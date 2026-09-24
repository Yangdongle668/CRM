import * as Imap from 'imap';
import { Logger } from '@nestjs/common';

export interface ImapAccount {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  imapSecure: boolean;
}

export function createImap(config: ImapAccount): any {
  return new Imap({
    user: config.imapUser,
    password: config.imapPass,
    host: config.imapHost,
    port: config.imapPort,
    tls: config.imapSecure,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 30000,
    connTimeout: 30000,
    keepalive: false,
  });
}

/**
 * 建连 → 执行 fn → 断开。带"空闲看门狗"：超过 idleMs 没有任何进展
 * （fn 里调用 touch() 表示有进展）就强制 destroy 连接并报错。
 *
 * 以前的超时只是 Promise.race：调用方不再等了，但卡住的 IMAP 连接
 * 还挂在那里，越积越多。
 */
export function withImap<T>(
  config: ImapAccount,
  fn: (imap: any, touch: () => void) => Promise<T>,
  idleMs = 120_000,
): Promise<T> {
  const imap = createImap(config);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (err: any, value?: T) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        if (err) imap.destroy();
        else imap.end();
      } catch {
        /* ignore */
      }
      err ? reject(err) : resolve(value as T);
    };
    const touch = () => {
      if (settled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => finish(new Error(`IMAP 连接 ${Math.round(idleMs / 1000)} 秒无响应，已断开`)),
        idleMs,
      );
    };

    // 用 on 而不是 once：连接期间可能多次报错，没有监听器会让进程崩溃
    imap.on('error', (err: Error) => finish(err));
    imap.once('ready', () => {
      touch();
      fn(imap, touch).then(
        (v) => finish(null, v),
        (e) => finish(e),
      );
    });
    touch();
    imap.connect();
  });
}

export function openBox(imap: any, name: string, readOnly = true): Promise<any> {
  return new Promise((resolve, reject) =>
    imap.openBox(name, readOnly, (err: any, box: any) => (err ? reject(err) : resolve(box))),
  );
}

/** UID SEARCH，返回升序 UID。 */
export function searchUids(imap: any, criteria: any[]): Promise<number[]> {
  return new Promise((resolve, reject) =>
    imap.search(criteria, (err: any, uids: number[]) =>
      err ? reject(err) : resolve((uids || []).map(Number).sort((a, b) => a - b)),
    ),
  );
}

/**
 * UID FETCH，把每封邮件请求的 body 部分收成 Buffer。
 * bodies: '' 为整封原文；'HEADER.FIELDS (MESSAGE-ID)' 只取头。
 */
export function fetchByUid(
  imap: any,
  uids: number[],
  bodies: string,
  onMessage?: () => void,
): Promise<Array<{ uid: number; data: Buffer }>> {
  return new Promise((resolve, reject) => {
    if (uids.length === 0) return resolve([]);
    const out: Array<{ uid: number; data: Buffer }> = [];
    const f = imap.fetch(uids, { bodies, struct: false });
    f.on('message', (msg: any) => {
      let uid = 0;
      const chunks: Buffer[] = [];
      msg.on('body', (stream: any) => {
        stream.on('data', (c: Buffer) => chunks.push(c));
      });
      msg.once('attributes', (attrs: any) => {
        uid = Number(attrs?.uid) || 0;
      });
      msg.once('end', () => {
        if (uid) out.push({ uid, data: Buffer.concat(chunks) });
        onMessage?.();
      });
    });
    f.once('error', reject);
    f.once('end', () => resolve(out.sort((a, b) => a.uid - b.uid)));
  });
}

/** 从只取了 MESSAGE-ID 的头部里解析出 Message-ID。 */
export function parseMessageIdHeader(data: Buffer): string | null {
  const parsed = (Imap as any).parseHeader(data.toString('utf8'));
  const v = parsed?.['message-id']?.[0];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** 按 SPECIAL-USE 标记 + 各语言常见名字找"已发送"文件夹。 */
export function findSentFolder(imap: any, logger?: Logger): Promise<string | null> {
  return new Promise((resolve) => {
    imap.getBoxes((err: any, boxes: any) => {
      if (err) {
        logger?.warn(`Failed to list IMAP boxes: ${err.message}`);
        return resolve(null);
      }

      const sentNames = [
        'Sent', 'SENT', 'sent', 'Sent Items', 'Sent Messages', 'Sent Mail',
        'INBOX.Sent', 'INBOX.Sent Messages', 'INBOX.Sent Items', 'INBOX.Sent Mail',
        '已发送', '已发邮件', '已发送邮件', 'INBOX.已发送', 'INBOX.已发邮件',
        '&XfJT0ZAB-', 'INBOX.&XfJT0ZAB-', '&XfJSIJZk;',
        'SentItems',
        'Gesendete Objekte', 'Gesendet', 'Messages envoyés', 'Envoyés', 'Enviados', 'Mensajes enviados',
      ];

      const flattenBoxes = (boxTree: any, prefix = ''): Array<{ path: string; attribs: string[] }> => {
        const result: Array<{ path: string; attribs: string[] }> = [];
        for (const [name, box] of Object.entries(boxTree || {})) {
          const delimiter = (box as any).delimiter || '/';
          const path = prefix ? `${prefix}${delimiter}${name}` : name;
          const attribs = (box as any).attribs || [];
          result.push({ path, attribs });
          if ((box as any).children) {
            result.push(...flattenBoxes((box as any).children, path));
          }
        }
        return result;
      };

      const allFolders = flattenBoxes(boxes);

      for (const folder of allFolders) {
        if (folder.attribs.includes('\\Sent') || folder.attribs.includes('\\sent')) {
          return resolve(folder.path);
        }
      }

      for (const name of sentNames) {
        if (boxes[name]) return resolve(name);
      }

      const gmailKey = Object.keys(boxes).find((k) => k === '[Gmail]' || k === '[Google Mail]') || null;
      if (gmailKey && (boxes[gmailKey] as any).children) {
        const children = (boxes[gmailKey] as any).children;
        const gmailDelim = (boxes[gmailKey] as any).delimiter || '/';
        for (const name of ['Sent Mail', '已发送邮件', 'Sent', 'Sent Messages']) {
          if (children[name]) return resolve(`${gmailKey}${gmailDelim}${name}`);
        }
      }

      if (boxes['INBOX'] && (boxes['INBOX'] as any).children) {
        const inboxChildren = (boxes['INBOX'] as any).children;
        const inboxDelim = (boxes['INBOX'] as any).delimiter || '/';
        for (const name of ['Sent', 'Sent Messages', 'Sent Items', 'Sent Mail', '已发送', '已发邮件']) {
          if (inboxChildren[name]) return resolve(`INBOX${inboxDelim}${name}`);
        }
      }

      const skipPatterns = /^(INBOX|Drafts|Trash|Junk|Spam|Archive|Deleted|Deleted Items|Deleted Messages|Notes|Outbox)$/i;
      for (const folder of allFolders) {
        const baseName = folder.path.split('/').pop() || '';
        if (skipPatterns.test(baseName)) continue;
        if (/sent/i.test(baseName) || /已发/.test(baseName) || /envoy/i.test(baseName) || /enviados/i.test(baseName) || /gesendet/i.test(baseName)) {
          return resolve(folder.path);
        }
      }

      const folderPaths = allFolders.map((f) => `${f.path} [${f.attribs.join(',')}]`);
      logger?.warn(`Could not find Sent folder. Available folders: ${folderPaths.join('; ')}`);
      resolve(null);
    });
  });
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { emailsApi } from '@/lib/api';
import type { ComposeWindowValue, DraftStatus } from './ComposeWindow';

const AUTOSAVE_DELAY_MS = 2000;

/**
 * 用户实际写了什么的指纹。去掉编辑器自动插入的签名块、只比较纯文本，
 * 这样"打开回复窗口、什么都没写就关掉"不会平白生成一份草稿；编辑器
 * 把 <br/> 规范化成 <br> 之类的变化也不算改动。
 */
function fingerprint(form: ComposeWindowValue, accountId: string | null): string {
  const body = (form.bodyHtml || '')
    .replace(/<div[^>]*data-role="signature"[\s\S]*?<\/div>/, '')
    .replace(/<img\b/gi, ' [img] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return JSON.stringify([
    accountId || '',
    form.toAddr.trim(),
    form.cc.trim(),
    form.bcc.trim(),
    form.subject.trim(),
    body,
    form.customerId,
    form.inReplyTo,
    (form.attachments || []).map((a) => a.id),
  ]);
}

/**
 * 写信窗口的草稿自动保存。
 *
 * - 打开窗口时记下基线；内容和基线不同（真的写了东西）才开始存草稿。
 * - 停止输入 2 秒后保存；保存串行执行，不会乱序覆盖。
 * - 发送 / 丢弃前先停掉自动保存并等在途请求结束，避免邮件已提交发送后
 *   又有一次迟到的保存。
 */
export function useComposeDraft(open: boolean, form: ComposeWindowValue, accountId: string | null) {
  const [status, setStatus] = useState<DraftStatus>('idle');
  const draftIdRef = useRef<string | null>(null);
  const baselineRef = useRef('');
  const lastSavedRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const pausedRef = useRef(false);
  const formRef = useRef(form);
  const accountRef = useRef(accountId);
  formRef.current = form;
  accountRef.current = accountId;

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  // 打开窗口：记基线
  useEffect(() => {
    if (!open) return;
    pausedRef.current = false;
    baselineRef.current = fingerprint(formRef.current, accountRef.current);
    lastSavedRef.current = draftIdRef.current ? baselineRef.current : '';
    setStatus(draftIdRef.current ? 'saved' : 'idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const needsSave = () => {
    const fp = fingerprint(formRef.current, accountRef.current);
    if (fp === lastSavedRef.current) return false;
    return !!draftIdRef.current || fp !== baselineRef.current;
  };

  const save = useCallback(() => {
    chainRef.current = chainRef.current.then(async () => {
      if (!needsSave()) return;
      const f = formRef.current;
      const fp = fingerprint(f, accountRef.current);
      setStatus('saving');
      try {
        const res: any = await emailsApi.saveDraft({
          draftId: draftIdRef.current || undefined,
          emailConfigId: accountRef.current || undefined,
          toAddr: f.toAddr,
          cc: f.cc,
          bcc: f.bcc,
          subject: f.subject,
          bodyHtml: f.bodyHtml,
          customerId: f.customerId || '',
          inReplyTo: f.inReplyTo || '',
          attachmentIds: (f.attachments || []).map((a) => a.id),
        });
        draftIdRef.current = res.data?.id || draftIdRef.current;
        lastSavedRef.current = fp;
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    });
    return chainRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 内容变化 → 防抖保存
  useEffect(() => {
    if (!open || pausedRef.current) return;
    if (!needsSave()) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (!pausedRef.current) save();
    }, AUTOSAVE_DELAY_MS);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form, accountId]);

  return {
    status,
    /** 当前草稿 id（还没存过则为 null） */
    getDraftId: () => draftIdRef.current,
    /** 打开一份已有草稿前调用 */
    setDraftId: (id: string | null) => {
      draftIdRef.current = id;
    },
    /** 关闭窗口时：立刻保存未保存的改动。返回草稿 id（没有则 null） */
    flush: async () => {
      clearTimer();
      // 已发送 / 已重置的会话不能再存（否则会存出一份空草稿）
      if (!pausedRef.current && needsSave()) await save();
      await chainRef.current;
      return draftIdRef.current;
    },
    /** 发送前：停掉自动保存，等在途保存结束，返回要一起提交的草稿 id */
    pauseForSend: async () => {
      pausedRef.current = true;
      clearTimer();
      await chainRef.current;
      return draftIdRef.current;
    },
    /** 发送失败时恢复自动保存 */
    resume: () => {
      pausedRef.current = false;
    },
    /** 丢弃：删除服务端草稿 */
    discard: async () => {
      pausedRef.current = true;
      clearTimer();
      await chainRef.current;
      const id = draftIdRef.current;
      draftIdRef.current = null;
      if (id) await emailsApi.discardDraft(id).catch(() => undefined);
      setStatus('idle');
    },
    /** 窗口关闭后清空状态 */
    reset: () => {
      pausedRef.current = true;
      clearTimer();
      draftIdRef.current = null;
      baselineRef.current = '';
      lastSavedRef.current = '';
      setStatus('idle');
    },
  };
}

import * as nodemailer from 'nodemailer';

export interface SmtpAccount {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
}

/**
 * 统一构造 SMTP transport 参数。
 *
 * 1. secure 以端口为准：465 是隐式 SSL，必须 secure=true；25/587 是先明文再
 *    STARTTLS，必须 secure=false。表单里的"SSL"勾选和端口对不上时，nodemailer
 *    要么在明文端口上发 TLS 握手，要么在 SSL 端口上等明文问候，都会连不上。
 * 2. 放宽 TLS 协议/加密套件下限。Node 18+ 自带 OpenSSL 3，默认只接受 TLS1.2+
 *    且安全级别为 2；网易企业邮箱（smtp.qiye.163.com / smtphz / hwsmtp）等
 *    部分服务器的握手达不到这个要求，服务器直接断开，表现为
 *    "Client network socket disconnected before secure TLS connection was
 *    established"。网易邮箱大师等桌面客户端兼容旧握手，所以能连上。
 *    证书校验保持开启。
 * 3. 显式设置 servername（SNI），以及连接/问候/空闲超时。
 */
export function buildSmtpTransportOptions(config: SmtpAccount): any {
  const host = (config.smtpHost || '').trim();
  const port = Number(config.smtpPort) || 465;
  let secure = config.smtpSecure !== false;
  if (port === 465) secure = true;
  else if (port === 25 || port === 587) secure = false;

  return {
    host,
    port,
    secure,
    auth: { user: config.smtpUser, pass: config.smtpPass },
    tls: {
      servername: host,
      minVersion: 'TLSv1',
      ciphers: 'DEFAULT:@SECLEVEL=0',
    },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  };
}

export function createSmtpTransport(config: SmtpAccount) {
  return nodemailer.createTransport(buildSmtpTransportOptions(config));
}

/** 给常见 SMTP 连接错误补一句排查提示。 */
export function explainSmtpError(error: any, config: Pick<SmtpAccount, 'smtpHost' | 'smtpPort'>): string {
  const msg: string = error?.message || String(error);
  const host = (config.smtpHost || '').toLowerCase();
  const isNetease = /(^|\.)(163|126|yeah)\.(com|net)$/.test(host) || host.includes('qiye.163.com');

  let hint = '';
  if (/before secure TLS connection was established|ECONNRESET|wrong version number/i.test(msg)) {
    hint = `TLS 握手被服务器断开，请确认端口与加密方式匹配（465 = SSL，25/587 = STARTTLS），当前端口 ${config.smtpPort}。`;
    if (isNetease) {
      hint +=
        ' 网易企业邮箱 SMTP 服务器为 smtp.qiye.163.com:465；CRM 部署在海外服务器时请改用 hwsmtp.qiye.163.com:465。' +
        ' 若仍失败，请在企业邮箱网页版「设置 → 客户端设置」中确认已开启 SMTP 服务，并使用客户端授权码作为密码。';
    }
  } else if (/ETIMEDOUT|Greeting never received|ECONNREFUSED/i.test(msg)) {
    hint = `无法连接 ${config.smtpHost}:${config.smtpPort}，请检查服务器出站防火墙/安全组是否放行该端口（云服务器通常封禁 25 端口）。`;
  } else if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    hint = `无法解析 SMTP 服务器域名 ${config.smtpHost}，请检查拼写和服务器 DNS。`;
  } else if (/Invalid login|535|authentication/i.test(msg)) {
    hint = isNetease
      ? '账号或密码错误。网易企业邮箱开启了安全登录时需使用客户端授权码，而不是网页登录密码。'
      : '账号或密码错误，部分邮箱需要使用授权码而不是登录密码。';
  }
  return hint ? `${msg}（${hint}）` : msg;
}

/**
 * 客户隐私工具：在 activities / emails 模块里复用。
 *
 * 三档可见性：
 *   full    —— 客户 owner 或超级管理员，明文。
 *   masked  —— 普通管理员（role==='ADMIN' 且非 owner 非 super admin）。
 *              能看到记录本身，但邮箱地址被直接隐藏（保留姓名）。
 *   denied  —— 其他角色 / 其他人。整段不可见。
 */

export type CustomerVisibility = 'full' | 'masked' | 'denied';

export interface VisibilityActor {
  userId: string;
  role: string;
  isSuperAdmin?: boolean;
}

/** 根据"客户 owner id + 当前用户"算出该用户对这个客户敏感数据的可见性档位。 */
export function customerVisibility(
  ownerId: string | null | undefined,
  actor: VisibilityActor,
): CustomerVisibility {
  if (actor.isSuperAdmin) return 'full';
  if (ownerId && actor.userId === ownerId) return 'full';
  if (actor.role === 'ADMIN') return 'masked';
  return 'denied';
}

const EMAIL_INNER = '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}';

/**
 * activity.content 这类自由文本里"看不到的邮箱"处理。规则：
 *   1. "Name <addr@x.com>" / "Name (addr@x.com)" → 仅保留 "Name"
 *   2. 裸邮箱 → 直接抹掉，不留占位符
 *   3. 抹完后若整段标签变空（"收件人: ，"），把这段标签连同分隔符一起去掉
 *      （留下的是 "发送邮件 - 主题: …" 这种干净的形态）
 *   4. 最后清理重复空格 / 重复的中英分隔符
 *
 * 姓名（不是邮箱形态）永远不会命中，所以"管理员看时间线"仍然能看到
 * 对应邮件的人名，只看不到邮箱本身。
 */
export function hideEmailsInText(raw: string | null | undefined): string {
  if (!raw) return raw ?? '';
  let s = raw;
  // 1. 显示名 + 邮箱包装：保留显示名，丢掉 <addr> / (addr)
  s = s.replace(new RegExp(`\\s*<\\s*${EMAIL_INNER}\\s*>`, 'g'), '');
  s = s.replace(new RegExp(`\\s*\\(\\s*${EMAIL_INNER}\\s*\\)`, 'g'), '');
  // 2. 剩下的裸邮箱
  s = s.replace(new RegExp(EMAIL_INNER, 'g'), '');
  // 3. 邮箱挪走后空掉的"发件人:"/"收件人:"/"To:" 段，连同后面的分隔符一起删
  s = s.replace(
    /(发件人|收件人|抄送|密送|To|From|CC|BCC)\s*[:：]\s*([，,、；;]\s*|$)/g,
    '',
  );
  // 4. 清掉残留的空 < > / ( )，合并多余空格，吃掉重复中英分隔符
  s = s.replace(/<\s*>/g, '').replace(/\(\s*\)/g, '');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/[，,]\s*[，,]/g, '，');
  s = s.replace(/\s+([，,、；;:])/g, '$1');
  return s.trim();
}

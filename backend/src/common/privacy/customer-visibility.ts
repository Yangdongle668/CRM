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

const HIDDEN_EMAIL_PLACEHOLDER = '(邮箱已隐藏)';
// 比较宽松的邮箱正则；只要"看上去像邮箱"就替换。
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * activity.content 等自由文本里直接把邮箱替换成占位符；姓名不会命中正则，
 * 所以"管理员看时间线"时仍能看到对应邮件的人名，只看不到邮箱地址。
 */
export function hideEmailsInText(raw: string | null | undefined): string {
  if (!raw) return raw ?? '';
  return raw.replace(EMAIL_RE, HIDDEN_EMAIL_PLACEHOLDER);
}

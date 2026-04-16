/**
 * Canonical list of permission codes used across the backend.
 *
 * Permission code convention: `<resource>:<action>`
 * Wildcards:
 *   - `*`            grants every permission (reserved for ADMIN)
 *   - `<resource>:*` grants every action on that resource
 *
 * Adding a new permission:
 *   1. Add its code below with a human-readable name/description/category.
 *   2. Update DEFAULT_ROLE_PERMISSIONS for non-admin roles if appropriate.
 *   3. Run `npm run prisma:seed` (or the Permission seeder on startup) to
 *      insert it into the DB. Admins don't need a row — they match `*`.
 */
export interface PermissionDef {
  code: string;
  name: string;
  description?: string;
  category: string;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // ---- User / Auth ----
  { code: 'user:read',   name: '查看用户', category: 'user' },
  { code: 'user:create', name: '创建用户', category: 'user' },
  { code: 'user:update', name: '编辑用户', category: 'user' },
  { code: 'user:delete', name: '删除用户', category: 'user' },
  { code: 'user:register', name: '注册账号', category: 'user' },

  // ---- Customer ----
  { code: 'customer:read',   name: '查看客户', category: 'customer' },
  { code: 'customer:create', name: '创建客户', category: 'customer' },
  { code: 'customer:update', name: '编辑客户', category: 'customer' },
  { code: 'customer:delete', name: '删除客户', category: 'customer' },
  { code: 'customer:assign', name: '分配客户归属', category: 'customer' },

  // ---- Contact ----
  { code: 'contact:read',   name: '查看联系人', category: 'contact' },
  { code: 'contact:create', name: '创建联系人', category: 'contact' },
  { code: 'contact:update', name: '编辑联系人', category: 'contact' },
  { code: 'contact:delete', name: '删除联系人', category: 'contact' },

  // ---- Lead ----
  { code: 'lead:read',   name: '查看线索', category: 'lead' },
  { code: 'lead:create', name: '创建线索', category: 'lead' },
  { code: 'lead:update', name: '编辑线索', category: 'lead' },
  { code: 'lead:delete', name: '删除线索', category: 'lead' },
  { code: 'lead:assign', name: '分配线索', category: 'lead' },

  // ---- Email ----
  { code: 'email:read',   name: '查看邮件', category: 'email' },
  { code: 'email:send',   name: '发送邮件', category: 'email' },
  { code: 'email:delete', name: '删除邮件', category: 'email' },
  { code: 'email:config', name: '管理邮箱配置', category: 'email' },

  // ---- Quotation ----
  { code: 'quotation:read',   name: '查看报价', category: 'quotation' },
  { code: 'quotation:create', name: '创建报价', category: 'quotation' },
  { code: 'quotation:update', name: '编辑报价', category: 'quotation' },
  { code: 'quotation:delete', name: '删除报价', category: 'quotation' },
  { code: 'quotation:send',   name: '发送报价', category: 'quotation' },

  // ---- Order ----
  { code: 'order:read',    name: '查看订单', category: 'order' },
  { code: 'order:create',  name: '创建订单', category: 'order' },
  { code: 'order:update',  name: '编辑订单', category: 'order' },
  { code: 'order:delete',  name: '删除订单', category: 'order' },
  { code: 'order:status',  name: '更新订单状态', category: 'order' },
  { code: 'order:payment', name: '处理订单回款', category: 'order' },

  // ---- PI (Proforma Invoice) ----
  { code: 'pi:read',    name: '查看形式发票', category: 'pi' },
  { code: 'pi:create',  name: '创建形式发票', category: 'pi' },
  { code: 'pi:update',  name: '编辑形式发票', category: 'pi' },
  { code: 'pi:delete',  name: '删除形式发票', category: 'pi' },
  { code: 'pi:approve', name: '审核形式发票', category: 'pi' },

  // ---- Task ----
  { code: 'task:read',   name: '查看任务', category: 'task' },
  { code: 'task:create', name: '创建任务', category: 'task' },
  { code: 'task:update', name: '编辑任务', category: 'task' },
  { code: 'task:delete', name: '删除任务', category: 'task' },

  // ---- Activity ----
  { code: 'activity:read',   name: '查看跟进记录', category: 'activity' },
  { code: 'activity:create', name: '创建跟进记录', category: 'activity' },

  // ---- Document ----
  { code: 'document:read',   name: '查看文档', category: 'document' },
  { code: 'document:upload', name: '上传文档', category: 'document' },
  { code: 'document:delete', name: '删除文档', category: 'document' },

  // ---- Settings / System ----
  { code: 'settings:read',   name: '查看系统设置', category: 'settings' },
  { code: 'settings:update', name: '修改系统设置', category: 'settings' },
  { code: 'backup:export',   name: '导出系统备份', category: 'settings' },
  { code: 'backup:import',   name: '导入系统备份', category: 'settings' },

  // ---- RBAC ----
  { code: 'rbac:read',   name: '查看角色权限', category: 'rbac' },
  { code: 'rbac:update', name: '配置角色权限', category: 'rbac' },
];

/**
 * Default role-permission mapping. Seeded on app boot if tables are empty.
 * ADMIN gets the `*` wildcard via special-case logic — no rows needed.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SALESPERSON: [
    'user:read',
    'customer:read', 'customer:create', 'customer:update',
    'contact:read', 'contact:create', 'contact:update', 'contact:delete',
    'lead:read', 'lead:create', 'lead:update',
    'email:read', 'email:send', 'email:config',
    'quotation:read', 'quotation:create', 'quotation:update', 'quotation:send',
    'order:read', 'order:create', 'order:update', 'order:status',
    'pi:read', 'pi:create', 'pi:update',
    'task:read', 'task:create', 'task:update', 'task:delete',
    'activity:read', 'activity:create',
    'document:read', 'document:upload',
  ],
  FINANCE: [
    'user:read',
    'customer:read',
    'contact:read',
    'lead:read',
    'email:read',
    'quotation:read',
    'order:read', 'order:update', 'order:status', 'order:payment',
    'pi:read', 'pi:create', 'pi:update', 'pi:approve',
    'task:read',
    'activity:read',
    'document:read', 'document:upload',
    'settings:read',
  ],
};

/**
 * The wildcard that grants every permission. Granted implicitly to ADMIN.
 */
export const WILDCARD = '*';

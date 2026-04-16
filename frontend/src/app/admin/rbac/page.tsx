'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/contexts/auth-context';
import { rbacApi } from '@/lib/api';

interface RoleRow {
  code: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  permissionCount: number; // -1 means "all" (ADMIN wildcard)
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PermissionDef {
  code: string;
  name: string;
  description?: string;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  user: '用户',
  customer: '客户',
  contact: '联系人',
  lead: '销售线索',
  email: '邮件',
  quotation: '报价单',
  order: '订单',
  pi: '形式发票',
  task: '任务',
  activity: '跟进',
  document: '文档',
  settings: '系统设置',
  rbac: '角色权限',
  audit: '审计日志',
};

export default function RbacPage() {
  const { can, isAdmin, loading: authLoading } = useAuth();
  const canRead = can ? can('rbac:read') : isAdmin;
  const canWrite = can ? can('rbac:update') : isAdmin;

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [originalPerms, setOriginalPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPerms, setSavingPerms] = useState(false);
  const [deleteCode, setDeleteCode] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Create-role modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    code: '',
    name: '',
    description: '',
  });
  const [creating, setCreating] = useState(false);

  // Edit-role metadata modal (name/description, not permissions)
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [editing, setEditing] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((r) => r.code === selectedCode) || null,
    [roles, selectedCode],
  );

  const permsByCategory = useMemo(() => {
    const m = new Map<string, PermissionDef[]>();
    for (const p of catalog) {
      if (!m.has(p.category)) m.set(p.category, []);
      m.get(p.category)!.push(p);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, catalogRes]: any = await Promise.all([
        rbacApi.listRoles(),
        rbacApi.catalog(),
      ]);
      setRoles(rolesRes.data?.roles || []);
      setCatalog(catalogRes.data?.permissions || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPermissionsFor = useCallback(async (code: string) => {
    try {
      const res: any = await rbacApi.getRolePermissions(code);
      const perms = res.data?.permissions || [];
      setOriginalPerms(perms);
      setSelectedPerms(perms);
    } catch {
      // error handled by interceptor
    }
  }, []);

  useEffect(() => {
    if (canRead) void loadRoles();
  }, [canRead, loadRoles]);

  useEffect(() => {
    if (selectedCode) void loadPermissionsFor(selectedCode);
  }, [selectedCode, loadPermissionsFor]);

  const permsDirty = useMemo(() => {
    if (selectedPerms.length !== originalPerms.length) return true;
    const a = [...selectedPerms].sort().join('|');
    const b = [...originalPerms].sort().join('|');
    return a !== b;
  }, [selectedPerms, originalPerms]);

  const handleTogglePerm = (code: string) => {
    if (!canWrite || selectedRole?.code === 'ADMIN') return;
    setSelectedPerms((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const handleToggleCategory = (category: string, checked: boolean) => {
    if (!canWrite || selectedRole?.code === 'ADMIN') return;
    const codes = (permsByCategory.find(([c]) => c === category)?.[1] || []).map(
      (p) => p.code,
    );
    setSelectedPerms((prev) => {
      const set = new Set(prev);
      for (const c of codes) {
        if (checked) set.add(c);
        else set.delete(c);
      }
      return Array.from(set);
    });
  };

  const handleSavePerms = async () => {
    if (!selectedCode) return;
    setSavingPerms(true);
    try {
      await rbacApi.setRolePermissions(selectedCode, selectedPerms);
      toast.success('权限已更新');
      await loadPermissionsFor(selectedCode);
      await loadRoles();
    } catch {
      // error handled
    } finally {
      setSavingPerms(false);
    }
  };

  const handleReset = () => setSelectedPerms(originalPerms);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.code.trim() || !createForm.name.trim()) {
      toast.error('请填写角色代码与名称');
      return;
    }
    setCreating(true);
    try {
      const res: any = await rbacApi.createRole({
        code: createForm.code.trim().toUpperCase(),
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
      });
      toast.success('角色创建成功');
      setCreateOpen(false);
      setCreateForm({ code: '', name: '', description: '' });
      await loadRoles();
      setSelectedCode(res.data?.role?.code || null);
    } catch {
      // error handled
    } finally {
      setCreating(false);
    }
  };

  const openEdit = () => {
    if (!selectedRole) return;
    setEditForm({
      name: selectedRole.name,
      description: selectedRole.description || '',
    });
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setEditing(true);
    try {
      await rbacApi.updateRole(selectedRole.code, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
      });
      toast.success('角色信息已更新');
      setEditOpen(false);
      await loadRoles();
    } catch {
      // error handled
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCode) return;
    setDeleting(true);
    try {
      await rbacApi.deleteRole(deleteCode);
      toast.success('角色已删除');
      if (selectedCode === deleteCode) setSelectedCode(null);
      setDeleteCode(null);
      await loadRoles();
    } catch {
      // error handled
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading) {
    return <AppLayout><div className="p-8 text-gray-500">加载中...</div></AppLayout>;
  }
  if (!canRead) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-gray-500">
          你没有查看角色权限的权限（<code>rbac:read</code>）。
        </div>
      </AppLayout>
    );
  }

  const isAdminRole = selectedRole?.code === 'ADMIN';
  const readOnly = !canWrite || isAdminRole;

  return (
    <AppLayout>
      <div className="flex gap-4 h-[calc(100vh-112px)]">
        {/* Role list */}
        <div className="w-72 flex-shrink-0 flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">角色列表</h2>
            {canWrite && (
              <button
                onClick={() => setCreateOpen(true)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                + 新建
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-gray-400">加载中...</div>
            ) : roles.length === 0 ? (
              <div className="p-4 text-sm text-gray-400">暂无角色</div>
            ) : (
              roles.map((r) => {
                const active = r.code === selectedCode;
                return (
                  <button
                    key={r.code}
                    onClick={() => setSelectedCode(r.code)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                      active ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {r.name}
                          </span>
                          {r.isBuiltin && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
                              内置
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">
                          {r.code}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-gray-500">
                          {r.permissionCount === -1 ? '全部权限' : `${r.permissionCount} 项权限`}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {r.userCount} 用户
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Permission editor */}
        <div className="flex-1 flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          {!selectedRole ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              <div className="text-center">
                <div className="text-4xl mb-3">🛡️</div>
                <p>选择左侧角色以查看 / 编辑权限</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-900">
                      {selectedRole.name}
                    </h3>
                    {selectedRole.isBuiltin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
                        内置
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">
                    code: {selectedRole.code}
                  </div>
                  {selectedRole.description && (
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedRole.description}
                    </p>
                  )}
                  {isAdminRole && (
                    <p className="text-xs text-amber-600 mt-2">
                      管理员角色默认拥有全部权限（通配符 <code>*</code>），不可在此配置。
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canWrite && (
                    <button
                      onClick={openEdit}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      编辑信息
                    </button>
                  )}
                  {canWrite && !selectedRole.isBuiltin && (
                    <button
                      onClick={() => setDeleteCode(selectedRole.code)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      删除角色
                    </button>
                  )}
                </div>
              </div>

              {/* Permission checkboxes grouped by category */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {permsByCategory.map(([cat, perms]) => {
                  const catLabel = CATEGORY_LABELS[cat] || cat;
                  const enabledInCat = perms.filter((p) =>
                    selectedPerms.includes(p.code),
                  ).length;
                  const allChecked = enabledInCat === perms.length;
                  const someChecked = enabledInCat > 0 && !allChecked;
                  return (
                    <div key={cat} className="border border-gray-100 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-800">
                          {catLabel}
                          <span className="ml-2 text-xs text-gray-400 font-normal">
                            {isAdminRole ? '全部' : `${enabledInCat} / ${perms.length}`}
                          </span>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-500">
                          <input
                            type="checkbox"
                            disabled={readOnly}
                            checked={isAdminRole ? true : allChecked}
                            ref={(el) => {
                              if (el) el.indeterminate = someChecked;
                            }}
                            onChange={(e) => handleToggleCategory(cat, e.target.checked)}
                          />
                          全选
                        </label>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 px-4 py-3">
                        {perms.map((p) => {
                          const checked = isAdminRole || selectedPerms.includes(p.code);
                          return (
                            <label
                              key={p.code}
                              className={`flex items-start gap-2 py-1.5 text-sm ${
                                readOnly ? 'opacity-80' : 'cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1"
                                disabled={readOnly}
                                checked={checked}
                                onChange={() => handleTogglePerm(p.code)}
                              />
                              <div className="min-w-0">
                                <div className="text-gray-900 truncate">{p.name}</div>
                                <div className="text-xs text-gray-400 font-mono truncate">
                                  {p.code}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              {!readOnly && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <div className="text-xs text-gray-500">
                    已选 {selectedPerms.length} / {catalog.length} 项权限
                    {permsDirty && (
                      <span className="ml-2 text-amber-600">• 有未保存的改动</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleReset}
                      disabled={!permsDirty || savingPerms}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
                    >
                      撤销
                    </button>
                    <button
                      onClick={handleSavePerms}
                      disabled={!permsDirty || savingPerms}
                      className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      {savingPerms ? '保存中...' : '保存权限'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create role modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建角色"
        maxWidth="md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              角色代码 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={createForm.code}
              onChange={(e) =>
                setCreateForm({ ...createForm, code: e.target.value.toUpperCase() })
              }
              placeholder="例如 MARKETING"
              pattern="[A-Z][A-Z0-9_]{1,31}"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              2–32 位大写字母 / 数字 / 下划线，以字母开头，建议使用英文大写。
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              角色名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="例如 市场部"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              角色描述
            </label>
            <textarea
              value={createForm.description}
              onChange={(e) =>
                setCreateForm({ ...createForm, description: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="简短说明该角色的职责"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit role metadata modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="编辑角色信息"
        maxWidth="md"
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              角色代码
            </label>
            <input
              type="text"
              value={selectedRole?.code || ''}
              disabled
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">角色代码一旦创建不可修改</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              角色名称
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              角色描述
            </label>
            <textarea
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={editing}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {editing ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteCode}
        onClose={() => setDeleteCode(null)}
        onConfirm={handleDelete}
        title="删除角色"
        message={`确定要删除角色 "${deleteCode}" 吗？该操作不可撤销，但角色下若仍有用户将无法删除。`}
        confirmText="删除"
        loading={deleting}
      />
    </AppLayout>
  );
}

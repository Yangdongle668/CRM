'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import { leadsApi, customersApi, usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { LEAD_STAGE_MAP, CUSTOMER_SOURCES } from '@/lib/constants';
import type { Lead, Customer, PaginatedData, LeadStage, User } from '@/types';
import toast from 'react-hot-toast';
import {
  HiOutlineEye,
  HiOutlineTrash,
  HiOutlineArrowUpTray,
  HiOutlineLockClosed,
  HiOutlineUserPlus,
} from 'react-icons/hi2';

const isAdminOwned = (lead: Lead): boolean => lead.owner?.role === 'ADMIN';

const STAGES: LeadStage[] = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST',
];

interface LeadFormData {
  title: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  stage: LeadStage;
  priority: number;
  source: string;
  notes: string;
}

const emptyForm: LeadFormData = {
  title: '',
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  country: '',
  stage: 'NEW',
  priority: 2,
  source: '',
  notes: '',
};

export default function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'mine' | 'pool' | 'all'>('mine');
  const [stage, setStage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Assign modal (admin only)
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLeadId, setAssignLeadId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [assigning, setAssigning] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, pageSize, scope };
      if (search) params.search = search;
      if (stage) params.stage = stage;
      const res: any = await leadsApi.list(params);
      setLeads(res.data.items);
      setTotal(res.data.total);
    } catch (error) {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, scope, stage]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Fetch users for assign dropdown (admin only)
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      usersApi.list().then((res: any) => {
        setUsers(res.data?.items || res.data || []);
      }).catch(() => {});
    }
  }, [user?.role]);

  const openAssignModal = (leadId: string) => {
    setAssignLeadId(leadId);
    setAssignUserId('');
    setAssignOpen(true);
  };

  const handleAssign = async () => {
    if (!assignLeadId || !assignUserId) {
      toast.error('请选择负责人');
      return;
    }
    setAssigning(true);
    try {
      await leadsApi.assign(assignLeadId, assignUserId);
      toast.success('线索已分配');
      setAssignOpen(false);
      fetchLeads();
    } catch {
      // handled by interceptor
    } finally {
      setAssigning(false);
    }
  };

  const openCreateModal = () => {
    setEditingLead(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setForm({
      title: lead.title,
      companyName: lead.companyName || '',
      contactName: lead.contactName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      country: lead.country || '',
      stage: lead.stage,
      priority: lead.priority || 2,
      source: lead.source || '',
      notes: lead.notes || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('请输入线索标题');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        ...form,
        priority: form.priority || 2,
      };
      if (editingLead) {
        await leadsApi.update(editingLead.id, payload);
        toast.success('线索已更新');
      } else {
        await leadsApi.create(payload);
        toast.success('线索已创建');
      }
      setModalOpen(false);
      fetchLeads();
    } catch (error) {
      // handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此线索？')) return;
    try {
      await leadsApi.delete(id);
      toast.success('线索已删除');
      fetchLeads();
    } catch (error) {
      // handled by interceptor
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  };

  const getInitials = (text?: string) => {
    if (!text) return 'L';
    const words = text.split(/[\s\-]/);
    return words.map(w => w[0]).slice(0, 2).join('').toUpperCase();
  };

  return (
    <AppLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">线索列表</h1>
            <p className="text-sm text-gray-500 mt-1">共 {total} 条线索 — 可搜索、筛选、批量操作</p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <span>+</span> 新建线索
          </button>
        </div>

        {/* Search & Filters */}
        <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="搜索线索、公司、邮箱或电话..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Scope tabs */}
            {(['mine', 'pool', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setScope(s);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  scope === s
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s === 'mine' ? '我的线索' : s === 'pool' ? '公海' : '全部'}
              </button>
            ))}

            {/* Stage filter */}
            <select
              value={stage}
              onChange={(e) => {
                setStage(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部阶段</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STAGE_MAP[s].label}
                </option>
              ))}
            </select>

            {/* Clear button */}
            <button
              onClick={() => {
                setSearch('');
                setScope('mine');
                setStage('');
                setPage(1);
              }}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            >
              清除筛选
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-gray-500">暂无线索</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">线索</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">来源</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">国家</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">邮箱</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">电话</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">评分</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">最后更新时间</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {getInitials(lead.companyName || lead.title)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{lead.title}</p>
                          <p className="text-xs text-gray-500 truncate">{lead.companyName || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{lead.source || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{lead.country || '-'}</td>
                    <td className="px-4 py-3">
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="text-sm text-blue-600 hover:underline truncate block"
                        >
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{lead.phone || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge className={LEAD_STAGE_MAP[lead.stage]?.color || ''}>
                        {LEAD_STAGE_MAP[lead.stage]?.label || lead.stage}
                      </Badge>
                      {isAdminOwned(lead) && (
                        <HiOutlineLockClosed className="h-4 w-4 text-amber-500 inline-block ml-2" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{lead.score ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(lead.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(lead)}
                          className="p-1 text-gray-500 hover:text-blue-600"
                          title="查看详情"
                        >
                          <HiOutlineEye className="h-4 w-4" />
                        </button>
                        {user?.role === 'ADMIN' && !isAdminOwned(lead) && (
                          <button
                            onClick={() => openAssignModal(lead.id)}
                            className="p-1 text-gray-500 hover:text-green-600"
                            title="分配"
                          >
                            <HiOutlineUserPlus className="h-4 w-4" />
                          </button>
                        )}
                        {isAdminOwned(lead) && (
                          <span className="p-1 text-amber-500 cursor-not-allowed" title="管理员线索不可转移">
                            <HiOutlineLockClosed className="h-4 w-4" />
                          </span>
                        )}
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="p-1 text-gray-500 hover:text-red-600"
                          title="删除"
                        >
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {leads.length > 0 && (
            <Pagination
              current={page}
              total={total}
              pageSize={pageSize}
              onChange={setPage}
            />
          )}
        </div>

        {/* Form Modal */}
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingLead ? '编辑线索' : '新建线索'}
          size="2xl"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                线索标题 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="输入线索标题"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">公司名称</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="公司名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="联系人"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="电话"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">国家</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="国家"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">来源</label>
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择来源</option>
                  {CUSTOMER_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">阶段</label>
                <select
                  value={form.stage}
                  onChange={(e) => setForm({ ...form, stage: e.target.value as LeadStage })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STAGE_MAP[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1">低</option>
                  <option value="2">中</option>
                  <option value="3">高</option>
                  <option value="4">紧急</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="备注"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Assign Modal (admin only) */}
        <Modal
          isOpen={assignOpen}
          onClose={() => setAssignOpen(false)}
          title="分配线索"
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">选择负责人</label>
              <select
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">请选择...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'ADMIN' ? '管理员' : '业务员'})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                onClick={() => setAssignOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || !assignUserId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {assigning ? '分配中...' : '确认分配'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}

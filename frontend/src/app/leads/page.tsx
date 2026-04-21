'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import EmailLink from '@/components/ui/EmailLink';
import CountrySelect from '@/components/ui/CountrySelect';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import { leadsApi, customersApi, usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { LEAD_STAGE_MAP, CUSTOMER_SOURCES } from '@/lib/constants';
import { celebrate } from '@/lib/celebrate';
import type { Lead, Customer, PaginatedData, LeadStage, User } from '@/types';
import toast from 'react-hot-toast';
import {
  HiOutlineEye,
  HiOutlineTrash,
  HiOutlineArrowUpTray,
  HiOutlineArrowDownTray,
  HiOutlineLockClosed,
  HiOutlineUserPlus,
  HiOutlineHandRaised,
} from 'react-icons/hi2';

const isAdminOwned = (lead: Lead): boolean => lead.owner?.role === 'ADMIN';

const STAGES: LeadStage[] = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST',
];

interface LeadFormData {
  title: string;
  companyName: string;
  industry: string;
  website: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  email: string;
  phone: string;
  country: string;
  region: string;
  city: string;
  address: string;
  postalCode: string;
  stage: LeadStage;
  priority: number;
  source: string;
  notes: string;
}

// 网站栏点击一键跳转：用户录入时可能只写了 "example.com"，没协议，
// 浏览器会把没协议的 href 当成相对路径。这里补上 https:// 让跳转成立。
const normalizeWebsiteUrl = (raw: string): string => {
  const s = raw.trim();
  if (!s) return '#';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
};

const emptyForm: LeadFormData = {
  title: '',
  companyName: '',
  industry: '',
  website: '',
  contactName: '',
  contactTitle: '',
  contactEmail: '',
  email: '',
  phone: '',
  country: '',
  region: '',
  city: '',
  address: '',
  postalCode: '',
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
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  // 防抖后的搜索值，实际传给后端
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scope, setScope] = useState<'mine' | 'pool' | 'all'>('mine');
  const [stage, setStage] = useState('');
  // 管理员专属：按负责人筛选（scope=all 时生效）
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped?: number;
    errors: string[];
  } | null>(null);

  // Assign modal (admin only)
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLeadId, setAssignLeadId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [assigning, setAssigning] = useState(false);

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignUserId, setBulkAssignUserId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const params: Record<string, any> = { page, pageSize, scope };
      if (debouncedSearch) params.search = debouncedSearch;
      if (stage) params.stage = stage;
      // 后端只在 ADMIN + scope=all 时接受 ownerId；销售员角色就算传了也会被忽略。
      if (user?.role === 'ADMIN' && scope === 'all' && ownerFilter) {
        params.ownerId = ownerFilter;
      }
      const res: any = await leadsApi.list(params);
      setLeads(res.data.items);
      setTotal(res.data.total);
    } catch (error) {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, scope, stage, ownerFilter, user?.role]);

  // 搜索输入防抖 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

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

  // Derived selection helpers
  const allOnPageSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));
  const someOnPageSelected = leads.some((l) => selectedIds.has(l.id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        leads.forEach((l) => next.delete(l.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        leads.forEach((l) => next.add(l.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignUserId) {
      toast.error('请选择负责人');
      return;
    }
    setBulkAssigning(true);
    try {
      const res: any = await leadsApi.batchAssign(Array.from(selectedIds), bulkAssignUserId);
      const skipped = res.data?.skipped ?? 0;
      toast.success(
        `成功分配 ${res.data?.updated ?? 0} 条线索` + (skipped > 0 ? `，${skipped} 条已跳过` : ''),
      );
      setBulkAssignOpen(false);
      setBulkAssignUserId('');
      setSelectedIds(new Set());
      fetchLeads();
    } catch {
      // handled by interceptor
    } finally {
      setBulkAssigning(false);
    }
  };

  const handleClaim = async (leadId: string) => {
    try {
      await leadsApi.claim(leadId);
      toast.success('认领成功，线索已归入我的线索');
      fetchLeads();
    } catch {
      // handled by interceptor
    }
  };

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

  // ===== Export =====
  const handleExport = async () => {
    try {
      const params: Record<string, any> = { scope };
      if (search) params.search = search;
      if (stage) params.stage = stage;
      const res: any = await leadsApi.exportCsv(params);
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  // ===== Import =====
  const handleImport = async () => {
    if (!importFile) {
      toast.error('请选择 CSV 文件');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const res: any = await leadsApi.importCsv(importFile);
      const data = res.data;
      setImportResult(data);
      if (data.created > 0 || data.updated > 0) {
        const parts = [`新增 ${data.created}`, `更新 ${data.updated}`];
        if (data.skipped) parts.push(`跳过 ${data.skipped}`);
        toast.success(`导入完成：${parts.join('，')}`);
        fetchLeads();
      } else if (data.skipped) {
        toast(`全部跳过 ${data.skipped} 条（邮箱重复或缺失公司名称）`);
      }
      if (data.errors?.length > 0) {
        toast.error(`${data.errors.length} 条记录有错误/已跳过`);
      }
    } catch {
      toast.error('导入失败');
    } finally {
      setImporting(false);
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
      industry: lead.industry || '',
      website: lead.website || '',
      contactName: lead.contactName || '',
      contactTitle: lead.contactTitle || '',
      contactEmail: lead.contactEmail || '',
      email: lead.email || '',
      phone: lead.phone || '',
      country: lead.country || '',
      region: lead.region || '',
      city: lead.city || '',
      address: lead.address || '',
      postalCode: lead.postalCode || '',
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
        const prevStage = editingLead.stage;
        await leadsApi.update(editingLead.id, payload);
        toast.success('线索已更新');
        // 温度系统：从非成交状态推进到 CLOSED_WON 时撒一把彩带
        if (prevStage !== 'CLOSED_WON' && payload.stage === 'CLOSED_WON') {
          celebrate();
          toast.success('恭喜拿下订单！');
        }
      } else {
        await leadsApi.create(payload);
        toast.success('线索已创建');
        if (payload.stage === 'CLOSED_WON') {
          celebrate();
        }
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setImportFile(null);
                setImportResult(null);
                setImportOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              <HiOutlineArrowUpTray className="h-4 w-4" /> 导入
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              <HiOutlineArrowDownTray className="h-4 w-4" /> 导出
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              <span>+</span> 新建线索
            </button>
          </div>
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

            {/* Owner filter — 仅管理员；只在 scope=all 下使用，"我的线索"本来就过滤成自己了 */}
            {user?.role === 'ADMIN' && scope === 'all' && (
              <select
                value={ownerFilter}
                onChange={(e) => {
                  setOwnerFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部负责人</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}

            {/* Clear button */}
            <button
              onClick={() => {
                setSearch('');
                setScope('mine');
                setStage('');
                setOwnerFilter('');
                setPage(1);
              }}
              className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            >
              清除筛选
            </button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm font-medium text-blue-700">
              已选 {selectedIds.size} 条
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              取消选择
            </button>
            {user?.role === 'ADMIN' && (
              <button
                onClick={() => { setBulkAssignUserId(''); setBulkAssignOpen(true); }}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                <HiOutlineUserPlus className="h-4 w-4" /> 批量分配
              </button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-gray-500">暂无线索</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={(el) => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 min-w-[140px]">线索</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 min-w-[70px]">国家</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 min-w-[140px]">网站</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 min-w-[120px]">邮箱</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 min-w-[100px]">电话</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 min-w-[70px]">状态</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 min-w-[80px]">负责人</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 min-w-[90px]">最后更新</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 min-w-[100px] flex-shrink-0">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`hover:bg-gray-50 ${selectedIds.has(lead.id) ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-3 py-2 w-8 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {getInitials(lead.companyName || lead.title)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-xs truncate">{lead.title}</p>
                          <p className="text-xs text-gray-500 truncate">{lead.companyName || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 min-w-[70px]">{lead.country || '-'}</td>
                    <td className="px-3 py-2 min-w-[140px]">
                      {lead.website ? (
                        <a
                          href={normalizeWebsiteUrl(lead.website)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-blue-600 hover:underline truncate block"
                          title={lead.website}
                        >
                          {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 min-w-[120px]">
                      {lead.email ? (
                        <EmailLink
                          email={lead.email}
                          className="text-xs text-blue-600 hover:underline truncate block"
                        />
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 min-w-[100px]">{lead.phone || '-'}</td>
                    <td className="px-3 py-2 min-w-[70px]">
                      <Badge className={LEAD_STAGE_MAP[lead.stage]?.color || ''}>
                        {LEAD_STAGE_MAP[lead.stage]?.label || lead.stage}
                      </Badge>
                      {isAdminOwned(lead) && (
                        <HiOutlineLockClosed className="h-3 w-3 text-amber-500 inline-block ml-1" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 min-w-[80px]">
                      {lead.owner ? (
                        <span className="inline-flex items-center gap-0.5">
                          <span className="truncate">{lead.owner.name}</span>
                          {lead.owner.role === 'ADMIN' && (
                            <HiOutlineLockClosed className="h-3 w-3 text-amber-500 flex-shrink-0" title="管理员" />
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">公海</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 min-w-[90px]">
                      {formatDate(lead.updatedAt)}
                    </td>
                    <td className="px-3 py-2 min-w-[100px] flex-shrink-0">
                      <div className="flex items-center justify-center gap-0.5 flex-wrap">
                        <button
                          onClick={() => openEditModal(lead)}
                          className="p-0.5 text-gray-500 hover:text-blue-600"
                          title="查看详情"
                        >
                          <HiOutlineEye className="h-3.5 w-3.5" />
                        </button>
                        {/* Claim button — shown when lead is in public pool and not owned by current user */}
                        {(lead.isPublicPool || !lead.ownerId) && lead.ownerId !== user?.id && (
                          <button
                            onClick={() => handleClaim(lead.id)}
                            className="p-0.5 text-gray-500 hover:text-emerald-600"
                            title="认领线索"
                          >
                            <HiOutlineHandRaised className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {user?.role === 'ADMIN' && (
                          <button
                            onClick={() => openAssignModal(lead.id)}
                            className="p-0.5 text-gray-500 hover:text-green-600"
                            title="分配给业务员"
                          >
                            <HiOutlineUserPlus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="p-0.5 text-gray-500 hover:text-red-600"
                          title="删除"
                        >
                          <HiOutlineTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {/* Pagination + page-size selector */}
          {leads.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>每页显示</span>
                {[25, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => { setPageSize(n); setPage(1); }}
                    className={`px-2 py-0.5 rounded text-xs font-medium border ${
                      pageSize === n
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span>条</span>
              </div>
              <Pagination
                current={page}
                total={total}
                pageSize={pageSize}
                onChange={setPage}
              />
            </div>
          )}
        </div>

        {/* Form Modal */}
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingLead ? '编辑线索' : '新建线索'}
          size="2xl"
          dismissible={false}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">行业</label>
                <input
                  type="text"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="行业"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">网站</label>
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="company@example.com"
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

            {/* 对接人（个人）信息 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">对接人姓名</label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="对接人姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">对接人头衔</label>
                <input
                  type="text"
                  value={form.contactTitle}
                  onChange={(e) => setForm({ ...form, contactTitle: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="如：采购经理"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">对接人邮箱</label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="contact@example.com"
                />
              </div>
            </div>

            {/* 地址 */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">国家</label>
                <CountrySelect
                  value={form.country}
                  onChange={(v) => setForm({ ...form, country: v })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">地区</label>
                <input
                  type="text"
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="省/州"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">城市</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="城市"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮编</label>
                <input
                  type="text"
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="邮编"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="详细地址"
              />
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

        {/* Bulk Assign Modal (admin only) */}
        <Modal
          isOpen={bulkAssignOpen}
          onClose={() => setBulkAssignOpen(false)}
          title={`批量分配线索（已选 ${selectedIds.size} 条）`}
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">选择负责人</label>
              <select
                value={bulkAssignUserId}
                onChange={(e) => setBulkAssignUserId(e.target.value)}
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
                onClick={() => setBulkAssignOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={bulkAssigning || !bulkAssignUserId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkAssigning ? '分配中...' : '确认分配'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Import Modal */}
        <Modal
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
          title="导入线索 (CSV)"
          size="lg"
        >
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-800 mb-2">CSV 文件格式要求：</p>
              <p>第一行为表头，列名如下（顺序不限）：</p>
              <p className="mt-1 text-xs text-gray-500 bg-white p-2 rounded border font-mono">
                ID, 公司名称, 行业, 网站, 电话, 邮箱, 国家, 地区, 城市, 地址, 邮编, 状态, 备注, 创建时间, 更新时间, 创建者ID, 负责人ID, 对接人姓名, 对接人头衔, 对接人邮箱
              </p>
              <ul className="mt-2 space-y-1 text-xs text-gray-500">
                <li>- <strong>公司名称</strong>为必填项</li>
                <li>- <strong>状态</strong>可填写：新建、已联系、已确认、方案、谈判、成交、失败</li>
                <li>- <strong>负责人ID</strong>为业务员的用户 ID，留空则进入公海</li>
                <li>- 如果 <strong>ID</strong> 列匹配已有线索则更新，否则新建</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">选择 CSV 文件</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportResult(null);
                }}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {importResult && (
              <div className="bg-gray-50 rounded-lg p-4 text-sm">
                <p className="font-medium text-gray-800">
                  导入结果：新增 {importResult.created} 条，更新 {importResult.updated} 条
                  {importResult.skipped ? `，跳过 ${importResult.skipped} 条` : ''}
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-red-600 font-medium">
                      错误/已跳过 ({importResult.errors.length})：
                    </p>
                    <ul className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                      {importResult.errors.map((err, i) => (
                        <li key={i} className="text-xs text-red-500">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                onClick={() => setImportOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                {importResult ? '关闭' : '取消'}
              </button>
              {!importResult && (
                <button
                  onClick={handleImport}
                  disabled={importing || !importFile}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {importing ? '导入中...' : '开始导入'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}

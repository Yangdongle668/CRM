'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import { leadsApi, customersApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { LEAD_STAGE_MAP } from '@/lib/constants';
import type { Lead, Customer, PaginatedData, LeadStage } from '@/types';
import toast from 'react-hot-toast';

const STAGES: LeadStage[] = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST',
];

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: '低', color: 'bg-gray-100 text-gray-800' },
  2: { label: '中', color: 'bg-blue-100 text-blue-800' },
  3: { label: '高', color: 'bg-orange-100 text-orange-800' },
  4: { label: '紧急', color: 'bg-red-100 text-red-800' },
};

const SOURCES = ['展会', '阿里巴巴', 'Google广告', '社交媒体', '客户推荐', '电话开发', '邮件开发', '其他'];

interface LeadFormData {
  title: string;
  description: string;
  stage: LeadStage;
  expectedAmount: string;
  expectedDate: string;
  source: string;
  priority: number;
  customerId: string;
}

const emptyForm: LeadFormData = {
  title: '',
  description: '',
  stage: 'NEW',
  expectedAmount: '',
  expectedDate: '',
  source: '',
  priority: 2,
  customerId: '',
};

export default function LeadsPage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // All leads for kanban (no pagination)
  const [kanbanLeads, setKanbanLeads] = useState<Lead[]>([]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, pageSize };
      if (search) params.search = search;
      if (stageFilter) params.stage = stageFilter;
      const res: any = await leadsApi.list(params);
      const data: PaginatedData<Lead> = res.data;
      setLeads(data.items);
      setTotal(data.total);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, stageFilter]);

  const fetchKanbanLeads = useCallback(async () => {
    try {
      const params: Record<string, any> = { page: 1, pageSize: 500 };
      if (search) params.search = search;
      if (stageFilter) params.stage = stageFilter;
      const res: any = await leadsApi.list(params);
      const data: PaginatedData<Lead> = res.data;
      setKanbanLeads(data.items);
    } catch {
      // handled by interceptor
    }
  }, [search, stageFilter]);

  const fetchCustomers = useCallback(async () => {
    try {
      const res: any = await customersApi.list({ page: 1, pageSize: 200 });
      setCustomers(res.data.items || []);
    } catch {
      // handled by interceptor
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'table') {
      fetchLeads();
    } else {
      fetchKanbanLeads();
    }
  }, [viewMode, fetchLeads, fetchKanbanLeads]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const openCreateModal = () => {
    setEditingLead(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setForm({
      title: lead.title,
      description: lead.description || '',
      stage: lead.stage,
      expectedAmount: lead.expectedAmount?.toString() || '',
      expectedDate: lead.expectedDate ? lead.expectedDate.slice(0, 10) : '',
      source: lead.source || '',
      priority: lead.priority,
      customerId: lead.customerId || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('请输入标题');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        title: form.title,
        description: form.description || undefined,
        stage: form.stage,
        expectedAmount: form.expectedAmount ? parseFloat(form.expectedAmount) : undefined,
        expectedDate: form.expectedDate || undefined,
        source: form.source || undefined,
        priority: form.priority,
        customerId: form.customerId || undefined,
      };

      if (editingLead) {
        await leadsApi.update(editingLead.id, payload);
        toast.success('线索已更新');
      } else {
        await leadsApi.create(payload);
        toast.success('线索已创建');
      }
      setModalOpen(false);
      if (viewMode === 'table') {
        fetchLeads();
      } else {
        fetchKanbanLeads();
      }
    } catch {
      // handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该线索？')) return;
    try {
      await leadsApi.delete(id);
      toast.success('线索已删除');
      if (viewMode === 'table') {
        fetchLeads();
      } else {
        fetchKanbanLeads();
      }
    } catch {
      // handled by interceptor
    }
  };

  const handleStageChange = async (leadId: string, newStage: string) => {
    try {
      await leadsApi.updateStage(leadId, newStage);
      toast.success('阶段已更新');
      if (viewMode === 'table') {
        fetchLeads();
      } else {
        fetchKanbanLeads();
      }
    } catch {
      // handled by interceptor
    }
  };

  const formatAmount = (amount?: number) => {
    if (!amount) return '-';
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  // ==================== Kanban View ====================
  const renderKanban = () => {
    const groupedLeads: Record<string, Lead[]> = {};
    STAGES.forEach((s) => (groupedLeads[s] = []));
    kanbanLeads.forEach((lead) => {
      if (groupedLeads[lead.stage]) {
        groupedLeads[lead.stage].push(lead);
      }
    });

    return (
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
        {STAGES.map((stage) => {
          const stageInfo = LEAD_STAGE_MAP[stage];
          const stageLeads = groupedLeads[stage] || [];

          // Determine possible moves for this stage
          const stageIdx = STAGES.indexOf(stage);
          const prevStage = stageIdx > 0 ? STAGES[stageIdx - 1] : null;
          const nextStage = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;

          return (
            <div
              key={stage}
              className="flex-shrink-0 w-64 bg-gray-50 rounded-lg flex flex-col"
            >
              <div className="px-3 py-2 border-b bg-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <Badge className={stageInfo.color}>{stageInfo.label}</Badge>
                  <span className="text-xs text-gray-500">{stageLeads.length}</span>
                </div>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="text-sm font-medium text-gray-900 truncate flex-1">
                        {lead.title}
                      </h4>
                      <Badge className={PRIORITY_LABELS[lead.priority]?.color || 'bg-gray-100 text-gray-800'}>
                        {PRIORITY_LABELS[lead.priority]?.label || '中'}
                      </Badge>
                    </div>
                    {lead.customer && (
                      <p className="text-xs text-gray-500 mb-1 truncate">
                        {lead.customer.companyName}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 mb-2">
                      {formatAmount(lead.expectedAmount)}
                      {lead.expectedDate && ` | ${formatDate(lead.expectedDate)}`}
                    </p>
                    {lead.owner && (
                      <p className="text-xs text-gray-400 mb-2">{lead.owner.name}</p>
                    )}
                    <div className="flex gap-1">
                      {prevStage && (
                        <button
                          onClick={() => handleStageChange(lead.id, prevStage)}
                          className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                          title={`移至 ${LEAD_STAGE_MAP[prevStage].label}`}
                        >
                          ← {LEAD_STAGE_MAP[prevStage].label}
                        </button>
                      )}
                      {nextStage && (
                        <button
                          onClick={() => handleStageChange(lead.id, nextStage)}
                          className="text-xs px-2 py-0.5 bg-blue-50 hover:bg-blue-100 rounded text-blue-600"
                          title={`移至 ${LEAD_STAGE_MAP[nextStage].label}`}
                        >
                          {LEAD_STAGE_MAP[nextStage].label} →
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1 mt-2 border-t pt-2">
                      <button
                        onClick={() => openEditModal(lead)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(lead.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ==================== Table View ====================
  const renderTable = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                标题
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                客户
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                阶段
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                预期金额
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                预期日期
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                优先级
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                负责人
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {lead.title}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {lead.customer?.companyName || '-'}
                </td>
                <td className="px-4 py-3">
                  <Badge className={LEAD_STAGE_MAP[lead.stage]?.color || ''}>
                    {LEAD_STAGE_MAP[lead.stage]?.label || lead.stage}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatAmount(lead.expectedAmount)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatDate(lead.expectedDate)}
                </td>
                <td className="px-4 py-3">
                  <Badge className={PRIORITY_LABELS[lead.priority]?.color || 'bg-gray-100 text-gray-800'}>
                    {PRIORITY_LABELS[lead.priority]?.label || '中'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {lead.owner?.name || '-'}
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button
                    onClick={() => openEditModal(lead)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(lead.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        current={page}
        total={total}
        pageSize={pageSize}
        onChange={setPage}
      />
    </div>
  );

  // ==================== Form Modal ====================
  const renderFormModal = () => (
    <Modal
      isOpen={modalOpen}
      onClose={() => setModalOpen(false)}
      title={editingLead ? '编辑线索' : '新建线索'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            标题 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="请输入线索标题"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            placeholder="请输入描述"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">阶段</label>
            <select
              value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value as LeadStage })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Object.entries(PRIORITY_LABELS).map(([val, info]) => (
                <option key={val} value={val}>
                  {info.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">预期金额</label>
            <input
              type="number"
              value={form.expectedAmount}
              onChange={(e) => setForm({ ...form, expectedAmount: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="请输入预期金额"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">预期日期</label>
            <input
              type="date"
              value={form.expectedDate}
              onChange={(e) => setForm({ ...form, expectedDate: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">来源</label>
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">请选择</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">关联客户</label>
            <select
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">请选择客户</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">销售线索</h1>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                列表视图
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                看板视图
              </button>
            </div>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              + 新建线索
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="搜索线索..."
            className="w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">全部阶段</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STAGE_MAP[s].label}
              </option>
            ))}
          </select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        )}

        {/* Content */}
        {!loading && (viewMode === 'table' ? renderTable() : renderKanban())}

        {/* Modal */}
        {renderFormModal()}
      </div>
    </AppLayout>
  );
}

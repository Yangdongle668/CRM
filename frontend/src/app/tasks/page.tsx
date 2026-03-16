'use client';

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { tasksApi } from '@/lib/api';
import { TASK_PRIORITY_MAP, TASK_STATUS_MAP } from '@/lib/constants';
import type { Task, TaskPriority, TaskStatus, PaginatedData } from '@/types';

const defaultForm = {
  title: '',
  description: '',
  priority: 'MEDIUM' as TaskPriority,
  status: 'PENDING' as TaskStatus,
  dueDate: '',
  relatedType: '',
  relatedId: '',
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  // Status dropdown
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, pageSize };
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      const res: any = await tasksApi.list(params);
      const data: PaginatedData<Task> = res.data;
      setTasks(data.items);
      setTotal(data.total);
    } catch {
      // error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, filterPriority]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const openCreate = () => {
    setEditingTask(null);
    setForm(defaultForm);
    setModalOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      relatedType: task.relatedType || '',
      relatedId: task.relatedId || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('请输入任务标题');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        status: form.status,
        dueDate: form.dueDate || undefined,
        relatedType: form.relatedType || undefined,
        relatedId: form.relatedId || undefined,
      };

      if (editingTask) {
        await tasksApi.update(editingTask.id, payload);
        toast.success('任务已更新');
      } else {
        await tasksApi.create(payload);
        toast.success('任务已创建');
      }
      setModalOpen(false);
      fetchTasks();
    } catch {
      // error handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该任务吗？')) return;
    try {
      await tasksApi.delete(id);
      toast.success('任务已删除');
      fetchTasks();
    } catch {
      // error handled by interceptor
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await tasksApi.update(taskId, { status: newStatus });
      toast.success('状态已更新');
      setStatusDropdownId(null);
      fetchTasks();
    } catch {
      // error handled by interceptor
    }
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate) return false;
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
    return new Date(task.dueDate) < new Date();
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">任务管理</h1>
          <button
            onClick={openCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            新建任务
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部状态</option>
            {Object.entries(TASK_STATUS_MAP).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => { setFilterPriority(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部优先级</option>
            {Object.entries(TASK_PRIORITY_MAP).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">标题</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">优先级</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">截止日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">负责人</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">创建时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    加载中...
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    暂无任务数据
                  </td>
                </tr>
              ) : (
                tasks.map((task) => {
                  const overdue = isOverdue(task);
                  const priorityInfo = TASK_PRIORITY_MAP[task.priority];
                  const statusInfo = TASK_STATUS_MAP[task.status];

                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-gray-50 ${overdue ? 'bg-red-50' : ''}`}
                    >
                      <td className={`px-4 py-3 text-sm font-medium ${overdue ? 'text-red-600' : 'text-gray-900'}`}>
                        {task.title}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={priorityInfo?.color || ''}>
                          {priorityInfo?.label || task.priority}
                        </Badge>
                      </td>
                      <td className="relative px-4 py-3">
                        <button
                          onClick={() =>
                            setStatusDropdownId(statusDropdownId === task.id ? null : task.id)
                          }
                          className="cursor-pointer"
                        >
                          <Badge className={statusInfo?.color || ''}>
                            {statusInfo?.label || task.status}
                          </Badge>
                        </button>
                        {statusDropdownId === task.id && (
                          <div className="absolute left-4 top-full z-20 mt-1 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            {Object.entries(TASK_STATUS_MAP).map(([key, val]) => (
                              <button
                                key={key}
                                onClick={() => handleStatusChange(task.id, key as TaskStatus)}
                                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 ${
                                  task.status === key ? 'font-semibold text-blue-600' : 'text-gray-700'
                                }`}
                              >
                                {val.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm ${overdue ? 'font-medium text-red-600' : 'text-gray-500'}`}>
                        {formatDate(task.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {task.owner?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(task.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(task)}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(task.id)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTask ? '编辑任务' : '新建任务'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              任务标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入任务标题"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">任务描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入任务描述"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {Object.entries(TASK_PRIORITY_MAP).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {Object.entries(TASK_STATUS_MAP).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">关联类型</label>
              <select
                value={form.relatedType}
                onChange={(e) => setForm({ ...form, relatedType: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">无</option>
                <option value="customer">客户</option>
                <option value="lead">线索</option>
                <option value="order">订单</option>
                <option value="quotation">报价单</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">关联ID</label>
              <input
                type="text"
                value={form.relatedId}
                onChange={(e) => setForm({ ...form, relatedId: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="请输入关联对象ID"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? '提交中...' : editingTask ? '保存修改' : '创建任务'}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}

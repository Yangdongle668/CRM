'use client';

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { tasksApi, usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { TASK_PRIORITY_MAP, TASK_STATUS_MAP } from '@/lib/constants';
import type { Task, TaskPriority, TaskStatus, PaginatedData, User } from '@/types';

const defaultForm = {
  title: '',
  description: '',
  priority: 'MEDIUM' as TaskPriority,
  status: 'PENDING' as TaskStatus,
  dueDate: '',
  assigneeId: '',
};

export default function TasksPage() {
  const { isAdmin } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
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
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, filterPriority]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Admin needs the user list for assignment
  useEffect(() => {
    if (!isAdmin) return;
    usersApi.list({ isActive: true }).then((res: any) => {
      setUsers(res.data?.items || res.data || []);
    }).catch(() => {});
  }, [isAdmin]);

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
      assigneeId: task.owner?.id || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('请输入任务标题'); return; }
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        status: form.status,
        dueDate: form.dueDate || undefined,
      };
      if (isAdmin && form.assigneeId) payload.assigneeId = form.assigneeId;

      if (editingTask) {
        // For update, ownerId change isn't supported via assigneeId; handled below
        const updatePayload: Record<string, any> = { ...payload };
        delete updatePayload.assigneeId;
        await tasksApi.update(editingTask.id, updatePayload);
        toast.success('任务已更新');
      } else {
        await tasksApi.create(payload);
        toast.success('任务已创建');
      }
      setModalOpen(false);
      fetchTasks();
    } catch {
      // handled by interceptor
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
      // handled by interceptor
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await tasksApi.update(taskId, { status: newStatus });
      toast.success('状态已更新');
      setStatusDropdownId(null);
      fetchTasks();
    } catch {
      // handled by interceptor
    }
  };

  const isOverdue = (task: Task) =>
    !!task.dueDate && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' &&
    new Date(task.dueDate) < new Date();

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('zh-CN') : '-';

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">任务管理</h1>
          <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            新建任务
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            <option value="">全部状态</option>
            {Object.entries(TASK_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => { setFilterPriority(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            <option value="">全部优先级</option>
            {Object.entries(TASK_PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['标题', '优先级', '状态', '截止日期', '负责人', '创建时间', '操作'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">加载中...</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">暂无任务数据</td></tr>
              ) : tasks.map((task) => {
                const overdue = isOverdue(task);
                return (
                  <tr key={task.id} className={`hover:bg-gray-50 ${overdue ? 'bg-red-50' : ''}`}>
                    <td className={`px-4 py-3 text-sm font-medium ${overdue ? 'text-red-600' : 'text-gray-900'}`}>
                      {task.title}
                      {task.description && <p className="text-xs text-gray-400 font-normal mt-0.5 truncate max-w-xs">{task.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={TASK_PRIORITY_MAP[task.priority]?.color || ''}>{TASK_PRIORITY_MAP[task.priority]?.label || task.priority}</Badge>
                    </td>
                    <td className="relative px-4 py-3">
                      <button onClick={() => setStatusDropdownId(statusDropdownId === task.id ? null : task.id)}>
                        <Badge className={TASK_STATUS_MAP[task.status]?.color || ''}>{TASK_STATUS_MAP[task.status]?.label || task.status}</Badge>
                      </button>
                      {statusDropdownId === task.id && (
                        <div className="absolute left-4 top-full z-20 mt-1 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                          {Object.entries(TASK_STATUS_MAP).map(([k, v]) => (
                            <button key={k} onClick={() => handleStatusChange(task.id, k as TaskStatus)}
                              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 ${task.status === k ? 'font-semibold text-blue-600' : 'text-gray-700'}`}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-sm ${overdue ? 'font-medium text-red-600' : 'text-gray-500'}`}>{fmt(task.dueDate)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{task.owner?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmt(task.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(task)} className="text-sm text-blue-600 hover:text-blue-800">编辑</button>
                        <button onClick={() => handleDelete(task.id)} className="text-sm text-red-600 hover:text-red-800">删除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingTask ? '编辑任务' : '新建任务'} maxWidth="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">任务标题 <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入任务标题" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">任务描述</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入任务描述" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {Object.entries(TASK_PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {Object.entries(TASK_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            {isAdmin && !editingTask && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">指派给</label>
                <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="">指派给自己</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role === 'ADMIN' ? '管理员' : '业务员'})</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">取消</button>
            <button type="submit" disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {submitting ? '提交中...' : editingTask ? '保存修改' : '创建任务'}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}

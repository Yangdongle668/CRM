'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/auth-context';
import { pisApi, customersApi } from '@/lib/api';
import type { ProformaInvoice, Customer } from '@/types';

type TabKey = 'mine' | 'all' | 'pending';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'mine', label: '我的PI' },
  { key: 'all', label: '所有PI' },
  { key: 'pending', label: '待审核' },
];

export default function PIsPage() {
  const { user: currentUser, isAdmin } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('mine');
  const [pis, setPis] = useState<ProformaInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPIs = async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize };

      if (searchKeyword) {
        params.keyword = searchKeyword;
      }

      if (activeTab === 'all' && isAdmin) {
        // No filter for all
      } else if (activeTab === 'pending' && isAdmin) {
        params.status = 'PENDING_APPROVAL';
      } else {
        params.status = statusFilter || undefined;
      }

      const res: any = await pisApi.list(params);
      const data = res.data;
      setPis(data?.items || []);
      setTotal(data?.total || 0);
    } catch {
      toast.error('加载PI失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res: any = await customersApi.list({ pageSize: 999 });
      setCustomers(res.data?.items || []);
    } catch {
      // Silently fail
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    setPage(1);
    fetchPIs();
  }, [activeTab, statusFilter, searchKeyword]);

  useEffect(() => {
    if (page > 1) {
      fetchPIs();
    }
  }, [page]);

  const getCustomerName = (customerId: string) => {
    return customers.find((c) => c.id === customerId)?.companyName || customerId;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return '#94a3b8';
      case 'PENDING_APPROVAL':
        return '#f59e0b';
      case 'APPROVED':
        return '#10b981';
      case 'REJECTED':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return '草稿';
      case 'PENDING_APPROVAL':
        return '待审核';
      case 'APPROVED':
        return '已批准';
      case 'REJECTED':
        return '已拒绝';
      default:
        return status;
    }
  };

  const handleEdit = (piId: string) => {
    router.push(`/pis/${piId}`);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await pisApi.delete(deletingId);
      toast.success('PI已删除');
      setDeleteModalOpen(false);
      setDeletingId(null);
      fetchPIs();
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleApprove = async (piId: string) => {
    try {
      await pisApi.approve(piId);
      toast.success('PI已批准');
      fetchPIs();
    } catch {
      toast.error('批准失败');
    }
  };

  const handleReject = async (piId: string) => {
    const reason = prompt('请输入拒绝原因');
    if (!reason) return;

    try {
      await pisApi.reject(piId, reason);
      toast.success('PI已拒绝');
      fetchPIs();
    } catch {
      toast.error('拒绝失败');
    }
  };

  const handleDownloadPdf = async (piId: string) => {
    try {
      const res: any = await pisApi.downloadPdf(piId);
      const pi = pis.find((p) => p.id === piId);
      // The interceptor returns response.data, which is a Blob
      const blob = res instanceof Blob ? res : new Blob([JSON.stringify(res)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pi?.piNo || 'PI'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('下载失败');
    }
  };

  const visibleTabs = isAdmin ? TABS : TABS.slice(0, 1);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">形式发票 (PI)</h1>
          <button
            onClick={() => router.push('/pis/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            + 新建PI
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder="搜索PI号或收货人..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
          />
          {activeTab !== 'pending' && activeTab !== 'all' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">所有状态</option>
              <option value="DRAFT">草稿</option>
              <option value="PENDING_APPROVAL">待审核</option>
              <option value="APPROVED">已批准</option>
              <option value="REJECTED">已拒绝</option>
            </select>
          )}
        </div>

        {/* PI Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">PI号</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">客户</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">收货人</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">金额</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">状态</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">创建日期</th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    加载中...
                  </td>
                </tr>
              ) : pis.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    没有PI数据
                  </td>
                </tr>
              ) : (
                pis.map((pi) => (
                  <tr key={pi.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-blue-600 cursor-pointer hover:underline"
                        onClick={() => handleEdit(pi.id)}>
                      {pi.piNo}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {getCustomerName(pi.customerId)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {pi.consigneeName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-right text-gray-900">
                      {pi.currency} {Number(pi.totalAmount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: getStatusColor(pi.status) }}
                      >
                        {getStatusLabel(pi.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {new Date(pi.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-6 py-4 text-center text-sm space-x-2">
                      <button
                        onClick={() => handleEdit(pi.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        编辑
                      </button>
                      {pi.status === 'APPROVED' && (
                        <button
                          onClick={() => handleDownloadPdf(pi.id)}
                          className="text-green-600 hover:text-green-800"
                        >
                          下载
                        </button>
                      )}
                      {isAdmin && pi.status === 'PENDING_APPROVAL' && (
                        <>
                          <button
                            onClick={() => handleApprove(pi.id)}
                            className="text-green-600 hover:text-green-800"
                          >
                            批准
                          </button>
                          <button
                            onClick={() => handleReject(pi.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            拒绝
                          </button>
                        </>
                      )}
                      {pi.status === 'DRAFT' && (
                        <button
                          onClick={() => {
                            setDeletingId(pi.id);
                            setDeleteModalOpen(true);
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          删除
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="mt-6 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              共 {total} 条 / {Math.ceil(total / pageSize)} 页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              {Array.from({ length: Math.ceil(total / pageSize) }, (_, i) => i + 1)
                .slice(Math.max(0, page - 3), Math.min(Math.ceil(total / pageSize), page + 2))
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-2 rounded-lg ${
                      page === p
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              <button
                onClick={() => setPage(Math.min(Math.ceil(total / pageSize), page + 1))}
                disabled={page === Math.ceil(total / pageSize)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="删除PI"
      >
        <div className="space-y-4">
          <p className="text-gray-600">确定要删除这份PI吗？此操作无法撤销。</p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? '删除中...' : '确定删除'}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

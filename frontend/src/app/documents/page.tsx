'use client';

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { documentsApi, customersApi } from '@/lib/api';
import type { Document, Customer, PaginatedData } from '@/types';

const CATEGORIES = ['合同', '发票', '产品资料', '其他'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterCategory, setFilterCategory] = useState('');

  // Upload modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState('其他');
  const [uploadCustomerId, setUploadCustomerId] = useState('');
  const [uploading, setUploading] = useState(false);

  // Customer list for dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, pageSize };
      if (filterCategory) params.category = filterCategory;
      const res: any = await documentsApi.list(params);
      const data: PaginatedData<Document> = res.data;
      setDocuments(data.items);
      setTotal(data.total);
    } catch {
      // error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterCategory]);

  const fetchCustomers = useCallback(async () => {
    try {
      const res: any = await customersApi.list({ pageSize: 999 });
      setCustomers(res.data?.items || []);
    } catch {
      // error handled by interceptor
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error('请选择要上传的文件');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('category', uploadCategory);
      if (uploadCustomerId) {
        formData.append('customerId', uploadCustomerId);
      }
      await documentsApi.upload(formData);
      toast.success('文件上传成功');
      setUploadOpen(false);
      setUploadFile(null);
      setUploadCategory('其他');
      setUploadCustomerId('');
      fetchDocuments();
    } catch {
      // error handled by interceptor
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const res: any = await documentsApi.download(doc.id);
      const blob = res instanceof Blob ? res : new Blob([res]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      toast.error('下载失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该文件吗？')) return;
    try {
      await documentsApi.delete(id);
      toast.success('文件已删除');
      fetchDocuments();
    } catch {
      // error handled by interceptor
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">文件管理</h1>
          <button
            onClick={() => setUploadOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            上传文件
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">全部类别</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">文件名</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">类别</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">大小</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">关联客户</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">上传者</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">上传时间</th>
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
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    暂无文件数据
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {doc.fileName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {doc.category || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {customers.find((c) => c.id === doc.customerId)?.companyName || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {doc.owner?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          下载
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
      </div>

      {/* Upload Modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="上传文件"
      >
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              选择文件 <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">文件类别</label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">关联客户</label>
            <select
              value={uploadCustomerId}
              onChange={(e) => setUploadCustomerId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">不关联客户</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? '上传中...' : '上传'}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}

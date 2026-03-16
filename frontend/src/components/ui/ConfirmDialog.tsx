'use client';

import React from 'react';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';
import Modal from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  variant?: 'danger' | 'warning';
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = '确认操作',
  message = '确定要执行此操作吗？此操作无法撤销。',
  confirmText = '确认删除',
  cancelText = '取消',
  loading = false,
  variant = 'danger',
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="sm">
      <div className="flex flex-col items-center text-center">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full ${
            variant === 'danger' ? 'bg-red-100' : 'bg-yellow-100'
          }`}
        >
          <HiOutlineExclamationTriangle
            className={`h-6 w-6 ${
              variant === 'danger' ? 'text-red-600' : 'text-yellow-600'
            }`}
          />
        </div>
        <p className="mt-4 text-sm text-gray-600">{message}</p>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={loading}
          className="btn-secondary"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}
        >
          {loading ? '处理中...' : confirmText}
        </button>
      </div>
    </Modal>
  );
}

'use client';

import React, { useEffect, useRef } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';

interface ModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  // 默认 true：点遮罩 / 按 ESC 可关闭。
  // 编辑类表单传 false，避免误点空白或误按 ESC 丢失正在编辑的内容。
  dismissible?: boolean;
}

const maxWidthClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
};

export function Modal({ open, isOpen, onClose, title, children, maxWidth, size, dismissible = true }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const visible = open ?? isOpen ?? false;
  const width = maxWidth ?? size ?? 'lg';

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (visible) {
      // 仅在可关闭的弹窗上监听 ESC，避免编辑表单被误关。
      if (dismissible) {
        document.addEventListener('keydown', handleEsc);
      }
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [visible, dismissible, onClose]);

  if (!visible) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (!dismissible) return;
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in"
    >
      <div
        className={`w-full ${maxWidthClasses[width]} rounded-2xl bg-white/95 backdrop-blur-xl shadow-apple-xl animate-scale-in`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export default Modal;

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HiOutlineBars3 } from 'react-icons/hi2';
import { useAuth } from '@/contexts/auth-context';
import { useLogo } from '@/contexts/logo-context';
import Sidebar from './Sidebar';
import ExchangeRates from './ExchangeRates';
import FollowUpBanner from './FollowUpBanner';
import GlobalSearch from './GlobalSearch';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const { logoUrl } = useLogo();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading) {
      const token = localStorage.getItem('token');
      if (!token) {
        router.replace('/login');
      }
    }
  }, [loading, router]);

  // 抽屉打开时锁定 body 滚动，避免背后页面被带着滚。
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileNavOpen]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f5f5f7]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary-500 border-t-transparent" />
          <p className="text-sm text-gray-500 font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="relative z-[100] flex items-center gap-2 sm:gap-4 h-12 px-3 sm:px-6 bg-white/60 backdrop-blur-xl border-b border-gray-200/60 flex-shrink-0">
          {/* 汉堡按钮 —— 仅 <lg 可见，用来拉出侧栏抽屉 */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
            aria-label="打开菜单"
          >
            <HiOutlineBars3 className="h-5 w-5" />
          </button>

          {/* 移动端小 Logo —— 桌面端的 logo 在侧栏里，这里只给 <lg 用 */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 lg:hidden"
            aria-label="回到首页"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded-lg object-cover" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500 text-[11px] font-bold text-white">
                CRM
              </div>
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <div className="hidden md:block flex-shrink-0">
            <ExchangeRates />
          </div>
        </div>
        <FollowUpBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

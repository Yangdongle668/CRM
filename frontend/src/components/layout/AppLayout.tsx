'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import Sidebar from './Sidebar';
import ExchangeRates from './ExchangeRates';
import FollowUpBanner from './FollowUpBanner';
import GlobalSearch from './GlobalSearch';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      const token = localStorage.getItem('token');
      if (!token) {
        router.replace('/login');
      }
    }
  }, [loading, router]);

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
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 h-12 px-6 bg-white/60 backdrop-blur-xl border-b border-gray-200/60 flex-shrink-0">
          <GlobalSearch />
          <ExchangeRates />
        </div>
        <FollowUpBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

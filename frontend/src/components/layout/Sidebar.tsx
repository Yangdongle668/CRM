'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useLogo } from '@/contexts/logo-context';
import { messagesApi } from '@/lib/api';
import {
  HiOutlineHome,
  HiOutlineBuildingOffice2,
  HiOutlineUsers,
  HiOutlineFunnel,
  HiOutlineEnvelope,
  HiOutlineDocumentText,
  HiOutlineClipboardDocumentList,
  HiOutlineCheckCircle,
  HiOutlineFolderOpen,
  HiOutlineCog6Tooth,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineArrowRightOnRectangle,
  HiOutlineBookOpen,
  HiOutlineChartBar,
  HiOutlineChatBubbleLeftRight,
} from 'react-icons/hi2';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: '仪表盘', href: '/dashboard', icon: HiOutlineHome },
  { label: '客户管理', href: '/customers', icon: HiOutlineBuildingOffice2 },
  { label: '联系人', href: '/contacts', icon: HiOutlineUsers },
  { label: '销售线索', href: '/leads', icon: HiOutlineFunnel },
  { label: '邮件中心', href: '/emails', icon: HiOutlineEnvelope },
  { label: '形式发票', href: '/pis', icon: HiOutlineDocumentText },
  { label: '订单管理', href: '/orders', icon: HiOutlineClipboardDocumentList },
  { label: '任务管理', href: '/tasks', icon: HiOutlineCheckCircle },
  { label: '消息中心', href: '/messages', icon: HiOutlineChatBubbleLeftRight },
  { label: '文件管理', href: '/documents', icon: HiOutlineFolderOpen },
  { label: '备忘录', href: '/memos', icon: HiOutlineBookOpen },
  { label: '管理中心', href: '/admin', icon: HiOutlineChartBar, adminOnly: true },
  { label: '系统设置', href: '/settings', icon: HiOutlineCog6Tooth, adminOnly: true },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { logoUrl } = useLogo();

  useEffect(() => {
    const fetchUnread = () => {
      messagesApi.getUnreadCount().then((res: any) => {
        setUnreadMessages(res.data?.count ?? 0);
      }).catch(() => {});
    };
    fetchUnread();
    const id = setInterval(fetchUnread, 15000);
    return () => clearInterval(id);
  }, []);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const LogoIcon = () => logoUrl ? (
    <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-xl object-cover" />
  ) : (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-500 text-sm font-bold text-white shadow-apple">
      CRM
    </div>
  );

  return (
    <aside
      className={`flex h-screen flex-col bg-white/80 backdrop-blur-xl border-r border-gray-200/60 transition-all duration-300 ${
        collapsed ? 'w-[68px]' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <LogoIcon />
            <span className="text-[15px] font-semibold tracking-tight text-gray-900">外贸CRM</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto">
            <LogoIcon />
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            if (item.adminOnly && user?.role !== 'ADMIN') return null;
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all ${
                    active
                      ? 'bg-primary-500/10 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    className={`h-[18px] w-[18px] flex-shrink-0 ${
                      active ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                  />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {item.href === '/messages' && unreadMessages > 0 && (
                    <span className="flex-shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="px-3 py-1.5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100/80 hover:text-gray-600"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? (
            <HiOutlineChevronRight className="h-4 w-4" />
          ) : (
            <HiOutlineChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* User info & Logout */}
      <div className="border-t border-gray-200/60 px-3 py-3">
        {!collapsed ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-xs font-semibold text-white">
                {user?.name?.charAt(0) || '?'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-gray-900">
                  {user?.name || '未知用户'}
                </p>
                <p className="truncate text-[11px] text-gray-500">
                  {user?.role === 'ADMIN' ? '管理员' : '销售人员'}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="退出登录"
            >
              <HiOutlineArrowRightOnRectangle className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={logout}
            className="flex w-full items-center justify-center rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="退出登录"
          >
            <HiOutlineArrowRightOnRectangle className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}

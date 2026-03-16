'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
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
  { label: '报价管理', href: '/quotations', icon: HiOutlineDocumentText },
  { label: '订单管理', href: '/orders', icon: HiOutlineClipboardDocumentList },
  { label: '任务管理', href: '/tasks', icon: HiOutlineCheckCircle },
  { label: '文件管理', href: '/documents', icon: HiOutlineFolderOpen },
  { label: '系统设置', href: '/settings', icon: HiOutlineCog6Tooth, adminOnly: true },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-300 ${
        collapsed ? 'w-[68px]' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              外
            </div>
            <span className="text-lg font-bold text-gray-900">外贸CRM</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              外
            </div>
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            if (item.adminOnly && user?.role !== 'ADMIN') return null;
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    className={`h-5 w-5 flex-shrink-0 ${
                      active ? 'text-blue-700' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                  />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-gray-200 px-3 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? (
            <HiOutlineChevronRight className="h-5 w-5" />
          ) : (
            <HiOutlineChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* User info & Logout */}
      <div className="border-t border-gray-200 px-3 py-3">
        {!collapsed ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700">
                {user?.name?.charAt(0) || '?'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {user?.name || '未知用户'}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {user?.role === 'ADMIN' ? '管理员' : '销售人员'}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="退出登录"
            >
              <HiOutlineArrowRightOnRectangle className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button
            onClick={logout}
            className="flex w-full items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="退出登录"
          >
            <HiOutlineArrowRightOnRectangle className="h-5 w-5" />
          </button>
        )}
      </div>
    </aside>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useLogo } from '@/contexts/logo-context';
import { messagesApi, followUpsApi } from '@/lib/api';
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
  HiOutlineShieldCheck,
  HiOutlineKey,
  HiOutlineBellAlert,
  HiOutlineXMark,
} from 'react-icons/hi2';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  /** Optional permission code; when set, the item shows only if user has it. */
  permission?: string;
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
  { label: '跟进', href: '/follow-ups', icon: HiOutlineBellAlert },
  { label: '消息中心', href: '/messages', icon: HiOutlineChatBubbleLeftRight },
  { label: '文件管理', href: '/documents', icon: HiOutlineFolderOpen },
  { label: '备忘录', href: '/memos', icon: HiOutlineBookOpen },
  { label: '管理中心', href: '/admin', icon: HiOutlineChartBar, adminOnly: true },
  { label: '角色权限', href: '/admin/rbac', icon: HiOutlineKey, permission: 'rbac:read' },
  { label: '审计日志', href: '/admin/audit-logs', icon: HiOutlineShieldCheck, permission: 'audit:read' },
  { label: '系统设置', href: '/settings', icon: HiOutlineCog6Tooth },
];

interface SidebarProps {
  /** 移动端抽屉是否打开（桌面端忽略，始终常驻）。 */
  mobileOpen: boolean;
  /** 移动端请求关闭抽屉（点遮罩 / 关闭按钮 / 切换路由）。 */
  onMobileClose: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  // `collapsed` 只在桌面端（lg+）有意义 —— 移动端抽屉永远是完整宽度的，
  // 折叠切换按钮也是 lg 以上才显示，用户无法在移动端把它改成 true。
  const [collapsed, setCollapsed] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [followUpOverdue, setFollowUpOverdue] = useState(0);
  const pathname = usePathname();
  const { user, logout, can } = useAuth();
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

  // 跟进逾期数量：侧栏红点 + banner 都依赖这个。1 分钟刷新一次即可。
  useEffect(() => {
    const fetchSummary = () => {
      followUpsApi.summary().then((res: any) => {
        setFollowUpOverdue(res.data?.overdue ?? 0);
      }).catch(() => {});
    };
    fetchSummary();
    const id = setInterval(fetchSummary, 60_000);
    return () => clearInterval(id);
  }, []);

  // 移动端：切换路由后自动收起抽屉，避免遮挡目标页面。
  // 有意省略 onMobileClose 依赖：它是 AppLayout 里的 setState setter，
  // 会在父组件每次渲染后引用变化，加进去会导致每次渲染都关一次。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    onMobileClose();
  }, [pathname]);

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
    <>
      {/* 移动端遮罩：抽屉打开时盖住页面，点一下就关。桌面端整块不渲染 */}
      <div
        onClick={onMobileClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          flex h-screen flex-col
          bg-white/95 lg:bg-white/80 backdrop-blur-xl
          border-r border-gray-200/60
          transition-transform duration-300 lg:transition-[width]
          w-[min(16rem,85vw)] flex-shrink-0
          ${collapsed ? 'lg:w-[68px]' : 'lg:w-60'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
        `}
      >
        {/* Logo 区 */}
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          {/* 完整 logo —— 移动端始终显示；桌面端折叠时隐藏 */}
          <Link
            href="/dashboard"
            className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'lg:hidden' : ''}`}
          >
            <LogoIcon />
            <span className="truncate text-[15px] font-semibold tracking-tight text-gray-900">
              维界系统
            </span>
          </Link>
          {/* 仅 logo —— 桌面端折叠时才出现 */}
          {collapsed && (
            <Link href="/dashboard" className="mx-auto hidden lg:block">
              <LogoIcon />
            </Link>
          )}
          {/* 移动端关闭按钮 */}
          <button
            onClick={onMobileClose}
            className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 lg:hidden"
            aria-label="关闭菜单"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              if (item.permission && can && !can(item.permission)) return null;
              if (item.adminOnly && user?.role !== 'ADMIN') return null;
              if (user?.role === 'FINANCE' && item.href !== '/orders' && item.href !== '/settings' && !item.permission) return null;
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 lg:py-2 text-[13px] font-medium transition-all ${
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
                    {/* 文案：移动端恒显；桌面端折叠时隐藏 */}
                    <span className={`flex-1 truncate ${collapsed ? 'lg:hidden' : ''}`}>
                      {item.label}
                    </span>
                    {item.href === '/messages' && unreadMessages > 0 && (
                      <span
                        className={`flex-shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ${
                          collapsed ? 'lg:hidden' : ''
                        }`}
                      >
                        {unreadMessages > 99 ? '99+' : unreadMessages}
                      </span>
                    )}
                    {item.href === '/follow-ups' && followUpOverdue > 0 && (
                      <span
                        className={`flex-shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ${
                          collapsed ? 'lg:hidden' : ''
                        }`}
                        title={`${followUpOverdue} 条逾期跟进`}
                      >
                        {followUpOverdue > 99 ? '99+' : followUpOverdue}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 折叠切换 —— 仅桌面端 */}
        <div className="hidden lg:block px-3 py-1.5">
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
          {/* 完整信息：移动端恒显，桌面端折叠时隐藏 */}
          <div className={`flex items-center justify-between ${collapsed ? 'lg:hidden' : ''}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-xs font-semibold text-white">
                  {user?.name?.charAt(0) || '?'}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-gray-900">
                  {user?.name || '未知用户'}
                </p>
                <p className="truncate text-[11px] text-gray-500">
                  {user?.role === 'ADMIN' ? '管理员' : user?.role === 'FINANCE' ? '财务人员' : '销售人员'}
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
          {/* 折叠态仅登出按钮 —— 仅桌面端 */}
          {collapsed && (
            <button
              onClick={logout}
              className="hidden lg:flex w-full items-center justify-center rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="退出登录"
            >
              <HiOutlineArrowRightOnRectangle className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

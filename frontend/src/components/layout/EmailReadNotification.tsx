'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { emailsApi } from '@/lib/api';
import type { Email } from '@/types';

export default function EmailReadNotification() {
  const [viewedEmails, setViewedEmails] = useState<Email[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchRecentlyViewed = useCallback(async () => {
    try {
      const res: any = await emailsApi.getRecentlyViewed();
      const items: Email[] = Array.isArray(res.data?.items) ? res.data.items : [];
      setViewedEmails(items);

      // Check for new views
      const currentIds = new Set(items.map((e) => e.id));
      if (prevIdsRef.current.size > 0) {
        const currentArr = items.map((e) => e.id);
        for (let i = 0; i < currentArr.length; i++) {
          if (!prevIdsRef.current.has(currentArr[i])) {
            setHasNew(true);
            break;
          }
        }
      }
      if (items.length > 0 && prevIdsRef.current.size === 0) {
        // First load - show indicator if there are viewed emails
        setHasNew(true);
      }
      prevIdsRef.current = currentIds;
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    fetchRecentlyViewed();
    const interval = setInterval(fetchRecentlyViewed, 30000);
    return () => clearInterval(interval);
  }, [fetchRecentlyViewed]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleToggle = () => {
    setShowDropdown((prev) => !prev);
    if (hasNew) setHasNew(false);
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    return d.toLocaleDateString('zh-CN');
  };

  if (viewedEmails.length === 0) return null;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleToggle}
        className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-green-50 transition-colors"
        title="客户已读邮件通知"
      >
        {/* Green envelope icon */}
        <svg
          className="w-6 h-6 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4"
            strokeWidth={2}
            className="text-green-600"
          />
        </svg>

        {/* Notification dot */}
        {hasNew && (
          <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        )}

        {/* Count badge */}
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold text-white bg-green-600 rounded-full min-w-[18px]">
          {viewedEmails.length > 99 ? '99+' : viewedEmails.length}
        </span>
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-green-50">
            <h3 className="text-sm font-semibold text-green-800">
              客户已读邮件
            </h3>
            <p className="text-xs text-green-600 mt-0.5">
              最近24小时内客户打开的邮件
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {viewedEmails.map((email) => (
              <div
                key={email.id}
                className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                    {email.toAddr}
                  </span>
                  <span className="text-xs text-green-600 flex-shrink-0 ml-2">
                    {formatTime(email.viewedAt)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 truncate">
                  {email.subject || '(无主题)'}
                </p>
                {email.customer && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    {email.customer.companyName}
                  </p>
                )}
                {(email.viewCount ?? 0) > 1 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    已打开 {email.viewCount} 次
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { authApi } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  /** Full list of permission codes granted to the current user. */
  permissions: string[];
  /**
   * Returns true if the user has the given permission code (or the `*`
   * wildcard, or any namespace wildcard like `customer:*`).
   * Admins (wildcard) always return true.
   */
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function matchPermission(granted: string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  // Namespace wildcard: "customer:*" grants "customer:delete" etc.
  const colon = required.indexOf(':');
  if (colon > 0) {
    const ns = required.slice(0, colon) + ':*';
    if (granted.includes(ns)) return true;
  }
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const applyProfile = useCallback((profile: any) => {
    if (!profile) return;
    setUser(profile);
    // Prefer server-provided permissions; fall back to role-based shortcut.
    const perms: string[] = Array.isArray(profile.permissions)
      ? profile.permissions
      : profile.role === 'ADMIN'
        ? ['*']
        : [];
    setPermissions(perms);
    try {
      localStorage.setItem('user', JSON.stringify(profile));
      // 把服务器返回的个人偏好镜像到 localStorage：EmailLink 这类
      // 轻量组件可以同步读取而无需走 API；切换用户 / 重新登录时会被
      // 下面一行覆盖，始终跟当前登录用户保持一致。
      const pref = profile?.preferences?.emailLinkPreference;
      if (pref === 'ask' || pref === 'external' || pref === 'internal') {
        localStorage.setItem('emailLinkPreference', pref);
      } else {
        localStorage.removeItem('emailLinkPreference');
      }
    } catch {}
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authApi
        .getProfile()
        .then((res: any) => {
          applyProfile(res.data);
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [applyProfile]);

  const login = async (email: string, password: string) => {
    const res: any = await authApi.login({ email, password });
    localStorage.setItem('token', res.data.token);
    applyProfile(res.data.user);
    router.push('/dashboard');
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // 登出时清掉个人偏好的本地缓存，下个登录用户会用自己服务器上的偏好。
    localStorage.removeItem('emailLinkPreference');
    setUser(null);
    setPermissions([]);
    router.push('/login');
  };

  const refreshUser = async () => {
    const res: any = await authApi.getProfile();
    applyProfile(res.data);
  };

  const can = useCallback(
    (permission: string) => matchPermission(permissions, permission),
    [permissions],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        isAdmin: user?.role === 'ADMIN',
        permissions,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

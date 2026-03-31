'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/auth-context';
import { authApi } from '@/lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [isSetupMode, setIsSetupMode] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    authApi
      .checkInit()
      .then((res: any) => {
        setIsSetupMode(!res.data.initialized);
      })
      .catch(() => {
        setIsSetupMode(false);
      })
      .finally(() => setChecking(false));
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (isSetupMode && !name.trim()) newErrors.name = '请输入姓名';
    if (!email.trim()) newErrors.email = '请输入邮箱地址';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = '请输入有效的邮箱地址';
    if (!password) newErrors.password = '请输入密码';
    else if (password.length < 6) newErrors.password = '密码长度不能少于6位';
    if (isSetupMode && password !== confirmPassword) newErrors.confirmPassword = '两次输入的密码不一致';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      if (isSetupMode) {
        const res: any = await authApi.setup({ email, password, name });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        toast.success('管理员账户创建成功！');
        window.location.href = '/dashboard';
        return;
      } else {
        await login(email, password);
        toast.success('登录成功');
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message || (isSetupMode ? '初始化失败，请重试' : '登录失败，请检查邮箱和密码');
      toast.error(Array.isArray(message) ? message[0] : message);
    } finally {
      setLoading(false);
    }
  };

  const clearFieldError = (field: string) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary-500 border-t-transparent" />
      </div>
    );
  }

  const inputClass = (field: string) =>
    `w-full px-4 py-3 rounded-xl border bg-white/80 backdrop-blur-sm text-[15px] transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 ${
      errors[field] ? 'border-red-400' : 'border-gray-200'
    }`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[400px] mx-4">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500 text-xl font-bold text-white shadow-apple-md mb-4">
            CRM
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-gray-900">外贸CRM</h1>
          <p className="text-[15px] text-gray-500 mt-1">
            {isSetupMode ? '首次使用，请设置管理员账户' : '请登录您的账户'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-apple-lg border border-gray-200/60 p-8">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {isSetupMode && (
              <div>
                <label htmlFor="name" className="label">姓名</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
                  placeholder="管理员姓名"
                  className={inputClass('name')}
                />
                {errors.name && <p className="text-red-500 text-xs mt-1.5">{errors.name}</p>}
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">邮箱地址</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                placeholder="name@example.com"
                className={inputClass('email')}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1.5">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="label">密码</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                placeholder={isSetupMode ? '设置密码（至少6位）' : '输入密码'}
                className={inputClass('password')}
              />
              {errors.password && <p className="text-red-500 text-xs mt-1.5">{errors.password}</p>}
            </div>

            {isSetupMode && (
              <div>
                <label htmlFor="confirmPassword" className="label">确认密码</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError('confirmPassword'); }}
                  placeholder="再次输入密码"
                  className={inputClass('confirmPassword')}
                />
                {errors.confirmPassword && <p className="text-red-500 text-xs mt-1.5">{errors.confirmPassword}</p>}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-primary-500 text-white text-[15px] font-semibold rounded-xl hover:bg-primary-600 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
            >
              {loading
                ? isSetupMode ? '创建中...' : '登录中...'
                : isSetupMode ? '创建管理员账户' : '登录'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          外贸CRM客户关系管理系统
        </p>
      </div>
    </div>
  );
}

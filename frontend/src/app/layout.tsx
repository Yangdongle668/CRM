import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { LogoProvider } from '@/contexts/logo-context';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: '维界系统',
  description: '维界系统 —— 客户关系与业务管理平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">
        <AuthProvider>
          <LogoProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: {
                  borderRadius: '12px',
                  background: 'rgba(28, 28, 30, 0.92)',
                  backdropFilter: 'blur(20px)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 500,
                  padding: '10px 16px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                },
                success: {
                  iconTheme: {
                    primary: '#34C759',
                    secondary: '#fff',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#FF3B30',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </LogoProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

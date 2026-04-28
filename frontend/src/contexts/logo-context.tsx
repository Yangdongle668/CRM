'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsApi } from '@/lib/api';

const CACHE_KEY = 'crm_logo_url';

interface LogoContextValue {
  logoUrl: string | null;
  refreshLogo: () => Promise<void>;
}

const LogoContext = createContext<LogoContextValue>({ logoUrl: null, refreshLogo: async () => {} });

export function LogoProvider({ children }: { children: React.ReactNode }) {
  // Seed synchronously from cache → no flash on render
  const [logoUrl, setLogoUrl] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null
  );

  /**
   * 把任意宽高比的 logo 重绘到方形 canvas 上，再作为 favicon。
   * 直接拿 URL 当 favicon 时，浏览器对横长 logo 会缩成一条几乎看不清的
   * 细带；先 contain 到方形画布、白底居中后，方形 16/32 像素槽位里展示
   * 就完整且正比例。
   */
  const buildSquareFaviconDataUrl = useCallback((url: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const size = 128;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          // 白底，避免透明 PNG 在深色浏览器主题里显示成黑块
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, size, size);
          // 居中等比缩放（contain）
          const ratio = Math.min(size / img.width, size / img.height);
          const w = img.width * ratio;
          const h = img.height * ratio;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }, []);

  const applyLogo = useCallback(
    async (url: string | null) => {
      setLogoUrl(url);
      if (!url) {
        localStorage.removeItem(CACHE_KEY);
        return;
      }
      localStorage.setItem(CACHE_KEY, url);

      // 拿一份方形版本做 favicon；失败则降级回原 URL（浏览器自己缩）。
      const square = await buildSquareFaviconDataUrl(url);
      const faviconHref = square || url;

      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = faviconHref;
      link.type = square ? 'image/png' : '';
    },
    [buildSquareFaviconDataUrl],
  );

  const refreshLogo = useCallback(async () => {
    try {
      const res: any = await settingsApi.getLogo();
      const url = res?.data?.logoUrl ?? null;
      applyLogo(url);
    } catch {}
  }, [applyLogo]);

  // On mount: apply cached favicon immediately, then fetch fresh URL
  useEffect(() => {
    if (logoUrl) applyLogo(logoUrl); // ensures favicon is set from cache
    refreshLogo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <LogoContext.Provider value={{ logoUrl, refreshLogo }}>{children}</LogoContext.Provider>;
}

export const useLogo = () => useContext(LogoContext);

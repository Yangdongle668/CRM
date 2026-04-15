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

  const applyLogo = useCallback((url: string | null) => {
    setLogoUrl(url);
    if (url) {
      localStorage.setItem(CACHE_KEY, url);
      // Update browser-tab favicon
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = url;
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  }, []);

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

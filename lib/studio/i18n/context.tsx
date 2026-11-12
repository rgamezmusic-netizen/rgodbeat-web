"use client";

import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { StudioLocale, StudioTranslations } from './types';
import { esTranslations } from './es';
import { enTranslations } from './en';

interface StudioI18nContextValue {
  locale: StudioLocale;
  setLocale: (locale: StudioLocale) => void;
  toggleLocale: () => void;
  t: StudioTranslations;
}

const STORAGE_KEY = 'rgodbeat_studio_lang';

const listeners = new Set<() => void>();

function getStoredLocale(): StudioLocale {
  if (typeof window === 'undefined') return 'es';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  try {
    const browserLang = (window.navigator?.language || '').toLowerCase();
    if (browserLang.startsWith('en')) return 'en';
  } catch {
    /* ignore */
  }
  return 'es';
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

let cachedLocale: StudioLocale | null = null;

function getSnapshot(): StudioLocale {
  if (typeof window === 'undefined') return 'es';
  if (cachedLocale === null) {
    cachedLocale = getStoredLocale();
  }
  return cachedLocale;
}

function getServerSnapshot(): StudioLocale {
  return 'es';
}

function updateLocale(next: StudioLocale) {
  cachedLocale = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const StudioI18nContext = createContext<StudioI18nContextValue>({
  locale: 'es',
  setLocale: () => {},
  toggleLocale: () => {},
  t: esTranslations,
});

export function StudioI18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((next: StudioLocale) => {
    updateLocale(next);
  }, []);

  const toggleLocale = useCallback(() => {
    updateLocale(getSnapshot() === 'es' ? 'en' : 'es');
  }, []);

  const t = useMemo(() => {
    return locale === 'en' ? enTranslations : esTranslations;
  }, [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t]
  );

  return (
    <StudioI18nContext.Provider value={value}>
      {children}
    </StudioI18nContext.Provider>
  );
}

export function useStudioI18n(): StudioI18nContextValue {
  return useContext(StudioI18nContext);
}

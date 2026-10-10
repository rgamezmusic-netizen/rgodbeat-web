"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { syncNavigationClock } from "@/lib/browser/navigation-clock";

const sections = [
  "/ranking/season", "/beats", "/", "/park", "/studio", "/download", "/services", "/about",
  "/park/catalog", "/park/registrations", "/park/documents", "/park/profile", "/park/projects",
];
const checkIntervalMs = 30_000;

export function NavigationPreloader() {
  const router = useRouter();
  const pathname = usePathname();
  const warmed = useRef(new Map<string, number>());
  const codeWarmed = useRef(false);

  useEffect(() => {
    // Keep background work out of recording, account and checkout workflows.
    if (!sections.includes(pathname) || pathname === "/studio") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    const available = () => !document.hidden && navigator.onLine;
    const schedule = (delay = 600) => {
      if (stopped || timer || idle !== undefined || !available()) return;
      timer = setTimeout(() => {
        timer = undefined;
        if ("requestIdleCallback" in window) {
          idle = window.requestIdleCallback(() => { idle = undefined; warmNext(); }, { timeout: 1500 });
        } else warmNext();
      }, delay);
    };
    const warmNext = () => {
      if (stopped || !available()) return;
      // Next owns cache freshness. Revisit the queue regularly; valid entries
      // are reused without network traffic and expired entries are fetched.
      const href = sections.find(route => route !== pathname && Date.now() - (warmed.current.get(route) ?? 0) >= checkIntervalMs);
      if (href) {
        warmed.current.set(href, Date.now());
        // AUTO only fetches loading boundaries for dynamic routes in this Next
        // version; FULL includes the actual data and page component chunks.
        router.prefetch(href, { kind: PrefetchKind.FULL, onInvalidate: () => {
          warmed.current.delete(href);
          if (!stopped) schedule();
        } });
        schedule();
      } else if (!codeWarmed.current) {
        codeWarmed.current = true;
        // Import code without mounting a DAW, opening checkout or fetching audio.
        void Promise.all([
          import("@/components/studio/StudioApp"),
          import("@/components/cart/CartDrawer"),
          import("@/components/player/BeatPlayer"),
        ]).catch(() => { codeWarmed.current = false; });
      }
    };
    const resume = () => {
      if (!available()) return;
      void syncNavigationClock();
      schedule(300);
    };
    const start = () => { resume(); };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    // Refresh warm data while the visitor stays on the same section.
    const refresh = setInterval(resume, checkIntervalMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(refresh);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      window.removeEventListener("load", start);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [pathname, router]);

  return null;
}

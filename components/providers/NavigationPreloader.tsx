"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { syncNavigationClock } from "@/lib/browser/navigation-clock";
import { canPrefetchInBackground, useBackgroundPrefetch } from "@/lib/browser/prefetch";

const sections = [
  "/ranking/season", "/beats", "/", "/studio", "/the-park", "/services", "/about",
];
const checkIntervalMs = 30_000;

export function NavigationPreloader() {
  const router = useRouter();
  const pathname = usePathname();
  const backgroundPrefetch = useBackgroundPrefetch();
  const warmed = useRef(new Map<string, number>());
  const codeWarmed = useRef(new Set<string>());
  const exploring = useRef(false);

  const warmCode = useCallback((feature: "studio" | "cart" | "player") => {
    if (!canPrefetchInBackground() || codeWarmed.current.has(feature)) return;
    codeWarmed.current.add(feature);
    const pending = feature === "studio" ? import("@/components/studio/StudioApp")
      : feature === "cart" ? import("@/components/cart/CartDrawer")
      : import("@/components/player/BeatPlayer");
    void pending.catch(() => { codeWarmed.current.delete(feature); });
  }, []);

  useEffect(() => {
    // Prepare heavier features only when the visitor approaches their controls.
    const warmIntent = (event: Event) => {
      if (!canPrefetchInBackground() || !(event.target instanceof Element)) return;
      const control = event.target.closest("a, button");
      if (!control) return;
      const href = control.getAttribute("href");
      const feature = href === "/studio" ? "studio"
        : /CART/i.test(control.textContent ?? "") ? "cart"
        : /^(Play preview of|Escuchar beat)/.test(control.getAttribute("aria-label") ?? "") ? "player" : null;
      if (feature) warmCode(feature);
    };
    document.addEventListener("pointerover", warmIntent, { passive: true });
    document.addEventListener("focusin", warmIntent);
    return () => {
      document.removeEventListener("pointerover", warmIntent);
      document.removeEventListener("focusin", warmIntent);
    };
  }, [warmCode]);

  useEffect(() => {
    // Keep background work out of recording, account and checkout workflows.
    if (!sections.includes(pathname) || pathname === "/studio") return;
    let stopped = false;
    let scrolling = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    const available = () => !scrolling && !document.hidden && canPrefetchInBackground();
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
      // Main destinations come first. Once the visitor explores the page,
      // extend the queue to the remaining public workspace and feature code.
      const routes = exploring.current || pathname.startsWith("/park") ? sections
        : sections.filter(route => !route.startsWith("/park/") && route !== "/the-park");
      // Next owns cache freshness. Revisit the queue regularly; valid entries
      // are reused without network traffic and expired entries are fetched.
      const href = routes.find(route => route !== pathname && Date.now() - (warmed.current.get(route) ?? 0) >= checkIntervalMs);
      if (href) {
        warmed.current.set(href, Date.now());
        // AUTO only fetches loading boundaries for dynamic routes in this Next
        // version; FULL includes the actual data and page component chunks.
        router.prefetch(href, { kind: PrefetchKind.FULL, onInvalidate: () => {
          warmed.current.delete(href);
          if (!stopped) schedule();
        } });
        schedule();
      } else if (exploring.current) {
        const feature = (["studio", "cart", "player"] as const).find(name => !codeWarmed.current.has(name));
        if (feature) {
          warmCode(feature);
          schedule();
        }
      }
    };
    const onScroll = () => {
      scrolling = true;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrolling = false;
        if (window.scrollY >= Math.min(window.innerHeight / 3, 240)) exploring.current = true;
        schedule(300);
      }, 180);
    };
    const resume = () => {
      // The tiny clock request keeps cached season deadlines correct even when
      // optional page downloads are disabled on a constrained connection.
      if (document.hidden || !navigator.onLine) return;
      void syncNavigationClock();
      schedule(300);
    };
    const start = () => { resume(); };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("scroll", onScroll, { passive: true });
    // Refresh warm data while the visitor stays on the same section.
    const refresh = setInterval(resume, checkIntervalMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(scrollTimer);
      clearInterval(refresh);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      window.removeEventListener("load", start);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname, router, backgroundPrefetch, warmCode]);

  return null;
}

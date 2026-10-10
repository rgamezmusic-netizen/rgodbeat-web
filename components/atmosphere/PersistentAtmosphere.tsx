"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { AtmosphereTheme } from "./types";

const AtmosphericBackground = dynamic(
  () => import("./AtmosphericBackground").then(module => module.AtmosphericBackground),
  { ssr: false },
);

const themes: Record<string, AtmosphereTheme> = {
  "/": "default",
  "/beats": "beats",
  "/cart": "beats",
  "/services": "services",
  "/about": "about",
  "/download": "default",
  "/the-park": "park",
  "/ranking": "default",
  "/ranking/season": "default",
};

export function PersistentAtmosphere() {
  const pathname = usePathname();
  const theme = themes[pathname] ?? "beats";
  const enabled = !/^\/(?:studio|admin|account|park|rg|api|login|reset-password|gifts|checkout|tickets|test-supabase|android)(?:\/|$)/.test(pathname);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready || !enabled) return;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loadWhenIdle = () => {
      // The page and its controls get priority over all decorative assets.
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      } else {
        timer = setTimeout(() => setReady(true), 300);
      }
    };
    if (document.readyState === "complete") loadWhenIdle();
    else window.addEventListener("load", loadWhenIdle, { once: true });
    return () => {
      window.removeEventListener("load", loadWhenIdle);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      clearTimeout(timer);
    };
  }, [enabled, ready]);

  if (!ready) return null;
  // Keep this instance mounted even in Studio or account screens. Hiding and
  // pausing it preserves the stars and the already loaded assets for the return.
  return <div className="fixed inset-0 pointer-events-none -z-10" hidden={!enabled} aria-hidden="true" data-persistent-atmosphere>
    <AtmosphericBackground
      theme={theme}
      intensity={pathname === "/beats" || pathname === "/cart" ? "medium" : "high"}
      enableStars
      starDensity="high"
      animate={enabled}
    />
  </div>;
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/contexts/CartContext";
import styles from "./FloatingSocialButtons.module.css";
import { WHATSAPP_URL } from "@/lib/contact";
import { isWorkspaceRoute } from "@/lib/site-layout";

// Links and SVG artwork supplied in ../botones-flotantes.html.
const links = [
  { service: "twitch", label: "Twitch", href: "https://www.twitch.tv/RGodbeat", path: "M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" },
  { service: "whatsapp", label: "WhatsApp", href: "https://wa.me/17373067677", path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" },
  { service: "telegram", label: "Telegram", href: "https://t.me/rgodbus", path: "M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" },
] as const;

// Accept a duration only: errors, empty responses and offline messages are not live.
function isLiveUptime(value: string) {
  return /^\d+\s+(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?)(?:,?\s+\d+\s+(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?))*$/i.test(value.trim());
}

export function FloatingSocialButtons() {
  const pathname = usePathname();
  const { isCartOpen } = useCart();
  const [live, setLive] = useState(false);
  const workspaceRoute = isWorkspaceRoute(pathname);

  useEffect(() => {
    if (workspaceRoute) return;
    let disposed = false;
    let controller: AbortController | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (document.hidden || controller) return;
      controller = new AbortController();
      timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch("https://decapi.me/twitch/uptime/RGodbeat", {
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        const nextLive = response.ok && isLiveUptime(await response.text());
        if (!disposed) setLive(nextLive);
      } catch {
        if (!disposed) setLive(false);
      } finally {
        clearTimeout(timeout);
        controller = null;
      }
    };
    // Give the visible page priority; status never blocks rendering or navigation.
    const firstCheck = setTimeout(check, 1500);
    const interval = setInterval(check, 120000);
    const onVisibility = () => {
      if (document.hidden) controller?.abort();
      else void check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      clearTimeout(firstCheck);
      clearTimeout(timeout);
      clearInterval(interval);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [workspaceRoute]);

  if (workspaceRoute) return null;

  return (
    <aside id="rg-float-stack" className={styles.stack} aria-label="Contacto y directos" hidden={isCartOpen}>
      {links.map(({ service, label, href, path }) => {
        const isLive = service === "twitch" && live;
        return (
          <a key={service} id={`rg-btn-${service}`} href={service === "whatsapp" ? WHATSAPP_URL : href} target="_blank" rel="noopener noreferrer"
            className={`${styles.button} ${styles[service]} ${isLive ? styles.live : ""}`}
            aria-label={isLive ? "Twitch: EN VIVO" : label} title={isLive ? "Twitch: EN VIVO" : label}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
            <span className={styles.label}>{isLive ? "🔴 EN VIVO" : label}</span>
          </a>
        );
      })}
    </aside>
  );
}

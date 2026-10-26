"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ContactProvider } from "@/components/contact/ContactProvider";
import { isWorkspaceRoute } from "@/lib/site-layout";
import dynamic from "next/dynamic";
import { PlayerProvider, usePlayerState } from "@/contexts/PlayerContext";
import { CartProvider, useCart } from "@/contexts/CartContext";
import { SocialSidebar } from "@/components/layout/SocialSidebar";
import { FloatingSocialButtons } from "@/components/layout/FloatingSocialButtons";
import { NavigationPreloader } from "@/components/providers/NavigationPreloader";

import { AtmosphereProvider } from "@/components/atmosphere/AtmosphereContext";
import { PersistentAtmosphere } from "@/components/atmosphere/PersistentAtmosphere";
import { RecoveryLinkRedirect } from "@/components/auth/RecoveryLinkRedirect";
import { useAppInstallation } from "@/hooks/useAppInstallation";
import { configureStudioServiceWorker } from "@/lib/browser/studio-service-worker";

const BeatPlayer = dynamic(() => import("@/components/player/BeatPlayer").then(mod => mod.BeatPlayer), { ssr: false });
const CartDrawer = dynamic(() => import("@/components/cart/CartDrawer").then(mod => mod.CartDrawer), { ssr: false });

function DeferredOverlays() {
  const { currentBeat } = usePlayerState();
  const { isCartOpen } = useCart();
  const [cartWasOpened, setCartWasOpened] = useState(false);
  // Keep checkout mounted after its first use so closing/reopening preserves it.
  if (isCartOpen && !cartWasOpened) setCartWasOpened(true);
  return <>
    {currentBeat && <BeatPlayer />}
    {cartWasOpened && <CartDrawer />}
  </>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Capture the browser's install offer before lazy Studio loads and keep it
  // available while the visitor navigates between the store and the Studio.
  useAppInstallation();
  useEffect(() => {
    const configure = () => {
      void configureStudioServiceWorker(process.env.NEXT_PUBLIC_STUDIO_SW_DISABLED !== 'true')
        .catch(() => { console.warn('[Studio] La caché de interfaz no está disponible.'); });
    };
    if (document.readyState === 'complete') configure();
    else window.addEventListener('load', configure, { once: true });
    return () => window.removeEventListener('load', configure);
  }, []);
  const workspace = isWorkspaceRoute(usePathname());
  return (
    <PlayerProvider>
      <CartProvider>
        <AtmosphereProvider>
          <ContactProvider>
            <RecoveryLinkRedirect />
            <NavigationPreloader />
            <PersistentAtmosphere />
            <div className={workspace ? undefined : "site-content"}>{children}</div>
            {!workspace && <SocialSidebar />}
            <FloatingSocialButtons />
            <DeferredOverlays />
          </ContactProvider>
        </AtmosphereProvider>
      </CartProvider>
    </PlayerProvider>
  );
}

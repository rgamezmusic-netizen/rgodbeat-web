"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { PlayerProvider, usePlayer } from "@/contexts/PlayerContext";
import { CartProvider, useCart } from "@/contexts/CartContext";
import { SocialSidebar } from "@/components/layout/SocialSidebar";

import { AtmosphereProvider } from "@/components/atmosphere/AtmosphereContext";
import { PersistentAtmosphere } from "@/components/atmosphere/PersistentAtmosphere";
import { RecoveryLinkRedirect } from "@/components/auth/RecoveryLinkRedirect";

const BeatPlayer = dynamic(() => import("@/components/player/BeatPlayer").then(mod => mod.BeatPlayer), { ssr: false });
const CartDrawer = dynamic(() => import("@/components/cart/CartDrawer").then(mod => mod.CartDrawer), { ssr: false });

function DeferredOverlays() {
  const { currentBeat } = usePlayer();
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
  return (
    <PlayerProvider>
      <CartProvider>
        <AtmosphereProvider>
          <RecoveryLinkRedirect />
          <PersistentAtmosphere />
          {children}
          <SocialSidebar />
          <DeferredOverlays />
        </AtmosphereProvider>
      </CartProvider>
    </PlayerProvider>
  );
}

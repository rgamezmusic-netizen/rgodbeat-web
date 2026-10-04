"use client";

import React from "react";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { CartProvider } from "@/contexts/CartContext";
import { BeatPlayer } from "@/components/player/BeatPlayer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { SocialSidebar } from "@/components/layout/SocialSidebar";

import { AtmosphereProvider } from "@/components/atmosphere";
import { RecoveryLinkRedirect } from "@/components/auth/RecoveryLinkRedirect";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <CartProvider>
        <AtmosphereProvider>
          <RecoveryLinkRedirect />
          {children}
          <SocialSidebar />
          <BeatPlayer />
          <CartDrawer />
        </AtmosphereProvider>
      </CartProvider>
    </PlayerProvider>
  );
}

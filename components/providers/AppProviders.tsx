"use client";

import React from "react";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { CartProvider } from "@/contexts/CartContext";
import { BeatPlayer } from "@/components/player/BeatPlayer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { SocialSidebar } from "@/components/layout/SocialSidebar";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <CartProvider>
        {children}
        <SocialSidebar />
        <BeatPlayer />
        <CartDrawer />
      </CartProvider>
    </PlayerProvider>
  );
}

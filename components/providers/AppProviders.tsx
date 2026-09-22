"use client";

import React from "react";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { CartProvider } from "@/contexts/CartContext";
import { BeatPlayer } from "@/components/player/BeatPlayer";
import { CartDrawer } from "@/components/cart/CartDrawer";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <CartProvider>
        {children}
        <BeatPlayer />
        <CartDrawer />
      </CartProvider>
    </PlayerProvider>
  );
}

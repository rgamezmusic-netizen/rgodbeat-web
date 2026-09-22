"use client";

import React, { createContext, useContext, useState } from "react";
import { Beat, CartItem, LicenseTier } from "@/types";
import { LICENSE_OPTIONS } from "@/lib/mock-data";

interface CartContextType {
  items: CartItem[];
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addToCart: (beat: Beat, tier?: LicenseTier) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  totalAmount: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);
  const toggleCart = () => setIsCartOpen((prev) => !prev);

  const addToCart = (beat: Beat, tier: LicenseTier = "mp3") => {
    const licenseConfig = LICENSE_OPTIONS.find((l) => l.id === tier) || LICENSE_OPTIONS[0];
    const cartItemId = `${beat.id}_${tier}`;

    setItems((prev) => {
      // Check if this beat with this license is already in cart
      const exists = prev.some((item) => item.id === cartItemId);
      if (exists) return prev;

      return [
        ...prev,
        {
          id: cartItemId,
          beat,
          licenseTier: tier,
          price: beat.pricing[tier] || licenseConfig.price,
          licenseName: licenseConfig.name,
        },
      ];
    });

    // Auto open drawer when adding to cart
    setIsCartOpen(true);
  };

  const removeFromCart = (cartItemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== cartItemId));
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalAmount = items.reduce((acc, item) => acc + item.price, 0);
  const itemCount = items.length;

  return (
    <CartContext.Provider
      value={{
        items,
        isCartOpen,
        openCart,
        closeCart,
        toggleCart,
        addToCart,
        removeFromCart,
        clearCart,
        totalAmount,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

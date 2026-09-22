"use client";

import React, { useState } from "react";
import Link from "next/link";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripe/client";
import { useCart } from "@/contexts/CartContext";
import { formatCurrency } from "@/lib/utils";
import { CartItemRow } from "./CartItemRow";
import { Button } from "@/components/ui/Button";

export function CartDrawer() {
  const { items, isCartOpen, closeCart, removeFromCart, clearCart, totalAmount, itemCount } = useCart();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  if (!isCartOpen) return null;

  const handleCheckout = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const payload = {
        embedded: true,
        items: items.map((item) => ({
          beatId: item.beat.id,
          licenseTier: item.licenseTier,
        })),
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to proceed to checkout.");
      }

      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Stripe checkout secret was not returned.");
      }
    } catch (err: any) {
      console.error("[Checkout Error]:", err);
      setErrorMessage(err.message || "Failed to initiate checkout. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setClientSecret(null);
    closeCart();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-fadeIn"
      />

      {/* Drawer Container */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div
          className={`w-screen ${
            clientSecret ? "max-w-lg" : "max-w-md"
          } bg-[#0e0e13] border-l border-white/[0.1] shadow-2xl flex flex-col justify-between animate-slideLeft transition-all duration-300`}
        >
          {/* Header */}
          <div className="p-6 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {clientSecret ? (
                <button
                  type="button"
                  onClick={() => setClientSecret(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-purple-400 hover:text-purple-300 uppercase tracking-wider font-bold transition-colors cursor-pointer"
                >
                  ← BACK TO CART
                </button>
              ) : (
                <>
                  <span className="font-extrabold text-lg tracking-wider text-white">YOUR CART</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {itemCount} {itemCount === 1 ? "ITEM" : "ITEMS"}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close Cart"
              className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Embedded Stripe Checkout Mode */}
          {clientSecret ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#08080c] space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400 border-b border-white/[0.06] pb-3">
                <span>TOTAL DUE:</span>
                <span className="text-base font-bold text-white">{formatCurrency(totalAmount)}</span>
              </div>

              {/* Stripe Embedded Checkout Container */}
              <div className="rounded-xl overflow-hidden min-h-[420px]">
                <EmbeddedCheckoutProvider
                  stripe={getStripeClient()}
                  options={{ clientSecret }}
                >
                  <EmbeddedCheckout className="w-full" />
                </EmbeddedCheckoutProvider>
              </div>
            </div>
          ) : (
            /* Standard Cart Items Body */
            <div className="flex-1 overflow-y-auto p-6 space-y-3.5">
              {errorMessage && (
                <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-mono">
                  {errorMessage}
                </div>
              )}

              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-zinc-500">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <circle cx="9" cy="21" r="1" />
                      <circle cx="20" cy="21" r="1" />
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-white text-base">Your cart is empty</h3>
                    <p className="text-xs text-zinc-400 max-w-xs">
                      Browse the catalog and add master licenses or stems to your cart.
                    </p>
                  </div>
                  <Button
                    onClick={closeCart}
                    href="/beats"
                    variant="primary"
                    size="sm"
                    className="mt-2"
                  >
                    EXPLORE BEATS →
                  </Button>
                </div>
              ) : (
                items.map((item) => (
                  <CartItemRow
                    key={item.id}
                    item={item}
                    onRemove={removeFromCart}
                    onCloseCart={closeCart}
                  />
                ))
              )}
            </div>
          )}

          {/* Footer Subtotal & Actions (Only when not in embedded checkout) */}
          {!clientSecret && items.length > 0 && (
            <div className="p-6 border-t border-white/[0.08] bg-[#09090d] space-y-4">
              <div className="flex items-center justify-between text-sm font-mono">
                <span className="text-zinc-400">SUBTOTAL</span>
                <span className="text-lg font-bold text-white">
                  {formatCurrency(totalAmount)}
                </span>
              </div>

              <div className="text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                <span>Instant Digital Delivery</span>
                <span>Stripe Test Mode Secure</span>
              </div>

              {/* Checkout Button */}
              <Button
                variant="primary"
                size="lg"
                className="w-full justify-center text-sm tracking-wider"
                onClick={handleCheckout}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    LOADING PAYMENT FORM...
                  </span>
                ) : (
                  `PROCEED TO CHECKOUT (${formatCurrency(totalAmount)})`
                )}
              </Button>

              <button
                type="button"
                onClick={clearCart}
                className="w-full text-center text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors py-1 cursor-pointer"
              >
                Clear Cart
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

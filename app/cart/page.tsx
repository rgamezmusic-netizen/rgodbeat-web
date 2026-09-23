"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { AtmosphericBackground } from "@/components/atmosphere";
import { useCart } from "@/contexts/CartContext";

export default function CartPage() {
  const { openCart, items, totalAmount, removeFromCart } = useCart();

  useEffect(() => {
    // Automatically trigger cart slideover
    openCart();
  }, [openCart]);

  return (
    <div className="relative min-h-screen bg-transparent text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      <AtmosphericBackground theme="beats" intensity="medium" enableStars={true} animate={true} />
      <Navbar />

      <main className="relative z-10 flex-1 pt-28 sm:pt-36 pb-24 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        <div className="mb-8 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
              CHECKOUT // CARRITO DE COMPRAS
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight uppercase">
            TU CARRITO
          </h1>
        </div>

        {items.length === 0 ? (
          <div className="p-12 rounded-3xl bg-[#0c0c12]/70 border border-white/[0.08] backdrop-blur-2xl text-center space-y-6">
            <div className="w-14 h-14 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Tu carrito está vacío</h2>
              <p className="text-sm text-zinc-400 max-w-md mx-auto">
                No tienes beats seleccionados. Explora el catálogo de RGODBEAT para elegir tu licencia.
              </p>
            </div>
            <Link
              href="/beats"
              className="inline-block px-8 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)]"
            >
              EXPLORAR BEATS
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-3xl bg-[#0c0c12]/70 border border-white/[0.08] backdrop-blur-2xl p-6 sm:p-8 space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 py-4 border-b border-white/[0.06] last:border-0"
                >
                  <div>
                    <h3 className="text-base font-bold text-white">{item.beat.title}</h3>
                    <p className="text-xs text-purple-400 uppercase font-mono tracking-wider">
                      Licencia: {item.licenseName || item.licenseTier}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-white">${item.price.toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id)}
                      className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}

              <div className="pt-4 flex items-center justify-between border-t border-white/[0.08]">
                <span className="text-sm font-bold uppercase tracking-wider text-zinc-400">Total:</span>
                <span className="text-xl font-extrabold text-white">${totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link
                href="/beats"
                className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold tracking-wider uppercase transition-colors"
              >
                Seguir comprando
              </Link>
              <button
                type="button"
                onClick={openCart}
                className="px-8 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold tracking-widest uppercase transition-all shadow-[0_0_24px_rgba(168,85,247,0.4)]"
              >
                Proceder al Pago
              </button>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

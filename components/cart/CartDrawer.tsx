"use client";

import React, { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripe/client";
import { useCart } from "@/contexts/CartContext";
import { formatCurrency } from "@/lib/utils";
import { CartItemRow } from "./CartItemRow";
import { Button } from "@/components/ui/Button";

export function CartDrawer() {
  const { items, isCartOpen, closeCart, removeFromCart, clearCart, totalAmount, itemCount } = useCart();
  const hasExclusiveLicense = items.some((item) => item.licenseTier === "exclusive");
  const hasNonExclusiveLicense = items.some((item) => item.licenseTier !== "exclusive");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutTotal, setCheckoutTotal] = useState<number | null>(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [completionStatus, setCompletionStatus] = useState<"idle" | "loading" | "ready" | "pending" | "error">("idle");
  const [completedPurchases, setCompletedPurchases] = useState<Array<{ id: string; licenseTier: string; beatTitle: string }>>([]);

  const handleEmbeddedComplete = useCallback(async () => {
    setCheckoutComplete(true);
    if (!checkoutSessionId) {
      setCompletionStatus("error");
      setErrorMessage("No pudimos identificar esta sesión de pago. Contacta a soporte antes de volver a pagar.");
      return;
    }

    setCompletionStatus("loading");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/checkout/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: checkoutSessionId }),
      });
      const data = await response.json();

      if (response.status === 202) {
        setCompletionStatus("pending");
        return;
      }
      if (!response.ok) {
        throw new Error(data.error || "No pudimos cargar tu compra.");
      }

      setCompletedPurchases(data.purchases || []);
      setCheckoutTotal(typeof data.totalAmount === "number" ? data.totalAmount : checkoutTotal);
      setCompletionStatus("ready");
      clearCart();
    } catch (error: any) {
      console.error("[Checkout Completion Error]:", error);
      setErrorMessage(error.message || "No pudimos cargar tus archivos. Inténtalo de nuevo.");
      setCompletionStatus("error");
    }
  }, [checkoutSessionId, checkoutTotal, clearCart]);
  const completionHandlerRef = useRef(handleEmbeddedComplete);
  completionHandlerRef.current = handleEmbeddedComplete;
  const handleStripeComplete = useCallback(() => {
    void completionHandlerRef.current();
  }, []);

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
        if (typeof data.sessionId !== "string") {
          throw new Error("No se recibió el identificador de la sesión de pago.");
        }
        setCheckoutTotal(typeof data.totalAmount === "number" ? data.totalAmount : null);
        setCheckoutSessionId(data.sessionId);
        setCheckoutComplete(false);
        setCompletionStatus("idle");
        setCompletedPurchases([]);
        setClientSecret(data.clientSecret);
      } else {
        throw new Error("No se recibió el formulario de pago integrado.");
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
    setCheckoutTotal(null);
    setCheckoutSessionId(null);
    setCheckoutComplete(false);
    setCompletionStatus("idle");
    setCompletedPurchases([]);
    setErrorMessage(null);
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
                  onClick={() => {
                    setClientSecret(null);
                    setCheckoutTotal(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-purple-400 hover:text-purple-300 uppercase tracking-wider font-bold transition-colors cursor-pointer"
                >
                  ← VOLVER AL CARRITO
                </button>
              ) : (
                <>
                  <span className="font-extrabold text-lg tracking-wider text-white">TU CARRITO</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {itemCount} {itemCount === 1 ? "ARTÍCULO" : "ARTÍCULOS"}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Cerrar carrito"
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
              {checkoutComplete ? (
                <div className="space-y-5 py-3">
                  <div className="text-center space-y-2">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 text-2xl">✓</div>
                    <h2 className="text-xl font-bold text-white">
                      {completionStatus === "ready" ? "Pago confirmado" : "Pago recibido"}
                    </h2>
                    <p className="text-sm text-zinc-400">
                      {completionStatus === "ready"
                        ? "Tu compra y tus archivos están listos aquí."
                        : completionStatus === "loading"
                          ? "Estamos verificando el pago y preparando tus archivos."
                          : "Estamos terminando de verificar la compra. Actualiza el estado antes de volver a pagar."}
                    </p>
                    {checkoutTotal !== null && (
                      <p className="text-sm font-mono text-emerald-300">TOTAL: {formatCurrency(checkoutTotal)}</p>
                    )}
                  </div>

                  {completionStatus === "ready" && completedPurchases.length > 0 && (
                    <div className="space-y-3">
                      {completedPurchases.map((purchase) => (
                        <div key={purchase.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                          <div>
                            <h3 className="font-semibold text-white">{purchase.beatTitle}</h3>
                            <p className="text-xs uppercase tracking-wide text-purple-300">Licencia {purchase.licenseTier}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <a href={`/api/download/${purchase.id}?fileType=mp3`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">Descargar MP3</a>
                            {purchase.licenseTier !== "mp3" && (
                              <a href={`/api/download/${purchase.id}?fileType=wav`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10">Descargar WAV</a>
                            )}
                            <a href={`/api/download/${purchase.id}?fileType=contract`} className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-200 hover:bg-purple-500/20">Contrato PDF</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {completionStatus === "ready" && completedPurchases.length === 0 && (
                    <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
                      Tu pago está confirmado. Estamos terminando de preparar tus licencias.
                    </p>
                  )}

                  {(completionStatus === "pending" || completionStatus === "error" || completionStatus === "loading") && (
                    <div className="space-y-3">
                      {errorMessage && <p role="alert" className="text-sm text-amber-200">{errorMessage}</p>}
                      <button type="button" onClick={() => void handleEmbeddedComplete()} disabled={completionStatus === "loading"} className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60">
                        {completionStatus === "loading" ? "CARGANDO TU COMPRA..." : "ACTUALIZAR ESTADO DE LA COMPRA"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-400 border-b border-white/[0.06] pb-3">
                    <span>TOTAL A PAGAR:</span>
                    <span className="text-base font-bold text-white">{formatCurrency(checkoutTotal ?? totalAmount)}</span>
                  </div>

                  <div className="rounded-xl overflow-hidden min-h-[420px]">
                    <EmbeddedCheckoutProvider
                      stripe={getStripeClient()}
                      options={{ clientSecret, onComplete: handleStripeComplete }}
                    >
                      <EmbeddedCheckout className="w-full" />
                    </EmbeddedCheckoutProvider>
                  </div>
                </>
              )}
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
                    <h3 className="font-semibold text-white text-base">Tu carrito está vacío</h3>
                    <p className="text-xs text-zinc-400 max-w-xs">
                      Explora el catálogo y selecciona una licencia para agregarla al carrito.
                    </p>
                  </div>
                  <Button
                    onClick={closeCart}
                    href="/beats"
                    variant="primary"
                    size="sm"
                    className="mt-2"
                  >
                    EXPLORAR BEATS →
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
                <span>Entrega digital</span>
                <span>Pago con Stripe</span>
              </div>

              {/* Electronic Acceptance Disclosure */}
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[10px] text-zinc-400 font-mono leading-relaxed">
                <span className="text-purple-400 font-semibold block mb-0.5">⚖️ ACEPTACIÓN DE LICENCIA</span>
                Al continuar al pago, aceptas los acuerdos correspondientes a las licencias de tu carrito:{" "}
                {hasNonExclusiveLicense && (
                  <a
                    href="/contracts/templates/non_exclusive_master_v1.html"
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-300 underline hover:text-white transition-colors"
                  >
                    licencia no exclusiva (NE-v1.0)
                  </a>
                )}
                {hasNonExclusiveLicense && hasExclusiveLicense && " y "}
                {hasExclusiveLicense && (
                  <a
                    href="/contracts/templates/exclusive_master_v1.html"
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-300 underline hover:text-white transition-colors"
                  >
                    licencia exclusiva (EX-v1.0)
                  </a>
                )}.
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
                    CARGANDO FORMULARIO DE PAGO...
                  </span>
                ) : (
                  `CONTINUAR AL PAGO (${formatCurrency(totalAmount)})`
                )}
              </Button>

              <button
                type="button"
                onClick={clearCart}
                className="w-full text-center text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors py-1 cursor-pointer"
              >
                Vaciar carrito
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

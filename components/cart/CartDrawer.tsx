"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripe/client";
import { useCart } from "@/contexts/CartContext";
import { formatCurrency } from "@/lib/utils";
import { CartItemRow } from "./CartItemRow";
import { Button } from "@/components/ui/Button";
import { isGiftCheckoutVisible } from "@/lib/commerce/gift-feature";
import { fetchRgWalletSummary, type RgWalletSummary } from "@/lib/rg/product/wallet-client";
import { RgWalletStatus } from "@/components/rg/RgWalletStatus";

export function CartDrawer() {
  const router = useRouter();
  const giftCheckoutVisible = isGiftCheckoutVisible();
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
  const [recipientMode, setRecipientMode] = useState<"self" | "gift">("self");
  const [recipientKind, setRecipientKind] = useState<"artist" | "email">("email");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<Array<{ stage_name: string; slug: string; bio: string | null }>>([]);
  const [selectedArtist, setSelectedArtist] = useState<{ stage_name: string; slug: string; bio: string | null } | null>(null);
  const [giftStatus, setGiftStatus] = useState<string | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "rg_beat_pass">("stripe");
  const [passWallet, setPassWallet] = useState<RgWalletSummary | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [completedWithPass, setCompletedWithPass] = useState(false);
  const passRequestRef = useRef<{ signature: string; key: string } | null>(null);

  const walletReadRef = useRef({ sequence: 0 });
  const refreshPassWallet = useCallback(async () => {
    const reads = walletReadRef.current;
    const readId = ++reads.sequence;
    setWalletLoading(true);
    setPassWallet(null);
    setWalletError(null);
    try {
      const wallet = await fetchRgWalletSummary();
      if (readId === reads.sequence) setPassWallet(wallet);
    } catch {
      if (readId === reads.sequence) setWalletError("No pudimos consultar tu saldo ni tus pases. Vuelve a abrir el carrito para intentarlo de nuevo.");
    } finally { if (readId === reads.sequence) setWalletLoading(false); }
  }, []);

  useEffect(() => {
    if (!isCartOpen) return;
    const reads = walletReadRef.current;
    const refresh = () => { void refreshPassWallet(); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { reads.sequence++; window.removeEventListener("focus", refresh); };
  }, [isCartOpen, paymentMethod, refreshPassWallet]);

  useEffect(() => {
    if (recipientMode !== "gift" || recipientKind !== "artist" || artistQuery.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/gift/artists?q=${encodeURIComponent(artistQuery.trim())}`, { signal: controller.signal });
        const data = await response.json();
        if (response.ok) setArtistResults(Array.isArray(data.artists) ? data.artists : []);
        else setGiftError(data.error || "No se pudo buscar RG Artists.");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setGiftError("No se pudo buscar RG Artists.");
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [artistQuery, recipientKind, recipientMode]);

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
      setGiftStatus(data.giftStatus || null);
      setCompletedWithPass(false);
      setCheckoutTotal(typeof data.totalAmount === "number" ? data.totalAmount : checkoutTotal);
      setCompletionStatus("ready");
      clearCart();
    } catch (error: unknown) {
      console.error("[Checkout Completion Error]:", error);
      setErrorMessage(error instanceof Error ? error.message : "No pudimos cargar tus archivos. Inténtalo de nuevo.");
      setCompletionStatus("error");
    }
  }, [checkoutSessionId, checkoutTotal, clearCart]);
  const completionHandlerRef = useRef(handleEmbeddedComplete);
  useEffect(() => { completionHandlerRef.current = handleEmbeddedComplete; }, [handleEmbeddedComplete]);
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
        paymentMethod,
        recipientMode,
        ...(recipientMode === "gift" ? recipientKind === "email"
          ? { recipientKind, recipientEmail: recipientEmail.trim() }
          : { recipientKind, recipientArtistSlug: selectedArtist?.slug }
          : {}),
        items: items.map((item) => ({
          beatId: item.beat.id,
          licenseTier: item.licenseTier,
      })),
    };

      if (paymentMethod === "rg_beat_pass") {
        const signature = JSON.stringify(payload);
        if (!passRequestRef.current) {
          try {
            const saved = JSON.parse(sessionStorage.getItem("rg-beat-pass-redemption-request-v1") || "null") as { signature?: string; key?: string } | null;
            if (saved?.signature === signature && saved.key) passRequestRef.current = { signature, key: saved.key };
          } catch { sessionStorage.removeItem("rg-beat-pass-redemption-request-v1"); }
        }
        if (!passRequestRef.current || passRequestRef.current.signature !== signature) {
          passRequestRef.current = { signature, key: crypto.randomUUID() };
        }
        sessionStorage.setItem("rg-beat-pass-redemption-request-v1", JSON.stringify(passRequestRef.current));
        const response = await fetch("/api/checkout/rg-beat-pass", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, idempotencyKey: passRequestRef.current.key }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo canjear RG Beat Pass.");
        setCheckoutTotal(0);
        setCompletedPurchases(data.purchases || []);
        setGiftStatus(data.giftStatus || null);
        setCheckoutSessionId(null);
        setCompletedWithPass(true);
        setCheckoutComplete(true);
        setCompletionStatus("ready");
        setClientSecret(null);
        clearCart();
        passRequestRef.current = null;
        sessionStorage.removeItem("rg-beat-pass-redemption-request-v1");
        return;
      }

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
    } catch (err: unknown) {
      console.error("[Checkout Error]:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to initiate checkout. Please try again.");
    } finally {
      if (paymentMethod === "rg_beat_pass") {
        await refreshPassWallet();
        router.refresh();
        window.dispatchEvent(new Event("rg-wallet-updated"));
      }
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
    setGiftStatus(null);
    setRecipientMode("self");
    setRecipientKind("email");
    setRecipientEmail("");
    setArtistQuery("");
    setArtistResults([]);
    setSelectedArtist(null);
    setGiftError(null);
    setPaymentMethod("stripe");
    setCompletedWithPass(false);
    passRequestRef.current = null;
    setErrorMessage(null);
    closeCart();
  };

  return (
    <div className="fixed inset-0 z-50 h-dvh overflow-hidden">
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
          } h-full min-h-0 min-w-0 bg-[#0e0e13] border-l border-white/[0.1] shadow-2xl flex flex-col animate-slideLeft transition-all duration-300`}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-4 sm:px-6 border-b border-white/[0.08] flex items-center justify-between">
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
          {clientSecret || checkoutComplete ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 bg-[#08080c] space-y-4">
              {checkoutComplete ? (
                <div className="space-y-5 py-3">
                  <div className="text-center space-y-2">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 text-2xl">✓</div>
                    <h2 className="text-xl font-bold text-white">
                      {completionStatus === "ready" ? completedWithPass ? "Canje confirmado" : "Pago confirmado" : "Pago recibido"}
                    </h2>
                    <p className="text-sm text-zinc-400">
                      {completionStatus === "ready"
                        ? completedWithPass ? "Tu RG Beat Pass se aplicó y la licencia quedó preparada." : "Tu compra y tus archivos están listos aquí."
                        : completionStatus === "loading"
                          ? "Estamos verificando el pago y preparando tus archivos."
                          : "Estamos terminando de verificar la compra. Actualiza el estado antes de volver a pagar."}
                    </p>
                    {checkoutTotal !== null && (
                      <p className="text-sm font-mono text-emerald-300">{completedWithPass ? "TOTAL: 0 USD · RG BEAT PASS" : `TOTAL: ${formatCurrency(checkoutTotal)}`}</p>
                    )}
                  </div>

                  {completedWithPass && <section className="rounded-xl border border-amber-300/20 bg-amber-300/[0.035] p-4 space-y-3">
                    <RgWalletStatus wallet={passWallet} />
                    <p className="text-xs text-emerald-300">RG BEAT PASS: CONSUMED · Se usó 1 pase en este canje.</p>
                    {walletLoading && <p role="status" className="text-xs text-zinc-400">Consultando estado actualizado…</p>}
                    {walletError && <p role="alert" className="text-xs text-rose-300">{walletError}</p>}
                  </section>}

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

                  {completionStatus === "ready" && giftStatus && (
                    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
                      <strong className="block text-xs tracking-wider">{giftStatus === "claimed" ? "REGALO RECLAMADO" : "ESPERANDO RECLAMO"}</strong>
                      <span className="mt-1 block text-zinc-300">{giftStatus === "claimed" ? "La licencia quedó disponible para el destinatario." : "Enviamos las instrucciones para reclamar la licencia."}</span>
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
            <div role="region" aria-label="Contenido del carrito" tabIndex={0}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-3.5">
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

              {items.length > 0 && <div className="space-y-4 border-t border-white/[0.08] pt-5">
                {passWallet?.beatPassEnabled && items.length === 1 && passWallet.beatPassEligibleTiers.includes(items[0].licenseTier) && <section className="rounded-xl border border-amber-300/20 bg-amber-300/[0.035] p-4 space-y-2">
                  <h2 className="text-xs font-mono font-bold tracking-wider text-amber-200">PAGA CON</h2>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setPaymentMethod("stripe")} disabled={isLoading} aria-pressed={paymentMethod === "stripe"} className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${paymentMethod === "stripe" ? "border-purple-400 bg-purple-500/15 text-purple-100" : "border-white/10 text-zinc-400"}`}>PAGO NORMAL</button>
                    <button type="button" onClick={() => setPaymentMethod("rg_beat_pass")} disabled={isLoading || passWallet.availableBeatPasses < 1} aria-pressed={paymentMethod === "rg_beat_pass"} className={`rounded-lg border px-3 py-2.5 text-xs font-semibold disabled:opacity-50 ${paymentMethod === "rg_beat_pass" ? "border-amber-300 bg-amber-300/10 text-amber-100" : "border-white/10 text-zinc-400"}`}>RG BEAT PASS ({passWallet.availableBeatPasses})</button>
                  </div>
                  {passWallet.availableBeatPasses < 1 && <p className="text-[11px] text-zinc-400">Compra un pase desde <a className="text-amber-200 underline" href="/rg/market">RG Market</a>.</p>}
                </section>}

                {paymentMethod === "rg_beat_pass" && <section className="rounded-xl border border-amber-300/20 bg-amber-300/[0.035] p-4 space-y-3">
                  <RgWalletStatus wallet={passWallet} />
                  <p className="text-xs text-zinc-300">Esta compra consume 1 RG Beat Pass disponible. No se descontarán RG adicionales.</p>
                  {walletLoading && <p role="status" className="text-xs text-zinc-400">Consultando saldo y pases…</p>}
                  <button type="button" onClick={() => setPaymentMethod("stripe")} disabled={isLoading} className="text-xs text-zinc-300 underline hover:text-white disabled:opacity-50">USAR PAGO NORMAL</button>
                </section>}
                {walletError && <p role="alert" className="text-xs text-rose-300">{walletError}</p>}

                {giftCheckoutVisible ? <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-3">
                  <h2 className="text-xs font-mono font-bold tracking-wider text-white">¿PARA QUIÉN ES?</h2>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setRecipientMode("self"); setArtistResults([]); }} aria-pressed={recipientMode === "self"} className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${recipientMode === "self" ? "border-purple-400 bg-purple-500/15 text-purple-100" : "border-white/10 text-zinc-400"}`}>PARA MÍ</button>
                    <button type="button" onClick={() => { setRecipientMode("gift"); setArtistResults([]); }} aria-pressed={recipientMode === "gift"} className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${recipientMode === "gift" ? "border-amber-400 bg-amber-400/10 text-amber-100" : "border-white/10 text-zinc-400"}`}>ENVIAR COMO REGALO</button>
                  </div>
                  {recipientMode === "gift" && <div className="space-y-3">
                    <p className="text-[11px] text-zinc-400">La licencia y los 30 días de Studio serán para quien reciba el beat.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setRecipientKind("artist"); setArtistResults([]); }} aria-pressed={recipientKind === "artist"} className={`rounded-lg border px-3 py-2 text-xs ${recipientKind === "artist" ? "border-amber-300 text-amber-100" : "border-white/10 text-zinc-400"}`}>RG ARTIST</button>
                      <button type="button" onClick={() => { setRecipientKind("email"); setArtistResults([]); }} aria-pressed={recipientKind === "email"} className={`rounded-lg border px-3 py-2 text-xs ${recipientKind === "email" ? "border-amber-300 text-amber-100" : "border-white/10 text-zinc-400"}`}>CORREO</button>
                    </div>
                    {recipientKind === "email" ? <label className="block space-y-1.5 text-[11px] text-zinc-400">CORREO DEL DESTINATARIO
                      <input type="email" autoComplete="off" maxLength={254} value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="artista@correo.com" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400" />
                    </label> : <div className="space-y-2">
                      <label className="block space-y-1.5 text-[11px] text-zinc-400">BUSCAR RG ARTIST
                        <input value={artistQuery} onChange={(event) => { setArtistQuery(event.target.value); setArtistResults([]); setSelectedArtist(null); }} placeholder="Nombre artístico" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400" />
                      </label>
                      {artistResults.length > 0 && !selectedArtist && <ul className="max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-[#111116]">{artistResults.map((artist) => <li key={artist.slug}><button type="button" onClick={() => { setSelectedArtist(artist); setArtistQuery(artist.stage_name); setArtistResults([]); }} className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/5"><span className="block font-semibold">{artist.stage_name}</span><span className="text-xs text-zinc-500">RG Artist</span></button></li>)}</ul>}
                      {selectedArtist && <p className="text-xs text-amber-100">La licencia será para {selectedArtist.stage_name}.</p>}
                  </div>}
                  {giftError && <p role="alert" className="text-xs text-rose-300">{giftError}</p>}
                </div>}
              </section> : <p className="text-xs text-zinc-500">Esta compra es para ti.</p>}

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

              </div>}
            </div>
          )}

          {/* Footer Subtotal & Actions (Only when not in embedded checkout) */}
          {!clientSecret && !checkoutComplete && items.length > 0 && (
            <footer aria-label="Confirmar compra" className="shrink-0 border-t border-white/[0.08] bg-[#09090d] px-4 pt-3 sm:px-6 space-y-2"
              style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
              <div className="flex items-center justify-between text-sm font-mono">
                <span className="text-zinc-400">SUBTOTAL</span>
                <span className="text-lg font-bold text-white">
                  {formatCurrency(paymentMethod === "rg_beat_pass" ? 0 : totalAmount)}
                </span>
              </div>

              <div className="text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                <span>Entrega digital</span>
                <span>{paymentMethod === "rg_beat_pass" ? "Canje RG" : "Pago con Stripe"}</span>
              </div>

              {/* Checkout Button */}
              <Button
                variant="primary"
                size="lg"
                className="w-full justify-center text-sm tracking-wider"
                onClick={handleCheckout}
                disabled={isLoading || (paymentMethod === "rg_beat_pass" && (walletLoading || !passWallet?.beatPassEnabled || passWallet.availableBeatPasses < 1 || items.length !== 1 || !passWallet.beatPassEligibleTiers.includes(items[0]?.licenseTier || ""))) || (recipientMode === "gift" && (recipientKind === "email"
                  ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())
                  : !selectedArtist))}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {paymentMethod === "rg_beat_pass" ? "CANJEANDO RG BEAT PASS..." : "CARGANDO FORMULARIO DE PAGO..."}
                  </span>
                ) : (
                  paymentMethod === "rg_beat_pass" ? "CANJEAR RG BEAT PASS" : recipientMode === "gift" ? `CONFIRMAR REGALO (${formatCurrency(totalAmount)})` : `CONTINUAR AL PAGO (${formatCurrency(totalAmount)})`
                )}
              </Button>

              <button
                type="button"
                onClick={clearCart}
                className="w-full text-center text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors py-1 cursor-pointer"
              >
                Vaciar carrito
              </button>
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}

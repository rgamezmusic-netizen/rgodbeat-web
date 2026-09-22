"use client";

import React, { useState } from "react";
import { Beat, LicenseTier } from "@/types";
import { LICENSE_OPTIONS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/contexts/CartContext";

interface LicenseSelectorProps {
  beat: Beat;
}

export function LicenseSelector({ beat }: LicenseSelectorProps) {
  const [selectedTier, setSelectedTier] = useState<LicenseTier>("wav");
  const { addToCart } = useCart();

  const currentOption =
    LICENSE_OPTIONS.find((opt) => opt.id === selectedTier) || LICENSE_OPTIONS[1];

  const currentPrice = beat.pricing[selectedTier] || currentOption.price;

  const handleAddToCart = () => {
    addToCart(beat, selectedTier);
  };

  const handleBuyNow = () => {
    addToCart(beat, selectedTier);
  };

  return (
    <section aria-labelledby="licensing-heading" className="rounded-2xl bg-[#0d0d12] border border-white/[0.08] p-6 sm:p-8 space-y-6">
      {/* License Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <span className="text-[11px] font-mono text-purple-400 uppercase tracking-widest block">
            LICENSE & USAGE RIGHTS
          </span>
          <h2 id="licensing-heading" className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
            Select Your License
          </h2>
        </div>

        <div className="sm:text-right">
          <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white">
            {formatCurrency(currentPrice)}
          </div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            One-time licensing payment
          </span>
        </div>
      </div>

      {/* License Tiers Selection Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {LICENSE_OPTIONS.map((opt) => {
          const tier = (opt.slug || opt.id) as LicenseTier;
          const isSelected = selectedTier === tier;
          const price = beat.pricing[tier] || opt.price;

          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedTier(tier)}
              className={`flex flex-col justify-between p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "bg-purple-500/10 border-purple-500 text-white shadow-[0_0_24px_rgba(168,85,247,0.18)]"
                  : "bg-[#121217] border-white/[0.06] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider">
                  {opt.id}
                </span>
                {opt.recommended && (
                  <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-purple-500 text-white font-bold tracking-wider">
                    POPULAR
                  </span>
                )}
              </div>

              <div className="text-base sm:text-lg font-mono font-bold text-white mt-2">
                {formatCurrency(price)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected License Breakdown Panel */}
      <div className="p-5 sm:p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/[0.06] pb-3">
          <div className="text-base font-bold text-white tracking-tight">
            {currentOption.name}
          </div>
          <span className="text-xs font-mono text-purple-300">
            {currentOption.format}
          </span>
        </div>

        {/* Feature List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {currentOption.features.map((feat, idx) => (
            <div key={idx} className="flex items-center gap-2.5 text-xs text-zinc-300">
              <svg
                className="w-3.5 h-3.5 text-purple-400 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{feat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Purchase Actions (Primary Dominant BUY NOW — $XX + Secondary ADD TO CART) */}
      <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
        {/* Dominant Primary CTA */}
        <Button
          type="button"
          onClick={handleBuyNow}
          variant="primary"
          size="lg"
          className="w-full sm:flex-[1.4] justify-center font-bold tracking-wider text-sm shadow-[0_0_25px_rgba(255,255,255,0.18)]"
        >
          BUY NOW — {formatCurrency(currentPrice)}
        </Button>

        {/* Secondary Clean CTA */}
        <Button
          type="button"
          onClick={handleAddToCart}
          variant="secondary"
          size="lg"
          className="w-full sm:flex-1 justify-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span>ADD TO CART</span>
        </Button>
      </div>

      <div className="text-center text-[11px] font-mono text-zinc-500 pt-1">
        🔒 Encrypted Checkout • Instant Master File Download Link • Official Signed Contract
      </div>
    </section>
  );
}

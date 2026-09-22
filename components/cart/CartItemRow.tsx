"use client";

import React from "react";
import Link from "next/link";
import { CartItem } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface CartItemRowProps {
  item: CartItem;
  onRemove: (id: string) => void;
  onCloseCart?: () => void;
}

export function CartItemRow({ item, onRemove, onCloseCart }: CartItemRowProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-[#14141c] border border-white/[0.06] gap-3">
      {/* Thumbnail */}
      <Link
        href={`/beats/${item.beat.slug}`}
        onClick={onCloseCart}
        className={`w-12 h-12 rounded-lg bg-gradient-to-br ${item.beat.cover} shrink-0 border border-white/10 flex items-center justify-center overflow-hidden`}
      >
        <span className="w-1.5 h-4 bg-purple-400/80 rounded-full" />
        <span className="w-1.5 h-6 bg-white/90 rounded-full mx-1" />
        <span className="w-1.5 h-3 bg-blue-400/80 rounded-full" />
      </Link>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <Link
          href={`/beats/${item.beat.slug}`}
          onClick={onCloseCart}
          className="font-semibold text-sm text-white hover:text-purple-300 transition-colors truncate block"
        >
          {item.beat.title}
        </Link>
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 mt-0.5">
          <span className="text-purple-300 uppercase">{item.licenseName}</span>
          <span>•</span>
          <span>{item.beat.bpm} BPM</span>
        </div>
      </div>

      {/* Price & Remove */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-sm font-mono font-bold text-white">
          {formatCurrency(item.price)}
        </span>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="text-[11px] font-mono text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

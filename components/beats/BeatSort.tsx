"use client";

import React from "react";
import { SortOption } from "@/types";

interface BeatSortProps {
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "latest", label: "LATEST" },
  { id: "price_asc", label: "PRICE: LOW → HIGH" },
  { id: "price_desc", label: "PRICE: HIGH → LOW" },
  { id: "bpm_asc", label: "BPM: LOW → HIGH" },
  { id: "bpm_desc", label: "BPM: HIGH → LOW" },
];

export function BeatSort({ currentSort, onSortChange }: BeatSortProps) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="text-zinc-500 uppercase tracking-wider hidden sm:inline">SORT:</span>
      <select
        value={currentSort}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        aria-label="Sort Beats"
        className="bg-[#121218] text-zinc-300 border border-white/[0.08] rounded-full px-3.5 py-1.5 focus:outline-none focus:border-purple-500/40 text-xs font-mono tracking-wider cursor-pointer"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id} className="bg-[#0e0e13] text-white">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

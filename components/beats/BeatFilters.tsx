"use client";

import React from "react";

interface BeatFiltersProps {
  activeGenre: string;
  onSelectGenre: (genre: string) => void;
  categories?: { id: string; label: string }[];
}

const DEFAULT_CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "trap", label: "TRAP" },
  { id: "rnb", label: "R&B" },
  { id: "reggaeton", label: "REGGAETON" },
  { id: "afrobeat", label: "AFROBEAT" },
  { id: "house", label: "HOUSE" },
  { id: "hiphop", label: "HIP-HOP" },
  { id: "pop", label: "POP" },
  { id: "drill", label: "DRILL" },
];

export function BeatFilters({ activeGenre, onSelectGenre, categories }: BeatFiltersProps) {
  const categoryList = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  return (
    <div
      role="group"
      aria-label="Genre Filters"
      className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none max-w-full -mx-4 px-4 sm:mx-0 sm:px-0"
    >
      {categoryList.map((cat) => {
        const isActive = activeGenre === cat.id;

        return (
          <button
            key={cat.id}
            type="button"
            role="button"
            aria-pressed={isActive}
            onClick={() => onSelectGenre(cat.id)}
            className={`shrink-0 text-xs font-mono tracking-wider uppercase px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer select-none ${
              isActive
                ? "bg-white text-black font-bold shadow-md"
                : "bg-[#111116] text-zinc-400 border border-white/[0.06] hover:border-white/20 hover:text-white hover:bg-[#181820]"
            }`}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}

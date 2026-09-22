"use client";

import React from "react";
import { Beat } from "@/types";
import { BeatCard } from "./BeatCard";
import { Button } from "@/components/ui/Button";

interface BeatGridProps {
  beats: Beat[];
  onResetFilters?: () => void;
}

export function BeatGrid({ beats, onResetFilters }: BeatGridProps) {
  if (beats.length === 0) {
    return (
      <div className="py-20 text-center flex flex-col items-center justify-center space-y-4 rounded-2xl border border-white/[0.06] bg-[#0c0c10]/50 p-8">
        <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-zinc-500">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white tracking-tight">No beats found</h3>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto">
            Try adjusting your search query, mood filter, or selecting a different genre category.
          </p>
        </div>
        {onResetFilters && (
          <Button variant="outline" size="sm" onClick={onResetFilters}>
            RESET ALL FILTERS
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-7">
      {beats.map((beat) => (
        <BeatCard key={beat.id} beat={beat} />
      ))}
    </div>
  );
}

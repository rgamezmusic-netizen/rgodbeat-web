"use client";

import React from "react";

interface BeatSearchProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  resultCount: number;
}

export function BeatSearch({ value, onChange, onClear, resultCount }: BeatSearchProps) {
  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        {/* Search Icon */}
        <span className="absolute left-4 text-zinc-500 pointer-events-none">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>

        {/* Search Input */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Search catalog by title, genre, mood, BPM, or key"
          placeholder="Search by title, genre, mood (e.g. Dark, Melodic), BPM, or key..."
          className="w-full bg-[#111116] text-white placeholder-zinc-500 text-xs sm:text-sm rounded-xl pl-11 pr-24 py-3 border border-white/[0.08] focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all"
        />

        {/* Right Badge / Clear Button */}
        <div className="absolute right-3 flex items-center gap-2">
          {value ? (
            <button
              type="button"
              onClick={onClear}
              className="p-1 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              aria-label="Clear Search Input"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : (
            <span className="text-[10px] font-mono text-zinc-500 px-2 py-0.5 rounded bg-white/[0.04]">
              {resultCount} {resultCount === 1 ? "BEAT" : "BEATS"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

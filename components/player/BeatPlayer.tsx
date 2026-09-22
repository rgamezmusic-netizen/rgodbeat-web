"use client";

import React from "react";
import Link from "next/link";
import { usePlayer } from "@/contexts/PlayerContext";
import { formatCurrency } from "@/lib/utils";

export function BeatPlayer() {
  const {
    currentBeat,
    isPlaying,
    progress,
    currentTime,
    duration,
    volume,
    togglePlay,
    seek,
    setVolume,
    closePlayer,
  } = usePlayer();

  if (!currentBeat) return null;

  return (
    <aside
      aria-label="Global Beat Player"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#09090e]/95 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-8px_30px_rgba(0,0,0,0.8)] transition-all animate-slideUp"
    >
      {/* Top Hairline Progress Bar for Continuous Visual Feedback */}
      <div
        className="h-[2px] bg-zinc-800 w-full cursor-pointer relative group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
          seek(pct);
        }}
      >
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 sm:gap-6">
        {/* Left Track Info */}
        <div className="flex items-center gap-3 w-auto md:w-1/4 min-w-0">
          {/* Cover Avatar */}
          <Link
            href={`/beats/${currentBeat.slug}`}
            className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-lg shrink-0 border border-white/10 flex items-center justify-center overflow-hidden group bg-[#151520]"
          >
            {currentBeat.cover && (currentBeat.cover.startsWith("http") || currentBeat.cover.startsWith("/")) ? (
              <img
                src={currentBeat.cover}
                alt={currentBeat.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${currentBeat.cover} flex items-center justify-center`}>
                <span className="w-1.5 h-3 bg-purple-400 rounded-full group-hover:scale-110 transition-transform" />
                <span className="w-1.5 h-5 bg-white rounded-full mx-1 group-hover:scale-110 transition-transform delay-75" />
                <span className="w-1.5 h-3.5 bg-blue-400 rounded-full group-hover:scale-110 transition-transform delay-100" />
              </div>
            )}
          </Link>

          {/* Title & Artist */}
          <div className="min-w-0">
            <Link
              href={`/beats/${currentBeat.slug}`}
              className="font-bold text-xs sm:text-sm text-white hover:text-purple-300 transition-colors truncate block leading-tight"
            >
              {currentBeat.title}
            </Link>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono text-zinc-400 truncate mt-0.5">
              <span>RGODBEAT</span>
              <span className="text-zinc-600">•</span>
              <span className="uppercase text-purple-400">{currentBeat.genre}</span>
            </div>
          </div>
        </div>

        {/* Center Controls & Progress Bar (Desktop Scrubber) */}
        <div className="flex flex-col items-center justify-center gap-1 flex-1 max-w-md hidden md:flex">
          <div className="flex items-center gap-4">
            {/* Prev Track button */}
            <button
              type="button"
              aria-label="Previous Track"
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>

            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={() => togglePlay()}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              {isPlaying ? (
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            {/* Next Track button */}
            <button
              type="button"
              aria-label="Next Track"
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          </div>

          {/* Time Scrubber */}
          <div className="w-full flex items-center gap-2.5 text-[10px] font-mono text-zinc-500">
            <span className="w-7 text-right text-zinc-400">{currentTime}</span>
            <div className="relative flex-1 flex items-center group cursor-pointer py-1">
              <input
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Seek audio preview"
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-400 group-hover:h-1.5 transition-all"
              />
            </div>
            <span className="w-7 text-zinc-400">{duration}</span>
          </div>
        </div>

        {/* Right Actions / Mobile Controls */}
        <div className="flex items-center gap-3 sm:gap-4 justify-end">
          {/* Mobile Direct Play/Pause Button */}
          <button
            type="button"
            onClick={() => togglePlay()}
            aria-label={isPlaying ? "Pause Preview" : "Play Preview"}
            className="md:hidden w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-md active:scale-95 cursor-pointer"
          >
            {isPlaying ? (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-4 h-4 fill-current translate-x-0.5" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          {/* Price / License Link */}
          <Link
            href={`/beats/${currentBeat.slug}`}
            className="text-[11px] font-mono px-3 py-1 rounded-full bg-white/[0.08] hover:bg-purple-500/20 text-white border border-white/10 transition-colors font-bold whitespace-nowrap"
          >
            {formatCurrency(currentBeat.price)}
          </Link>

          {/* Desktop Volume Control */}
          <div className="hidden lg:flex items-center gap-2 text-zinc-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume Slider"
              className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
            />
          </div>

          {/* Close Player */}
          <button
            type="button"
            onClick={closePlayer}
            aria-label="Close Player"
            className="p-1 text-zinc-500 hover:text-white rounded-full hover:bg-white/5 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

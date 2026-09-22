"use client";

import React from "react";
import { Beat } from "@/types";
import { usePlayer } from "@/contexts/PlayerContext";
import { LicenseSelector } from "@/components/beats/LicenseSelector";

interface BeatDetailClientProps {
  beat: Beat;
}

export function BeatDetailClient({ beat }: BeatDetailClientProps) {
  const { currentBeat, isPlaying, togglePlay, progress, seek } = usePlayer();

  const isCurrentBeat = currentBeat?.id === beat.id;
  const isCurrentlyPlaying = isCurrentBeat && isPlaying;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
      {/* 1. Artwork & Direct Waveform Playback Area */}
      <div className="lg:col-span-5 space-y-5">
        {/* Large Dominant 1:1 Artwork */}
        <div
          className={`relative aspect-square w-full rounded-2xl bg-gradient-to-br ${beat.cover} border border-white/[0.1] shadow-2xl flex items-center justify-center overflow-hidden group`}
        >
          {/* Subtle dot matrix */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />

          {/* Sound sculpture vector */}
          <div className="relative flex items-center justify-center gap-2 h-24 w-48 opacity-60 group-hover:opacity-90 transition-opacity">
            <span
              className={`w-1.5 bg-purple-400 rounded-full transition-all duration-300 ${
                isCurrentlyPlaying ? "h-16 animate-pulse" : "h-10"
              }`}
            />
            <span
              className={`w-1.5 bg-purple-300 rounded-full transition-all duration-300 delay-75 ${
                isCurrentlyPlaying ? "h-22 animate-pulse" : "h-16"
              }`}
            />
            <span
              className={`w-1.5 bg-blue-400 rounded-full transition-all duration-300 delay-100 ${
                isCurrentlyPlaying ? "h-18 animate-pulse" : "h-12"
              }`}
            />
            <span
              className={`w-1.5 bg-white rounded-full transition-all duration-300 delay-150 ${
                isCurrentlyPlaying ? "h-24 animate-pulse shadow-[0_0_12px_rgba(255,255,255,0.6)]" : "h-20"
              }`}
            />
            <span
              className={`w-1.5 bg-purple-300 rounded-full transition-all duration-300 delay-75 ${
                isCurrentlyPlaying ? "h-20 animate-pulse" : "h-14"
              }`}
            />
            <span
              className={`w-1.5 bg-blue-400 rounded-full transition-all duration-300 ${
                isCurrentlyPlaying ? "h-12 animate-pulse" : "h-8"
              }`}
            />
          </div>

          {/* Large Floating Play Button */}
          <button
            type="button"
            onClick={() => togglePlay(beat)}
            aria-label={isCurrentlyPlaying ? `Pause ${beat.title}` : `Play ${beat.title}`}
            className={`absolute w-20 h-20 rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer ${
              isCurrentlyPlaying
                ? "bg-purple-500 text-white shadow-purple-500/50"
                : "bg-white text-black hover:bg-zinc-100"
            }`}
          >
            {isCurrentlyPlaying ? (
              <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-8 h-8 fill-current translate-x-1" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>
        </div>

        {/* Audio Console Preview Bar */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#0f0f15] border border-white/[0.08] space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isCurrentlyPlaying ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
              {isCurrentlyPlaying ? "PLAYING AUDIO PREVIEW" : "PREVIEW AUDIO"}
            </span>
            <span className="text-zinc-500 font-mono">24-BIT MASTER</span>
          </div>

          {/* Interactive Waveform / Scrubber Bar */}
          <div className="relative py-1 group cursor-pointer">
            <input
              type="range"
              min="0"
              max="100"
              value={isCurrentBeat ? progress : 0}
              onChange={(e) => {
                if (!isCurrentBeat) togglePlay(beat);
                seek(Number(e.target.value));
              }}
              aria-label="Seek preview audio"
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-400 group-hover:h-2 transition-all"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
            <span>{isCurrentBeat ? "0:28" : "0:00"}</span>
            <span>{beat.duration}</span>
          </div>
        </div>
      </div>

      {/* 2. Beat Title, Core Metadata & Licensing */}
      <div className="lg:col-span-7 space-y-7">
        {/* Title & Artist */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.2em] text-purple-400 uppercase">
              PRODUCED BY RGODBEAT
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white uppercase leading-tight">
            {beat.title}
          </h1>

          {/* Core Metadata Clean Strip (Clean & Non-overwhelming) */}
          <div className="flex flex-wrap items-center gap-2 pt-4">
            <div className="px-3 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-xs font-mono">
              <span className="text-zinc-400">GENRE: </span>
              <span className="text-white font-semibold uppercase">{beat.genre}</span>
            </div>

            <div className="px-3 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-xs font-mono">
              <span className="text-zinc-400">TEMPO: </span>
              <span className="text-white font-semibold">{beat.bpm} BPM</span>
            </div>

            <div className="px-3 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-xs font-mono">
              <span className="text-zinc-400">KEY: </span>
              <span className="text-white font-semibold">{beat.key}</span>
            </div>

            <div className="px-3 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-xs font-mono">
              <span className="text-zinc-400">MOOD: </span>
              <span className="text-purple-300 font-semibold">{beat.mood}</span>
            </div>
          </div>
        </div>

        {/* 3. License Selector with Primary BUY NOW & Secondary ADD TO CART */}
        <LicenseSelector beat={beat} />

        {/* 4. Secondary Information (Tags & Release Info - visually secondary) */}
        <div className="pt-4 border-t border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
            <span>RELEASED: {beat.createdAt}</span>
            <span>DURATION: {beat.duration}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-mono text-zinc-500 uppercase mr-1">
              TAGS:
            </span>
            {beat.tags.map((tag, idx) => (
              <span
                key={idx}
                className="text-xs text-zinc-400 px-2.5 py-0.5 rounded-full bg-white/[0.02] border border-white/[0.05]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

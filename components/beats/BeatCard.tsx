"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Beat } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { usePlayer } from "@/contexts/PlayerContext";
import { useCart } from "@/contexts/CartContext";

import { useAtmosphere } from "@/components/atmosphere";

interface BeatCardProps {
  beat: Beat;
}

export function BeatCard({ beat }: BeatCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { currentBeat, isPlaying, togglePlay } = usePlayer();
  const { addToCart } = useCart();
  const { setHoverState } = useAtmosphere();

  // Weekly Ranking & Like / Vote State
  const [likesCount, setLikesCount] = useState<number>(
    beat.performanceMetrics?.favorites || 0
  );
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  const [isVoting, setIsVoting] = useState<boolean>(false);

  const handleVote = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isVoting) return;

    try {
      setIsVoting(true);
      const res = await fetch(`/api/beats/${beat.id}/vote`, { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setHasVoted(true);
        setLikesCount(data.favorites || likesCount + 1);
      } else if (data.alreadyVoted) {
        setHasVoted(true);
      } else if (data.requireLogin) {
        window.location.href = `/login?redirect=${encodeURIComponent(
          typeof window !== "undefined" ? window.location.pathname : "/beats"
        )}`;
      }
    } catch (err) {
      console.error("[BeatCard Vote Error]:", err);
    } finally {
      setIsVoting(false);
    }
  };

  const isCurrentTrack = currentBeat?.id === beat.id;
  const isCurrentPlaying = isCurrentTrack && isPlaying;

  return (
    <article
      onMouseEnter={(e) => {
        setIsHovered(true);
        setHoverState({ active: true, x: e.clientX, y: e.clientY });
      }}
      onMouseMove={(e) => {
        setHoverState({ active: true, x: e.clientX, y: e.clientY });
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoverState({ active: false });
      }}
      className={`group relative flex flex-col bg-[#0b0b10] border transition-all duration-300 rounded-xl overflow-hidden ${
        isCurrentTrack
          ? "border-purple-500/50 shadow-[0_8px_30px_rgba(168,85,247,0.18)]"
          : "border-white/[0.07] hover:border-white/20 hover:shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
      }`}
    >
      {/* 1:1 Artwork Container (Front and Center) */}
      <div className="relative w-full aspect-square overflow-hidden bg-[#101017]">
        {/* Placeholder / Artwork Gradient Canvas */}
        <Link
          href={`/beats/${beat.slug}`}
          aria-label={`View ${beat.title} details`}
          className={`relative block w-full h-full bg-gradient-to-br ${beat.cover} transition-transform duration-500 group-hover:scale-[1.02]`}
        >
          {/* Subtle tactile grid watermark */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />

          {/* Sound Architecture Graphic Motif */}
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-40 group-hover:opacity-70 transition-opacity">
            <span className={`w-1 bg-purple-400 rounded-full transition-all duration-300 ${isCurrentPlaying ? "h-10 animate-pulse" : "h-6 group-hover:h-8"}`} />
            <span className={`w-1 bg-purple-300 rounded-full transition-all duration-300 delay-75 ${isCurrentPlaying ? "h-14 animate-pulse" : "h-10 group-hover:h-12"}`} />
            <span className={`w-1 bg-blue-400 rounded-full transition-all duration-300 delay-100 ${isCurrentPlaying ? "h-12 animate-pulse" : "h-7 group-hover:h-10"}`} />
            <span className={`w-1 bg-white rounded-full transition-all duration-300 delay-150 ${isCurrentPlaying ? "h-16 animate-pulse" : "h-12 group-hover:h-14"}`} />
            <span className={`w-1 bg-purple-300 rounded-full transition-all duration-300 delay-75 ${isCurrentPlaying ? "h-11 animate-pulse" : "h-8 group-hover:h-11"}`} />
            <span className={`w-1 bg-blue-400 rounded-full transition-all duration-300 ${isCurrentPlaying ? "h-7 animate-pulse" : "h-5 group-hover:h-7"}`} />
          </div>
        </Link>

        {/* Play Action Trigger Overlay */}
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center transition-opacity duration-200 pointer-events-none ${
            isHovered || isCurrentPlaying ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              togglePlay(beat);
            }}
            aria-label={isCurrentPlaying ? `Pause preview of ${beat.title}` : `Play preview of ${beat.title}`}
            className={`pointer-events-auto w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer ${
              isCurrentPlaying ? "bg-purple-500 text-white shadow-purple-500/40" : "bg-white text-black"
            }`}
          >
            {isCurrentPlaying ? (
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>
        </div>

        {/* Top Genre Badge */}
        <div className="absolute top-3 left-3 pointer-events-none">
          <span className="text-[10px] font-mono tracking-widest uppercase px-2.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-zinc-300 border border-white/10">
            {beat.genre}
          </span>
        </div>

        {/* Price Tag Pill */}
        <div className="absolute top-3 right-3 pointer-events-none">
          <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-white border border-white/10">
            {formatCurrency(beat.price)}
          </span>
        </div>
      </div>

      {/* Beat Details Body */}
      <div className="p-4 sm:p-4.5 flex flex-col justify-between flex-1 gap-3">
        <div>
          <Link
            href={`/beats/${beat.slug}`}
            className="font-bold text-sm sm:text-base text-white group-hover:text-purple-300 transition-colors tracking-tight line-clamp-1 block"
          >
            {beat.title}
          </Link>
          <div className="flex items-center justify-between text-xs text-zinc-400 mt-1">
            <span>RGODBEAT</span>
            <span className="font-mono text-[11px] text-zinc-500">{beat.mood}</span>
          </div>
        </div>

        {/* Metadata & Direct License Action */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] text-[11px] font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <span>{beat.bpm} BPM</span>
            <span className="text-zinc-600">•</span>
            <span>{beat.key}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVote}
              disabled={isVoting}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono transition-all cursor-pointer ${
                hasVoted
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20"
                  : "bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06] active:scale-95"
              }`}
              title={
                hasVoted
                  ? "Voto semanal registrado en el ranking"
                  : "Votar por este beat en el Ranking Semanal (1 voto por semana)"
              }
            >
              <Heart
                className={`w-3 h-3 transition-colors ${
                  hasVoted ? "fill-rose-500 text-rose-500" : "text-zinc-400"
                }`}
              />
              <span>{likesCount}</span>
            </button>

            <button
              type="button"
              onClick={() => addToCart(beat, "mp3")}
              aria-label={`Add ${beat.title} MP3 license to cart`}
              className="text-xs font-mono text-purple-300 hover:text-white px-2 py-0.5 rounded hover:bg-purple-500/15 transition-colors cursor-pointer"
            >
              + LICENSE
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

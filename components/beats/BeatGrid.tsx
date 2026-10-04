"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart, Pause, Play, ShoppingBag } from "lucide-react";
import { Beat } from "@/types";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/contexts/CartContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { formatCurrency } from "@/lib/utils";
import styles from "./BeatGrid.module.css";

interface BeatGridProps {
  beats: Beat[];
  onResetFilters?: () => void;
}

function coverIsImage(cover: string) {
  return cover.startsWith("http://") || cover.startsWith("https://") || cover.startsWith("/");
}

export function BeatGrid({ beats, onResetFilters }: BeatGridProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [votedBeatIds, setVotedBeatIds] = useState<Set<string>>(() => new Set());
  const [isVoting, setIsVoting] = useState(false);
  const { addToCart } = useCart();
  const { currentBeat, isPlaying, togglePlay } = usePlayer();

  useEffect(() => setActiveIndex(0), [beats]);

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
          <h3 className="text-lg font-bold text-white tracking-tight">No hay beats con esos filtros</h3>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto">Prueba otra búsqueda o selecciona un género diferente.</p>
        </div>
        {onResetFilters && <Button variant="outline" size="sm" onClick={onResetFilters}>LIMPIAR FILTROS</Button>}
      </div>
    );
  }

  const selected = beats[activeIndex % beats.length];
  const selectedIsPlaying = currentBeat?.id === selected.id && isPlaying;
  const selectedHasVoted = votedBeatIds.has(selected.id);
  const selectedVotes = voteCounts[selected.id] ?? selected.weeklyVotes ?? selected.performanceMetrics?.favorites ?? 0;

  const offsets = beats.length === 1
    ? [0]
    : beats.length === 2
      ? [0, 1]
      : Array.from({ length: Math.min(5, beats.length) }, (_, i) => i - Math.floor(Math.min(5, beats.length) / 2));

  function moveBy(delta: number) {
    setActiveIndex((index) => (index + delta + beats.length) % beats.length);
  }

  async function voteForSelected() {
    if (isVoting || selectedHasVoted) return;
    setIsVoting(true);
    try {
      const response = await fetch(`/api/beats/${selected.id}/vote`, { method: "POST" });
      const data = await response.json();
      if (response.ok && data.success) {
        setVotedBeatIds((current) => new Set(current).add(selected.id));
        const nextVotes = selected.weeklyVotes !== undefined
          ? data.weeklyVotes ?? selectedVotes + 1
          : data.favorites ?? selectedVotes + 1;
        setVoteCounts((current) => ({ ...current, [selected.id]: nextVotes }));
      } else if (data.alreadyVoted) {
        setVotedBeatIds((current) => new Set(current).add(selected.id));
      } else if (data.requireLogin) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
    } catch (error) {
      console.error("[BeatCarousel Vote Error]:", error);
    } finally {
      setIsVoting(false);
    }
  }

  return (
    <section className={styles.gallery} aria-label="Galería de beats">
      <div className={styles.galleryHead}>
        <span>RGODBEAT / DISCOS</span>
        <span>{String(activeIndex + 1).padStart(2, "0")} — {String(beats.length).padStart(2, "0")}</span>
      </div>

      <div className={styles.stage}>
        <div className={styles.axis} aria-hidden="true" />
        {offsets.map((offset) => {
          const index = (activeIndex + offset + beats.length) % beats.length;
          const beat = beats[index];
          const imageCover = coverIsImage(beat.cover);
          const angle = offset * 32;
          const opacity = offset === 0 ? 1 : Math.abs(offset) === 1 ? 0.78 : 0.43;

          return (
            <button
              key={beat.id}
              type="button"
              className={`${styles.sleeve} ${offset === 0 ? styles.activeSleeve : ""}`}
              style={{ "--angle": `${angle}deg`, "--radius": "clamp(245px, 41vw, 390px)", opacity, zIndex: 10 - Math.abs(offset) } as React.CSSProperties}
              onClick={() => offset !== 0 && setActiveIndex(index)}
              aria-label={`${offset === 0 ? "Beat seleccionado" : "Seleccionar beat"}: ${beat.title}`}
              aria-current={offset === 0 ? "true" : undefined}
            >
              <span className={styles.disc} aria-hidden="true" />
              <span
                className={`${styles.artwork} ${imageCover ? "" : `bg-gradient-to-br ${beat.cover}`}`}
                style={imageCover ? { backgroundImage: `url(${JSON.stringify(beat.cover)})` } : undefined}
              >
                <span className={styles.artworkShade} />
                <span className={styles.artworkMark}>RG</span>
                <span className={styles.artworkInfo}>
                  <span>{beat.genre}</span>
                  <strong>{beat.title}</strong>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.arrow} onClick={() => moveBy(-1)} aria-label="Beat anterior">
          <ChevronLeft size={21} />
        </button>
        <button type="button" className={styles.play} onClick={() => togglePlay(selected)} aria-label={selectedIsPlaying ? "Pausar beat" : "Escuchar beat"}>
          {selectedIsPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
        </button>
        <button type="button" className={styles.arrow} onClick={() => moveBy(1)} aria-label="Siguiente beat">
          <ChevronRight size={21} />
        </button>
      </div>

      <div className={styles.selectedBeat}>
        <div className={styles.trackInfo}>
          <span className={styles.trackEyebrow}>{selected.genre} <i>•</i> {selected.bpm} BPM <i>•</i> {selected.key}</span>
          <Link href={`/beats/${selected.slug}`} className={styles.trackTitle}>{selected.title}</Link>
          <span className={styles.trackMood}>{selected.mood}</span>
        </div>

        <div className={styles.trackActions}>
          <button
            type="button"
            onClick={voteForSelected}
            disabled={isVoting}
            aria-pressed={selectedHasVoted}
            aria-label={`${selectedHasVoted ? "Votado" : "Votar por"} ${selected.title}; ${selectedVotes} votos`}
            className={`${styles.vote} ${selectedHasVoted ? styles.voted : ""}`}
          >
            <Heart size={16} fill={selectedHasVoted ? "currentColor" : "none"} />
            <span>{selectedVotes}</span>
          </button>
          <button type="button" className={styles.buy} onClick={() => addToCart(selected, "mp3")}>
            <ShoppingBag size={16} />
            <span>COMPRAR</span>
            <strong>{formatCurrency(selected.price)}</strong>
          </button>
        </div>
      </div>
    </section>
  );
}

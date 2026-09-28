"use client";

import React, { useState, useMemo } from "react";
import { BeatSearch, BeatFilters, BeatSort, BeatGrid } from "@/components/beats";
import { Beat, SortOption } from "@/types";

interface CategoryFilterItem {
  id: string;
  label: string;
}

interface BeatsShopClientProps {
  initialBeats: Beat[];
  categories: CategoryFilterItem[];
  isProUser?: boolean;
}

export function BeatsShopClient({ initialBeats, categories, isProUser = false }: BeatsShopClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState("all");
  const [currentSort, setCurrentSort] = useState<SortOption>("latest");
  const [isProcessingService, setIsProcessingService] = useState<string | null>(null);

  const top23BeatIds = useMemo(() => {
    return [...initialBeats]
      .sort((a, b) => {
        const scoreA = a.performanceScore !== undefined ? a.performanceScore : ((a.performanceMetrics?.favorites || 0) * 5);
        const scoreB = b.performanceScore !== undefined ? b.performanceScore : ((b.performanceMetrics?.favorites || 0) * 5);
        return scoreB - scoreA;
      })
      .slice(0, 23)
      .map((b) => b.id);
  }, [initialBeats]);

  const handlePurchaseService = async (serviceId: string) => {
    try {
      setIsProcessingService(serviceId);
      const res = await fetch("/api/checkout/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else if (res.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      } else {
        alert(data.error || "Ocurrió un error al procesar la compra.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión.");
    } finally {
      setIsProcessingService(null);
    }
  };

  // Filter and sort beats dynamically on the client
  const filteredAndSortedBeats = useMemo(() => {
    let result = [...initialBeats];

    // 1. Filter by category
    if (activeGenre !== "all") {
      result = result.filter((beat) => beat.genre.toLowerCase() === activeGenre.toLowerCase());
    }

    // 2. Filter by search query (title, genre, mood, bpm, key, tags)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((beat) => {
        return (
          beat.title.toLowerCase().includes(q) ||
          beat.genre.toLowerCase().includes(q) ||
          beat.mood.toLowerCase().includes(q) ||
          beat.key.toLowerCase().includes(q) ||
          beat.bpm.toString().includes(q) ||
          beat.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      });
    }

    // 3. Sort results
    result.sort((a, b) => {
      switch (currentSort) {
        case "ranking": {
          const scoreA = a.performanceScore !== undefined ? a.performanceScore : ((a.performanceMetrics?.favorites || 0) * 5);
          const scoreB = b.performanceScore !== undefined ? b.performanceScore : ((b.performanceMetrics?.favorites || 0) * 5);
          return scoreB - scoreA;
        }
        case "price_asc":
          return a.price - b.price;
        case "price_desc":
          return b.price - a.price;
        case "bpm_asc":
          return a.bpm - b.bpm;
        case "bpm_desc":
          return b.bpm - a.bpm;
        case "latest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [initialBeats, searchQuery, activeGenre, currentSort]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setActiveGenre("all");
    setCurrentSort("latest");
  };

  return (
    <>
      {/* Special Shop Offers */}
      <div className="mb-14">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <h2 className="text-sm font-mono tracking-[0.15em] text-amber-400 uppercase font-bold">
            EXCLUSIVOS DEL SHOP
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* THE PARK Card */}
          <div className="relative overflow-hidden p-6 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 shadow-[0_0_30px_rgba(6,182,212,0.1)] flex flex-col justify-between group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">The Park</h3>
                <span className="px-2.5 py-1 text-[10px] font-mono font-bold bg-amber-500 text-black rounded uppercase">50% OFF</span>
              </div>
              <p className="text-sm text-zinc-400 mb-6 max-w-sm">
                Acceso total al ecosistema de The Park. Registra y monetiza tu música con total control de tus regalías.
              </p>
            </div>
            <div className="relative z-10 flex items-end justify-between mt-auto">
              <div className="flex flex-col">
                <span className="text-sm text-zinc-500 line-through font-mono">$398.00</span>
                <span className="text-3xl font-black text-white font-mono">$199<span className="text-lg text-cyan-400">.00</span></span>
              </div>
              <button
                onClick={() => handlePurchaseService("the_park")}
                disabled={isProcessingService === "the_park"}
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
              >
                {isProcessingService === "the_park" ? "Procesando..." : "Comprar Acceso"}
              </button>
            </div>
          </div>

          {/* STUDIO PRO Card */}
          <div className="relative overflow-hidden p-6 rounded-2xl border border-purple-500/30 bg-purple-950/20 shadow-[0_0_30px_rgba(168,85,247,0.1)] flex flex-col justify-between group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">Studio Pro</h3>
                <span className="px-2.5 py-1 text-[10px] font-mono font-bold bg-amber-500 text-black rounded uppercase">50% OFF</span>
              </div>
              <p className="text-sm text-zinc-400 mb-6 max-w-sm">
                Desbloquea 30 días de acceso total a RGODBEAT Studio. Graba con Autotune directo desde tu navegador.
              </p>
            </div>
            <div className="relative z-10 flex items-end justify-between mt-auto">
              <div className="flex flex-col">
                <span className="text-sm text-zinc-500 line-through font-mono">$20.00</span>
                <span className="text-3xl font-black text-white font-mono">$10<span className="text-lg text-purple-400">.00</span></span>
              </div>
              <button
                onClick={() => handlePurchaseService("studio_pro")}
                disabled={isProcessingService === "studio_pro"}
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
              >
                {isProcessingService === "studio_pro" ? "Procesando..." : "Activar 30 Días"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search, Category Filters, Sort */}
      <div className="space-y-6 mb-10 pb-8 border-b border-white/[0.08]">
        {/* Row 1: Search Field */}
        <div className="max-w-2xl">
          <BeatSearch
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={() => setSearchQuery("")}
            resultCount={filteredAndSortedBeats.length}
          />
        </div>

        {/* Row 2: Genre Category Filters & Sort Control */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <BeatFilters
            activeGenre={activeGenre}
            onSelectGenre={setActiveGenre}
            categories={categories}
          />

          <div className="shrink-0 flex items-center justify-between sm:justify-end gap-4 pt-2 lg:pt-0">
            <span className="text-xs font-mono text-zinc-500 lg:hidden">
              {filteredAndSortedBeats.length} {filteredAndSortedBeats.length === 1 ? "RESULT" : "RESULTS"}
            </span>
            <BeatSort
              currentSort={currentSort}
              onSortChange={setCurrentSort}
            />
          </div>
        </div>
      </div>

      {/* Beats Grid */}
      <BeatGrid
        beats={filteredAndSortedBeats}
        onResetFilters={handleResetFilters}
        isProUser={isProUser}
        top23BeatIds={top23BeatIds}
      />
    </>
  );
}

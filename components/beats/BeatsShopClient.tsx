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
}

export function BeatsShopClient({ initialBeats, categories }: BeatsShopClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState("all");
  const [currentSort, setCurrentSort] = useState<SortOption>("latest");

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
      />
    </>
  );
}

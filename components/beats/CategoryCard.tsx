import React from "react";
import { CategoryInfo } from "@/types";

interface CategoryCardProps {
  category: CategoryInfo;
}

export function CategoryCard({ category }: CategoryCardProps) {
  return (
    <a
      href={`/beats?genre=${category.id}`}
      className="group relative flex flex-col justify-between p-6 sm:p-7 rounded-2xl bg-[#0f0f14] border border-white/[0.08] hover:border-purple-500/40 transition-all duration-300 overflow-hidden min-h-[190px] select-none"
    >
      {/* Background Accent Gradient Ambient Glow */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${category.accentColor} opacity-20 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none`}
      />

      {/* Subtle Grid Watermark */}
      <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px] pointer-events-none" />

      {/* Top Header: Tag + Track Count */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
          {category.bpmRange}
        </span>
        <span className="text-[11px] font-mono text-zinc-500 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
          {category.count} TRACKS
        </span>
      </div>

      {/* Bottom Information */}
      <div className="relative z-10 mt-6 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white group-hover:text-purple-200 transition-colors">
            {category.title}
          </h3>
          <span className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-purple-500/20 group-hover:translate-x-1 transition-all duration-200">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </div>
        <p className="text-xs text-zinc-400 font-normal leading-relaxed line-clamp-2">
          {category.tagline}
        </p>
      </div>
    </a>
  );
}

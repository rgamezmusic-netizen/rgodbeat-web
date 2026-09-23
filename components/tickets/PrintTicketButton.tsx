"use client";

import React from "react";

export function PrintTicketButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider uppercase bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white transition-colors cursor-pointer flex items-center gap-1.5"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      <span>IMPRIMIR / PDF</span>
    </button>
  );
}

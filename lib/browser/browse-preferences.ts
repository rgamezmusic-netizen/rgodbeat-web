"use client";

import { useSyncExternalStore } from "react";
import type { SortOption } from "@/types";

type BrowsePreferences = {
  searchQuery: string;
  activeGenre: string;
  currentSort: SortOption;
  rankingKind: "tracks" | "artists" | "beats";
};

const defaults: BrowsePreferences = {
  searchQuery: "", activeGenre: "all", currentSort: "latest", rankingKind: "tracks",
};
let preferences = defaults;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => preferences;
const serverSnapshot = () => defaults;

// Browsing choices only, held in this tab's memory across page unmounts.
// No account data, credentials, payment state or recordings are stored here.
function updatePreferences(next: Partial<BrowsePreferences>) {
  preferences = { ...preferences, ...next };
  listeners.forEach(listener => listener());
}

export function useBrowsePreferences() {
  return [useSyncExternalStore(subscribe, snapshot, serverSnapshot), updatePreferences] as const;
}

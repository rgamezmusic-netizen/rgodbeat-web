"use client";

import { useSyncExternalStore } from "react";

type ConnectionInfo = EventTarget & {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};
type NetworkNavigator = Navigator & { connection?: ConnectionInfo };

export function canPrefetchInBackground() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as NetworkNavigator).connection;
  return navigator.onLine && !connection?.saveData
    && !/^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? "")
    && !(connection?.downlink !== undefined && connection.downlink < 1.5);
}

function subscribe(onChange: () => void) {
  const connection = (navigator as NetworkNavigator).connection;
  connection?.addEventListener("change", onChange);
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    connection?.removeEventListener("change", onChange);
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Disable optional link downloads until the browser's network is known.
export function useBackgroundPrefetch() {
  return useSyncExternalStore(subscribe, canPrefetchInBackground, () => false);
}

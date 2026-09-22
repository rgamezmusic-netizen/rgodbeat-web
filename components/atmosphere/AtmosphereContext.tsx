"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { AtmosphereContextType, AtmosphereHoverEvent, AudioReactivityMetrics } from "./types";

const AtmosphereContext = createContext<AtmosphereContextType | undefined>(undefined);

export function AtmosphereProvider({ children }: { children: React.ReactNode }) {
  const [hoverState, setHoverState] = useState<AtmosphereHoverEvent | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<AudioReactivityMetrics>({});

  const value = useMemo(
    () => ({
      hoverState,
      setHoverState,
      audioMetrics,
      setAudioMetrics,
    }),
    [hoverState, audioMetrics]
  );

  return (
    <AtmosphereContext.Provider value={value}>
      {children}
    </AtmosphereContext.Provider>
  );
}

export function useAtmosphere(): AtmosphereContextType {
  const context = useContext(AtmosphereContext);
  if (!context) {
    // Return safe no-op defaults if used outside AtmosphereProvider
    return {
      hoverState: null,
      setHoverState: () => {},
      audioMetrics: {},
      setAudioMetrics: () => {},
    };
  }
  return context;
}

"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { AtmosphereContextType, AtmosphereHoverEvent, AudioReactivityMetrics } from "./types";

const AtmosphereContext = createContext<AtmosphereContextType | undefined>(undefined);
type AtmosphereActions = Pick<AtmosphereContextType, "setHoverState" | "setAudioMetrics">;
const AtmosphereActionsContext = createContext<AtmosphereActions | undefined>(undefined);
const noopActions: AtmosphereActions = { setHoverState: () => {}, setAudioMetrics: () => {} };

export function AtmosphereProvider({ children }: { children: React.ReactNode }) {
  const [hoverState, setHoverState] = useState<AtmosphereHoverEvent | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<AudioReactivityMetrics>({});
  const actions = useMemo(() => ({ setHoverState, setAudioMetrics }), []);

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
      <AtmosphereActionsContext.Provider value={actions}>{children}</AtmosphereActionsContext.Provider>
    </AtmosphereContext.Provider>
  );
}

// Interactive cards publish hover changes without subscribing to every move.
export function useAtmosphereActions(): AtmosphereActions {
  return useContext(AtmosphereActionsContext) ?? noopActions;
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

export type AtmosphereTheme = "beats" | "studio" | "services" | "park" | "about" | "default";
export type AtmosphereIntensity = "subtle" | "medium" | "high";
export type AtmosphereAccent = "purple" | "blue" | "cyber" | "neutral" | "gold";
export type MobileIntensity = "reduced" | "hidden" | "same";

export interface AudioReactivityMetrics {
  /** Master volume / peak energy level (0.0 to 1.0) */
  audioLevel?: number;
  /** Low-frequency sub/808 energy (0.0 to 1.0) */
  bassLevel?: number;
  /** Transient kick pulse energy (0.0 to 1.0) */
  kickLevel?: number;
  /** Vocal / instrument mid-range presence (0.0 to 1.0) */
  midLevel?: number;
  /** Shaker / hi-hat high-frequency energy (0.0 to 1.0) */
  highLevel?: number;
}

export interface AtmosphereHoverEvent {
  active: boolean;
  x?: number; // clientX in px or %
  y?: number; // clientY in px or %
  accent?: AtmosphereAccent;
}

export interface AtmosphericBackgroundProps extends AudioReactivityMetrics {
  /** Page theme preset ('beats' | 'studio' | 'services' | 'park' | 'about') */
  theme?: AtmosphereTheme;
  /** Overall intensity preset */
  intensity?: AtmosphereIntensity;
  /** Primary atmospheric accent hue (overrides theme preset if provided) */
  accentColor?: AtmosphereAccent;
  /** Global master opacity multiplier (0 to 1) */
  opacity?: number;
  /** Whether ambient motion and parallax are active */
  animate?: boolean;
  /** Mobile viewport behavior */
  mobileIntensity?: MobileIntensity;
  /** Whether audio is currently playing */
  playing?: boolean;
  /** Optional hover event state from interactive cards */
  hoverState?: AtmosphereHoverEvent | null;
  /** Additional custom class names */
  className?: string;
}

export interface AtmosphereContextType {
  hoverState: AtmosphereHoverEvent | null;
  setHoverState: (event: AtmosphereHoverEvent | null) => void;
  audioMetrics: AudioReactivityMetrics;
  setAudioMetrics: (metrics: AudioReactivityMetrics) => void;
}

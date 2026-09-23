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
  /** Environmental background image source path (defaults to '/atmosphere/studio-env.jpg') */
  backgroundSource?: string | null;
  /** Opacity of the environmental studio image (0 to 1, default 0.22) */
  backgroundOpacity?: number;
  /** Blur radius for environmental silhouettes (default '4px') */
  backgroundBlur?: string | number;
  /** Overall intensity preset */
  intensity?: AtmosphereIntensity;
  /** Granular ambient light intensity override */
  ambientIntensity?: AtmosphereIntensity | number;
  /** Granular soundfield matrix intensity override */
  soundFieldIntensity?: AtmosphereIntensity | number;
  /** Whether procedural starfield is active (defaults to true) */
  enableStars?: boolean;
  /** Star density ('low' | 'medium' | 'high') */
  starDensity?: "low" | "medium" | "high";
  /** Procedural starfield opacity (0 to 1) */
  starOpacity?: number;
  /** Starfield tint palette */
  starTint?: "cosmic" | "violet" | "neutral";
  /** Primary atmospheric accent hue (overrides theme preset if provided) */
  accentColor?: AtmosphereAccent;
  /** Global master opacity multiplier (0 to 1) */
  opacity?: number;
  /** Whether ambient motion and parallax are active */
  animate?: boolean;
  /** Alias for animate */
  animationEnabled?: boolean;
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

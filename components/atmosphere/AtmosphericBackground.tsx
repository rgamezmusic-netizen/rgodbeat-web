import React from "react";

export type AtmosphereIntensity = "subtle" | "medium" | "high";
export type AtmosphereAccent = "purple" | "blue" | "cyber" | "neutral";
export type MobileIntensity = "reduced" | "hidden" | "same";

export interface AtmosphericBackgroundProps {
  /** Overall intensity preset */
  intensity?: AtmosphereIntensity;
  /** Primary atmospheric accent hue */
  accentColor?: AtmosphereAccent;
  /** Global master opacity multiplier (0 to 1) */
  opacity?: number;
  /** Reserved for future animation phases (disabled in Part 1) */
  animate?: boolean;
  /** Mobile viewport behavior */
  mobileIntensity?: MobileIntensity;
  /** Additional custom class names */
  className?: string;
}

/**
 * AtmosphericBackground (RGODBEAT 2.0)
 * 
 * Independent, reusable visual foundation component representing
 * "An underground futuristic music studio at night."
 * 
 * Features:
 * - 100% pointer-events-none (never captures clicks, gestures, or interferes with audio)
 * - Pure CSS & inline SVG (zero external assets, zero heavy images, zero video)
 * - 5 decoupled layers:
 *   1. Dark Base
 *   2. Large Blurred Radial Ambient Lights
 *   3. Abstract Dotted Sound-Field
 *   4. Subtle Studio Particles / Dust Motes
 *   5. Cinematic Micro-Grain Texture
 */
export function AtmosphericBackground({
  intensity = "medium",
  accentColor = "purple",
  opacity = 1,
  animate = false,
  mobileIntensity = "reduced",
  className = "",
}: AtmosphericBackgroundProps) {
  // Intensity multipliers
  const intensityMap: Record<AtmosphereIntensity, { lightOpacity: string; dotOpacity: string; particleOpacity: string }> = {
    subtle: {
      lightOpacity: "opacity-40",
      dotOpacity: "opacity-25",
      particleOpacity: "opacity-30",
    },
    medium: {
      lightOpacity: "opacity-70",
      dotOpacity: "opacity-45",
      particleOpacity: "opacity-60",
    },
    high: {
      lightOpacity: "opacity-100",
      dotOpacity: "opacity-75",
      particleOpacity: "opacity-90",
    },
  };

  // Accent color themes
  const accentLightMap: Record<AtmosphereAccent, { primary: string; secondary: string; tertiary: string }> = {
    purple: {
      primary: "rgba(147, 51, 234, 0.12)",   // Deep electric purple
      secondary: "rgba(59, 130, 246, 0.08)",  // Studio blue accent
      tertiary: "rgba(168, 85, 247, 0.06)",   // Violet haze
    },
    blue: {
      primary: "rgba(37, 99, 235, 0.12)",    // Deep cobalt
      secondary: "rgba(14, 165, 233, 0.08)",  // Electric cyan
      tertiary: "rgba(99, 102, 241, 0.06)",   // Indigo wash
    },
    cyber: {
      primary: "rgba(168, 85, 247, 0.10)",   // Purple
      secondary: "rgba(6, 182, 212, 0.08)",   // Cyber cyan
      tertiary: "rgba(236, 72, 153, 0.05)",   // Magenta undertone
    },
    neutral: {
      primary: "rgba(255, 255, 255, 0.05)",  // Soft white studio light
      secondary: "rgba(148, 163, 184, 0.04)",// Slate
      tertiary: "rgba(71, 85, 105, 0.04)",   // Charcoal
    },
  };

  const selectedIntensity = intensityMap[intensity];
  const selectedAccent = accentLightMap[accentColor];

  // Mobile visibility classes
  const mobileClass = mobileIntensity === "hidden"
    ? "hidden md:block"
    : mobileIntensity === "reduced"
    ? "[@media(max-width:768px)]:opacity-50"
    : "";

  return (
    <div
      aria-hidden="true"
      style={{ opacity }}
      className={`fixed inset-0 pointer-events-none select-none overflow-hidden -z-10 bg-[#060608] ${mobileClass} ${className}`}
    >
      {/* ========================================================
          LAYER 1: DARK BASE
          Deep underground studio palette: charcoal, deep navy, midnight
          ======================================================== */}
      <div 
        className="absolute inset-0 bg-gradient-to-b from-[#08080b] via-[#060609] to-[#040406]"
      />

      {/* ========================================================
          LAYER 2: AMBIENT LIGHT LAYER
          Large blurred radial lights creating subtle studio depth
          ======================================================== */}
      <div className={`absolute inset-0 transition-opacity duration-700 ${selectedIntensity.lightOpacity}`}>
        {/* Top-left primary aura (Key light) */}
        <div
          className="absolute -top-[15%] -left-[10%] w-[65vw] h-[65vw] max-w-[900px] max-h-[900px] rounded-full blur-[130px] sm:blur-[160px]"
          style={{ background: `radial-gradient(circle, ${selectedAccent.primary} 0%, transparent 70%)` }}
        />

        {/* Right-center secondary aura (Rim light) */}
        <div
          className="absolute top-[25%] -right-[15%] w-[60vw] h-[60vw] max-w-[850px] max-h-[850px] rounded-full blur-[140px] sm:blur-[180px]"
          style={{ background: `radial-gradient(circle, ${selectedAccent.secondary} 0%, transparent 65%)` }}
        />

        {/* Bottom subtle baseline reflection */}
        <div
          className="absolute -bottom-[20%] left-[20%] w-[70vw] h-[50vw] max-w-[1000px] max-h-[700px] rounded-full blur-[150px]"
          style={{ background: `radial-gradient(ellipse, ${selectedAccent.tertiary} 0%, transparent 70%)` }}
        />
      </div>

      {/* ========================================================
          LAYER 3: SOUND-FIELD LAYER
          Abstract acoustic matrix pattern with radial falloff mask
          ======================================================== */}
      <div 
        className={`absolute inset-0 transition-opacity duration-700 ${selectedIntensity.dotOpacity}`}
        style={{
          maskImage: "radial-gradient(circle at 50% 35%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 35%, black 20%, transparent 75%)",
        }}
      >
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="soundfield-pattern"
              x="0"
              y="0"
              width="44"
              height="44"
              patternUnits="userSpaceOnUse"
            >
              {/* Primary sound-field matrix point */}
              <circle cx="22" cy="22" r="1.1" fill="rgba(255, 255, 255, 0.16)" />
              {/* Harmonic secondary node */}
              <circle cx="44" cy="44" r="0.65" fill="rgba(168, 85, 247, 0.14)" />
              <circle cx="0" cy="0" r="0.65" fill="rgba(59, 130, 246, 0.12)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#soundfield-pattern)" />
        </svg>
      </div>

      {/* ========================================================
          LAYER 4: PARTICLE / ATMOSPHERE LAYER
          Static floating studio micro-motes / ambient dust particles
          ======================================================== */}
      <div className={`absolute inset-0 transition-opacity duration-700 ${selectedIntensity.particleOpacity}`}>
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Constellation of carefully balanced atmospheric particles */}
          <circle cx="12%" cy="18%" r="1.4" fill="rgba(255, 255, 255, 0.22)" filter="drop-shadow(0 0 4px rgba(168, 85, 247, 0.4))" />
          <circle cx="28%" cy="14%" r="0.9" fill="rgba(255, 255, 255, 0.14)" />
          <circle cx="45%" cy="22%" r="1.6" fill="rgba(147, 197, 253, 0.25)" filter="drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))" />
          <circle cx="68%" cy="11%" r="1.1" fill="rgba(255, 255, 255, 0.18)" />
          <circle cx="84%" cy="26%" r="1.3" fill="rgba(216, 180, 254, 0.22)" filter="drop-shadow(0 0 5px rgba(168, 85, 247, 0.5))" />
          <circle cx="92%" cy="19%" r="0.8" fill="rgba(255, 255, 255, 0.12)" />

          <circle cx="8%" cy="46%" r="1.1" fill="rgba(255, 255, 255, 0.15)" />
          <circle cx="22%" cy="58%" r="1.8" fill="rgba(192, 132, 252, 0.28)" filter="drop-shadow(0 0 8px rgba(168, 85, 247, 0.6))" />
          <circle cx="38%" cy="49%" r="0.9" fill="rgba(255, 255, 255, 0.16)" />
          <circle cx="58%" cy="62%" r="1.2" fill="rgba(147, 197, 253, 0.20)" />
          <circle cx="76%" cy="52%" r="1.5" fill="rgba(255, 255, 255, 0.24)" filter="drop-shadow(0 0 5px rgba(255, 255, 255, 0.3))" />
          <circle cx="88%" cy="67%" r="1.0" fill="rgba(216, 180, 254, 0.18)" />

          <circle cx="15%" cy="82%" r="1.2" fill="rgba(147, 197, 253, 0.18)" />
          <circle cx="32%" cy="78%" r="1.5" fill="rgba(255, 255, 255, 0.20)" filter="drop-shadow(0 0 6px rgba(168, 85, 247, 0.4))" />
          <circle cx="52%" cy="88%" r="0.8" fill="rgba(255, 255, 255, 0.12)" />
          <circle cx="69%" cy="84%" r="1.7" fill="rgba(192, 132, 252, 0.26)" filter="drop-shadow(0 0 7px rgba(168, 85, 247, 0.5))" />
          <circle cx="83%" cy="91%" r="1.0" fill="rgba(255, 255, 255, 0.15)" />
        </svg>
      </div>

      {/* ========================================================
          LAYER 5: FINE CINEMATIC GRAIN / NOISE
          Ultra-fine procedural noise generating tactile studio film aesthetic
          ======================================================== */}
      <div 
        className="absolute inset-0 opacity-[0.022] mix-blend-screen"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}

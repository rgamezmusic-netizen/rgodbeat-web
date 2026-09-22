"use client";

import React, { useEffect, useRef, useState } from "react";

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
  /** Whether ambient motion and parallax are active (defaults to true) */
  animate?: boolean;
  /** Mobile viewport behavior */
  mobileIntensity?: MobileIntensity;
  /** Additional custom class names */
  className?: string;
}

/**
 * AtmosphericBackground (RGODBEAT 2.0 - PART 2: Ambient Motion & Parallax)
 * 
 * An independent atmospheric layer simulating an underground futuristic music studio at night.
 * 
 * Performance & Architecture:
 * - 100% pointer-events-none (never captures clicks, scrolling, or gestures)
 * - Pure hardware-accelerated GPU transforms (translate3d, scale3d)
 * - Zero CPU churn: RAF loop automatically sleeps when mouse rests
 * - Full prefers-reduced-motion accessibility compliance
 * - Zero external assets, zero heavy WebGL, zero video
 */
export function AtmosphericBackground({
  intensity = "medium",
  accentColor = "purple",
  opacity = 1,
  animate = true,
  mobileIntensity = "reduced",
  className = "",
}: AtmosphericBackgroundProps) {
  // Layer DOM refs for silky GPU parallax without re-renders
  const lightsLayerRef = useRef<HTMLDivElement>(null);
  const soundfieldLayerRef = useRef<HTMLDivElement>(null);
  const particlesLayerRef = useRef<HTMLDivElement>(null);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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

  // Accent color palettes
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

  // -------------------------------------------------------------
  // DESKTOP SUBTLE PARALLAX SYSTEM (Controlled by requestAnimationFrame)
  // -------------------------------------------------------------
  useEffect(() => {
    // Check user preference for reduced motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(motionQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    if (motionQuery.addEventListener) {
      motionQuery.addEventListener("change", handleMotionChange);
    }

    if (!animate || motionQuery.matches) {
      return () => {
        if (motionQuery.removeEventListener) {
          motionQuery.removeEventListener("change", handleMotionChange);
        }
      };
    }

    // Only enable mouse parallax on devices with fine pointer (mouse)
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;
    if (!isFinePointer) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId: number | null = null;
    let isRunning = false;

    const onMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      if (!innerWidth || !innerHeight) return;

      // Normalized coordinates from -1 to 1 centered at screen middle
      targetX = (e.clientX / innerWidth - 0.5) * 2;
      targetY = (e.clientY / innerHeight - 0.5) * 2;

      if (!isRunning) {
        isRunning = true;
        rafId = requestAnimationFrame(animateLoop);
      }
    };

    const animateLoop = () => {
      // Smooth exponential easing factor
      const ease = 0.04;
      const dx = targetX - currentX;
      const dy = targetY - currentY;

      currentX += dx * ease;
      currentY += dy * ease;

      // Multi-layer depth parallax offsets
      // Layer 2: Ambient lights move gently (8px max)
      if (lightsLayerRef.current) {
        lightsLayerRef.current.style.transform = `translate3d(${(-currentX * 10).toFixed(2)}px, ${(-currentY * 8).toFixed(2)}px, 0)`;
      }

      // Layer 3: Acoustic sound-field moves at medium depth (18px max)
      if (soundfieldLayerRef.current) {
        soundfieldLayerRef.current.style.transform = `translate3d(${(-currentX * 18).toFixed(2)}px, ${(-currentY * 15).toFixed(2)}px, 0)`;
      }

      // Layer 4: Ambient particles move closest to viewer (28px max)
      if (particlesLayerRef.current) {
        particlesLayerRef.current.style.transform = `translate3d(${(-currentX * 28).toFixed(2)}px, ${(-currentY * 22).toFixed(2)}px, 0)`;
      }

      // If almost reached resting target, pause loop to save 100% CPU
      if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) {
        rafId = requestAnimationFrame(animateLoop);
      } else {
        isRunning = false;
        rafId = null;
      }
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (rafId) cancelAnimationFrame(rafId);
      if (motionQuery.removeEventListener) {
        motionQuery.removeEventListener("change", handleMotionChange);
      }
    };
  }, [animate]);

  const shouldAnimate = animate && !prefersReducedMotion;

  return (
    <div
      aria-hidden="true"
      style={{ opacity }}
      className={`fixed inset-0 pointer-events-none select-none overflow-hidden -z-10 bg-[#060608] ${mobileClass} ${className}`}
    >
      {/* Dynamic Keyframe Injections for Organic Ambient Drift */}
      <style jsx global>{`
        @keyframes rgod-ambient-drift-1 {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(55px, 40px, 0) scale(1.08);
          }
          100% {
            transform: translate3d(-20px, 15px, 0) scale(0.96);
          }
        }

        @keyframes rgod-ambient-drift-2 {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(-45px, -35px, 0) scale(0.94);
          }
          100% {
            transform: translate3d(25px, -15px, 0) scale(1.05);
          }
        }

        @keyframes rgod-ambient-drift-3 {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(35px, -25px, 0) scale(1.06);
          }
          100% {
            transform: translate3d(-15px, 20px, 0) scale(0.98);
          }
        }

        @keyframes rgod-soundfield-morph {
          0% {
            transform: perspective(1000px) rotateX(12deg) scale(1) translateY(0);
          }
          50% {
            transform: perspective(1000px) rotateX(16deg) scale(1.03) translateY(-12px);
          }
          100% {
            transform: perspective(1000px) rotateX(12deg) scale(1) translateY(0);
          }
        }

        @keyframes rgod-particles-drift {
          0% {
            transform: translate3d(0, 0, 0);
            opacity: 0.85;
          }
          50% {
            transform: translate3d(14px, -18px, 0);
            opacity: 1;
          }
          100% {
            transform: translate3d(-8px, -32px, 0);
            opacity: 0.75;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rgod-animate-drift-1,
          .rgod-animate-drift-2,
          .rgod-animate-drift-3,
          .rgod-animate-soundfield,
          .rgod-animate-particles {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* ========================================================
          LAYER 1: DARK BASE
          Deep underground studio palette: charcoal, deep navy, midnight
          ======================================================== */}
      <div 
        className="absolute inset-0 bg-gradient-to-b from-[#08080b] via-[#060609] to-[#040406]"
      />

      {/* ========================================================
          LAYER 2: AMBIENT LIGHT LAYER (With Slow 15s–30s Drift & Depth)
          ======================================================== */}
      <div
        ref={lightsLayerRef}
        className={`absolute inset-0 transition-opacity duration-700 will-change-transform ${selectedIntensity.lightOpacity}`}
      >
        {/* Top-left primary aura (Key light - 24s slow ease) */}
        <div
          className={`absolute -top-[15%] -left-[10%] w-[65vw] h-[65vw] max-w-[900px] max-h-[900px] rounded-full blur-[130px] sm:blur-[160px] ${
            shouldAnimate ? "rgod-animate-drift-1" : ""
          }`}
          style={{
            background: `radial-gradient(circle, ${selectedAccent.primary} 0%, transparent 70%)`,
            animation: shouldAnimate ? "rgod-ambient-drift-1 24s ease-in-out infinite alternate" : "none",
          }}
        />

        {/* Right-center secondary aura (Rim light - 28s slow ease) */}
        <div
          className={`absolute top-[25%] -right-[15%] w-[60vw] h-[60vw] max-w-[850px] max-h-[850px] rounded-full blur-[140px] sm:blur-[180px] ${
            shouldAnimate ? "rgod-animate-drift-2" : ""
          }`}
          style={{
            background: `radial-gradient(circle, ${selectedAccent.secondary} 0%, transparent 65%)`,
            animation: shouldAnimate ? "rgod-ambient-drift-2 28s ease-in-out infinite alternate" : "none",
          }}
        />

        {/* Bottom subtle baseline reflection (20s slow ease) */}
        <div
          className={`absolute -bottom-[20%] left-[20%] w-[70vw] h-[50vw] max-w-[1000px] max-h-[700px] rounded-full blur-[150px] ${
            shouldAnimate ? "rgod-animate-drift-3" : ""
          }`}
          style={{
            background: `radial-gradient(ellipse, ${selectedAccent.tertiary} 0%, transparent 70%)`,
            animation: shouldAnimate ? "rgod-ambient-drift-3 20s ease-in-out infinite alternate" : "none",
          }}
        />
      </div>

      {/* ========================================================
          LAYER 3: SOUND-FIELD LAYER (Abstract Organic Acoustic Morphing)
          ======================================================== */}
      <div 
        ref={soundfieldLayerRef}
        className={`absolute inset-0 transition-opacity duration-700 will-change-transform ${selectedIntensity.dotOpacity}`}
        style={{
          maskImage: "radial-gradient(circle at 50% 35%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 35%, black 20%, transparent 75%)",
        }}
      >
        <div
          className="w-full h-full"
          style={{
            animation: shouldAnimate ? "rgod-soundfield-morph 24s ease-in-out infinite alternate" : "none",
          }}
        >
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern
                id="soundfield-pattern-v2"
                x="0"
                y="0"
                width="44"
                height="44"
                patternUnits="userSpaceOnUse"
              >
                {/* Primary sound-field matrix point */}
                <circle cx="22" cy="22" r="1.1" fill="rgba(255, 255, 255, 0.16)" />
                {/* Harmonic secondary nodes */}
                <circle cx="44" cy="44" r="0.65" fill="rgba(168, 85, 247, 0.14)" />
                <circle cx="0" cy="0" r="0.65" fill="rgba(59, 130, 246, 0.12)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#soundfield-pattern-v2)" />
          </svg>
        </div>
      </div>

      {/* ========================================================
          LAYER 4: PARTICLE / ATMOSPHERE LAYER (Subtle Floating Studio Motes)
          ======================================================== */}
      <div
        ref={particlesLayerRef}
        className={`absolute inset-0 transition-opacity duration-700 will-change-transform ${selectedIntensity.particleOpacity}`}
        style={{
          animation: shouldAnimate ? "rgod-particles-drift 32s ease-in-out infinite alternate" : "none",
        }}
      >
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Constellation of atmospheric particles */}
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
          Tactile analogue film grain overlay
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

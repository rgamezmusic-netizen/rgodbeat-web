"use client";

import React, { useEffect, useRef } from "react";

export interface ProceduralStarfieldProps {
  /** Total number of procedural stars (defaults to ~180 on desktop) */
  density?: "low" | "medium" | "high";
  /** Whether the stars twinkle and animate */
  animate?: boolean;
  /** Whether audio is currently playing (modulates shimmer intensity) */
  playing?: boolean;
  /** Global starfield opacity multiplier (0 to 1) */
  opacity?: number;
  /** Primary tint: cosmic (purple/cyan/white), violet (purple/blue), or neutral (pure diamond white) */
  tint?: "cosmic" | "violet" | "neutral";
  className?: string;
}

interface Star {
  x: number;
  y: number;
  baseSize: number;
  baseAlpha: number;
  alpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  tier: 1 | 2 | 3; // 1: Distant faint, 2: Mid-range, 3: Bright hero star
  r: number;
  g: number;
  b: number;
  hasSpike: boolean;
}

interface ShootingStar {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  opacity: number;
  active: boolean;
}

export function ProceduralStarfield({
  density = "medium",
  animate = true,
  playing = false,
  opacity = 0.85,
  tint = "cosmic",
  className = "",
}: ProceduralStarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let shootingStar: ShootingStar | null = null;
    let nextShootingStarTime = Date.now() + 4000;

    // Mouse parallax tracking
    let targetParallaxX = 0;
    let targetParallaxY = 0;
    let currentParallaxX = 0;
    let currentParallaxY = 0;

    const countMap = {
      low: 90,
      medium: 180,
      high: 280,
    };

    const isMobile = window.innerWidth < 768;
    const targetCount = isMobile ? Math.floor(countMap[density] * 0.45) : countMap[density];

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
      generateStars();
    };

    const generateStars = () => {
      stars = [];
      for (let i = 0; i < targetCount; i++) {
        // Random distribution across screen
        const x = Math.random() * width;
        const y = Math.random() * height;

        // Depth tier: 65% distant, 25% mid-ground, 10% bright stars
        const rand = Math.random();
        let tier: 1 | 2 | 3 = 1;
        let baseSize = 0.7;
        let baseAlpha = 0.25;

        if (rand > 0.90) {
          tier = 3;
          baseSize = 1.8 + Math.random() * 0.9;
          baseAlpha = 0.75 + Math.random() * 0.25;
        } else if (rand > 0.65) {
          tier = 2;
          baseSize = 1.1 + Math.random() * 0.6;
          baseAlpha = 0.45 + Math.random() * 0.35;
        } else {
          tier = 1;
          baseSize = 0.5 + Math.random() * 0.5;
          baseAlpha = 0.2 + Math.random() * 0.3;
        }

        // Color palettes based on tint
        let r = 255;
        let g = 255;
        let b = 255;

        if (tint === "cosmic") {
          const colorRoll = Math.random();
          if (colorRoll > 0.7) {
            // Electric violet / lilac
            r = 216;
            g = 180;
            b = 254;
          } else if (colorRoll > 0.45) {
            // Cool cyber cyan / ice blue
            r = 186;
            g = 230;
            b = 253;
          } else if (colorRoll > 0.25) {
            // Soft lavender
            r = 196;
            g = 181;
            b = 253;
          } else {
            // Diamond white
            r = 250;
            g = 250;
            b = 255;
          }
        } else if (tint === "violet") {
          const colorRoll = Math.random();
          if (colorRoll > 0.5) {
            r = 192;
            g = 132;
            b = 252;
          } else {
            r = 233;
            g = 213;
            b = 255;
          }
        } else {
          // Neutral diamond white
          r = 245;
          g = 248;
          b = 255;
        }

        stars.push({
          x,
          y,
          baseSize,
          baseAlpha,
          alpha: baseAlpha,
          twinkleSpeed: 0.012 + Math.random() * 0.035,
          twinklePhase: Math.random() * Math.PI * 2,
          tier,
          r,
          g,
          b,
          hasSpike: tier === 3 && Math.random() > 0.5,
        });
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      targetParallaxX = (e.clientX / width - 0.5) * 2;
      targetParallaxY = (e.clientY / height - 0.5) * 2;
    };

    const maybeTriggerShootingStar = () => {
      const now = Date.now();
      if (!shootingStar && now > nextShootingStarTime) {
        shootingStar = {
          x: Math.random() * (width * 0.8),
          y: Math.random() * (height * 0.4),
          length: 80 + Math.random() * 70,
          speed: 9 + Math.random() * 6,
          angle: (Math.PI / 4) + (Math.random() - 0.5) * 0.3,
          opacity: 1,
          active: true,
        };
        nextShootingStarTime = now + 9000 + Math.random() * 8000;
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Smooth parallax easing
      currentParallaxX += (targetParallaxX - currentParallaxX) * 0.04;
      currentParallaxY += (targetParallaxY - currentParallaxY) * 0.04;

      // Audio reactive multiplier
      const pulseMultiplier = playing ? 1.2 : 1.0;

      // Render Procedural Stars
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        if (animate) {
          star.twinklePhase += star.twinkleSpeed * (playing ? 1.3 : 1);
        }

        // Sinusoidal twinkle formula
        const twinkleFactor = 0.5 + 0.5 * Math.sin(star.twinklePhase);
        const dynamicAlpha = Math.min(
          1,
          star.baseAlpha * (0.6 + 0.4 * twinkleFactor) * pulseMultiplier * opacity
        );

        // Parallax depth multiplier per tier
        const tierParallax = star.tier === 3 ? 16 : star.tier === 2 ? 9 : 4;
        const renderX = star.x - currentParallaxX * tierParallax;
        const renderY = star.y - currentParallaxY * tierParallax;

        // Wrap around boundaries
        const finalX = (renderX + width) % width;
        const finalY = (renderY + height) % height;

        // Tier 3: Soft halo glow for prominent stars
        if (star.tier === 3) {
          const glowGrad = ctx.createRadialGradient(
            finalX,
            finalY,
            0,
            finalX,
            finalY,
            star.baseSize * 4
          );
          glowGrad.addColorStop(0, `rgba(${star.r}, ${star.g}, ${star.b}, ${dynamicAlpha * 0.45})`);
          glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(finalX, finalY, star.baseSize * 4, 0, Math.PI * 2);
          ctx.fill();

          // Subtle 4-point cross diffraction spikes on brightest stars
          if (star.hasSpike) {
            ctx.strokeStyle = `rgba(${star.r}, ${star.g}, ${star.b}, ${dynamicAlpha * 0.35})`;
            ctx.lineWidth = 0.6;
            const spikeLen = star.baseSize * 2.8;
            ctx.beginPath();
            ctx.moveTo(finalX - spikeLen, finalY);
            ctx.lineTo(finalX + spikeLen, finalY);
            ctx.moveTo(finalX, finalY - spikeLen);
            ctx.lineTo(finalX, finalY + spikeLen);
            ctx.stroke();
          }
        }

        // Draw the core star body
        ctx.fillStyle = `rgba(${star.r}, ${star.g}, ${star.b}, ${dynamicAlpha})`;
        ctx.beginPath();
        ctx.arc(finalX, finalY, star.baseSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // Render Procedural Shooting Star
      if (animate) {
        maybeTriggerShootingStar();
      }

      if (shootingStar && shootingStar.active) {
        const { x, y, length, speed, angle, opacity: sOpacity } = shootingStar;
        const tailX = x - Math.cos(angle) * length;
        const tailY = y - Math.sin(angle) * length;

        const grad = ctx.createLinearGradient(x, y, tailX, tailY);
        grad.addColorStop(0, `rgba(255, 255, 255, ${sOpacity * 0.9 * opacity})`);
        grad.addColorStop(0.3, `rgba(196, 181, 253, ${sOpacity * 0.6 * opacity})`);
        grad.addColorStop(1, "rgba(147, 51, 234, 0)");

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(x, y);
        ctx.stroke();

        shootingStar.x += Math.cos(angle) * speed;
        shootingStar.y += Math.sin(angle) * speed;
        shootingStar.opacity -= 0.018;

        if (shootingStar.opacity <= 0 || shootingStar.x > width + 50 || shootingStar.y > height + 50) {
          shootingStar = null;
        }
      }

      if (animate) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    resize();
    render();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [density, animate, playing, opacity, tint]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none select-none z-0 ${className}`}
    />
  );
}

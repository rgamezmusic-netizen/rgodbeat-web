'use client';

import { useEffect, useRef } from 'react';
import styles from './Ranking.module.css';

type Star = { x: number; y: number; radius: number; opacity: number; phase: number; speed: number };
type Constellation = { x: number; y: number; points: { x: number; y: number }[] };

/** Decorative space, generated locally on each visit. No image downloads or animation library. */
export function GalaxyBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!root || !canvas || !context) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seed = new Uint32Array(1); crypto.getRandomValues(seed);
    let state = seed[0];
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    const palettes = [ ['119, 77, 175', '40, 111, 152'], ['61, 97, 168', '145, 88, 136'], ['94, 78, 162', '127, 104, 65'], ['52, 106, 130', '109, 77, 169'] ];
    const palette = palettes[Math.floor(random() * palettes.length)];
    root.style.setProperty('--nebula-one', palette[0]);
    root.style.setProperty('--nebula-two', palette[1]);
    root.style.setProperty('--nebula-x', `${-20 + random() * 40}%`);
    root.style.setProperty('--nebula-y', `${random() * 28}%`);
    root.style.setProperty('--galaxy-angle', `${-35 + random() * 70}deg`);
    root.style.setProperty('--galaxy-x', `${35 + random() * 45}%`);
    root.style.setProperty('--galaxy-y', `${10 + random() * 45}%`);
    let width = 0; let height = 0; let frame = 0; let last = 0; let elapsed = random() * 60;
    let lastDraw = 0; let meteorAt = elapsed + 8 + random() * 12;
    const stars: Star[] = Array.from({ length: window.innerWidth < 760 ? 85 : 190 }, () => ({
      x: random(), y: random(), radius: .4 + random() * 1.4, opacity: .22 + random() * .65, phase: random() * Math.PI * 2, speed: .35 + random() * .5,
    }));
    const constellations: Constellation[] = Array.from({ length: 3 }, () => ({
      x: random() * .8, y: .12 + random() * .65,
      points: Array.from({ length: 5 }, (_, index) => ({ x: index * 25 + random() * 14, y: random() * 75 })),
    }));
    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const drift = reduceMotion.matches ? 0 : elapsed * (star.radius > 1.4 ? .7 : .25);
        const x = (star.x * width + drift) % width;
        const y = star.y * height;
        const glow = reduceMotion.matches ? 1 : .75 + .25 * Math.sin(elapsed * star.speed + star.phase);
        context.fillStyle = `rgba(236, 237, 255, ${star.opacity * glow})`;
        context.beginPath(); context.arc(x, y, star.radius, 0, Math.PI * 2); context.fill();
        if (star.radius > 1.65) {
          context.strokeStyle = `rgba(216, 188, 124, ${star.opacity * glow * .4})`;
          context.lineWidth = .5; context.beginPath(); context.moveTo(x - 5, y); context.lineTo(x + 5, y); context.moveTo(x, y - 5); context.lineTo(x, y + 5); context.stroke();
        }
      }
      for (const constellation of constellations) {
        const x = constellation.x * width; const y = constellation.y * height;
        const scale = width < 760 ? .7 : 1;
        context.strokeStyle = 'rgba(214, 205, 183, .18)'; context.lineWidth = .65; context.beginPath();
        constellation.points.forEach((point, index) => {
          const px = x + point.x * scale; const py = y + point.y * scale;
          if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
        }); context.stroke();
        for (const point of constellation.points) {
          context.fillStyle = 'rgba(237, 228, 208, .65)'; context.beginPath(); context.arc(x + point.x * scale, y + point.y * scale, 1.3, 0, Math.PI * 2); context.fill();
        }
      }
      const age = elapsed - meteorAt;
      if (!reduceMotion.matches && age > 0 && age < 1.6) {
        const x = width * .14 + age * width * .38; const y = height * .05 + age * height * .22;
        const gradient = context.createLinearGradient(x - 85, y - 40, x, y);
        gradient.addColorStop(0, 'rgba(230, 226, 255, 0)'); gradient.addColorStop(1, `rgba(230, 226, 255, ${Math.sin(age / 1.6 * Math.PI) * .7})`);
        context.strokeStyle = gradient; context.lineWidth = 1; context.beginPath(); context.moveTo(x - 85, y - 40); context.lineTo(x, y); context.stroke();
      } else if (age >= 1.6) meteorAt = elapsed + 12 + random() * 20;
    };
    const resize = () => {
      width = root.clientWidth; height = root.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
    };
    const tick = (time: number) => {
      elapsed += last ? Math.min(time - last, 100) / 1000 : 0; last = time;
      if (time - lastDraw >= (width < 760 ? 50 : 42)) { lastDraw = time; draw(); }
      frame = requestAnimationFrame(tick);
    };
    const syncMotion = () => {
      cancelAnimationFrame(frame); last = 0;
      const paused = document.hidden || reduceMotion.matches;
      root.dataset.paused = String(paused);
      if (!paused) frame = requestAnimationFrame(tick); else draw();
    };
    const observer = new ResizeObserver(resize); observer.observe(root);
    document.addEventListener('visibilitychange', syncMotion); reduceMotion.addEventListener('change', syncMotion);
    resize(); syncMotion();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', syncMotion); reduceMotion.removeEventListener('change', syncMotion); };
  }, []);
  return <div ref={rootRef} className={styles.galaxyBackground} aria-hidden="true">
    <div className={styles.nebulaOne} /><div className={styles.nebulaTwo} /><div className={styles.distantGalaxy} />
    <canvas ref={canvasRef} className={styles.spaceCanvas} />
  </div>;
}

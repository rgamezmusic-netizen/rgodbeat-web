"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import styles from "./Hero.module.css";

const padIndexes = Array.from({ length: 16 }, (_, index) => index);

export function HeroPadField() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const field = fieldRef.current;
    if (!field) return;
    field.dataset.pointerActive = "true";

    const bounds = field.getBoundingClientRect();
    pointerRef.current = { x: event.clientX, y: event.clientY };
    field.style.setProperty("--pointer-x", `${event.clientX - bounds.left}px`);
    field.style.setProperty("--pointer-y", `${event.clientY - bounds.top}px`);

    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const grid = field.querySelector<HTMLElement>("[data-pad-grid]");
      if (!grid) return;
      const gridBounds = grid.getBoundingClientRect();
      const cellSize = gridBounds.width / 4;
      const { x, y } = pointerRef.current;

      grid.querySelectorAll<HTMLElement>("[data-pad]").forEach((pad, index) => {
        const col = index % 4;
        const row = Math.floor(index / 4);
        const centerX = gridBounds.left + (col + 0.5) * cellSize;
        const centerY = gridBounds.top + (row + 0.5) * cellSize;
        const distance = Math.hypot(x - centerX, y - centerY);
        const energy = Math.max(0, 1 - distance / 150);
        pad.style.setProperty("--energy", (energy * 0.8).toFixed(2));
      });
    });
  };

  const handlePointerLeave = () => {
    const field = fieldRef.current;
    if (!field) return;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    delete field.dataset.pointerActive;
    field.style.setProperty("--pointer-x", "-400px");
    field.style.setProperty("--pointer-y", "-400px");
    field.querySelectorAll<HTMLElement>("[data-pad]").forEach((pad) => {
      pad.style.setProperty("--energy", "0");
    });
  };

  return (
    <div
      ref={fieldRef}
      className={styles.padField}
      aria-hidden="true"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className={styles.padGrid} data-pad-grid>
        {padIndexes.map((index) => (
          <span className={styles.ambientPad} data-pad key={index} />
        ))}
      </div>
      <span className={styles.fieldGlow} />
    </div>
  );
}

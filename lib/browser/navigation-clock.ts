type ClockSample = { time: number; receivedAt: number };
let sample: ClockSample | null = null;
let pending: Promise<void> | null = null;

export function navigationServerTime() {
  return sample ? sample.time + performance.now() - sample.receivedAt : null;
}

export function syncNavigationClock() {
  if (pending) return pending;
  if (sample && performance.now() - sample.receivedAt < 60_000) return Promise.resolve();
  pending = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const started = performance.now();
    try {
      const response = await fetch("/api/navigation/clock", { cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json() as { serverTime?: string };
      const time = Date.parse(data.serverTime || "");
      if (Number.isFinite(time)) sample = { time: time + (performance.now() - started) / 2, receivedAt: performance.now() };
    } catch { /* Keep the chart's existing server-time fallback during outages. */ }
    finally { clearTimeout(timer); }
  })().finally(() => { pending = null; });
  return pending;
}

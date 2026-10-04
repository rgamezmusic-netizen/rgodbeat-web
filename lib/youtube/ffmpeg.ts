import "server-only";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";

/** Prefer a valid explicit/package path, then fall back to the traced package binary. */
export function getYouTubeFfmpegPath(): string | null {
  if (ffmpegPath && existsSync(ffmpegPath)) return ffmpegPath;
  const tracedPackageBinary = resolve(process.cwd(), "node_modules/ffmpeg-static/ffmpeg");
  return existsSync(tracedPackageBinary) ? tracedPackageBinary : null;
}

export function isYouTubeFfmpegReady(): boolean {
  return getYouTubeFfmpegPath() !== null;
}

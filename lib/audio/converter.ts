import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * RGODBEAT 2.0 - High-Fidelity Audio Converter
 * Automatically converts uncompressed Master WAV files to studio-grade 320kbps MP3s.
 */

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "/usr/bin/ffmpeg",
  "ffmpeg",
].filter(Boolean) as string[];

let cachedFfmpegPath: string | null = null;

export function getFfmpegBinary(): string | null {
  if (cachedFfmpegPath) return cachedFfmpegPath;

  for (const binPath of FFMPEG_CANDIDATES) {
    try {
      execSync(`${binPath} -version`, { stdio: "ignore" });
      cachedFfmpegPath = binPath;
      return binPath;
    } catch {
      // Continue searching
    }
  }

  return null;
}

export function isAudioConverterAvailable(): boolean {
  return Boolean(getFfmpegBinary());
}

/**
 * Converts a WAV audio buffer into a high-fidelity MP3 buffer (320 kbps, 44.1 kHz).
 */
export async function convertWavBufferToMp3(
  wavBuffer: Buffer,
  bitrate = "320k"
): Promise<Buffer> {
  const ffmpegBin = getFfmpegBinary();
  if (!ffmpegBin) {
    throw new Error(
      "FFmpeg audio converter is not available on this system. Please provide an MP3 preview file or install ffmpeg."
    );
  }

  const tempId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = os.tmpdir();
  const inputWavPath = path.join(tempDir, `rgodbeat_in_${tempId}.wav`);
  const outputMp3Path = path.join(tempDir, `rgodbeat_out_${tempId}.mp3`);

  try {
    // 1. Write WAV to temporary disk file for stable streaming
    await fs.promises.writeFile(inputWavPath, wavBuffer);

    // 2. Run FFmpeg conversion
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegBin, [
        "-y",
        "-i",
        inputWavPath,
        "-codec:a",
        "libmp3lame",
        "-b:a",
        bitrate,
        "-ar",
        "44100",
        outputMp3Path,
      ]);

      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputMp3Path)) {
          resolve();
        } else {
          reject(
            new Error(
              `FFmpeg failed to convert WAV to MP3 (code: ${code}). Details: ${stderr.slice(-200)}`
            )
          );
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });

    // 3. Read converted MP3 buffer
    const mp3Buffer = await fs.promises.readFile(outputMp3Path);
    return mp3Buffer;
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(inputWavPath)) await fs.promises.unlink(inputWavPath);
    } catch {}
    try {
      if (fs.existsSync(outputMp3Path)) await fs.promises.unlink(outputMp3Path);
    } catch {}
  }
}

import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createAdminClient } from "@/lib/supabase/admin";
import { RG_UUID, serializeIdentityError, validateOwnedTrackForPublication } from "@/lib/rg/identity";
import { recordConfirmedPublication } from "@/lib/rg/publications";
import { getAuthorizedStudioExporter } from "@/lib/youtube/access";
import { getYouTubeChannelSettings, refreshYouTubeAccessToken } from "@/lib/youtube/channel";
import { youtubeConfig } from "@/lib/youtube/config";
import { getYouTubeFfmpegPath, isYouTubeFfmpegReady } from "@/lib/youtube/ffmpeg";
import { clearYouTubeR2, getYouTubeR2Bucket, getYouTubeR2Client, headYouTubeR2, isYouTubeR2Configured, readYouTubeR2 } from "@/lib/youtube/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PublishInput = { uploadId?: string; artistName?: string; videoTitle?: string; videoDescription?: string; beatTitle?: string; beatGenre?: string; beatBpm?: number; beatKey?: string; privacy?: "unlisted" | "public"; madeForKids?: boolean; hasRights?: boolean; coverUrl?: string | null; rgLink?: { artistId?: unknown; trackId?: unknown; beatId?: unknown } };
type YouTubeInsertResponse = { id?: string; status?: { privacyStatus?: "private" | "unlisted" | "public" }; error?: { errors?: Array<{ reason?: string }> } };

function jobsTable() { return createAdminClient().from("youtube_export_jobs"); }
function stagingPrefix(userId: string, uploadId: string) { return `youtube/exports/${userId}/${uploadId}/`; }
function failCode(value: string | undefined) {
  const accepted = new Set(["quotaExceeded", "dailyLimitExceeded", "forbidden", "uploadLimitExceeded", "invalidVideoMetadata", "processingFailed", "renderFailed", "uploadFailed", "channelAuthorization"]);
  return value && accepted.has(value) ? value : "uploadFailed";
}

function cleanMetadataText(value: string, maxLength: number) {
  return value.replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildVideoMetadata(input: { artistName: string; videoTitle: string; videoDescription: string; beatTitle: string; beatGenre: string; beatBpm: number; beatKey: string }) {
  const title = cleanMetadataText(input.videoTitle, 100) || cleanMetadataText(`${input.artistName} - ${input.beatTitle} | RGODBEAT`, 100);
  const description = input.videoDescription || [
    `Artista: ${input.artistName}`,
    `Beat: ${input.beatTitle}`,
    input.beatGenre ? `Género: ${input.beatGenre}` : "",
    input.beatBpm ? `Tempo: ${input.beatBpm} BPM` : "",
    input.beatKey ? `Tonalidad: ${input.beatKey}` : "",
  ].filter(Boolean).join("\n");
  const tags = [...new Set([
    "RGODBEAT", input.beatGenre, input.artistName, input.beatTitle,
    input.beatBpm ? `${input.beatBpm} BPM` : "", input.beatKey,
  ].map((tag) => cleanMetadataText(tag, 60)).filter(Boolean))];
  return { title, description, tags, categoryId: "10", defaultLanguage: "es" };
}

async function downloadR2File(key: string, destination: string) {
  const client = getYouTubeR2Client();
  if (!client) throw new Error("storageUnavailable");
  const bucket = getYouTubeR2Bucket();
  if (!bucket) throw new Error("storageUnavailable");
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error("stagedAudioMissing");
  const bodyStream = result.Body.transformToWebStream() as unknown as import("node:stream/web").ReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(bodyStream), createWriteStream(destination, { flags: "wx", mode: 0o600 }));
}

async function streamWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error("coverUnavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("coverTooLarge");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function runFfmpeg(args: string[], cwd: string): Promise<void> {
  const binary = getYouTubeFfmpegPath();
  if (!binary) return Promise.reject(new Error("rendererUnavailable"));
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let errorTail = "";
    child.stderr.on("data", (chunk: Buffer) => { errorTail = (errorTail + chunk.toString("utf8")).slice(-2000); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise() : reject(new Error(errorTail.includes("Invalid data") ? "invalidMaster" : "renderFailed")));
  });
}

function imageExtension(bytes: Buffer): "jpg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

async function loadDefaultCover(url: string | null): Promise<Buffer> {
  if (!url) {
    const logo = resolve(process.cwd(), "public/images/rgodbeat-studio-logo.png");
    return readFile(logo);
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) throw new Error("coverUnavailable");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("coverUnavailable"); }
  const configuredOrigin = new URL(base).origin;
  if (parsed.origin !== configuredOrigin || !parsed.pathname.startsWith("/storage/v1/object/public/rgodbeat-public/covers/") || parsed.pathname.includes("..")) throw new Error("coverUnavailable");
  const response = await fetch(parsed, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("coverUnavailable");
  const bytes = await streamWithLimit(response, 4_000_000);
  if (!imageExtension(bytes)) throw new Error("coverUnavailable");
  return bytes;
}

export async function POST(request: NextRequest) {
  const access = await getAuthorizedStudioExporter();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const input = await request.json().catch(() => ({})) as PublishInput;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "La solicitud de publicación no es válida." }, { status: 400 });
  }
  const hasRgFields = Object.hasOwn(input, "rgLink");
  const rgLink = input.rgLink;
  if (hasRgFields && (!rgLink || typeof rgLink !== "object" || Array.isArray(rgLink)
    || !Object.hasOwn(rgLink, "artistId") || !Object.hasOwn(rgLink, "trackId") || !Object.hasOwn(rgLink, "beatId")
    || Object.keys(rgLink).some(key => !["artistId", "trackId", "beatId"].includes(key))
    || typeof rgLink.artistId !== "string" || !RG_UUID.test(rgLink.artistId)
    || typeof rgLink.trackId !== "string" || !RG_UUID.test(rgLink.trackId)
    || !(rgLink.beatId === null || (typeof rgLink.beatId === "string" && RG_UUID.test(rgLink.beatId))))) {
    return NextResponse.json({ error: "La asociación RG del track no es válida." }, { status: 400 });
  }
  const uploadId = input.uploadId || "";
  const artistName = cleanMetadataText(input.artistName || "", 80);
  const beatTitle = cleanMetadataText(input.beatTitle || "Beat RGODBEAT", 100) || "Beat RGODBEAT";
  const requestedTitle = cleanMetadataText(input.videoTitle || "", 200);
  const videoDescription = (input.videoDescription || "").replace(/[<>]/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  const videoDescriptionBytes = Buffer.byteLength(videoDescription, "utf8");
  const beatGenre = cleanMetadataText(input.beatGenre || "", 40);
  const beatBpm = Number.isInteger(input.beatBpm) && input.beatBpm! >= 30 && input.beatBpm! <= 300 ? input.beatBpm! : 0;
  const beatKey = cleanMetadataText(input.beatKey || "", 24);
  const privacy = input.privacy === "public" ? "public" : "unlisted";
  if (!UUID.test(uploadId) || artistName.length < 1 || requestedTitle.length > 100 || videoDescriptionBytes > 5000 || input.hasRights !== true || typeof input.madeForKids !== "boolean") {
    return NextResponse.json({ error: "Revisa el nombre, el título y la descripción; confirma también los derechos y el público del vídeo." }, { status: 400 });
  }
  if (rgLink) {
    try {
      await validateOwnedTrackForPublication(access.user.id, rgLink.artistId, rgLink.trackId, rgLink.beatId);
    } catch (error) {
      const result = serializeIdentityError(error);
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
  }
  const metadata = buildVideoMetadata({
    artistName, videoTitle: requestedTitle, videoDescription, beatTitle,
    beatGenre, beatBpm, beatKey,
  });
  if (!metadata.title) return NextResponse.json({ error: "El título del vídeo está vacío." }, { status: 400 });
  const config = youtubeConfig();
  if (!config.configured || !config.validKey || !isYouTubeFfmpegReady() || !isYouTubeR2Configured()) return NextResponse.json({ error: "La publicación de YouTube todavía no está configurada." }, { status: 503 });
  const settings = await getYouTubeChannelSettings().catch(() => null);
  if (!settings) return NextResponse.json({ error: "El canal RGODBEAT todavía no está conectado." }, { status: 503 });
  const prefix = stagingPrefix(access.user.id, uploadId);
  const stagedBytes = await headYouTubeR2(`${prefix}master.wav`);
  if (!stagedBytes || stagedBytes > 256_000_000) return NextResponse.json({ error: "No se encontró un master válido para subir." }, { status: 404 });

  const jobId = uploadId;
  const { data: reserved, error: reserveError } = await createAdminClient().rpc("reserve_youtube_export_job", {
    p_id: jobId, p_user_id: access.user.id, p_artist_name: artistName, p_title: metadata.title, p_privacy: privacy,
  });
  if (reserveError) return NextResponse.json({ error: "No se pudo iniciar la publicación. Comprueba si este export ya se envió." }, { status: 409 });
  if (!reserved) return NextResponse.json({ error: "El canal alcanzó el límite de publicaciones automatizadas de hoy. Inténtalo mañana." }, { status: 429 });

  let directory = "";
  try {
    directory = await mkdtemp(join(tmpdir(), "rgodbeat-youtube-"));
    const audioPath = join(directory, "master.wav");
    const videoPath = join(directory, "export.mp4");
    await downloadR2File(`${prefix}master.wav`, audioPath);
    const customCover = await readYouTubeR2(`${prefix}cover`);
    const cover = customCover?.length ? customCover : await loadDefaultCover(input.coverUrl || null);
    if (cover.length > 4_000_000) throw new Error("coverTooLarge");
    const extension = imageExtension(cover);
    if (!extension) throw new Error("coverUnavailable");
    const coverPath = join(directory, `cover.${extension}`);
    await writeFile(coverPath, cover, { mode: 0o600, flag: "wx" });
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "2", "-i", coverPath,
      "-i", audioPath, "-map", "0:v:0", "-map", "1:a:0", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
      "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "23", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", videoPath,
    ], directory);
    const video = await readFile(videoPath);
    const accessToken = await refreshYouTubeAccessToken();
    const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false", {
      method: "POST", cache: "no-store",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": "video/mp4", "x-upload-content-length": String(video.length) },
      body: JSON.stringify({ snippet: metadata, status: { privacyStatus: privacy, selfDeclaredMadeForKids: input.madeForKids } }),
      signal: AbortSignal.timeout(25_000),
    });
    const uploadUrl = start.headers.get("location");
    if (!start.ok || !uploadUrl) {
      const errorBody = await start.json().catch(() => ({})) as YouTubeInsertResponse;
      throw new Error(failCode(errorBody.error?.errors?.[0]?.reason));
    }
    const uploaded = await fetch(uploadUrl, {
      method: "PUT", cache: "no-store", headers: { "content-type": "video/mp4", "content-length": String(video.length) }, body: video,
      signal: AbortSignal.timeout(240_000),
    });
    const result = await uploaded.json().catch(() => ({})) as YouTubeInsertResponse;
    if (!uploaded.ok || !result.id) throw new Error(failCode(result.error?.errors?.[0]?.reason));
    const videoUrl = `https://www.youtube.com/watch?v=${result.id}`;
    const actualPrivacy = result.status?.privacyStatus || privacy;
    const uploadedValues = { status: "uploaded" as const, privacy: actualPrivacy, youtube_video_id: result.id, youtube_url: videoUrl, finished_at: new Date().toISOString() };
    if (!rgLink) {
      // Preserve the existing unlinked publication behavior and response shape.
      await jobsTable().update(uploadedValues).eq("id", jobId).eq("user_id", access.user.id);
      return NextResponse.json({ success: true, videoId: result.id, videoUrl, privacy: actualPrivacy });
    }
    let jobConfirmed = false;
    try {
      const savedJob = await jobsTable().update(uploadedValues).eq("id", jobId).eq("user_id", access.user.id).select("id").maybeSingle();
      jobConfirmed = !savedJob.error && savedJob.data?.id === jobId;
      if (!jobConfirmed) console.error("[YouTube publish job persistence]", savedJob.error?.code || "JOB_NOT_CONFIRMED");
    } catch (error) {
      console.error("[YouTube publish job persistence]", error instanceof Error ? error.name : "UNKNOWN");
    }
    let rgPublication: { linked: boolean; publicationId?: string; error?: string; code?: string } | undefined;
    if (rgLink) {
      rgPublication = jobConfirmed
        ? await recordConfirmedPublication({
          userId: access.user.id,
          artistId: rgLink.artistId as string,
          trackId: rgLink.trackId as string,
          beatId: rgLink.beatId as string | null,
          youtubeExportJobId: jobId,
          youtubeVideoId: result.id,
        })
        : { linked: false, error: "YouTube confirmó la publicación, pero el registro del trabajo no se pudo verificar para vincularlo.", code: "YOUTUBE_JOB_PERSISTENCE_FAILED" };
    }
    return NextResponse.json({ success: true, videoId: result.id, videoUrl, privacy: actualPrivacy,
      ...(rgPublication ? { rgPublicationLinked: rgPublication.linked, rgPublicationId: rgPublication.publicationId, rgPublicationError: rgPublication.error, rgPublicationCode: rgPublication.code } : {}) });
  } catch (error) {
    const code = failCode(error instanceof Error ? error.message : undefined);
    await jobsTable().update({ status: "failed", error_code: code, finished_at: new Date().toISOString() }).eq("id", jobId).eq("user_id", access.user.id);
    console.error("[YouTube publish]", code);
    const status = code === "quotaExceeded" || code === "dailyLimitExceeded" ? 429 : 502;
    return NextResponse.json({ error: code === "renderFailed" || code === "invalidMaster" ? "No se pudo convertir el master. Conserva el WAV e inténtalo de nuevo." : "YouTube no terminó la publicación. Conserva el WAV e inténtalo de nuevo.", code }, { status });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    await clearYouTubeR2(prefix).catch(() => undefined);
  }
}

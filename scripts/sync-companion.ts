/** Local-only library companion. Credentials stay in .env.local, never in beat packages. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type BeatRow = Database["public"]["Tables"]["beats"]["Row"];
type FileRow = Database["public"]["Tables"]["beat_files"]["Row"];
export type LibraryBeat = BeatRow & {
  categories: { name: string } | null;
  beat_files: FileRow[];
  beat_licenses: { active: boolean; price_override: number | null; license_types: { name: string; price: number } | null }[];
};
type Client = SupabaseClient<Database>;
interface Asset {
  source: string;
  bucket: string;
  relativePath: string;
  expectedSize: number | null;
  revision: string;
}
interface SavedAsset extends Asset { size: number; sha256: string; mtimeMs: number }
interface Manifest {
  version: 3;
  beatId: string;
  fingerprint: string;
  savedAt: string;
  assets: SavedAsset[];
}
export interface LocalSyncReport {
  beatId: string;
  title: string;
  slug: string;
  status: "synced" | "failed" | "skipped";
  path: string;
  error?: string;
}
const SELECT = "*, categories(name), beat_files(*), beat_licenses(*, license_types(*))";
const SUBFOLDERS = ["01_MASTER", "02_MP3", "03_ARTWORK", "04_METADATA", "05_YOUTUBE", "06_BEATSTARS", "07_LICENSE", "08_STEMS", "09_EXCLUSIVE", "10_OTHER_FILES"];

export function getConfig() {
  const envFile = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "",
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    libraryRoot: process.env.LOCAL_MASTER_LIBRARY_PATH?.trim() || "",
  };
}
export const MASTER_LIBRARY_ROOT = getConfig().libraryRoot;

export function ensureLibraryStructure(): string {
  const root = getConfig().libraryRoot;
  if (!root || !path.isAbsolute(root)) throw new Error("Configura LOCAL_MASTER_LIBRARY_PATH con una ruta absoluta.");
  // Never silently recreate a disconnected external disk on the system disk.
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Biblioteca no disponible. Conecta el SSD: ${root}`);
  }
  return fs.realpathSync(root);
}

function safeName(value: string): string {
  const name = path.basename(value.replace(/\\/g, "/")).normalize("NFC")
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_").trim();
  if (!name || name === "." || name === "..") throw new Error("Nombre de archivo o carpeta inválido.");
  return name.slice(0, 180);
}
function readJSON<T>(filename: string): T | null {
  try { return JSON.parse(fs.readFileSync(filename, "utf8")) as T; } catch { return null; }
}
function assertInside(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Ruta fuera de la biblioteca.");
  // Refuse symlinked destinations, including parent directories.
  let current = target;
  while (current !== root) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Enlace simbólico no permitido: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Ruta inválida.");
    current = parent;
  }
}
export function resolveBeatDirectory(baseDir: string, beat: { id?: string; slug: string; title: string }): string {
  const dirs = fs.readdirSync(baseDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  const normalize = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const available: string[] = [];
  for (const name of dirs) {
    const dir = path.join(baseDir, name);
    const identity = readJSON<{ rgodbeat_id?: string }>(path.join(dir, "04_METADATA", "beat.json"));
    if (beat.id && identity?.rgodbeat_id === beat.id) return dir;
    if (!identity?.rgodbeat_id) available.push(name);
  }
  const names = new Set([normalize(beat.slug), normalize(beat.title)]);
  let matches = available.filter(name => names.has(normalize(name)));
  // Historical folder confirmed on this SSD; no broad substring matching.
  if (!matches.length && names.has("diamonds")) matches = available.filter(name => name === "DAIMOND");
  if (matches.length > 1) throw new Error(`Más de una carpeta coincide con ${beat.title}. Usa beat.json para identificarla.`);
  if (matches.length === 1) return path.join(baseDir, matches[0]);
  const target = path.join(baseDir, safeName(beat.slug));
  if (fs.existsSync(target)) throw new Error(`La carpeta ${target} pertenece a otro beat o es un enlace.`);
  return target;
}

function contentOf(beat: LibraryBeat) {
  // Sync acknowledgements do not change the beat's content fingerprint.
  const { local_sync_status: _status, last_synced_at: _time, local_archive_path: _folder, ...content } = beat;
  void _status; void _time; void _folder;
  return { ...content,
    beat_files: [...(beat.beat_files || [])].sort((a, b) => a.id.localeCompare(b.id)),
    beat_licenses: [...(beat.beat_licenses || [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}
function fingerprint(beat: LibraryBeat): string {
  return createHash("sha256").update(JSON.stringify(contentOf(beat))).digest("hex");
}
export function generateCanonicalMetadata(beat: LibraryBeat) {
  return { version: "3.0", rgodbeat_id: beat.id, generated_at: new Date().toISOString(),
    title: beat.title, slug: beat.slug, bpm: beat.bpm, key: beat.musical_key,
    genre: beat.categories?.name || null, mood: beat.mood, duration_seconds: beat.duration_seconds,
    description: beat.description, published: beat.published,
    ranking: { status: beat.ranking_status, current_rank: beat.current_rank, previous_rank: beat.previous_rank, ranking_period: beat.ranking_period },
    online_assets: { cover_path: beat.cover_path, preview_path: beat.preview_path, files: beat.beat_files },
    licenses: beat.beat_licenses,
  };
}
function youtubeParts(beat: LibraryBeat) {
  const tags = ["RGODBEAT", beat.categories?.name, beat.bpm ? `${beat.bpm} BPM` : null, beat.musical_key].filter(Boolean);
  const lines = [beat.title, "", `Beat y licencias: https://rgodbeat.com/beats/${encodeURIComponent(beat.slug)}`];
  if (beat.bpm) lines.push(`BPM: ${beat.bpm}`);
  if (beat.musical_key) lines.push(`Tonalidad: ${beat.musical_key}`);
  if (beat.categories?.name) lines.push(`Género: ${beat.categories.name}`);
  if (beat.description) lines.push("", beat.description);
  return { title: beat.title, description: lines.join("\n"), tags: tags.join(", ") };
}
export function generateYouTubePackage(beat: LibraryBeat): string {
  const parts = youtubeParts(beat);
  return `TÍTULO:\n${parts.title}\n\nDESCRIPCIÓN:\n${parts.description}\n\nETIQUETAS:\n${parts.tags}\n\nID DEL CATÁLOGO: ${beat.id}\n`;
}
export function generateBeatStarsPackage(beat: LibraryBeat): string {
  return [`Título: ${beat.title}`, `Género: ${beat.categories?.name || "No registrado"}`,
    `BPM: ${beat.bpm ?? "No registrado"}`, `Tonalidad: ${beat.musical_key || "No registrada"}`,
    `Mood: ${beat.mood || "No registrado"}`, `Duración (segundos): ${beat.duration_seconds ?? "No registrada"}`,
    `Descripción: ${beat.description || ""}`, `ID: ${beat.id}`, ""].join("\n");
}
export function generateLicensePackage(beat: LibraryBeat): string {
  const licenses = (beat.beat_licenses || []).filter(l => l.active && l.license_types)
    .map(l => `- ${l.license_types!.name}: $${l.price_override ?? l.license_types!.price}`);
  return [`LICENCIAS REGISTRADAS — ${beat.title}`, ...licenses.length ? licenses : ["Sin licencias activas registradas."],
    "", "Resumen del catálogo; consultar el contrato de cada licencia para los derechos de uso.",
    `https://rgodbeat.com/beats/${encodeURIComponent(beat.slug)}`, ""].join("\n");
}
function assetsFor(beat: LibraryBeat): Asset[] {
  const assets: Asset[] = [];
  const folders: Record<string, string> = { wav: "01_MASTER", preview: "02_MP3", mp3: "02_MP3", stems: "08_STEMS", exclusive: "09_EXCLUSIVE", contract: "07_LICENSE" };
  for (const file of [...(beat.beat_files || [])].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!file.storage_path) throw new Error(`Archivo registrado sin ruta: ${file.id}`);
    const folder = folders[file.file_type] || "10_OTHER_FILES";
    let name = safeName(file.file_name || file.storage_path);
    if (assets.some(a => a.relativePath.toLowerCase() === `${folder}/${name}`.toLowerCase())) {
      const ext = path.extname(name);
      name = `${path.basename(name, ext)}-${file.id}${ext}`;
    }
    assets.push({ source: file.storage_path, bucket: file.file_type === "preview" ? "rgodbeat-public" : "rgodbeat-private",
      relativePath: `${folder}/${name}`, expectedSize: file.file_size && file.file_size > 0 ? file.file_size : null,
      revision: `${file.id}:${file.created_at}:${beat.updated_at}` });
  }
  const addPublic = (source: string | null, folder: string) => {
    if (!source || assets.some(a => a.source === source && a.bucket === "rgodbeat-public")) return;
    assets.push({ source, bucket: "rgodbeat-public", relativePath: `${folder}/${safeName(source)}`,
      expectedSize: null, revision: beat.updated_at });
  };
  addPublic(beat.preview_path, "02_MP3");
  addPublic(beat.cover_path, "03_ARTWORK");
  if (beat.published && (!beat.cover_path || !beat.beat_files.some(f => f.file_type === "wav"))) {
    throw new Error("Beat publicado sin artwork o WAV registrado; no se puede confirmar una copia completa.");
  }
  return assets;
}
function atomicText(filename: string, content: string) {
  const temp = `${filename}.${randomUUID()}.part`;
  try { fs.writeFileSync(temp, content, { flag: "wx" }); fs.renameSync(temp, filename); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
async function shaFile(filename: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
async function downloadAsset(asset: Asset, target: string, client: Client): Promise<SavedAsset> {
  let url: string;
  if (asset.source.startsWith("r2:")) {
    const { getR2SignedDownloadUrl } = await import("../lib/storage/r2");
    const signed = await getR2SignedDownloadUrl(asset.source.slice(3));
    if (!signed) throw new Error("No están configuradas las credenciales de R2 para este archivo.");
    url = signed;
  } else {
    const { data, error } = await client.storage.from(asset.bucket).createSignedUrl(asset.source, 3600);
    if (error || !data?.signedUrl) throw new Error(`No se pudo acceder a ${asset.relativePath}: ${error?.message || "sin URL"}`);
    url = data.signedUrl;
  }
  const temp = `${target}.${randomUUID()}.part`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Descarga ${asset.relativePath}: HTTP ${response.status}`);
    let size = 0;
    const hash = createHash("sha256");
    const counter = new Transform({ transform(chunk, _encoding, callback) { size += chunk.length; hash.update(chunk); callback(null, chunk); } });
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), counter, fs.createWriteStream(temp, { flags: "wx" }));
    const headerSize = response.headers.get("content-length");
    if (!size || (asset.expectedSize !== null && size !== asset.expectedSize) || (headerSize && !response.headers.get("content-encoding") && size !== Number(headerSize))) {
      throw new Error(`Tamaño incompleto en ${asset.relativePath}: ${size} bytes; esperado ${asset.expectedSize ?? headerSize}.`);
    }
    const sha256 = hash.digest("hex");
    if (fs.existsSync(target)) {
      if (await shaFile(target) === sha256) {
        fs.unlinkSync(temp);
        return { ...asset, size, sha256, mtimeMs: fs.statSync(target).mtimeMs };
      }
      // Preserve previous local versions, including files made by the creator.
      const history = path.join(path.dirname(target), "_VERSIONES_ANTERIORES");
      assertInside(path.dirname(path.dirname(target)), history);
      fs.mkdirSync(history, { recursive: true });
      fs.copyFileSync(target, path.join(history, `${Date.now()}-${randomUUID()}-${path.basename(target)}`), fs.constants.COPYFILE_EXCL);
    }
    fs.renameSync(temp, target);
    return { ...asset, size, sha256, mtimeMs: fs.statSync(target).mtimeMs };
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function sameSource(a: Asset, b: Asset): boolean {
  return a.source === b.source && a.bucket === b.bucket && a.relativePath === b.relativePath && a.revision === b.revision && a.expectedSize === b.expectedSize;
}
const verifiedFiles = new Set<string>();
async function savedFileValid(root: string, asset: SavedAsset): Promise<boolean> {
  const target = path.join(root, asset.relativePath);
  assertInside(root, target);
  if (!fs.existsSync(target)) return false;
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size !== asset.size || !stat.size) return false;
  const signature = `${target}:${stat.size}:${stat.mtimeMs}:${asset.sha256}`;
  if (verifiedFiles.has(signature)) return true;
  const valid = await shaFile(target) === asset.sha256;
  if (valid) verifiedFiles.add(signature);
  return valid;
}
function textFiles(beat: LibraryBeat): Record<string, string> {
  const parts = youtubeParts(beat);
  return {
    "04_METADATA/beat.json": JSON.stringify(generateCanonicalMetadata(beat), null, 2) + "\n",
    "05_YOUTUBE/youtube_metadata.txt": generateYouTubePackage(beat),
    "05_YOUTUBE/titulo.txt": parts.title + "\n",
    "05_YOUTUBE/descripcion.txt": parts.description + "\n",
    "05_YOUTUBE/etiquetas.txt": parts.tags + "\n",
    "06_BEATSTARS/beatstars_metadata.txt": generateBeatStarsPackage(beat),
    "07_LICENSE/license_terms.txt": generateLicensePackage(beat),
  };
}
export async function packageBeatLocally(beat: LibraryBeat, baseDir: string, client: Client, options: { force?: boolean } = {}): Promise<string> {
  const beatDir = resolveBeatDirectory(baseDir, beat);
  assertInside(baseDir, beatDir);
  for (const sub of SUBFOLDERS) {
    const dir = path.join(beatDir, sub);
    assertInside(baseDir, dir);
    fs.mkdirSync(dir, { recursive: true });
  }
  const manifestPath = path.join(beatDir, "04_METADATA", "sync_manifest.json");
  assertInside(baseDir, manifestPath);
  const previous = readJSON<Manifest>(manifestPath);
  const saved: SavedAsset[] = [];
  // A failed download never produces a success manifest or a synced status.
  for (const asset of assetsFor(beat)) {
    const target = path.join(beatDir, asset.relativePath);
    assertInside(baseDir, target);
    const old = previous?.beatId === beat.id ? previous.assets.find(a => sameSource(a, asset)) : null;
    if (!options.force && old && await savedFileValid(beatDir, old)) { saved.push(old); continue; }
    console.log(`[Descarga] ${beat.title}: ${asset.relativePath}`);
    saved.push(await downloadAsset(asset, target, client));
    // Keep verified downloads across retries without claiming the package is complete.
    atomicText(manifestPath, JSON.stringify({ version: 3, beatId: beat.id, fingerprint: "", savedAt: new Date().toISOString(), assets: saved }, null, 2) + "\n");
  }
  for (const [name, content] of Object.entries(textFiles(beat))) {
    const target = path.join(beatDir, name);
    assertInside(baseDir, target);
    atomicText(target, content);
  }
  const inventory = [`BEAT: ${beat.title}`, `ID: ${beat.id}`, "", ...saved.map(a => `${a.relativePath}\t${a.size} bytes\tSHA256 ${a.sha256}`), "",
    "Los proyectos Ableton y sus Samples locales se conservan en sus carpetas originales.",
    "Solo se descargan los archivos registrados en la web. Los stems/ZIP no se descomprimen automáticamente.", ""].join("\n");
  const inventoryPath = path.join(beatDir, "04_METADATA", "archivos.txt");
  assertInside(baseDir, inventoryPath);
  atomicText(inventoryPath, inventory);
  const manifest: Manifest = { version: 3, beatId: beat.id, fingerprint: fingerprint(beat), savedAt: new Date().toISOString(), assets: saved };
  atomicText(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return beatDir;
}
async function upToDate(beat: LibraryBeat, root: string): Promise<boolean> {
  const dir = resolveBeatDirectory(root, beat);
  assertInside(root, dir);
  const manifestPath = path.join(dir, "04_METADATA", "sync_manifest.json");
  assertInside(root, manifestPath);
  const manifest = readJSON<Manifest>(manifestPath);
  if (manifest?.version !== 3 || manifest.beatId !== beat.id || manifest.fingerprint !== fingerprint(beat)) return false;
  const expected = assetsFor(beat);
  if (manifest.assets.length !== expected.length) return false;
  for (const asset of expected) {
    const saved = manifest.assets.find(a => sameSource(a, asset));
    if (!saved || !await savedFileValid(dir, saved)) return false;
  }
  for (const name of [...Object.keys(textFiles(beat)), "04_METADATA/archivos.txt"]) {
    const target = path.join(dir, name);
    assertInside(root, target);
    if (!fs.existsSync(target) || !fs.statSync(target).size) return false;
  }
  return true;
}
export async function runSync(options: { dryRun?: boolean; slug?: string; beatId?: string; all?: boolean; force?: boolean } = {}): Promise<LocalSyncReport[]> {
  if (process.env.VERCEL) throw new Error("La copia al SSD debe ejecutarse en tu Mac, no en el servidor web.");
  const config = getConfig();
  if (!config.supabaseUrl || !config.supabaseServiceKey) throw new Error("Faltan las credenciales locales de Supabase en .env.local.");
  const root = ensureLibraryStructure();
  const client = createClient<Database>(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60000) }) },
  });
  // Scan the whole catalogue too: old deployments do not enqueue metadata edits.
  let query = client.from("beats").select(SELECT).order("created_at");
  if (options.slug) query = query.eq("slug", options.slug);
  if (options.beatId) query = query.eq("id", options.beatId);
  const { data, error } = await query;
  if (error || !data) throw new Error(`No se pudo leer el catálogo: ${error?.message}`);
  const reports: LocalSyncReport[] = [];
  for (const beat of data as unknown as LibraryBeat[]) {
    let target = "";
    try {
      target = resolveBeatDirectory(root, beat);
      assertInside(root, target);
      if (options.dryRun) {
        console.log(`[Sin cambios] ${beat.title} -> ${target} (${assetsFor(beat).length} archivos registrados)`);
        reports.push({ beatId: beat.id, title: beat.title, slug: beat.slug, status: "skipped", path: target });
        continue;
      }
      if (!options.force && beat.local_sync_status === "synced" && await upToDate(beat, root)) continue;
      // Allow ongoing uploads/edits to finish before downloading their snapshot.
      if (Date.now() - Date.parse(beat.updated_at) < 20000) continue;
      target = await packageBeatLocally(beat, root, client, { force: options.force });
      const { data: current, error: currentError } = await client.from("beats").select(SELECT).eq("id", beat.id).single();
      if (currentError) throw new Error(`No se pudo confirmar el catálogo: ${currentError.message}`);
      if (fingerprint(current as unknown as LibraryBeat) !== fingerprint(beat)) {
        console.log(`[Pendiente] ${beat.title} cambió durante la copia; se reintentará.`);
        reports.push({ beatId: beat.id, title: beat.title, slug: beat.slug, status: "skipped", path: target });
        continue;
      }
      const { data: acknowledged, error: updateError } = await client.from("beats").update({ local_sync_status: "synced", last_synced_at: new Date().toISOString(), local_archive_path: path.basename(target) })
        .eq("id", beat.id).eq("updated_at", beat.updated_at).select("id");
      if (updateError) throw new Error(`No se pudo confirmar la copia en la web: ${updateError.message}`);
      const status = acknowledged?.length ? "synced" : "skipped";
      reports.push({ beatId: beat.id, title: beat.title, slug: beat.slug, status, path: target });
      console.log(`[${status}] ${beat.title} -> ${target}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de sincronización";
      reports.push({ beatId: beat.id, title: beat.title, slug: beat.slug, status: "failed", path: target, error: message });
      console.error(`[failed] ${beat.title}: ${message}`);
      if (!options.dryRun) {
        const { error: statusError } = await client.from("beats").update({ local_sync_status: "failed" }).eq("id", beat.id).eq("updated_at", beat.updated_at);
        if (statusError) console.error(`[Estado] ${beat.title}: ${statusError.message}`);
      }
    }
  }
  return reports;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const options = { dryRun: args.includes("--dry-run"), slug: value("--slug"), beatId: value("--beat-id"), all: args.includes("--all"), force: args.includes("--force") };
  const stateDir = path.resolve(__dirname, "../.local-sync");
  const lock = path.join(stateDir, "companion.lock");
  if (!options.dryRun) {
    fs.mkdirSync(stateDir, { recursive: true });
    if (fs.existsSync(lock)) {
      const owner = readJSON<{ pid: number }>(path.join(lock, "owner.json"));
      if (!owner?.pid) throw new Error("Bloqueo de sincronización sin PID. Revisa .local-sync/companion.lock.");
      let running = true;
      try { process.kill(owner.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") running = false; }
      if (running) throw new Error("Ya hay un proceso sincronizando la biblioteca.");
      fs.rmSync(lock, { recursive: true });
    }
    fs.mkdirSync(lock);
    atomicText(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid }));
    const release = () => { if (readJSON<{ pid: number }>(path.join(lock, "owner.json"))?.pid === process.pid) fs.rmSync(lock, { recursive: true, force: true }); };
    process.on("exit", release);
    process.on("SIGINT", () => process.exit(0));
    process.on("SIGTERM", () => process.exit(0));
  }
  console.log(`[${new Date().toISOString()}] Biblioteca: ${getConfig().libraryRoot}`);
  do {
    try {
      const reports = await runSync(options);
      if (!options.dryRun) atomicText(path.join(stateDir, "status.json"), JSON.stringify({ checkedAt: new Date().toISOString(), pid: process.pid, libraryRoot: getConfig().libraryRoot, reports }, null, 2));
      if (!args.includes("--watch") && reports.some(r => r.status === "failed")) process.exitCode = 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error del companion";
      console.error(`[${new Date().toISOString()}] ${message}`);
      if (!options.dryRun) atomicText(path.join(stateDir, "status.json"), JSON.stringify({ checkedAt: new Date().toISOString(), pid: process.pid, error: message }, null, 2));
      if (!args.includes("--watch")) throw error;
    }
    if (!args.includes("--watch")) break;
    await new Promise(resolve => setTimeout(resolve, 30000));
  } while (true);
}
if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Error del companion"); process.exitCode = 1; });

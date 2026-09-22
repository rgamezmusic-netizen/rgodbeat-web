/**
 * RGODBEAT 2.0 - Public Storage Helper
 * Manages public assets (beat cover artwork and preview audio) in the 'rgodbeat-public' bucket.
 */

export const PUBLIC_STORAGE_BUCKET = "rgodbeat-public";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wrcdapajrsuqgpbfadff.supabase.co";

/**
 * Expected path formats for public assets:
 * - covers/{beat_id}/cover.{ext}
 * - previews/{beat_id}/preview.mp3
 */
export function getPublicCoverPath(beatId: string, ext: "jpg" | "png" | "webp" = "jpg"): string {
  const cleanId = beatId.trim();
  return `covers/${cleanId}/cover.${ext}`;
}

export function getPublicPreviewPath(beatId: string): string {
  const cleanId = beatId.trim();
  return `previews/${cleanId}/preview.mp3`;
}

/**
 * Validates that a storage path follows the expected public conventions and prevents traversal.
 */
export function validatePublicPath(path: string | null | undefined): boolean {
  if (!path || typeof path !== "string") return false;
  const normalized = path.trim().replace(/\\/g, "/");

  // Prevent directory traversal attacks
  if (normalized.includes("..") || normalized.startsWith("/")) return false;

  return normalized.startsWith("covers/") || normalized.startsWith("previews/");
}

/**
 * Generates a public CDN URL from a stored relative path in 'rgodbeat-public'.
 * If path is empty, null, or invalid, returns null.
 */
export function getPublicStorageUrl(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null;
  const cleanPath = path.trim().replace(/^\/+/, "");

  if (!validatePublicPath(cleanPath)) {
    // If not a standard public path, return null to protect architecture
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/${PUBLIC_STORAGE_BUCKET}/${cleanPath}`;
}

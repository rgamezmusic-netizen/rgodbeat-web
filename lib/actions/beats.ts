"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/server";
import { isSiteAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PUBLIC_STORAGE_BUCKET,
  getPublicCoverPath,
  getPublicPreviewPath,
} from "@/lib/storage/public";
import {
  PRIVATE_STORAGE_BUCKET,
  getPrivateBeatWavPath,
} from "@/lib/storage/private";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";
import { convertWavBufferToMp3 } from "@/lib/audio/converter";

export interface CreateBeatResponse {
  success: boolean;
  beatId?: string;
  slug?: string;
  error?: string;
}

export interface BeatLicenseInput {
  licenseTypeId: string;
  priceOverride?: number | null;
}

export interface CreateBeatDirectInput {
  beatId: string;
  title: string;
  slug: string;
  description?: string | null;
  genreId?: string | null;
  mood?: string | null;
  bpm?: number | null;
  key?: string | null;
  duration?: string | null;
  featured?: boolean;
  published: boolean;
  coverPath?: string | null;
  previewPath?: string | null;
  previewFileSize?: number | null;
  wavPath?: string | null;
  wavFileName?: string | null;
  wavFileSize?: number | null;
  licenses: BeatLicenseInput[];
}

export interface UpdateBeatDirectInput {
  beatId: string;
  title: string;
  slug: string;
  description?: string | null;
  genreId?: string | null;
  mood?: string | null;
  bpm?: number | null;
  key?: string | null;
  duration?: string | null;
  featured?: boolean;
  published: boolean;
  coverPath?: string | null;
  previewPath?: string | null;
  previewFileSize?: number | null;
  wavPath?: string | null;
  wavFileName?: string | null;
  wavFileSize?: number | null;
  licenses: BeatLicenseInput[];
}

export interface UploadUrlTarget {
  signedUrl: string;
  path: string;
}

export interface PrepareUploadResponse {
  success: boolean;
  error?: string;
  beatId?: string;
  cover?: UploadUrlTarget;
  preview?: UploadUrlTarget;
  wav?: UploadUrlTarget;
}

/**
 * Generates presigned / signed upload URLs so large files can be uploaded directly
 * from the client browser to storage, bypassing Vercel's 4.5 MB request payload limit.
 */
export async function getBeatUploadUrlsAction(params: {
  beatId?: string;
  coverExt?: string;
  hasPreview?: boolean;
  wavFileName?: string;
}): Promise<PrepareUploadResponse> {
  const user = await getCurrentUser();
  if (!isSiteAdmin(user)) {
    return { success: false, error: "Unauthorized: Admin session required." };
  }

  const supabase = createAdminClient();
  const beatId = params.beatId || crypto.randomUUID();

  let cover: UploadUrlTarget | undefined;
  let preview: UploadUrlTarget | undefined;
  let wav: UploadUrlTarget | undefined;

  try {
    if (params.coverExt) {
      const ext = (params.coverExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg") as "jpg" | "png" | "webp";
      const path = getPublicCoverPath(beatId, ext);
      const { data, error } = await supabase.storage
        .from(PUBLIC_STORAGE_BUCKET)
        .createSignedUploadUrl(path, { upsert: true });

      if (error || !data) {
        throw new Error(`Failed to generate upload URL for cover: ${error?.message}`);
      }
      cover = { signedUrl: data.signedUrl, path };
    }

    if (params.hasPreview) {
      const path = getPublicPreviewPath(beatId);
      const { data, error } = await supabase.storage
        .from(PUBLIC_STORAGE_BUCKET)
        .createSignedUploadUrl(path, { upsert: true });

      if (error || !data) {
        throw new Error(`Failed to generate upload URL for preview: ${error?.message}`);
      }
      preview = { signedUrl: data.signedUrl, path };
    }

    if (params.wavFileName) {
      const cleanWavName = params.wavFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = getPrivateBeatWavPath(beatId, cleanWavName);
      const { data, error } = await supabase.storage
        .from(PRIVATE_STORAGE_BUCKET)
        .createSignedUploadUrl(path, { upsert: true });

      if (error || !data) {
        throw new Error(`Failed to generate upload URL for WAV: ${error?.message}`);
      }
      wav = { signedUrl: data.signedUrl, path };
    }

    return {
      success: true,
      beatId,
      cover,
      preview,
      wav,
    };
  } catch (err) {
    console.error("[GetUploadUrls] Error:", err);
    return {
      success: false,
      error: (err instanceof Error ? err.message : null) || "Failed to prepare asset uploads.",
    };
  }
}

/**
 * Creates a beat record after the browser has uploaded all large media directly to storage.
 * Completely immune to Vercel payload limits and timeouts.
 */
export async function createBeatDirectAction(
  input: CreateBeatDirectInput
): Promise<CreateBeatResponse> {
  const user = await getCurrentUser();
  if (!isSiteAdmin(user)) {
    return { success: false, error: "Unauthorized: Admin session required." };
  }

  const supabase = createAdminClient();

  const title = input.title?.trim();
  const slug = input.slug?.trim().toLowerCase();
  const beatId = input.beatId?.trim();

  if (!title || !slug || !beatId) {
    return { success: false, error: "Title, slug, and beat ID are required fields." };
  }

  // Check slug uniqueness
  const { data: existingSlug } = await supabase
    .from("beats")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingSlug) {
    return { success: false, error: `The URL slug "${slug}" is already taken by another beat.` };
  }

  const bpm = input.bpm !== undefined && input.bpm !== null ? Number(input.bpm) : null;
  if (bpm !== null && (isNaN(bpm) || bpm <= 0 || bpm > 300)) {
    return { success: false, error: "BPM must be a valid number between 30 and 300." };
  }

  let durationSeconds: number | null = null;
  if (input.duration) {
    if (input.duration.includes(":")) {
      const [m, s] = input.duration.split(":").map(Number);
      durationSeconds = (m || 0) * 60 + (s || 0);
    } else {
      const val = parseInt(input.duration, 10);
      if (!isNaN(val)) {
        durationSeconds = val < 10 ? val * 60 : val;
      }
    }
  }

  if (input.published) {
    if (!input.coverPath) {
      return { success: false, error: "Cannot publish: A cover artwork file is required." };
    }
    if (!input.wavPath) {
      return { success: false, error: "Cannot publish: A master WAV audio file is required." };
    }
  }

  try {
    // 1. Insert beat record
    const { data: newBeat, error: insertError } = await supabase
      .from("beats")
      .insert({
        id: beatId,
        title,
        slug,
        description: input.description || null,
        genre_id: input.genreId || null,
        mood: input.mood || null,
        bpm,
        musical_key: input.key || null,
        duration_seconds: durationSeconds,
        featured: Boolean(input.featured),
        published: Boolean(input.published),
        cover_path: input.coverPath || null,
        preview_path: input.previewPath || null,
        local_sync_status: "pending",
        ranking_status: input.published ? "new" : "draft",
      })
      .select("id")
      .single();

    if (insertError || !newBeat) {
      console.error("[CreateBeatDirect] Error inserting beat:", insertError);
      return { success: false, error: insertError?.message || "Failed to create beat record." };
    }

    // 2. Insert Preview into beat_files if provided
    if (input.previewPath) {
      const { error: fileRecordError } = await supabase.from("beat_files").insert({
        beat_id: beatId,
        file_type: "preview",
        storage_path: input.previewPath,
        file_name: `${slug}-preview.mp3`,
        mime_type: "audio/mpeg",
        file_size: input.previewFileSize || 0,
      });
      if (fileRecordError) throw new Error(`Failed to register preview: ${fileRecordError.message}`);
    }

    // 3. Insert Master WAV into beat_files if provided
    if (input.wavPath) {
      const { error: fileRecordError } = await supabase.from("beat_files").insert({
        beat_id: beatId,
        file_type: "wav",
        storage_path: input.wavPath,
        file_name: input.wavFileName || `${slug}-master.wav`,
        mime_type: "audio/wav",
        file_size: input.wavFileSize || 0,
      });
      if (fileRecordError) throw new Error(`Failed to register WAV: ${fileRecordError.message}`);
    }

    // 4. Configure Licenses
    if (Array.isArray(input.licenses) && input.licenses.length > 0) {
      const licenseRows = input.licenses.map((lic) => ({
        beat_id: beatId,
        license_type_id: lic.licenseTypeId,
        price_override: lic.priceOverride !== undefined && lic.priceOverride !== null ? Number(lic.priceOverride) : null,
        active: true,
      }));

      const { error: licError } = await supabase.from("beat_licenses").insert(licenseRows);
      if (licError) {
        console.warn("[CreateBeatDirect] Warning inserting licenses:", licError);
      }
    }

    // The local companion detects this catalogue change and copies it to the SSD.

    const { error: syncQueueError } = await supabase.from("beats")
      .update({ local_sync_status: "pending", updated_at: new Date().toISOString() }).eq("id", beatId);
    if (syncQueueError) throw new Error(`Failed to queue local copy: ${syncQueueError.message}`);

    // 6. Revalidate routes
    revalidatePath("/beats");
    revalidatePath("/admin/beats");
    revalidatePath("/admin");

    return {
      success: true,
      beatId,
      slug,
    };
  } catch (err) {
    console.error("[CreateBeatDirect] Execution failure:", err);
    return {
      success: false,
      error: (err instanceof Error ? err.message : null) || "An unexpected error occurred during beat creation.",
    };
  }
}

/**
 * Updates a beat record after the browser has uploaded any replaced files directly to storage.
 */
export async function updateBeatDirectAction(
  input: UpdateBeatDirectInput
): Promise<CreateBeatResponse> {
  const user = await getCurrentUser();
  if (!isSiteAdmin(user)) {
    return { success: false, error: "Unauthorized: Admin session required." };
  }

  const supabase = createAdminClient();

  const title = input.title?.trim();
  const slug = input.slug?.trim().toLowerCase();
  const beatId = input.beatId?.trim();

  if (!title || !slug || !beatId) {
    return { success: false, error: "Title, slug, and beat ID are required fields." };
  }

  // Slug Uniqueness Check (excluding current beat)
  const { data: slugCheck } = await supabase
    .from("beats")
    .select("id")
    .eq("slug", slug)
    .neq("id", beatId)
    .maybeSingle();

  if (slugCheck) {
    return { success: false, error: `The URL slug "${slug}" is already taken by another beat.` };
  }

  const bpm = input.bpm !== undefined && input.bpm !== null ? Number(input.bpm) : null;
  if (bpm !== null && (isNaN(bpm) || bpm <= 0 || bpm > 300)) {
    return { success: false, error: "BPM must be a valid number between 30 and 300." };
  }

  let durationSeconds: number | null = null;
  if (input.duration) {
    if (input.duration.includes(":")) {
      const [m, s] = input.duration.split(":").map(Number);
      durationSeconds = (m || 0) * 60 + (s || 0);
    } else {
      const val = parseInt(input.duration, 10);
      if (!isNaN(val)) {
        durationSeconds = val < 10 ? val * 60 : val;
      }
    }
  }

  try {
    // 1. Fetch current beat
    const { data: existingBeat, error: fetchErr } = await supabase
      .from("beats")
      .select("id, cover_path, preview_path, beat_files(id, file_type, storage_path)")
      .eq("id", beatId)
      .single();

    if (fetchErr || !existingBeat) {
      return { success: false, error: "Beat not found." };
    }

    const coverPath = input.coverPath || existingBeat.cover_path;
    const previewPath = input.previewPath || existingBeat.preview_path;
    const hasWav = Boolean(
      input.wavPath ||
      (Array.isArray(existingBeat.beat_files) &&
        existingBeat.beat_files.some((f) => f.file_type === "wav"))
    );

    if (input.published) {
      if (!coverPath) {
        return { success: false, error: "Cannot publish: Cover artwork is required." };
      }
      if (!hasWav) {
        return { success: false, error: "Cannot publish: Master WAV audio is required." };
      }
    }

    // 2. If new preview uploaded, update beat_files
    if (input.previewPath) {
      const { error: deleteFileError } = await supabase.from("beat_files").delete().eq("beat_id", beatId).eq("file_type", "preview");
      if (deleteFileError) throw new Error(deleteFileError.message);
      const { error: fileRecordError } = await supabase.from("beat_files").insert({
        beat_id: beatId,
        file_type: "preview",
        storage_path: input.previewPath,
        file_name: `${slug}-preview.mp3`,
        mime_type: "audio/mpeg",
        file_size: input.previewFileSize || 0,
      });
      if (fileRecordError) throw new Error(`Failed to register preview: ${fileRecordError.message}`);
    }

    // 3. If new WAV uploaded, update beat_files
    if (input.wavPath) {
      const { error: deleteFileError } = await supabase.from("beat_files").delete().eq("beat_id", beatId).eq("file_type", "wav");
      if (deleteFileError) throw new Error(deleteFileError.message);
      const { error: fileRecordError } = await supabase.from("beat_files").insert({
        beat_id: beatId,
        file_type: "wav",
        storage_path: input.wavPath,
        file_name: input.wavFileName || `${slug}-master.wav`,
        mime_type: "audio/wav",
        file_size: input.wavFileSize || 0,
      });
      if (fileRecordError) throw new Error(`Failed to register WAV: ${fileRecordError.message}`);
    }

    // 4. Update beat licenses
    if (Array.isArray(input.licenses)) {
      await supabase.from("beat_licenses").delete().eq("beat_id", beatId);
      if (input.licenses.length > 0) {
        const licenseRows = input.licenses.map((lic) => ({
          beat_id: beatId,
          license_type_id: lic.licenseTypeId,
          price_override: lic.priceOverride !== undefined && lic.priceOverride !== null ? Number(lic.priceOverride) : null,
          active: true,
        }));
        await supabase.from("beat_licenses").insert(licenseRows);
      }
    }

    // 5. Update beats record
    const { error: updateError } = await supabase
      .from("beats")
      .update({
        title,
        slug,
        description: input.description || null,
        genre_id: input.genreId || null,
        mood: input.mood || null,
        bpm,
        musical_key: input.key || null,
        duration_seconds: durationSeconds,
        featured: Boolean(input.featured),
        published: Boolean(input.published),
        cover_path: coverPath,
        preview_path: previewPath,
        local_sync_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", beatId);

    if (updateError) {
      throw new Error(`Failed to update beat record: ${updateError.message}`);
    }

    // 6. Clean up old replaced files if paths changed
    if (input.coverPath && existingBeat.cover_path && input.coverPath !== existingBeat.cover_path) {
      try {
        await supabase.storage.from(PUBLIC_STORAGE_BUCKET).remove([existingBeat.cover_path]);
      } catch (e) {
        console.warn("[UpdateBeatDirect] Cleanup old cover warning:", e);
      }
    }

    // The local companion detects this catalogue change and copies it to the SSD.

    // 8. Revalidate
    revalidatePath("/beats");
    revalidatePath(`/beats/${slug}`);
    revalidatePath("/admin/beats");
    revalidatePath("/admin");

    return {
      success: true,
      beatId,
      slug,
    };
  } catch (err) {
    console.error("[UpdateBeatDirect] Execution failure:", err);
    return {
      success: false,
      error: (err instanceof Error ? err.message : null) || "An unexpected error occurred during beat update.",
    };
  }
}

export async function createBeatAction(formData: FormData): Promise<CreateBeatResponse> {
  // 1. Verify administrative authentication
  const user = await getCurrentUser();
  if (!isSiteAdmin(user)) {
    return { success: false, error: "Unauthorized: Admin session required." };
  }

  // 2. Initialize server-only administrative client (service-role)
  const supabase = createAdminClient();

  // 2. Extract basic metadata
  const title = (formData.get("title") as string)?.trim();
  const slug = (formData.get("slug") as string)?.trim().toLowerCase();
  const description = (formData.get("description") as string)?.trim() || null;
  const genreId = (formData.get("genreId") as string)?.trim() || null;
  const mood = (formData.get("mood") as string)?.trim() || null;
  const bpmStr = formData.get("bpm") as string;
  const key = (formData.get("key") as string)?.trim() || null;
  const durationStr = formData.get("duration") as string;
  const featured = formData.get("featured") === "true";
  const shouldPublish = formData.get("published") === "true";

  if (!title || !slug) {
    return { success: false, error: "Title and slug are required fields." };
  }

  const bpm = bpmStr ? parseInt(bpmStr, 10) : null;
  if (bpm !== null && (isNaN(bpm) || bpm <= 0)) {
    return { success: false, error: "BPM must be a positive integer." };
  }

  // Parse duration seconds
  let durationSeconds: number | null = null;
  if (durationStr) {
    if (durationStr.includes(":")) {
      const [m, s] = durationStr.split(":").map(Number);
      durationSeconds = (m || 0) * 60 + (s || 0);
    } else {
      const val = parseInt(durationStr, 10);
      if (!isNaN(val)) {
        durationSeconds = val < 10 ? val * 60 : val;
      }
    }
  }

  // 3. Extract Files
  const coverFile = formData.get("coverFile") as File | null;
  const previewFile = formData.get("previewFile") as File | null;
  const wavFile = formData.get("wavFile") as File | null;

  // If publishing immediately, required files must be present (cover and master WAV)
  if (shouldPublish && (!coverFile || coverFile.size === 0)) {
    return { success: false, error: "Cannot publish: A cover artwork file is required." };
  }
  if (shouldPublish && (!wavFile || wavFile.size === 0)) {
    return { success: false, error: "Cannot publish: A master WAV audio file is required." };
  }

  // 4. Create beat record (initial published: false for safe transaction)
  let createdBeatId: string | null = null;
  let coverPath: string | null = null;
  let previewPath: string | null = null;

  try {
    const { data: newBeat, error: insertError } = await supabase
      .from("beats")
      .insert({
        title,
        slug,
        description,
        genre_id: genreId,
        mood,
        bpm,
        musical_key: key,
        duration_seconds: durationSeconds,
        featured,
        published: false, // Initially false until assets upload safely
        local_sync_status: "pending",
        ranking_status: shouldPublish ? "new" : "draft",
      })
      .select("id")
      .single();

    if (insertError || !newBeat) {
      console.error("[CreateBeat] Error creating beat row:", insertError);
      return { success: false, error: insertError?.message || "Failed to create beat record." };
    }

    const beatId = newBeat.id;
    createdBeatId = beatId;

    // 5. Upload Cover Image (rgodbeat-public)
    if (coverFile && coverFile.size > 0) {
      const ext = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
      coverPath = getPublicCoverPath(beatId, ext as Parameters<typeof getPublicCoverPath>[1]);
      const coverBuffer = Buffer.from(await coverFile.arrayBuffer());

      const { error: coverUploadError } = await supabase.storage
        .from(PUBLIC_STORAGE_BUCKET)
        .upload(coverPath, coverBuffer, {
          contentType: coverFile.type || "image/jpeg",
          upsert: true,
        });

      if (coverUploadError) {
        throw new Error(`Cover upload failed: ${coverUploadError.message}`);
      }
    }

    // Pre-load WAV buffer once for storage and auto-conversion
    let wavBuffer: Buffer | null = null;
    if (wavFile && wavFile.size > 0) {
      wavBuffer = Buffer.from(await wavFile.arrayBuffer());
    }

    // 6. Upload Preview MP3 (rgodbeat-public)
    // If previewFile is explicitly provided (e.g. with custom voice tag), use it.
    // Otherwise, automatically convert the Master WAV into a studio-grade 320kbps MP3!
    if (previewFile && previewFile.size > 0) {
      previewPath = getPublicPreviewPath(beatId);
      const previewBuffer = Buffer.from(await previewFile.arrayBuffer());

      const { error: previewUploadError } = await supabase.storage
        .from(PUBLIC_STORAGE_BUCKET)
        .upload(previewPath, previewBuffer, {
          contentType: "audio/mpeg",
          upsert: true,
        });

      if (previewUploadError) {
        throw new Error(`Preview upload failed: ${previewUploadError.message}`);
      }

      // Record in beat_files for MP3 license purchases
      const { error: fileRecordError } = await supabase.from("beat_files").insert({
        beat_id: beatId,
        file_type: "preview",
        storage_path: previewPath,
        file_name: previewFile.name,
        mime_type: "audio/mpeg",
        file_size: previewFile.size,
      });
      if (fileRecordError) throw new Error(`Failed to register preview: ${fileRecordError.message}`);
    } else if (wavBuffer) {
      // Auto-convert Master WAV to 320kbps MP3
      try {
        console.log(`[CreateBeat] Auto-converting Master WAV to 320kbps MP3 for preview and MP3 license...`);
        const autoMp3Buffer = await convertWavBufferToMp3(wavBuffer, "320k");
        previewPath = getPublicPreviewPath(beatId);

        const { error: autoMp3UploadError } = await supabase.storage
          .from(PUBLIC_STORAGE_BUCKET)
          .upload(previewPath, autoMp3Buffer, {
            contentType: "audio/mpeg",
            upsert: true,
          });

        if (autoMp3UploadError) {
          console.warn("[CreateBeat] Warning uploading auto-converted MP3:", autoMp3UploadError.message);
        } else {
          console.log(`[CreateBeat] Auto-converted MP3 uploaded successfully (${autoMp3Buffer.length} bytes)`);

          // Record in beat_files so it is available for MP3 license purchases
          const { error: fileRecordError } = await supabase.from("beat_files").insert({
            beat_id: beatId,
            file_type: "preview",
            storage_path: previewPath,
            file_name: `${slug}-master.mp3`,
            mime_type: "audio/mpeg",
            file_size: autoMp3Buffer.length,
          });
          if (fileRecordError) throw new Error(`Failed to register preview: ${fileRecordError.message}`);
        }
      } catch (convErr) {
        console.warn("[CreateBeat] Auto-conversion to MP3 failed:", convErr instanceof Error ? convErr.message : convErr);
      }
    }

    // 7. Upload WAV Master Audio (Prioritizing Cloudflare R2 to preserve Supabase quota)
    if (wavFile && wavFile.size > 0 && wavBuffer) {
      const wavPath = getPrivateBeatWavPath(beatId, wavFile.name);
      let finalStoragePath = wavPath;

      if (isR2Configured()) {
        console.log(`[CreateBeat] Storing WAV in Cloudflare R2 (10GB tier): ${wavPath}`);
        const r2Result = await uploadToR2({
          key: wavPath,
          body: wavBuffer,
          contentType: wavFile.type || "audio/wav",
        });

        if (!r2Result.success) {
          console.warn(`[CreateBeat] Cloudflare R2 upload failed (${r2Result.error}). Falling back to Supabase Storage...`);
          const { error: fallbackError } = await supabase.storage
            .from(PRIVATE_STORAGE_BUCKET)
            .upload(wavPath, wavBuffer, {
              contentType: wavFile.type || "audio/wav",
              upsert: true,
            });

          if (fallbackError) {
            throw new Error(`Master WAV upload failed on both R2 and Supabase: ${fallbackError.message}`);
          }
        } else {
          finalStoragePath = `r2:${wavPath}`;
        }
      } else {
        console.log(`[CreateBeat] Cloudflare R2 not configured. Storing WAV in Supabase Storage: ${wavPath}`);
        const { error: wavUploadError } = await supabase.storage
          .from(PRIVATE_STORAGE_BUCKET)
          .upload(wavPath, wavBuffer, {
            contentType: wavFile.type || "audio/wav",
            upsert: true,
          });

        if (wavUploadError) {
          throw new Error(`Master WAV upload failed: ${wavUploadError.message}`);
        }
      }

      // Record in beat_files
      const { error: beatFileError } = await supabase
        .from("beat_files")
        .insert({
          beat_id: beatId,
          file_type: "wav",
          storage_path: finalStoragePath,
          file_name: wavFile.name,
          mime_type: wavFile.type || "audio/wav",
          file_size: wavFile.size,
        });

      if (beatFileError) {
        throw new Error(`Failed to register WAV: ${beatFileError.message}`);
      }
    }

    // 8. Configure Beat Licenses
    const licensesJson = formData.get("licenses") as string;
    if (licensesJson) {
      try {
        const selectedLicenses: { licenseTypeId: string; priceOverride?: number | null }[] = JSON.parse(licensesJson);

        if (Array.isArray(selectedLicenses) && selectedLicenses.length > 0) {
          const licenseRows = selectedLicenses.map((lic) => ({
            beat_id: beatId,
            license_type_id: lic.licenseTypeId,
            price_override: lic.priceOverride !== undefined ? lic.priceOverride : null,
            active: true,
          }));

          const { error: licenseInsertError } = await supabase
            .from("beat_licenses")
            .insert(licenseRows);

          if (licenseInsertError) {
            console.warn("[CreateBeat] Error configuring beat licenses:", licenseInsertError);
          }
        }
      } catch (err) {
        console.warn("[CreateBeat] Error parsing licenses JSON:", err);
      }
    }

    // 9. Finalize beat status with asset paths and publish status
    const { error: finalizeError } = await supabase
      .from("beats")
      .update({
        cover_path: coverPath,
        preview_path: previewPath,
        published: shouldPublish,
        ranking_status: shouldPublish ? "new" : "draft",
        local_sync_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", beatId);

    if (finalizeError) {
      throw new Error(`Failed to finalize beat publishing: ${finalizeError.message}`);
    }

    // The local companion detects this catalogue change and copies it to the SSD.

    // Revalidate affected routes
    revalidatePath("/beats");
    revalidatePath("/admin/beats");
    revalidatePath("/admin");

    return {
      success: true,
      beatId,
      slug,
    };
  } catch (err) {
    console.error("[CreateBeat] Execution failure, rolling back safely:", err);

    // Rollback: remove any uploaded storage assets and delete created beat row
    if (coverPath) {
      try {
        await supabase.storage.from(PUBLIC_STORAGE_BUCKET).remove([coverPath]);
      } catch (e) {
        console.error("[CreateBeat] Rollback cover cleanup error:", e);
      }
    }
    if (previewPath) {
      try {
        await supabase.storage.from(PUBLIC_STORAGE_BUCKET).remove([previewPath]);
      } catch (e) {
        console.error("[CreateBeat] Rollback preview cleanup error:", e);
      }
    }
    if (createdBeatId) {
      try {
        if (wavFile && wavFile.size > 0) {
          const wavPath = getPrivateBeatWavPath(createdBeatId, wavFile.name);
          await supabase.storage.from(PRIVATE_STORAGE_BUCKET).remove([wavPath]);
        }
        await supabase.from("beats").delete().eq("id", createdBeatId);
      } catch (e) {
        console.error("[CreateBeat] Rollback beat deletion error:", e);
      }
    }

    return {
      success: false,
      error: (err instanceof Error ? err.message : null) || "An unexpected error occurred during beat creation.",
    };
  }
}

/**
 * Update an existing beat with metadata, asset replacements, and license configuration.
 */
export async function updateBeatAction(formData: FormData): Promise<CreateBeatResponse> {
  const user = await getCurrentUser();
  if (!isSiteAdmin(user)) {
    return { success: false, error: "Unauthorized: Admin session required." };
  }

  const supabase = createAdminClient();

  const beatId = (formData.get("beatId") as string)?.trim();
  if (!beatId) {
    return { success: false, error: "Beat ID is required for update." };
  }

  const title = (formData.get("title") as string)?.trim();
  const slug = (formData.get("slug") as string)?.trim().toLowerCase();
  const description = (formData.get("description") as string)?.trim() || null;
  const genreId = (formData.get("genreId") as string)?.trim() || null;
  const mood = (formData.get("mood") as string)?.trim() || null;
  const bpmStr = formData.get("bpm") as string;
  const key = (formData.get("key") as string)?.trim() || null;
  const durationStr = formData.get("duration") as string;
  const featured = formData.get("featured") === "true";
  const shouldPublish = formData.get("published") === "true";

  if (!title || !slug) {
    return { success: false, error: "Title and slug are required fields." };
  }

  // 1. Slug Uniqueness Check (excluding current beat)
  const { data: slugCheck } = await supabase
    .from("beats")
    .select("id")
    .eq("slug", slug)
    .neq("id", beatId)
    .maybeSingle();

  if (slugCheck) {
    return { success: false, error: `The URL slug "${slug}" is already taken by another beat.` };
  }

  const bpm = bpmStr ? parseInt(bpmStr, 10) : null;
  if (bpm !== null && (isNaN(bpm) || bpm <= 0 || bpm > 300)) {
    return { success: false, error: "BPM must be a valid number between 30 and 300." };
  }

  // Duration parser
  let durationSeconds: number | null = null;
  if (durationStr) {
    if (durationStr.includes(":")) {
      const [m, s] = durationStr.split(":").map(Number);
      durationSeconds = (m || 0) * 60 + (s || 0);
    } else {
      const val = parseInt(durationStr, 10);
      if (!isNaN(val)) {
        durationSeconds = val < 10 ? val * 60 : val;
      }
    }
  }

  // 2. Fetch existing beat record and files
  const { data: existingBeat, error: fetchErr } = await supabase
    .from("beats")
    .select(`
      id,
      cover_path,
      preview_path,
      published,
      beat_files(id, file_type, storage_path, file_name)
    `)
    .eq("id", beatId)
    .single();

  if (fetchErr || !existingBeat) {
    return { success: false, error: "Beat not found." };
  }

  // 3. Process Asset Replacements
  const coverFile = formData.get("coverFile") as File | null;
  const previewFile = formData.get("previewFile") as File | null;
  const wavFile = formData.get("wavFile") as File | null;

  let updatedCoverPath = existingBeat.cover_path;
  let updatedPreviewPath = existingBeat.preview_path;
  const oldAssetsToCleanPublic: string[] = [];
  const oldAssetsToCleanPrivate: string[] = [];

  try {
    // Cover replacement
    if (coverFile && coverFile.size > 0) {
      const ext = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const coverPath = getPublicCoverPath(beatId, ext as Parameters<typeof getPublicCoverPath>[1]);
      const coverBuffer = Buffer.from(await coverFile.arrayBuffer());

      const { error: coverErr } = await supabase.storage
        .from(PUBLIC_STORAGE_BUCKET)
        .upload(coverPath, coverBuffer, {
          contentType: coverFile.type || "image/jpeg",
          upsert: true,
        });

      if (coverErr) throw new Error(`Cover upload failed: ${coverErr.message}`);

      if (existingBeat.cover_path && existingBeat.cover_path !== coverPath) {
        oldAssetsToCleanPublic.push(existingBeat.cover_path);
      }
      updatedCoverPath = coverPath;
    }

    // Preview MP3 replacement
    if (previewFile && previewFile.size > 0) {
      const previewPath = getPublicPreviewPath(beatId);
      const previewBuffer = Buffer.from(await previewFile.arrayBuffer());

      const { error: prevErr } = await supabase.storage
        .from(PUBLIC_STORAGE_BUCKET)
        .upload(previewPath, previewBuffer, {
          contentType: "audio/mpeg",
          upsert: true,
        });

      if (prevErr) throw new Error(`Preview upload failed: ${prevErr.message}`);
      const { error: removePreviewError } = await supabase.from("beat_files").delete().eq("beat_id", beatId).eq("file_type", "preview");
      if (removePreviewError) throw new Error(removePreviewError.message);
      const { error: previewRecordError } = await supabase.from("beat_files").insert({
        beat_id: beatId, file_type: "preview", storage_path: previewPath,
        file_name: previewFile.name, mime_type: previewFile.type || "audio/mpeg", file_size: previewFile.size,
      });
      if (previewRecordError) throw new Error(`Failed to register preview: ${previewRecordError.message}`);
      updatedPreviewPath = previewPath;
    }

    // Master WAV replacement
    let hasWav = Array.isArray(existingBeat.beat_files) && existingBeat.beat_files.some((f) => f.file_type === "wav");
    if (wavFile && wavFile.size > 0) {
      const wavPath = getPrivateBeatWavPath(beatId, wavFile.name);
      const wavBuffer = Buffer.from(await wavFile.arrayBuffer());

      const { error: wavErr } = await supabase.storage
        .from(PRIVATE_STORAGE_BUCKET)
        .upload(wavPath, wavBuffer, {
          contentType: wavFile.type || "audio/wav",
          upsert: true,
        });

      if (wavErr) throw new Error(`Master WAV upload failed: ${wavErr.message}`);

      const oldWavFile = Array.isArray(existingBeat.beat_files)
        ? existingBeat.beat_files.find((f) => f.file_type === "wav")
        : null;

      if (oldWavFile?.storage_path && oldWavFile.storage_path !== wavPath) {
        oldAssetsToCleanPrivate.push(oldWavFile.storage_path);
      }

      // Delete existing WAV record from beat_files
      const { error: deleteFileError } = await supabase.from("beat_files").delete().eq("beat_id", beatId).eq("file_type", "wav");
      if (deleteFileError) throw new Error(deleteFileError.message);

      // Insert new beat_file record
      const { error: fileErr } = await supabase.from("beat_files").insert({
        beat_id: beatId,
        file_type: "wav",
        storage_path: wavPath,
        file_name: wavFile.name,
        mime_type: wavFile.type || "audio/wav",
        file_size: wavFile.size,
      });

      if (fileErr) throw new Error(`Failed to register WAV: ${fileErr.message}`);
      hasWav = true;
    }

    // 4. Publishing Gatekeeper
    if (shouldPublish) {
      if (!updatedCoverPath) {
        return { success: false, error: "Cannot publish: Cover artwork is required." };
      }
      if (!hasWav) {
        return { success: false, error: "Cannot publish: Master WAV audio is required." };
      }
    }

    // 5. Sync Licenses
    const licensesJson = formData.get("licenses") as string;
    if (licensesJson) {
      try {
        const selectedLicenses: { licenseTypeId: string; priceOverride?: number | null }[] = JSON.parse(licensesJson);

        // Delete existing beat licenses
        await supabase.from("beat_licenses").delete().eq("beat_id", beatId);

        if (Array.isArray(selectedLicenses) && selectedLicenses.length > 0) {
          const licenseRows = selectedLicenses.map((lic) => ({
            beat_id: beatId,
            license_type_id: lic.licenseTypeId,
            price_override: lic.priceOverride !== undefined && lic.priceOverride !== null ? Number(lic.priceOverride) : null,
            active: true,
          }));

          const { error: licErr } = await supabase.from("beat_licenses").insert(licenseRows);
          if (licErr) console.warn("[UpdateBeat] Warning syncing licenses:", licErr);
        }
      } catch (err) {
        console.warn("[UpdateBeat] Error parsing licenses JSON:", err);
      }
    }

    // 6. Update Beat Record
    const { error: updateError } = await supabase
      .from("beats")
      .update({
        title,
        slug,
        description,
        genre_id: genreId,
        mood,
        bpm,
        musical_key: key,
        duration_seconds: durationSeconds,
        featured,
        published: shouldPublish,
        cover_path: updatedCoverPath,
        preview_path: updatedPreviewPath,
        local_sync_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", beatId);

    if (updateError) {
      throw new Error(`Failed to update beat record: ${updateError.message}`);
    }

    // 7. Safely remove old assets now that new assets are stored and referenced
    if (oldAssetsToCleanPublic.length > 0) {
      try {
        await supabase.storage.from(PUBLIC_STORAGE_BUCKET).remove(oldAssetsToCleanPublic);
      } catch (e) {
        console.warn("[UpdateBeat] Warning cleaning old public assets:", e);
      }
    }
    if (oldAssetsToCleanPrivate.length > 0) {
      try {
        await supabase.storage.from(PRIVATE_STORAGE_BUCKET).remove(oldAssetsToCleanPrivate);
      } catch (e) {
        console.warn("[UpdateBeat] Warning cleaning old private assets:", e);
      }
    }

    // The local companion detects this catalogue change and copies it to the SSD.

    // 7. Revalidate affected routes
    revalidatePath("/beats");
    revalidatePath(`/beats/${slug}`);
    revalidatePath("/admin/beats");
    revalidatePath("/admin");

    return {
      success: true,
      beatId,
      slug,
    };
  } catch (err) {
    console.error("[UpdateBeat] Update failed:", err);
    return {
      success: false,
      error: (err instanceof Error ? err.message : null) || "An unexpected error occurred while updating the beat.",
    };
  }
}

/**
 * Safely delete a beat and clean up all associated storage files across buckets.
 */
export async function deleteBeatAction(beatId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!isSiteAdmin(user)) {
    return { success: false, error: "Unauthorized: Admin session required." };
  }

  const supabase = createAdminClient();

  try {
    // 1. Fetch beat and all associated storage files
    const { data: beat, error: fetchErr } = await supabase
      .from("beats")
      .select("id, slug, cover_path, preview_path, beat_files(storage_path)")
      .eq("id", beatId)
      .maybeSingle();

    if (fetchErr || !beat) {
      return { success: false, error: "Beat not found or already deleted." };
    }

    // 2. Remove files from rgodbeat-public
    const publicFilesToRemove: string[] = [];
    if (beat.cover_path) publicFilesToRemove.push(beat.cover_path);
    if (beat.preview_path) publicFilesToRemove.push(beat.preview_path);

    if (publicFilesToRemove.length > 0) {
      const { error: pubStorageErr } = await supabase.storage
        .from(PUBLIC_STORAGE_BUCKET)
        .remove(publicFilesToRemove);
      if (pubStorageErr) {
        console.warn("[DeleteBeat] Warning removing public storage files:", pubStorageErr.message);
      }
    }

    // 3. Remove files from rgodbeat-private
    const privateFilesToRemove: string[] = [];
    if (Array.isArray(beat.beat_files)) {
      beat.beat_files.forEach((f) => {
        if (f.storage_path) privateFilesToRemove.push(f.storage_path);
      });
    }

    if (privateFilesToRemove.length > 0) {
      const { error: privStorageErr } = await supabase.storage
        .from(PRIVATE_STORAGE_BUCKET)
        .remove(privateFilesToRemove);
      if (privStorageErr) {
        console.warn("[DeleteBeat] Warning removing private storage files:", privStorageErr.message);
      }
    }

    // 4. Delete beat row from database (cascades to beat_files & beat_licenses)
    const { error: deleteError } = await supabase
      .from("beats")
      .delete()
      .eq("id", beatId);

    if (deleteError) {
      throw new Error(`Database deletion failed: ${deleteError.message}`);
    }

    // 5. Revalidate cache
    revalidatePath("/beats");
    revalidatePath("/admin/beats");
    revalidatePath("/admin");

    return { success: true };
  } catch (err) {
    console.error("[DeleteBeat] Error deleting beat:", err);
    return { success: false, error: (err instanceof Error ? err.message : null) || "Failed to delete beat." };
  }
}

/**
 * Quick toggle for publishing / unpublishing a beat with asset verification.
 */
export async function toggleBeatPublishAction(
  beatId: string,
  publish: boolean
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!isSiteAdmin(user)) {
    return { success: false, error: "Unauthorized: Admin session required." };
  }

  const supabase = createAdminClient();

  try {
    if (publish) {
      // Gatekeeper: verify all required assets exist before publishing
      const { data: beat, error: fetchErr } = await supabase
        .from("beats")
        .select("id, title, cover_path, preview_path, beat_files(id, file_type)")
        .eq("id", beatId)
        .maybeSingle();

      if (fetchErr || !beat) {
        return { success: false, error: "Beat not found." };
      }

      const hasCover = !!beat.cover_path;
      const hasWav = Array.isArray(beat.beat_files) && beat.beat_files.some((f) => f.file_type === "wav");

      if (!hasCover || !hasWav) {
        const missing = [
          !hasCover && "cover artwork",
          !hasWav && "master WAV audio",
        ]
          .filter(Boolean)
          .join(", ");
        return {
          success: false,
          error: `Cannot publish "${beat.title}": Missing required asset (${missing}).`,
        };
      }
    }

    const { error: updateError } = await supabase
      .from("beats")
      .update({
        published: publish,
        local_sync_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", beatId);

    if (updateError) {
      throw new Error(`Failed to update status: ${updateError.message}`);
    }

    revalidatePath("/beats");
    revalidatePath("/admin/beats");
    revalidatePath("/admin");

    return { success: true };
  } catch (err) {
    console.error("[TogglePublish] Error:", err);
    return { success: false, error: (err instanceof Error ? err.message : null) || "Failed to update beat status." };
  }
}

/** Queue a local copy. Only the companion on the creator's Mac can access the SSD. */
export async function syncBeatToDiskAction(slug?: string): Promise<{ success: boolean; error?: string; count?: number; message?: string }> {
  const user = await getCurrentUser();
  if (!isSiteAdmin(user)) return { success: false, error: "Unauthorized: Admin session required." };
  try {
    const supabase = createAdminClient();
    let query = supabase.from("beats").update({ local_sync_status: "pending", updated_at: new Date().toISOString() });
    if (slug) query = query.eq("slug", slug);
    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);
    if (slug && !data?.length) return { success: false, error: "Beat not found." };
    revalidatePath("/admin/beats");
    return { success: true, count: data?.length || 0,
      message: `${data?.length || 0} beat(s) en cola. La copia se confirma como SYNCED cuando tu Mac y el SSD están conectados y los archivos se han guardado.` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to queue local copy." };
  }
}

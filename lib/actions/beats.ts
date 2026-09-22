"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/server";
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

export interface CreateBeatResponse {
  success: boolean;
  beatId?: string;
  slug?: string;
  error?: string;
}

export async function createBeatAction(formData: FormData): Promise<CreateBeatResponse> {
  // 1. Verify administrative authentication
  const user = await getCurrentUser();
  if (!user) {
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
      coverPath = getPublicCoverPath(beatId, ext as any);
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

    // 6. Upload Preview MP3 (rgodbeat-public)
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
    }

    // 7. Upload WAV Master Audio (rgodbeat-private)
    if (wavFile && wavFile.size > 0) {
      const wavPath = getPrivateBeatWavPath(beatId, wavFile.name);
      const wavBuffer = Buffer.from(await wavFile.arrayBuffer());

      const { error: wavUploadError } = await supabase.storage
        .from(PRIVATE_STORAGE_BUCKET)
        .upload(wavPath, wavBuffer, {
          contentType: wavFile.type || "audio/wav",
          upsert: true,
        });

      if (wavUploadError) {
        throw new Error(`Master WAV upload failed: ${wavUploadError.message}`);
      }

      // Record in beat_files
      const { error: beatFileError } = await supabase
        .from("beat_files")
        .insert({
          beat_id: beatId,
          file_type: "wav",
          storage_path: wavPath,
          file_name: wavFile.name,
          mime_type: wavFile.type || "audio/wav",
          file_size: wavFile.size,
        });

      if (beatFileError) {
        console.warn("[CreateBeat] Error recording beat_file metadata:", beatFileError);
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

    // 10. Automatically sync to local external SSD master library
    try {
      const { runSync } = await import("@/scripts/sync-companion");
      await runSync({ slug });
    } catch (syncErr) {
      console.warn("[CreateBeat] Local SSD auto-sync warning:", syncErr);
    }

    // Revalidate affected routes
    revalidatePath("/beats");
    revalidatePath("/admin/beats");
    revalidatePath("/admin");

    return {
      success: true,
      beatId,
      slug,
    };
  } catch (err: any) {
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
      error: err.message || "An unexpected error occurred during beat creation.",
    };
  }
}

/**
 * Update an existing beat with metadata, asset replacements, and license configuration.
 */
export async function updateBeatAction(formData: FormData): Promise<CreateBeatResponse> {
  const user = await getCurrentUser();
  if (!user) {
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
      const coverPath = getPublicCoverPath(beatId, ext as any);
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
      updatedPreviewPath = previewPath;
    }

    // Master WAV replacement
    let hasWav = Array.isArray(existingBeat.beat_files) && existingBeat.beat_files.some((f: any) => f.file_type === "wav");
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
        ? existingBeat.beat_files.find((f: any) => f.file_type === "wav")
        : null;

      if (oldWavFile?.storage_path && oldWavFile.storage_path !== wavPath) {
        oldAssetsToCleanPrivate.push(oldWavFile.storage_path);
      }

      // Delete existing WAV record from beat_files
      await supabase.from("beat_files").delete().eq("beat_id", beatId).eq("file_type", "wav");

      // Insert new beat_file record
      const { error: fileErr } = await supabase.from("beat_files").insert({
        beat_id: beatId,
        file_type: "wav",
        storage_path: wavPath,
        file_name: wavFile.name,
        mime_type: wavFile.type || "audio/wav",
        file_size: wavFile.size,
      });

      if (fileErr) console.warn("[UpdateBeat] Warning updating beat_file row:", fileErr);
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

    // 8. Auto sync to local SSD
    try {
      const { runSync } = await import("@/scripts/sync-companion");
      await runSync({ slug });
    } catch (syncErr) {
      console.warn("[UpdateBeat] Local SSD auto-sync warning:", syncErr);
    }

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
  } catch (err: any) {
    console.error("[UpdateBeat] Update failed:", err);
    return {
      success: false,
      error: err.message || "An unexpected error occurred while updating the beat.",
    };
  }
}

/**
 * Safely delete a beat and clean up all associated storage files across buckets.
 */
export async function deleteBeatAction(beatId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
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
      beat.beat_files.forEach((f: any) => {
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
  } catch (err: any) {
    console.error("[DeleteBeat] Error deleting beat:", err);
    return { success: false, error: err.message || "Failed to delete beat." };
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
  if (!user) {
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
      const hasWav = Array.isArray(beat.beat_files) && beat.beat_files.some((f: any) => f.file_type === "wav");

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
  } catch (err: any) {
    console.error("[TogglePublish] Error:", err);
    return { success: false, error: err.message || "Failed to update beat status." };
  }
}

/**
 * Trigger local SSD library sync from admin UI
 */
export async function syncBeatToDiskAction(slug?: string): Promise<{ success: boolean; error?: string; count?: number }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized: Admin session required." };
  }

  try {
    const { runSync } = await import("@/scripts/sync-companion");
    const reports = await runSync(slug ? { slug } : {});
    revalidatePath("/admin/beats");
    return { success: true, count: reports.length };
  } catch (err: any) {
    console.error("[SyncAction] Failed to sync beat to disk:", err);
    return { success: false, error: err.message || "Failed to sync beat to disk" };
  }
}


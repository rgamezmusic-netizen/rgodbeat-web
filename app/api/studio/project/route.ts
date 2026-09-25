import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  uploadToR2,
  downloadFromR2,
  deleteR2Prefix,
  getR2SignedDownloadUrl,
  doesR2ObjectExist,
} from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = [
  "admin@rgodbeat.com",
  "rgamezmusic@gmail.com",
  "rgodbeat@gmail.com",
];

async function checkUserAccess(user: any) {
  if (!user || !user.email) {
    return { isLoggedIn: false, hasActivePass: false, daysRemaining: 0, isAdmin: false };
  }

  const isAdmin =
    user.user_metadata?.role === "admin" ||
    ADMIN_EMAILS.includes(user.email.toLowerCase());

  const supabase = createAdminClient();
  const { data: customer } = await (supabase as any)
    .from("customers")
    .select("studio_access_until")
    .eq("email", user.email)
    .maybeSingle();

  const accessUntil = customer?.studio_access_until ? new Date(customer.studio_access_until) : null;
  const now = new Date();
  const hasActivePass = isAdmin || Boolean(accessUntil && accessUntil > now);

  let daysRemaining = 0;
  if (isAdmin) {
    daysRemaining = 365;
  } else if (hasActivePass && accessUntil) {
    const diffMs = accessUntil.getTime() - now.getTime();
    daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  return { isLoggedIn: true, hasActivePass, daysRemaining, isAdmin, accessUntil };
}

/**
 * GET /api/studio/project
 * Fetches the user's saved single cloud project (or wipes it if subscription expired).
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ hasProject: false, isLoggedIn: false });
    }

    const { hasActivePass, daysRemaining, isAdmin, accessUntil } = await checkUserAccess(user);
    const projectPrefix = `studio/projects/${user.id}/`;
    const projectKey = `${projectPrefix}project.json`;

    // 1. If user had a paid pass and the expiration date has strictly elapsed in the past, clean up
    if (accessUntil && accessUntil < new Date() && !isAdmin) {
      const exists = await doesR2ObjectExist(projectKey);
      if (exists) {
        await deleteR2Prefix(projectPrefix);

        // Also clean DB if table exists
        try {
          const supabase = createAdminClient();
          await (supabase as any).from("studio_cloud_projects").delete().eq("user_id", user.id);
        } catch {
          // ignore
        }

        return NextResponse.json({
          hasProject: false,
          expired: true,
          message: "Tu proyecto en la nube fue eliminado porque tu suscripción premium ha expirado.",
        });
      }
    }

    // 2. Load user's latest project.json from R2
    const projectBuffer = await downloadFromR2(projectKey);
    if (!projectBuffer) {
      return NextResponse.json({
        hasProject: false,
        hasActivePass,
        daysRemaining,
        warnExpiration: daysRemaining <= 3 && daysRemaining > 0 && !isAdmin,
      });
    }

    const projectData = JSON.parse(projectBuffer.toString("utf8"));

    // Generate signed download URLs for clips and custom beat so the client can stream/decode them
    if (projectData.beat?.isCustomUpload && projectData.beat?.customBeatKey) {
      projectData.beat.downloadUrl = await getR2SignedDownloadUrl(projectData.beat.customBeatKey, 7200);
    }

    if (Array.isArray(projectData.tracks)) {
      for (const track of projectData.tracks) {
        if (Array.isArray(track.clips)) {
          for (const clip of track.clips) {
            if (clip.storageKey) {
              clip.downloadUrl = await getR2SignedDownloadUrl(clip.storageKey, 7200);
            }
          }
        }
      }
    }

    return NextResponse.json({
      hasProject: true,
      hasActivePass,
      daysRemaining,
      warnExpiration: daysRemaining <= 3 && daysRemaining > 0 && !isAdmin,
      project: projectData,
    });
  } catch (err: any) {
    console.error("[Studio Project GET error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/studio/project
 * Saves the active project (Beat + Vocals + FX) into Cloudflare R2 and Supabase.
 * Exactly 1 project slot per account.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Debes iniciar sesión para guardar tu proyecto en tu cuenta." },
        { status: 401 }
      );
    }

    const { daysRemaining, hasActivePass } = await checkUserAccess(user);

    const formData = await req.formData();
    const metadataRaw = formData.get("metadata") as string;
    if (!metadataRaw) {
      return NextResponse.json({ error: "Faltan los metadatos del proyecto." }, { status: 400 });
    }

    const metadata = JSON.parse(metadataRaw);
    const projectPrefix = `studio/projects/${user.id}/`;

    // 1. Upload custom beat if provided
    const customBeatFile = formData.get("beat_custom") as File | null;
    let customBeatKey: string | null = null;
    if (customBeatFile && customBeatFile.size > 0) {
      customBeatKey = `${projectPrefix}beat.wav`;
      const beatBuf = Buffer.from(await customBeatFile.arrayBuffer());
      await uploadToR2({
        key: customBeatKey,
        body: beatBuf,
        contentType: customBeatFile.type || "audio/wav",
      });
      metadata.beat.customBeatKey = customBeatKey;
    }

    // 2. Upload vocal clips
    if (Array.isArray(metadata.tracks)) {
      for (const track of metadata.tracks) {
        if (Array.isArray(track.clips)) {
          for (const clip of track.clips) {
            const formKey = `clip_${track.id}_${clip.id}`;
            const clipFile = formData.get(formKey) as File | null;
            if (clipFile && clipFile.size > 0) {
              const clipKey = `${projectPrefix}clips/${track.id}_${clip.id}.wav`;
              const clipBuf = Buffer.from(await clipFile.arrayBuffer());
              await uploadToR2({
                key: clipKey,
                body: clipBuf,
                contentType: "audio/wav",
              });
              clip.storageKey = clipKey;
            }
          }
        }
      }
    }

    metadata.savedAt = Date.now();
    metadata.userEmail = user.email;
    metadata.userId = user.id;

    // 3. Save project.json
    const projectKey = `${projectPrefix}project.json`;
    await uploadToR2({
      key: projectKey,
      body: Buffer.from(JSON.stringify(metadata, null, 2)),
      contentType: "application/json",
    });

    // 4. Try updating Supabase database table if available
    try {
      const supabase = createAdminClient();
      await (supabase as any).from("studio_cloud_projects").upsert(
        {
          user_id: user.id,
          email: user.email,
          project_name: metadata.projectName || "Mi Proyecto",
          beat_id: metadata.beat?.id || null,
          beat_title: metadata.beat?.title || null,
          beat_bpm: metadata.beat?.bpm || null,
          beat_key: metadata.beat?.key || null,
          beat_scale: metadata.beat?.scale || null,
          is_custom_beat: Boolean(metadata.beat?.isCustomUpload),
          beat_file_key: customBeatKey,
          tracks_meta: metadata.tracks || [],
          storage_r2_prefix: projectPrefix,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch {
      // Supabase table update optional (R2 is the primary source of truth)
    }

    return NextResponse.json({
      success: true,
      savedAt: metadata.savedAt,
      daysRemaining,
    });
  } catch (err: any) {
    console.error("[Studio Project POST error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/studio/project
 * Deletes the saved cloud project.
 */
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const projectPrefix = `studio/projects/${user.id}/`;
    await deleteR2Prefix(projectPrefix);

    try {
      const supabase = createAdminClient();
      await (supabase as any).from("studio_cloud_projects").delete().eq("user_id", user.id);
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Studio Project DELETE error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

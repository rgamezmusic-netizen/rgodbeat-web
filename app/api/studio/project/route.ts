import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isSiteAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { replaceCloudProject, ProjectConflict, type CloudMetadata, type StagedAudio } from "@/lib/studio/server/projectRepository";
import { r2ProjectStorage } from "@/lib/studio/server/r2ProjectStorage";
import { getR2Client } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// This optional table is not present in the generated database schema.
function projectIndex(client: ReturnType<typeof createAdminClient>) {
  return (client as unknown as { from(table: string): {
    upsert(values: Record<string, unknown>, options: { onConflict: string }): PromiseLike<unknown>;
    delete(): { eq(column: string, value: string): PromiseLike<unknown> };
  } }).from('studio_cloud_projects');
}

async function checkUserAccess(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  if (!user || !user.email) {
    return { isLoggedIn: false, hasActivePass: false, daysRemaining: 0, isAdmin: false };
  }

  const isAdmin = isSiteAdmin(user);
  // Admin access is already verified from the authenticated user. A second
  // customer lookup should not delay or prevent reading that user's backup.
  if (isAdmin) return { isLoggedIn: true, hasActivePass: true, daysRemaining: 365, isAdmin: true };

  const supabase = createAdminClient();
  const { data: customer } = await supabase
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

// Reading a backup never deletes it, including when a premium pass expires.
export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = await createClient();
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError") {
      console.warn("[Studio Project GET] Session verification is temporarily unavailable:", authError.name);
      return NextResponse.json({ error: "No se pudo verificar tu sesión. Reintenta la conexión." }, { status: 503 });
    }
    const user = authError ? null : authData.user;
    if (!user) return NextResponse.json({ hasProject: false, isLoggedIn: false });
    if (!getR2Client()) {
      return NextResponse.json({ error: "El respaldo de cuenta no está configurado para este entorno." }, { status: 503 });
    }
    const { hasActivePass, daysRemaining, isAdmin } = await checkUserAccess(user);
    const prefix = `studio/projects/${user.id}/`;
    const previousStored = await r2ProjectStorage.read(`${prefix}previous-project.json`);
    const slot = request.nextUrl.searchParams.get('slot') === 'previous' ? 'previous-project.json' : 'project.json';
    const stored = await r2ProjectStorage.read(`${prefix}${slot}`);
    const project = stored.body ? JSON.parse(stored.body.toString("utf8")) : null;
    const previousProject = previousStored.body ? JSON.parse(previousStored.body.toString("utf8")) : null;
    const access = { isLoggedIn: true, ownerEmail: user.email?.toLowerCase(), hasActivePass, daysRemaining,
      warnExpiration: daysRemaining <= 3 && daysRemaining > 0 && !isAdmin, revision: stored.etag,
      hasPreviousProject: Boolean(previousProject && !previousProject.deleted),
      previousProjectMeta: previousProject && !previousProject.deleted ? {
        projectName: typeof previousProject.projectName === 'string' ? previousProject.projectName : 'Proyecto guardado',
        savedAt: previousProject.savedAt,
        takesCount: Array.isArray(previousProject.tracks) ? previousProject.tracks.reduce((count: number, track: { clips?: unknown[] }) => count + (track.clips?.length ?? 0), 0) : 0,
      } : null };
    if (!project || project.deleted) return NextResponse.json({ ...access, hasProject: false });
    if (project.beat?.customBeatKey?.startsWith(prefix)) {
      project.beat.downloadUrl = `/api/studio/project/audio?slot=${slot === 'project.json' ? 'active' : 'previous'}&key=${encodeURIComponent(project.beat.customBeatKey)}`;
    }
    for (const track of project.tracks ?? []) for (const clip of track.clips ?? []) {
      if (clip.storageKey?.startsWith(prefix)) clip.downloadUrl = `/api/studio/project/audio?slot=${slot === 'project.json' ? 'active' : 'previous'}&key=${encodeURIComponent(clip.storageKey)}`;
    }
    return NextResponse.json({ ...access, revision: stored.etag, hasProject: true, project });
  } catch (error) {
    console.error("[Studio Project GET error]", error);
    return NextResponse.json({ error: "No se pudo consultar el respaldo. Tu proyecto no se ha borrado; reintenta la conexión." }, { status: 503 });
  }
}

// One active workspace per account. The old manifest remains usable until commit.
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Inicia sesión para respaldar tu proyecto." }, { status: 401 });
    const form = await req.formData();
    const raw = form.get("metadata");
    if (typeof raw !== "string") return NextResponse.json({ error: "Faltan los metadatos." }, { status: 400 });
    const metadata = JSON.parse(raw) as CloudMetadata;
    if (metadata.ownerEmail && metadata.ownerEmail !== user.email?.toLowerCase()) {
      return NextResponse.json({ error: 'La cuenta cambió antes de guardar.' }, { status: 401 });
    }
    if (!Array.isArray(metadata.tracks) || metadata.tracks.some(track => !Array.isArray(track.clips))) {
      return NextResponse.json({ error: "Las pistas del proyecto son inválidas." }, { status: 400 });
    }
    const base = form.get("baseRevision");
    if (typeof base !== "string") return NextResponse.json({ error: "Actualiza Studio antes de respaldar el proyecto." }, { status: 428 });
    const files = new Map<string, Buffer>();
    for (const [name, value] of form.entries()) {
      if (value instanceof File && value.size) files.set(name, Buffer.from(await value.arrayBuffer()));
    }
    const stagedRaw = form.get('stagedAudio');
    const staged = new Map<string, StagedAudio>();
    if (typeof stagedRaw === 'string') {
      const assets = JSON.parse(stagedRaw) as Record<string, StagedAudio>;
      for (const [formKey, asset] of Object.entries(assets)) {
        if (!/^([a-f0-9-]{36})$/.test(asset?.key.split('/')[4] || '')
          || !asset.key.startsWith(`studio/projects/${user.id}/snapshots/`)
          || !/^[a-f0-9]{64}$/.test(asset.hash)) {
          return NextResponse.json({ error: 'Audio preparado inválido.' }, { status: 400 });
        }
        staged.set(formKey, asset);
      }
    }
    delete metadata.deleted;
    metadata.userId = user.id; metadata.userEmail = user.email;
    const prefix = `studio/projects/${user.id}/`;
    const result = await replaceCloudProject(r2ProjectStorage, prefix, base || null, metadata, files, staged);
    // R2 manifest is authoritative; the existing optional account index is maintained.
    try {
      const supabase = createAdminClient();
      await projectIndex(supabase).upsert({
        user_id: user.id, email: user.email, project_name: metadata.projectName || "Mi Proyecto",
        beat_id: metadata.beat?.id || null, beat_title: metadata.beat?.title || null,
        beat_file_key: metadata.beat?.customBeatKey || null, tracks_meta: metadata.tracks,
        storage_r2_prefix: prefix, updated_at: new Date(result.savedAt).toISOString(),
      }, { onConflict: "user_id" });
    } catch { /* Optional index does not determine backup success. */ }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ProjectConflict) return NextResponse.json({ error: error.message, conflict: true }, { status: 409 });
    console.error("[Studio Project POST error]", error);
    return NextResponse.json({ error: "No se completó el respaldo de cuenta. Se conserva la versión anterior." }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    const body = await req.json();
    if (body.ownerEmail && body.ownerEmail !== user.email?.toLowerCase()) {
      return NextResponse.json({ error: 'La cuenta cambió antes de limpiar el proyecto.' }, { status: 401 });
    }
    if (!(typeof body.baseRevision === "string" || body.baseRevision === null)) {
      return NextResponse.json({ error: "Falta la revisión del proyecto." }, { status: 400 });
    }
    // A small tombstone prevents a delayed save from recreating the previous workspace.
    const result = await replaceCloudProject(r2ProjectStorage, `studio/projects/${user.id}/`,
      body.baseRevision, { deleted: true, beat: null, tracks: [], userId: user.id }, new Map());
    try {
      const supabase = createAdminClient();
      await projectIndex(supabase).delete().eq("user_id", user.id);
    } catch { /* Optional index. */ }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ProjectConflict) return NextResponse.json({ error: error.message, conflict: true }, { status: 409 });
    return NextResponse.json({ error: "No se pudo reemplazar el proyecto anterior. Inténtalo de nuevo." }, { status: 503 });
  }
}

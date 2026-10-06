import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getR2Client } from '@/lib/storage/r2';
import { r2ProjectStorage } from '@/lib/studio/server/r2ProjectStorage';
import { decodeProjectManifest } from '@/lib/studio/server/projectManifest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Keeps the current account project as the single previous project before a new one starts. */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión para guardar el proyecto en tu cuenta.' }, { status: 401 });
    if (!getR2Client()) return NextResponse.json({ error: 'El respaldo de cuenta no está configurado para este entorno.' }, { status: 503 });
    const prefix = `studio/projects/${user.id}/`;
    const body = await request.json().catch(() => ({})) as { replacePrevious?: boolean; baseRevision?: string | null; ownerEmail?: string };
    if (body.ownerEmail && body.ownerEmail !== user.email?.toLowerCase()) {
      return NextResponse.json({error:'La cuenta cambió antes de conservar el proyecto.',code:'SESSION_REQUIRED',retryable:false},{status:401});
    }
    if (!(typeof body.baseRevision === 'string' || body.baseRevision === null)) {
      return NextResponse.json({ error: 'Actualiza Studio antes de conservar el proyecto.' }, { status: 428 });
    }
    const [current, previous] = await Promise.all([
      r2ProjectStorage.read(`${prefix}project.json`),
      r2ProjectStorage.read(`${prefix}previous-project.json`),
    ]);
    if (current.etag !== body.baseRevision) {
      return NextResponse.json({ error: 'El proyecto cambió en otra sesión. Vuelve a comprobar la cuenta antes de iniciar uno nuevo.', conflict: true }, { status: 409 });
    }
    if (!current.body) return NextResponse.json({ success: true, archived: false, hasPreviousProject: Boolean(previous.body) });
    const project = decodeProjectManifest(current.body).project;
    const previousProject = decodeProjectManifest(previous.body).project;
    if (!project) return NextResponse.json({ success: true, archived: false, hasPreviousProject: Boolean(previousProject) });
    if (previousProject && !body.replacePrevious) {
      return NextResponse.json({ success: false, requiresConfirmation: true, hasPreviousProject: true }, { status: 409 });
    }
    const savedAt = typeof project.savedAt === 'number' ? project.savedAt : Date.now();
    const archived = { ...project, archivedAt: Date.now(), savedAt };
    const revision = await r2ProjectStorage.put(`${prefix}previous-project.json`, Buffer.from(JSON.stringify(archived)), 'application/json', previous.etag);
    return NextResponse.json({ success: true, archived: true, revision });
  } catch (error) {
    console.error('[Studio project archive]', error);
    return NextResponse.json({ error: 'No se pudo conservar el proyecto anterior. No se reemplazó.' }, { status: 503 });
  }
}

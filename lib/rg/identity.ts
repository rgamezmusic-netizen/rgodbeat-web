import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export const RG_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RgIdentityError extends Error {
  constructor(message: string, readonly status: number = 400, readonly code = 'INVALID_IDENTITY') {
    super(message);
    this.name = 'RgIdentityError';
  }
}

export type RgArtist = {
  id: string;
  stage_name: string;
  slug: string;
  bio: string | null;
  status: 'active' | 'suspended' | 'retired';
  created_at: string;
  updated_at: string;
};

export type RgTrack = {
  id: string;
  title: string;
  beat_id: string | null;
  studio_project_id: string | null;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
};

const artistFields = 'id,stage_name,slug,bio,status,created_at,updated_at';
const trackFields = 'id,title,beat_id,studio_project_id,status,created_at,updated_at';

function cleanStageName(value: unknown): string {
  if (typeof value !== 'string') throw new RgIdentityError('Escribe un nombre artístico válido.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 80 || /[<>\u0000-\u001f\u007f]/.test(name)) {
    throw new RgIdentityError('El nombre artístico debe tener entre 1 y 80 caracteres.');
  }
  return name;
}

function cleanBio(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new RgIdentityError('La biografía no es válida.');
  const bio = value.trim();
  if (bio.length > 1000 || /\u0000/.test(bio)) throw new RgIdentityError('La biografía puede tener hasta 1000 caracteres.');
  return bio || null;
}

function cleanTrackTitle(value: unknown): string {
  if (typeof value !== 'string') throw new RgIdentityError('Escribe un título de track válido.');
  const title = value.trim().replace(/\s+/g, ' ');
  if (title.length < 1 || title.length > 120 || /[<>\u0000-\u001f\u007f]/.test(title)) {
    throw new RgIdentityError('El título debe tener entre 1 y 120 caracteres.');
  }
  return title;
}

function toSlug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '') || 'artist';
}

function dbFailure(error: { code?: string; message?: string } | null, fallback: string): never {
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202') {
    throw new RgIdentityError('RG Artist/Track aún no está instalado en la base de datos.', 503, 'RG_SCHEMA_NOT_APPLIED');
  }
  throw new RgIdentityError(fallback, 503, error?.code || 'RG_DATABASE_ERROR');
}

export async function getOwnedArtist(userId: string): Promise<RgArtist | null> {
  const { data, error } = await createAdminClient().from('rg_artists').select(artistFields)
    .eq('user_id', userId).maybeSingle();
  if (error) dbFailure(error, 'No se pudo consultar tu RG Artist.');
  return data as unknown as RgArtist | null;
}

export async function getOwnedArtistById(userId: string, artistId: string): Promise<RgArtist> {
  if (!RG_UUID.test(artistId)) throw new RgIdentityError('RG Artist no encontrado.', 404, 'ARTIST_NOT_FOUND');
  const { data, error } = await createAdminClient().from('rg_artists').select(artistFields)
    .eq('id', artistId).eq('user_id', userId).maybeSingle();
  if (error) dbFailure(error, 'No se pudo consultar el RG Artist.');
  if (!data) throw new RgIdentityError('RG Artist no encontrado.', 404, 'ARTIST_NOT_FOUND');
  return data as unknown as RgArtist;
}

export async function createOwnedArtist(userId: string, input: { stageName: unknown; bio?: unknown }): Promise<RgArtist> {
  const stageName = cleanStageName(input.stageName);
  const bio = cleanBio(input.bio);
  const existing = await getOwnedArtist(userId);
  if (existing) throw new RgIdentityError('Esta cuenta ya tiene un RG Artist.', 409, 'ARTIST_ALREADY_EXISTS');

  const client = createAdminClient();
  const base = toSlug(stageName);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await client.from('rg_artists').insert({ user_id: userId, stage_name: stageName, slug, bio })
      .select(artistFields).single();
    if (!error && data) return data as unknown as RgArtist;
    if (error?.code === '23505') {
      const racedArtist = await getOwnedArtist(userId);
      if (racedArtist) throw new RgIdentityError('Esta cuenta ya tiene un RG Artist.', 409, 'ARTIST_ALREADY_EXISTS');
      if (attempt < 4) continue;
    }
    dbFailure(error, 'No se pudo crear el RG Artist.');
  }
  throw new RgIdentityError('No se pudo reservar un slug para el RG Artist.', 503, 'ARTIST_SLUG_UNAVAILABLE');
}

export async function updateOwnedArtist(userId: string, artistId: string, input: { stageName?: unknown; bio?: unknown }): Promise<RgArtist> {
  const artist = await getOwnedArtistById(userId, artistId);
  const values: { stage_name?: string; bio?: string | null; updated_at: string } = { updated_at: new Date().toISOString() };
  if (Object.hasOwn(input, 'stageName')) values.stage_name = cleanStageName(input.stageName);
  if (Object.hasOwn(input, 'bio')) values.bio = cleanBio(input.bio);
  if (Object.keys(values).length === 1) throw new RgIdentityError('No hay cambios válidos para guardar.');
  const { data, error } = await createAdminClient().from('rg_artists').update(values)
    .eq('id', artist.id).eq('user_id', userId).select(artistFields).maybeSingle();
  if (error) dbFailure(error, 'No se pudo actualizar el RG Artist.');
  if (!data) throw new RgIdentityError('RG Artist no encontrado.', 404, 'ARTIST_NOT_FOUND');
  return data as unknown as RgArtist;
}

async function verifyProject(userId: string, projectId: string | null): Promise<void> {
  if (projectId === null) return;
  if (!RG_UUID.test(projectId)) throw new RgIdentityError('El proyecto del Studio no es válido.');
  // This existing optional table is not present in the repository's generated DB type.
  const projectClient = createAdminClient() as unknown as {
    from(table: 'studio_cloud_projects'): {
      select(columns: 'id'): {
        eq(column: 'id', value: string): {
          eq(column: 'user_id', value: string): {
            maybeSingle(): PromiseLike<{ data: { id: string } | null; error: { code?: string; message?: string } | null }>;
          };
        };
      };
    };
  };
  const { data, error } = await projectClient.from('studio_cloud_projects').select('id')
    .eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (error) dbFailure(error, 'No se pudo verificar el proyecto del Studio.');
  if (!data) throw new RgIdentityError('El proyecto del Studio no pertenece a esta cuenta.', 403, 'PROJECT_NOT_OWNED');
}

export async function listOwnedTracks(userId: string, artistId: string): Promise<RgTrack[]> {
  await getOwnedArtistById(userId, artistId);
  const client = createAdminClient();
  const { data: associations, error: associationError } = await client.from('rg_track_artists')
    .select('track_id').eq('artist_id', artistId).eq('role', 'primary');
  if (associationError) dbFailure(associationError, 'No se pudieron consultar tus RG Tracks.');
  const ids = (associations ?? []).map(row => row.track_id);
  if (!ids.length) return [];
  const { data, error } = await client.from('rg_tracks').select(trackFields).in('id', ids).order('created_at', { ascending: false });
  if (error) dbFailure(error, 'No se pudieron consultar tus RG Tracks.');
  return (data ?? []) as unknown as RgTrack[];
}

export async function getOwnedTrack(userId: string, trackId: string): Promise<{ track: RgTrack; artist: RgArtist }> {
  if (!RG_UUID.test(trackId)) throw new RgIdentityError('RG Track no encontrado.', 404, 'TRACK_NOT_FOUND');
  const client = createAdminClient();
  const { data: track, error: trackError } = await client.from('rg_tracks').select(trackFields).eq('id', trackId).maybeSingle();
  if (trackError) dbFailure(trackError, 'No se pudo consultar el RG Track.');
  if (!track) throw new RgIdentityError('RG Track no encontrado.', 404, 'TRACK_NOT_FOUND');
  const { data: association, error: associationError } = await client.from('rg_track_artists').select('artist_id')
    .eq('track_id', trackId).eq('role', 'primary').maybeSingle();
  if (associationError) dbFailure(associationError, 'No se pudo verificar el RG Track.');
  if (!association) throw new RgIdentityError('El RG Track no tiene artista principal.', 409, 'TRACK_PRIMARY_ARTIST_MISSING');
  const artist = await getOwnedArtistById(userId, association.artist_id);
  return { track: track as unknown as RgTrack, artist };
}

export async function createOwnedTrack(userId: string, input: {
  artistId: unknown; title: unknown; beatId?: unknown; studioProjectId?: unknown;
}): Promise<RgTrack> {
  if (typeof input.artistId !== 'string' || !RG_UUID.test(input.artistId)) throw new RgIdentityError('Selecciona un RG Artist válido.');
  const artist = await getOwnedArtistById(userId, input.artistId);
  if (artist.status !== 'active') throw new RgIdentityError('Este RG Artist no puede crear tracks.', 403, 'ARTIST_INACTIVE');
  const title = cleanTrackTitle(input.title);
  const beatId = input.beatId === undefined || input.beatId === null || input.beatId === '' ? null : input.beatId;
  const projectId = input.studioProjectId === undefined || input.studioProjectId === null || input.studioProjectId === '' ? null : input.studioProjectId;
  if (beatId !== null && (typeof beatId !== 'string' || !RG_UUID.test(beatId))) throw new RgIdentityError('El beat de catálogo no es válido.');
  if (projectId !== null && (typeof projectId !== 'string' || !RG_UUID.test(projectId))) throw new RgIdentityError('El proyecto del Studio no es válido.');
  await verifyProject(userId, projectId as string | null);

  const { data: id, error } = await createAdminClient().rpc('create_rg_track', {
    p_user_id: userId, p_artist_id: artist.id, p_title: title,
    p_beat_id: beatId as string | null, p_studio_project_id: projectId as string | null,
  });
  if (error || !id) dbFailure(error, 'No se pudo crear el RG Track.');
  const { data, error: readError } = await createAdminClient().from('rg_tracks').select(trackFields).eq('id', id).single();
  if (readError || !data) dbFailure(readError, 'El RG Track se creó, pero no se pudo cargar.');
  return data as unknown as RgTrack;
}

export async function updateOwnedTrack(userId: string, trackId: string, input: {
  title?: unknown; beatId?: unknown; studioProjectId?: unknown;
}): Promise<RgTrack> {
  const { track } = await getOwnedTrack(userId, trackId);
  const values: { title?: string; beat_id?: string | null; studio_project_id?: string | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (Object.hasOwn(input, 'title')) values.title = cleanTrackTitle(input.title);
  if (Object.hasOwn(input, 'beatId')) {
    const beatId = input.beatId === null || input.beatId === '' ? null : input.beatId;
    if (beatId !== null && (typeof beatId !== 'string' || !RG_UUID.test(beatId))) throw new RgIdentityError('El beat de catálogo no es válido.');
    if (beatId !== null) {
      const { data, error } = await createAdminClient().from('beats').select('id').eq('id', beatId).maybeSingle();
      if (error) dbFailure(error, 'No se pudo verificar el beat.');
      if (!data) throw new RgIdentityError('El beat de catálogo no existe.', 404, 'BEAT_NOT_FOUND');
    }
    values.beat_id = beatId as string | null;
  }
  if (Object.hasOwn(input, 'studioProjectId')) {
    const projectId = input.studioProjectId === null || input.studioProjectId === '' ? null : input.studioProjectId;
    if (projectId !== null && (typeof projectId !== 'string' || !RG_UUID.test(projectId))) throw new RgIdentityError('El proyecto del Studio no es válido.');
    await verifyProject(userId, projectId as string | null);
    values.studio_project_id = projectId as string | null;
  }
  if (Object.keys(values).length === 1) throw new RgIdentityError('No hay cambios válidos para guardar.');
  if (track.status !== 'draft' && (Object.hasOwn(input, 'beatId') || Object.hasOwn(input, 'studioProjectId'))) {
    throw new RgIdentityError('No se puede cambiar el beat o proyecto después de publicar el track.', 409, 'TRACK_LOCKED');
  }
  const { data, error } = await createAdminClient().from('rg_tracks').update(values)
    .eq('id', track.id).eq('status', 'draft').select(trackFields).maybeSingle();
  if (error) dbFailure(error, 'No se pudo actualizar el RG Track.');
  if (!data) {
    if (Object.hasOwn(input, 'beatId') || Object.hasOwn(input, 'studioProjectId')) {
      throw new RgIdentityError('El track ya se publicó o cambió. Actualiza la página e inténtalo de nuevo.', 409, 'TRACK_LOCKED');
    }
    const { data: current, error: currentError } = await createAdminClient().from('rg_tracks').update(values)
      .eq('id', track.id).eq('status', 'published').select(trackFields).maybeSingle();
    if (currentError) dbFailure(currentError, 'No se pudo actualizar el RG Track.');
    if (!current) throw new RgIdentityError('RG Track no encontrado.', 404, 'TRACK_NOT_FOUND');
    return current as unknown as RgTrack;
  }
  return data as unknown as RgTrack;
}

export async function validateOwnedTrackForPublication(userId: string, artistId: unknown, trackId: unknown, beatId: unknown): Promise<void> {
  if (typeof artistId !== 'string' || !RG_UUID.test(artistId) || typeof trackId !== 'string' || !RG_UUID.test(trackId)) {
    throw new RgIdentityError('Selecciona un RG Artist y un RG Track válidos.');
  }
  if (beatId !== null && beatId !== undefined && beatId !== '' && (typeof beatId !== 'string' || !RG_UUID.test(beatId))) {
    throw new RgIdentityError('El beat del RG Track no es válido.');
  }
  const artist = await getOwnedArtistById(userId, artistId);
  if (artist.status !== 'active') throw new RgIdentityError('Este RG Artist no puede publicar tracks.', 403, 'ARTIST_INACTIVE');
  const client = createAdminClient();
  const { data: track, error: trackError } = await client.from('rg_tracks').select(trackFields).eq('id', trackId).maybeSingle();
  if (trackError) dbFailure(trackError, 'No se pudo verificar el RG Track.');
  if (!track || !['draft', 'published'].includes(track.status)) throw new RgIdentityError('El RG Track no está disponible para publicación.', 409, 'TRACK_UNAVAILABLE');
  const { data: association, error: associationError } = await client.from('rg_track_artists').select('artist_id')
    .eq('track_id', trackId).eq('artist_id', artistId).eq('role', 'primary').maybeSingle();
  if (associationError) dbFailure(associationError, 'No se pudo verificar la relación artista/track.');
  if (!association) throw new RgIdentityError('El RG Artist no es el artista principal de este track.', 403, 'TRACK_NOT_OWNED');
  const suppliedBeatId = beatId === undefined || beatId === '' ? null : beatId;
  if (track.beat_id !== suppliedBeatId) throw new RgIdentityError('El beat cargado no coincide con el RG Track seleccionado.', 409, 'TRACK_BEAT_MISMATCH');
}

export function serializeIdentityError(error: unknown): { error: string; status: number; code: string } {
  if (error instanceof RgIdentityError) return { error: error.message, status: error.status, code: error.code };
  return { error: 'No se pudo completar la operación RG. Inténtalo de nuevo.', status: 503, code: 'RG_UNAVAILABLE' };
}

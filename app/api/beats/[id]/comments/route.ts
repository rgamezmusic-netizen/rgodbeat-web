import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUUID, validateComment } from '@/lib/ranking/comments';
import type { Database } from '@/types/database';

export const dynamic = 'force-dynamic';
type CommentRow = Database['public']['Tables']['beat_comments']['Row'];
type Context = { params: Promise<{ id: string }> };
type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
const adminEmails = new Set(['admin@rgodbeat.com', 'rgamezmusic@gmail.com', 'rgodbeat@gmail.com']);
const isAdmin = (user: User | null) => !!user && (user.app_metadata?.role === 'admin' || adminEmails.has(user.email?.toLowerCase() ?? ''));
const serialize = (row: CommentRow, user: User | null) => ({ id: row.id, authorName: row.author_name,
  body: row.body, createdAt: row.created_at, canDelete: !!user && (row.author_id === user.id || isAdmin(user)) });
const unavailable = () => NextResponse.json({ error: 'No se pudieron cargar los comentarios. Inténtalo más tarde.', code: 'COMMENTS_UNAVAILABLE' }, { status: 503 });
const sameOrigin = (req: NextRequest) => !req.headers.get('origin') || req.headers.get('origin') === req.nextUrl.origin;

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    if (!isUUID(id)) return NextResponse.json({ error: 'Beat no encontrado.' }, { status: 404 });
    const client = createAdminClient();
    const [beat, user] = await Promise.all([
      client.from('beats').select('id').eq('id', id).eq('published', true).maybeSingle(), getCurrentUser(),
    ]);
    if (beat.error) return unavailable();
    if (!beat.data) return NextResponse.json({ error: 'Beat no encontrado.' }, { status: 404 });
    let query = client.from('beat_comments').select('*').eq('beat_id', id).eq('is_hidden', false)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(21);
    const before = req.nextUrl.searchParams.get('before');
    const cursorId = req.nextUrl.searchParams.get('cursorId');
    if (before || cursorId) {
      if (!before || !cursorId || !isUUID(cursorId) || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(before) || !Number.isFinite(Date.parse(before))) {
        return NextResponse.json({ error: 'Página de comentarios inválida.' }, { status: 400 });
      }
      query = query.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${cursorId})`);
    }
    const { data, error } = await query;
    if (error) return unavailable();
    const rows = (data ?? []).slice(0, 20);
    const last = rows.at(-1);
    return NextResponse.json({ comments: rows.map(row => serialize(row, user)), isLoggedIn: !!user,
      nextCursor: (data?.length ?? 0) > 20 && last ? { before: last.created_at, cursorId: last.id } : null,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return unavailable(); }
}

export async function POST(req: NextRequest, { params }: Context) {
  try {
    if (!sameOrigin(req)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
    const { id } = await params;
    if (!isUUID(id)) return NextResponse.json({ error: 'Beat no encontrado.' }, { status: 404 });
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión para comentar.', requireLogin: true }, { status: 401 });
    const input = await req.json().catch(() => null);
    const body = validateComment(input?.body);
    if (!body) return NextResponse.json({ error: 'Escribe entre 2 y 600 caracteres.' }, { status: 400 });
    const metadata = user.user_metadata ?? {};
    const authorName = [metadata.artist_name, metadata.full_name, metadata.name]
      .find(value => typeof value === 'string' && value.trim())?.trim().slice(0, 60) || 'Artista';
    const { data, error } = await createAdminClient().rpc('post_beat_comment', {
      p_user_id: user.id, p_beat_id: id, p_author_name: authorName, p_body: body,
    });
    if (error?.code === 'P0001') return NextResponse.json({ error: 'Espera 15 segundos antes de volver a comentar.' }, { status: 429 });
    if (error?.code === 'P0002') return NextResponse.json({ error: 'Beat no encontrado.' }, { status: 404 });
    if (error || !data) return unavailable();
    return NextResponse.json({ comment: serialize(data as unknown as CommentRow, user) }, { status: 201 });
  } catch { return unavailable(); }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    if (!sameOrigin(req)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
    const { id } = await params;
    const commentId = req.nextUrl.searchParams.get('commentId') ?? '';
    if (!isUUID(id) || !isUUID(commentId)) return NextResponse.json({ error: 'Comentario no encontrado.' }, { status: 404 });
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 });
    const client = createAdminClient();
    const { data: comment, error } = await client.from('beat_comments').select('author_id')
      .eq('id', commentId).eq('beat_id', id).maybeSingle();
    if (error) return unavailable();
    if (!comment) return NextResponse.json({ error: 'Comentario no encontrado.' }, { status: 404 });
    if (comment.author_id !== user.id && !isAdmin(user)) return NextResponse.json({ error: 'No puedes eliminar este comentario.' }, { status: 403 });
    const result = await client.from('beat_comments').update({ is_hidden: true }).eq('id', commentId).eq('beat_id', id);
    if (result.error) return unavailable();
    return NextResponse.json({ success: true });
  } catch { return unavailable(); }
}

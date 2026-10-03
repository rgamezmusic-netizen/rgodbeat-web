'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import type { BeatComment } from '@/lib/ranking/comments';
import type { Beat } from '@/types';
import styles from './Ranking.module.css';

type Cursor = { before: string; cursorId: string };

export function BeatConversation({ beat, onChange }: { beat: Beat; onChange: () => void }) {
  const [comments, setComments] = useState<BeatComment[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const alive = useRef(true);
  const busy = useRef(false);
  const load = useCallback(async (page: Cursor | null, signal?: AbortSignal) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true); setError('');
    try {
      const query = page ? `?${new URLSearchParams(page).toString()}` : '';
      const response = await fetch(`/api/beats/${beat.id}/comments${query}`, { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los comentarios.');
      if (!alive.current || signal?.aborted) return;
      setComments(previous => page ? [...previous, ...data.comments.filter((comment: BeatComment) => !previous.some(item => item.id === comment.id))] : data.comments);
      setCursor(data.nextCursor); setLoggedIn(data.isLoggedIn); setReady(true);
    } catch (cause) {
      if (alive.current && !signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los comentarios.');
    } finally {
      busy.current = false;
      if (alive.current && !signal?.aborted) setLoading(false);
    }
  }, [beat.id]);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    // Defer to make the effect safe during React's development remount.
    const timer = setTimeout(() => { void load(null, controller.signal); }, 0);
    return () => { alive.current = false; clearTimeout(timer); controller.abort(); };
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (posting || draft.trim().length < 2) return;
    setPosting(true); setError('');
    try {
      const response = await fetch(`/api/beats/${beat.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: draft }) });
      const data = await response.json();
      if (!response.ok) { if (data.requireLogin) setLoggedIn(false); throw new Error(data.error || 'No se pudo publicar tu comentario.'); }
      if (!alive.current) return;
      setComments(previous => [data.comment, ...previous]); setDraft(''); onChange();
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo publicar tu comentario.'); }
    finally { if (alive.current) setPosting(false); }
  }

  async function remove(id: string) {
    if (deleting) return;
    setDeleting(id); setError('');
    try {
      const response = await fetch(`/api/beats/${beat.id}/comments?commentId=${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo eliminar el comentario.');
      if (alive.current) { setComments(previous => previous.filter(comment => comment.id !== id)); onChange(); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo eliminar el comentario.'); }
    finally { if (alive.current) setDeleting(null); }
  }

  return <>
    <h3 className={styles.panelBeatTitle}>{beat.title}</h3>
    {ready && (loggedIn ? <form className={styles.commentForm} onSubmit={submit}>
      <label htmlFor="beat-comment">Tu comentario</label>
      <textarea id="beat-comment" value={draft} onChange={event => setDraft(event.target.value)} maxLength={600} rows={4} placeholder="Escribe un comentario…" disabled={posting} />
      <div><span className={styles.muted}>{draft.length}/600</span><button className={styles.goldButton} type="submit" disabled={posting || draft.trim().length < 2}><Send size={15} />{posting ? 'Publicando…' : 'Publicar'}</button></div>
    </form> : <div className={styles.loginNotice}><MessageCircle size={20} /><Link className={styles.goldButton} href={`/login?redirect=${encodeURIComponent(`/ranking?beat=${beat.id}`)}`}>Inicia sesión para comentar</Link></div>)}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!ready && !loading && <button className={styles.outlineButton} onClick={() => void load(null)}>Volver a intentar</button>}
    {comments.map(comment => <article key={comment.id} className={styles.comment}>
      <header><span className={styles.avatar} aria-hidden="true">{comment.authorName.slice(0, 1).toUpperCase()}</span><div><strong>{comment.authorName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time></div>
        {comment.canDelete && <button className={styles.iconButton} disabled={!!deleting} aria-label="Eliminar mi comentario" onClick={() => void remove(comment.id)}><Trash2 size={16} /></button>}
      </header><p>{comment.body}</p>
    </article>)}
    {loading && <p role="status" className={styles.muted}>Cargando…</p>}
    {ready && !loading && comments.length === 0 && <div className={styles.emptyConversation}><MessageCircle size={30} /><p>Sin comentarios todavía.</p></div>}
    {cursor && !loading && <button className={styles.outlineButton} onClick={() => void load(cursor)}>Ver más comentarios</button>}
  </>;
}

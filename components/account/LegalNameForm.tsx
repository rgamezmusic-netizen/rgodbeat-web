'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function LegalNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setFailed(false);
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legalName: name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No pudimos guardar el nombre.');
      setName(result.legalName);
      setMessage('Nombre legal guardado. Se usará en tus contratos de licencia.');
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'No pudimos guardar el nombre. Inténtalo de nuevo.');
    } finally { setSaving(false); }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0e0e14] p-5 sm:p-6">
      <h2 className="text-lg font-bold text-white">Datos para tus contratos</h2>
      <p id="legal-name-help" className="mt-2 text-sm text-zinc-400">
        Escribe tu nombre y apellidos reales como quieres que aparezcan en tus licencias. Este dato es privado y no cambia tu nombre artístico público.
      </p>
      <form onSubmit={save} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="legal-name" className="mb-2 block text-sm font-medium text-zinc-200">Nombre legal completo</label>
          <input id="legal-name" name="legalName" autoComplete="name" required minLength={2} maxLength={120}
            value={name} onChange={event => setName(event.target.value)} disabled={saving} aria-describedby="legal-name-help"
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-purple-600 px-5 py-3 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar nombre legal'}
        </button>
      </form>
      {message && <p role={failed ? 'alert' : 'status'} className={`mt-3 text-sm ${failed ? 'text-red-300' : 'text-emerald-300'}`}>{message}</p>}
    </section>
  );
}

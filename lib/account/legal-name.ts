/** Self-declared private contract identity, distinct from a public artist name. */
export function normalizeLegalName(value: unknown): string | null {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value)) return null;
  const name = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (name.length < 2 || name.length > 120 || !/^[\p{L}\p{M} .’'\-]+$/u.test(name) || !/\p{L}/u.test(name)) return null;
  return name;
}

export function getLegalName(user: { user_metadata?: Record<string, unknown> } | null | undefined): string | null {
  return normalizeLegalName(user?.user_metadata?.legal_name);
}

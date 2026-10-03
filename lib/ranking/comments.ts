export interface BeatComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  canDelete: boolean;
}

export function validateComment(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const body = value.trim();
  return body.length >= 2 && body.length <= 600 ? body : null;
}

export function isUUID(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}

/** Public Supabase settings are bundled at build time by Next.js. */
export function getSupabasePublicConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function requireSupabasePublicConfig(): { url: string; key: string } {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("Supabase no está configurado para este entorno.");
  }
  return config;
}

export function requireSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new Error("La URL de Supabase no está configurada para este entorno.");
  return url;
}

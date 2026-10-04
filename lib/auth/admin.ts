type AdminIdentity = {
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
} | null | undefined;

const LEGACY_ADMIN_EMAILS = new Set([
  "admin@rgodbeat.com",
  "rgamezmusic@gmail.com",
  "rgodbeat@gmail.com",
]);

/** Admin authority comes from trusted app_metadata or the existing server allowlist. */
export function isSiteAdmin(user: AdminIdentity): boolean {
  if (user?.app_metadata?.role === "admin") return true;
  return Boolean(user?.email && LEGACY_ADMIN_EMAILS.has(user.email.trim().toLowerCase()));
}

import "server-only";
import { getCurrentUser } from "@/lib/auth/server";
import { isSiteAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getAuthorizedStudioExporter() {
  const user = await getCurrentUser();
  if (!user?.email) return { user: null, error: "Inicia sesión para publicar desde el Studio.", status: 401 as const };
  if (isSiteAdmin(user)) return { user, error: null, status: 200 as const };

  const { data, error } = await createAdminClient().from("customers").select("studio_access_until").eq("email", user.email).maybeSingle();
  if (error) return { user: null, error: "No se pudo verificar el acceso al Studio.", status: 503 as const };
  const expiry = data?.studio_access_until ? new Date(data.studio_access_until).getTime() : 0;
  if (expiry <= Date.now()) return { user: null, error: "Necesitas un Pase activo del Studio para publicar.", status: 403 as const };
  return { user, error: null, status: 200 as const };
}

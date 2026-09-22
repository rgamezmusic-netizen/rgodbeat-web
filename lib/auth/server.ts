import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";

/**
 * Securely retrieves the currently authenticated user on the server.
 * Uses supabase.auth.getUser() to validate authentication against Supabase servers
 * rather than relying on unverified cookies.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch (err) {
    console.error("[Auth] Unexpected error retrieving current user:", err);
    return null;
  }
}

/**
 * Server-side route guard for protected admin areas.
 * If user is not authenticated, triggers a Next.js server-side redirect to /login.
 */
export async function requireAdminAuth(redirectPath = "/admin"): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  }

  return user;
}

/**
 * Server action to sign out the user and clear session cookies.
 */
export async function signOutAdmin(): Promise<void> {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

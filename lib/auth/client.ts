import { createClient } from "@/lib/supabase/client";
import { AuthError, User } from "@supabase/supabase-js";

export interface SignInResult {
  user: User | null;
  error: AuthError | null;
}

/**
 * Sign in using email and password on the client.
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<SignInResult> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  return {
    user: data.user,
    error,
  };
}

/**
 * Sign out on the client.
 */
export async function signOutClient(): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Retrieve the current authenticated user on the client.
 */
export async function getBrowserUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

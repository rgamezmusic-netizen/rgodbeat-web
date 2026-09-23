import { createClient } from "@/lib/supabase/client";
import { AuthError, User } from "@supabase/supabase-js";

export interface SignInResult {
  user: User | null;
  error: AuthError | null;
}

export interface SignUpResult {
  user: User | null;
  session: any | null;
  error: AuthError | null;
}

/**
 * Sign up a new customer/artist account using email and password.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  fullName?: string
): Promise<SignUpResult> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName?.trim() || "",
        role: "customer",
      },
    },
  });

  return {
    user: data.user,
    session: data.session,
    error,
  };
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

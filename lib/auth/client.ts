import { createClient } from "@/lib/supabase/client";
import { AuthError, User, Session } from "@supabase/supabase-js";
import { fetchAuth } from "./request";

export interface SignInResult {
  user: User | null;
  session?: Session | null;
  error: AuthError | { message: string; name?: string } | null;
}

export interface SignUpResult {
  user: User | null;
  session: Session | null;
  requiresEmailConfirmation?: boolean;
  error: AuthError | { message: string; name?: string } | null;
}

/**
 * Translates Supabase authentication errors into friendly Spanish explanations.
 */
export function translateAuthError(errorMessage?: string | null): string {
  if (!errorMessage) return "Ocurrió un error inesperado. Inténtalo de nuevo.";

  const msg = errorMessage.toLowerCase();

  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.";
  }
  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
    return "Tu correo electrónico aún no ha sido confirmado. Revisa tu invitación o solicita ayuda para verificar la cuenta.";
  }
  if (msg.includes("rate limit") || msg.includes("over_email_send_rate_limit")) {
    return "Demasiados intentos en poco tiempo. Por favor espera unos minutos.";
  }
  if (msg.includes("user already registered") || msg.includes("already registered") || msg.includes("already exists")) {
    return "Ya existe una cuenta con este correo electrónico. Por favor inicia sesión.";
  }
  if (msg.includes("same password") || msg.includes("different from the old") || msg.includes("same_password")) {
    return "Elige una contraseña nueva distinta de la anterior.";
  }
  if (msg.includes("weak_password") || msg.includes("password should contain")) {
    return "Elige una contraseña más segura con letras, números y símbolos.";
  }
  if (msg.includes("password should be at least")) {
    return "La contraseña no cumple la longitud mínima requerida. Usa al menos 8 caracteres.";
  }
  if (/network|fetch failed|failed to fetch|load failed|timeout|abort|tardó demasiado/.test(msg)) {
    return "Error de conexión con el servidor. Revisa tu conexión a internet.";
  }

  return errorMessage;
}

/**
 * Sign up a new customer/artist account using email and password.
 * Uses Supabase's public signup flow so configured email verification and
 * signup rate limits remain in force. The server only syncs the commerce profile.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  fullName?: string,
  giftContextId?: string | null
): Promise<SignUpResult> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const supabase = createClient();
    // 1. Register through the server endpoint
    const res = await fetchAuth("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cleanEmail,
        password,
        fullName: fullName?.trim() || "",
        ...(giftContextId ? { giftContextId } : {}),
      }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      return {
        user: null,
        session: null,
        error: { message: translateAuthError(data.error || "Error al crear la cuenta.") },
      };
    }

    // With email confirmation enabled there is no session yet. Do not attempt
    // a password login here; it would fail before the user verifies ownership.
    if (data.requiresEmailConfirmation) {
      return { user: null, session: null, requiresEmailConfirmation: true, error: null };
    }

    // 2. Automatically sign in on the client to establish cookie/session in the browser
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (signInError) {
      console.warn("[signUpWithEmail] Account created, but initial auto sign-in required manual step:", signInError);
      return {
        user: data.user,
        session: null,
        requiresEmailConfirmation: false,
        error: null,
      };
    }

    return {
      user: signInData.user,
      session: signInData.session,
      requiresEmailConfirmation: false,
      error: null,
    };
  } catch (err) {
    console.error("[signUpWithEmail] Network or server error:", err);
    return {
      user: null,
      session: null,
      error: { message: translateAuthError(err instanceof Error ? err.message : "Error al conectar con el servidor.") },
    };
  }
}

/**
 * Sign in using email and password on the client.
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<SignInResult> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) return { user: null, session: null, error: { message: translateAuthError(error.message) } };
    return { user: data.user, session: data.session, error: null };
  } catch (error) {
    return {
      user: null,
      session: null,
      error: { message: translateAuthError(error instanceof Error ? error.message : "Error de conexión.") },
    };
  }
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

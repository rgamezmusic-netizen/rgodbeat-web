import { createClient } from "@/lib/supabase/client";
import { AuthError, User, Session } from "@supabase/supabase-js";

export interface SignInResult {
  user: User | null;
  session?: Session | null;
  error: AuthError | { message: string; name?: string } | null;
}

export interface SignUpResult {
  user: User | null;
  session: Session | null;
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
    return "Tu correo electrónico aún no ha sido confirmado. Ya lo hemos activado automáticamente, por favor vuelve a ingresar.";
  }
  if (msg.includes("rate limit") || msg.includes("over_email_send_rate_limit")) {
    return "Demasiados intentos en poco tiempo. Por favor espera unos minutos.";
  }
  if (msg.includes("user already registered") || msg.includes("already registered") || msg.includes("already exists")) {
    return "Ya existe una cuenta con este correo electrónico. Por favor inicia sesión.";
  }
  if (msg.includes("password should be at least")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (msg.includes("network") || msg.includes("fetch failed")) {
    return "Error de conexión con el servidor. Revisa tu conexión a internet.";
  }

  return errorMessage;
}

/**
 * Sign up a new customer/artist account using email and password.
 * Routes through secure server API (/api/auth/register) to automatically
 * confirm the email, sync the customer profile, and bypass Supabase SMTP rate limits.
 * Immediately establishes a valid browser session upon creation.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  fullName?: string
): Promise<SignUpResult> {
  const cleanEmail = email.trim().toLowerCase();
  const supabase = createClient();

  try {
    // 1. Register through the server endpoint
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cleanEmail,
        password,
        fullName: fullName?.trim() || "",
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
        error: null,
      };
    }

    return {
      user: signInData.user,
      session: signInData.session,
      error: null,
    };
  } catch (err: any) {
    console.error("[signUpWithEmail] Network or server error:", err);
    return {
      user: null,
      session: null,
      error: { message: translateAuthError(err.message || "Error al conectar con el servidor.") },
    };
  }
}

/**
 * Sign in using email and password on the client.
 * Features automatic recovery if the account was previously unconfirmed.
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<SignInResult> {
  const cleanEmail = email.trim().toLowerCase();
  const supabase = createClient();

  let { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  // Auto-recovery: If email is unconfirmed, confirm it on the server and retry
  if (error && (error.message?.toLowerCase().includes("not confirmed") || error.code === "email_not_confirmed")) {
    try {
      console.log("[signInWithEmail] Unconfirmed email detected, auto-confirming on server...");
      const confirmRes = await fetch("/api/auth/confirm-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      if (confirmRes.ok) {
        // Retry sign in
        const retry = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (!retry.error) {
          data = retry.data;
          error = null;
        }
      }
    } catch (confirmErr) {
      console.warn("[signInWithEmail] Auto-confirm attempt failed:", confirmErr);
    }
  }

  if (error) {
    return {
      user: null,
      session: null,
      error: { message: translateAuthError(error.message) },
    };
  }

  return {
    user: data.user,
    session: data.session,
    error: null,
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

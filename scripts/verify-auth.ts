import * as fs from "fs";
import * as path from "path";

// Populate process.env from .env.local for standalone execution
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

import { NextRequest } from "next/server";
import { updateSession } from "../utils/supabase/middleware";

async function runAuthVerification() {
  console.log("==================================================================");
  console.log("🔐 RGODBEAT 2.0 — ADMIN AUTHENTICATION VERIFICATION");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // 1. Verify Auth Helper Module Files Exist
  const serverAuthPath = path.resolve(__dirname, "../lib/auth/server.ts");
  const clientAuthPath = path.resolve(__dirname, "../lib/auth/client.ts");
  const loginPagePath = path.resolve(__dirname, "../app/login/page.tsx");
  const adminLayoutPath = path.resolve(__dirname, "../app/admin/layout.tsx");
  const adminPagePath = path.resolve(__dirname, "../app/admin/page.tsx");

  assert(fs.existsSync(serverAuthPath), "Server auth helper file exists (lib/auth/server.ts)");
  assert(fs.existsSync(clientAuthPath), "Client auth helper file exists (lib/auth/client.ts)");
  assert(fs.existsSync(loginPagePath), "Login page exists (app/login/page.tsx)");
  assert(fs.existsSync(adminLayoutPath), "Admin layout exists with server guard (app/admin/layout.tsx)");
  assert(fs.existsSync(adminPagePath), "Admin dashboard foundation exists (app/admin/page.tsx)");

  // 2. Security Check: Ensure NO public signup route exists
  const signupPagePath = path.resolve(__dirname, "../app/signup");
  const registerPagePath = path.resolve(__dirname, "../app/register");
  assert(!fs.existsSync(signupPagePath) && !fs.existsSync(registerPagePath), "No public signup or registration routes exist (Security guarantee)");

  // 3. Security Check: Environment variables inspection
  const envPath = path.resolve(__dirname, "../.env.local");
  const envContent = fs.readFileSync(envPath, "utf8");
  const publicKeys = envContent
    .split("\n")
    .map((line) => line.trim().split("=")[0])
    .filter((k) => k.startsWith("NEXT_PUBLIC_"));

  assert(
    publicKeys.every(
      (k) =>
        k === "NEXT_PUBLIC_SUPABASE_URL" ||
        k === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ||
        k === "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
    ),
    "No secret keys exposed via NEXT_PUBLIC_ variables (Only Supabase and Stripe public keys present)"
  );

  // 4. Test Middleware Route Protection: Unauthenticated request to /admin redirects to /login
  try {
    const adminReq = new NextRequest("http://localhost:3001/admin");
    const adminRes = await updateSession(adminReq);

    const isRedirect = adminRes.status === 307 || adminRes.status === 308 || adminRes.status === 302 || adminRes.headers.get("location") !== null;
    const location = adminRes.headers.get("location");

    assert(
      isRedirect && !!location && location.includes("/login"),
      "Middleware intercepts unauthenticated request to /admin and redirects to /login",
      location || `status: ${adminRes.status}`
    );
  } catch (err: any) {
    assert(false, "Middleware unauthenticated /admin test", err.message);
  }

  // 5. Test Middleware Route Protection: Unauthenticated request to /admin/nested redirects to /login
  try {
    const nestedAdminReq = new NextRequest("http://localhost:3001/admin/beats/new");
    const nestedAdminRes = await updateSession(nestedAdminReq);

    const location = nestedAdminRes.headers.get("location");
    assert(
      !!location && location.includes("/login") && location.includes("redirect="),
      "Middleware preserves original destination in redirect query parameter (/login?redirect=...)",
      location || `status: ${nestedAdminRes.status}`
    );
  } catch (err: any) {
    assert(false, "Middleware nested /admin redirect query test", err.message);
  }

  // 6. Test Middleware Public Pass-through: Public route /beats is NOT redirected
  try {
    const beatsReq = new NextRequest("http://localhost:3001/beats");
    const beatsRes = await updateSession(beatsReq);

    const location = beatsRes.headers.get("location");
    assert(
      !location || !location.includes("/login"),
      "Public route /beats passes through without redirect"
    );
  } catch (err: any) {
    assert(false, "Middleware public route pass-through test", err.message);
  }

  // 7. Test Middleware Public Pass-through: Homepage / is NOT redirected
  try {
    const homeReq = new NextRequest("http://localhost:3001/");
    const homeRes = await updateSession(homeReq);

    const location = homeRes.headers.get("location");
    assert(
      !location || !location.includes("/login"),
      "Homepage / passes through without redirect"
    );
  } catch (err: any) {
    assert(false, "Middleware homepage pass-through test", err.message);
  }

  console.log("==================================================================");
  console.log(`AUTH VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAuthVerification();

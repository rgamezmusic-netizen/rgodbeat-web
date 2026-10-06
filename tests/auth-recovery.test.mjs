import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadSource } from './helpers/rg-fixtures.mjs';
const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');

test('Studio preparation does not wait for autoplay permission; playback still resumes audio', async () => {
  const { AudioEngine } = loadSource('lib/studio/audio/audioEngine.ts');
  const engine = new AudioEngine({});
  let resumed = 0;
  const context = { state: 'suspended', resume: async () => { resumed++; } };
  engine.ctx = context;
  assert.equal(await engine.ensureAudioContext({ resume: false }), context);
  assert.equal(resumed, 0);
  await engine.ensureAudioContext();
  assert.equal(resumed, 1);
});

test('startup finishes even when resume would wait forever for a browser gesture', async () => {
  const { AudioEngine } = loadSource('lib/studio/audio/audioEngine.ts');
  const engine = new AudioEngine({});
  let resumed = 0;
  engine.ctx = { state: 'suspended', resume() { resumed++; return new Promise(() => {}); } };
  assert.equal(await engine.ensureAudioContext({ resume: false }), engine.ctx);
  assert.equal(resumed, 0);
  const app = readFileSync('components/studio/StudioApp.tsx', 'utf8');
  assert.match(app, /audioEngine\.ensureAudioContext\(\{ resume: false \}\)/);
  assert.match(app, /cancelled = true;\s*audioEngine\.dispose\(\)/);
});

test('SDK timeout applies only to Auth; database and storage retain their response streams', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const response = new Response('local response');
  globalThis.fetch = async (_input, init) => { requests.push(init); return response.clone(); };
  try {
    const { fetchSupabaseAuth } = loadSource('lib/auth/request.ts');
    const controller = new AbortController();
    for (const path of ['/rest/v1/beats', '/storage/v1/object/audio.wav']) {
      const result = await fetchSupabaseAuth('https://local.invalid' + path, { signal: controller.signal });
      assert.equal(requests.at(-1).signal, controller.signal);
      assert.equal(result.bodyUsed, false);
    }
    await fetchSupabaseAuth('https://local.invalid/auth/v1/user', { signal: controller.signal });
    assert.notEqual(requests.at(-1).signal, controller.signal);
  } finally { globalThis.fetch = originalFetch; }
});

test('sign-in and session restore preserve the verified SDK user/session; logout reports failure', async () => {
  const user = { id: 'local-user' }, session = { user, access_token: 'local-only' };
  let signedOut = false;
  const failure = { message: 'network unavailable' };
  const auth = { signInWithPassword: async input => {
    assert.equal(input.email, 'local@example.invalid'); return { data: { user, session }, error: null };
  }, getUser: async () => ({ data: { user }, error: null }), signOut: async () => {
    signedOut = true; return { error: failure };
  } };
  const client = loadSource('lib/auth/client.ts', { '@/lib/supabase/client': { createClient: () => ({ auth }) } });
  assert.deepEqual(await client.signInWithEmail(' LOCAL@EXAMPLE.INVALID ', 'local-only'), { user, session, error: null });
  assert.equal(await client.getBrowserUser(), user);
  assert.deepEqual(await client.signOutClient(), { error: failure }); assert.equal(signedOut, true);
  auth.signOut = async () => ({ error: null });
  assert.deepEqual(await client.signOutClient(), { error: null });
  const app = readFileSync('components/studio/StudioApp.tsx', 'utf8');
  assert.match(app, /const \{ error \} = await signOutClient\(\);\s*if \(error\) throw error;\s*setSessionStorageUser\(null\)/);
});

test('middleware session refresh keeps cookies, avoids login loops and rejects unsafe destinations', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local.supabase.invalid'; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-public-key';
  try {
    const { middleware } = loadSource('middleware.ts', {
      '@supabase/ssr': { createServerClient: (_url, _key, options) => ({ auth: { getUser: async () => {
        options.cookies.setAll([{ name: 'local-session', value: 'local-refreshed', options: { path: '/' } }]);
        return { data: { user: { id: 'local-user' } } };
      } } }) }, '@/lib/auth/admin': { isSiteAdmin: () => false },
    });
    const login = await middleware(new NextRequest('https://local.invalid/login?redirect=%2Fstudio'));
    assert.equal(login.headers.get('location'), 'https://local.invalid/studio');
    assert.equal(login.cookies.get('local-session').value, 'local-refreshed');
    assert.equal((await middleware(new NextRequest('https://local.invalid/studio'))).status, 200);
    const unsafe = await middleware(new NextRequest('https://local.invalid/login?redirect=https://attacker.invalid'));
    assert.equal(unsafe.headers.get('location'), 'https://local.invalid/account');
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test('interrupted sign-in returns a useful error instead of rejecting the form', async () => {
  const { signInWithEmail } = loadSource('lib/auth/client.ts', {
    '@/lib/supabase/client': { createClient: () => ({ auth: { signInWithPassword: async () => { throw new TypeError('Failed to fetch'); } } }) },
  });
  const result = await signInWithEmail('local@example.invalid', 'local-only-password');
  assert.equal(result.user, null);
  assert.match(result.error.message, /conexión/i);
});

test('authentication timeout includes a stalled response body and releases the request', async () => {
  const originalFetch = globalThis.fetch, originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 20_000 ? 5 : delay, ...args);
  globalThis.fetch = async (_input, init) => new Response(new ReadableStream({
    start(controller) { init.signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true }); },
  }));
  try {
    const { fetchAuth } = loadSource('lib/auth/request.ts');
    await assert.rejects(fetchAuth('https://local.invalid/'), /tardó demasiado/);
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimeout; }
});

test('recovery supports email token hash, older implicit links and PKCE without exposing tokens in the URL', async () => {
  const originalWindow = globalThis.window;
  try {
    for (const [link, expected] of [
      ['?token_hash=local-token&type=recovery', 'otp'],
      ['#access_token=local-access&refresh_token=local-refresh&type=recovery', 'session'],
      ['?code=local-code&sb_flow_id=local-flow', 'code'],
    ]) {
      let cleaned;
      const calls = [];
      globalThis.window = { location: { href: 'https://www.rgodbeat.com/reset-password' + link },
        history: { state: null, replaceState(_state, _title, value) { cleaned = value; } } };
      const auth = { verifyOtp: async () => { calls.push('otp'); return {}; },
        setSession: async () => { calls.push('session'); return {}; },
        exchangeCodeForSession: async () => { calls.push('code'); return { data: { redirectType: 'recovery' } }; },
        getUser: async () => ({ data: { user: { id: 'local-user' } }, error: null }) };
      const { resolveAuthRecovery } = loadSource('lib/auth/recovery.ts', { '@/lib/supabase/client': { createClient: () => ({ auth }) } });
      const result = await resolveAuthRecovery();
      assert.equal(result.error, null); assert.equal(result.recovery, true);
      assert.deepEqual(calls, [expected]); assert.equal(cleaned, '/reset-password');
    }
  } finally { globalThis.window = originalWindow; }
});

test('invalid recovery links cannot use an existing session as a successful password recovery', async () => {
  const originalWindow = globalThis.window;
  let cleaned;
  globalThis.window = { location: { href: 'https://www.rgodbeat.com/reset-password#error=access_denied&error_code=otp_expired' }, history: { replaceState(_state,_title,value) {cleaned=value;} } };
  try {
    const { resolveAuthRecovery } = loadSource('lib/auth/recovery.ts', { '@/lib/supabase/client': { createClient() { throw Error('Must not use old session'); } } });
    const result = await resolveAuthRecovery(); assert.equal(result.user, null); assert.match(result.error, /venció/);
    assert.equal(cleaned,'/reset-password');
  } finally { globalThis.window = originalWindow; }
});

test('opening the reset page while signed in is not enough to authorize a password change', async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { href: 'https://www.rgodbeat.com/reset-password' },
    history: { replaceState() {} },
  };
  try {
    const { resolveAuthRecovery } = loadSource('lib/auth/recovery.ts', {
      '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'already-signed-in' } }, error: null }) } }) },
    });
    const result = await resolveAuthRecovery();
    assert.equal(result.user, null);
    assert.match(result.error, /enlace venció/i);
  } finally { globalThis.window = originalWindow; }
});

test('recovery accepts the actual first-party domain redirect, rejects other origins and sends no privileged credentials', async () => {
  let requests = 0;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local.supabase.invalid'; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-public-key';
  try {
    const { POST } = loadSource('app/api/auth/recover/route.ts', {
      '@supabase/supabase-js': { createClient(_url, key, options) {
        assert.equal(key, 'local-public-key'); assert.equal(options.auth.flowType, 'implicit'); assert.equal(options.auth.persistSession, false);
        return { auth: { resetPasswordForEmail: async (_email, { redirectTo }) => {
          requests++; assert.equal(redirectTo, 'https://www.rgodbeat.com/reset-password?next=%2Fstudio'); return { error: null };
        } } };
      } },
    });
    for (const origin of ['https://www.rgodbeat.com', 'https://rgodbeat.com', 'https://attacker.invalid']) {
      const response = await POST(new NextRequest('https://www.rgodbeat.com/api/auth/recover', {
        method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify({ email: 'local@example.invalid', next: '/studio' }),
      }));
      assert.equal(response.status, origin.includes('attacker') ? 403 : 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(requests, 2);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test('registration respects Supabase email verification and never auto-confirms with the service role', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local.supabase.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-public-key';
  let customerSyncs = 0;
  let signupOptions;
  try {
    const { POST } = loadSource('app/api/auth/register/route.ts', {
      '@supabase/supabase-js': { createClient(_url, key, options) {
        assert.equal(key, 'local-public-key');
        assert.equal(options.auth.persistSession, false);
        return { auth: { signUp: async input => {
          signupOptions = input;
          return { data: { user: { id: 'private-user-id', identities: [{ id: 'identity' }] }, session: null }, error: null };
        } } };
      } },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
        assert.equal(table, 'customers');
        return { upsert: async values => { customerSyncs++; assert.equal(values.email, 'local@example.invalid'); return { error: null }; } };
      } }) },
      '@/lib/auth/request': { fetchAuth: async (_input, init) => fetch(_input, init) },
    });

    const response = await POST(new NextRequest('https://www.rgodbeat.com/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://www.rgodbeat.com' },
      body: JSON.stringify({ email: 'Local@Example.Invalid', password: 'a-safe-password', fullName: 'Artist' }),
    }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(body.requiresEmailConfirmation, true);
    assert.equal('user' in body, false);
    assert.equal(JSON.stringify(signupOptions).includes('email_confirm'), false);
    assert.equal(signupOptions.options.emailRedirectTo, 'https://www.rgodbeat.com/login?confirmed=1');
    // The commercial customer link is deferred until Auth email verification.
    assert.equal(customerSyncs, 0);

    const denied = await POST(new NextRequest('https://www.rgodbeat.com/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://attacker.invalid' },
      body: JSON.stringify({ email: 'local@example.invalid', password: 'a-safe-password' }),
    }));
    assert.equal(denied.status, 403);
    assert.equal(customerSyncs, 0);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test('registration avoids revealing duplicate account identity', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local.supabase.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-public-key';
  let customerSyncs = 0;
  try {
    const { POST } = loadSource('app/api/auth/register/route.ts', {
      '@supabase/supabase-js': { createClient: () => ({ auth: { signUp: async () => ({
        data: { user: { id: 'obfuscated-user-id', identities: [] }, session: null }, error: null,
      }) } }) },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ upsert: async () => { customerSyncs++; return { error: null }; } }) }) },
      '@/lib/auth/request': { fetchAuth: async (_input, init) => fetch(_input, init) },
    });
    const response = await POST(new NextRequest('https://rgodbeat.com/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'local@example.invalid', password: 'a-safe-password' }),
    }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { success: true, requiresEmailConfirmation: true });
    assert.equal(customerSyncs, 0);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test('gift signup confirmation returns to an opaque context without carrying the claim secret', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local.supabase.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-public-key';
  let signupOptions;
  try {
    const { POST } = loadSource('app/api/auth/register/route.ts', {
      '@supabase/supabase-js': { createClient: () => ({ auth: { signUp: async input => {
        signupOptions = input;
        return { data: { user: { id: 'private-user', identities: [{ id: 'identity' }] }, session: null }, error: null };
      } } }) },
      '@/lib/commerce/admin-client': { createCommerceAdminClient: () => ({ rpc: async (name, args) => {
        assert.equal(name, 'rg_resolve_gift_claim_context');
        assert.equal(args.p_context_id, 'a0000000-0000-4000-8000-000000000001');
        return { data: [{ claim_token_hash: 'private-hash', expires_at: '2030-01-01T00:00:00Z' }], error: null };
      } }) },
      '@/lib/auth/request': { fetchAuth: async (_input, init) => fetch(_input, init) },
    });
    const response = await POST(new NextRequest('https://www.rgodbeat.com/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://www.rgodbeat.com' },
      body: JSON.stringify({ email: 'recipient@example.invalid', password: 'a-safe-password', giftContextId: 'a0000000-0000-4000-8000-000000000001' }),
    }));
    assert.equal(response.status, 200);
    const redirect = new URL(signupOptions.options.emailRedirectTo);
    assert.equal(redirect.pathname, '/login');
    assert.equal(redirect.searchParams.get('confirmed'), '1');
    const destination = new URL(redirect.searchParams.get('redirect'), 'https://www.rgodbeat.com');
    assert.equal(destination.pathname, '/gifts/claim');
    assert.equal(destination.searchParams.get('context'), 'a0000000-0000-4000-8000-000000000001');
    assert.doesNotMatch(signupOptions.options.emailRedirectTo, /private-hash|token=/);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test('signup does not try to log in before the email owner confirms the address', async () => {
  const originalFetch = globalThis.fetch;
  let passwordLoginAttempts = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, requiresEmailConfirmation: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
  try {
    const { signUpWithEmail } = loadSource('lib/auth/client.ts', {
      '@/lib/supabase/client': { createClient: () => ({ auth: { signInWithPassword: async () => {
        passwordLoginAttempts++;
        return { data: {}, error: null };
      } } }) },
    });
    const result = await signUpWithEmail('local@example.invalid', 'a-safe-password');
    assert.deepEqual(result, { user: null, session: null, requiresEmailConfirmation: true, error: null });
    assert.equal(passwordLoginAttempts, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('Auth outages leave public pages available and protected pages closed', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local.supabase.invalid'; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-public-key';
  try {
    const { middleware } = loadSource('middleware.ts', {
      '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => { throw new TypeError('Failed to fetch'); } } }) },
    });
    assert.equal((await middleware(new NextRequest('https://www.rgodbeat.com/'))).status, 200);
    for (const path of ['/account', '/admin']) {
      const response = await middleware(new NextRequest('https://www.rgodbeat.com' + path));
      assert.equal(response.status, 307); assert.match(response.headers.get('location'), /\/login\?redirect=/);
    }
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

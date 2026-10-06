import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
  globalThis.window = { location: { href: 'https://www.rgodbeat.com/reset-password#error=access_denied&error_code=otp_expired' }, history: { replaceState() {} } };
  try {
    const { resolveAuthRecovery } = loadSource('lib/auth/recovery.ts', { '@/lib/supabase/client': { createClient() { throw Error('Must not use old session'); } } });
    const result = await resolveAuthRecovery(); assert.equal(result.user, null); assert.match(result.error, /venció/);
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

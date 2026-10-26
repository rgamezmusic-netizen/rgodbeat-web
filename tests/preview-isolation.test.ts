import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { getPublicStorageUrl } from '@/lib/storage/public';
import { getSupabasePublicConfig, requireSupabasePublicConfig } from '@/lib/supabase/config';

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function restoreSupabaseEnvironment() {
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
}

test('public storage returns no URL when Preview has no Supabase configuration', () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    assert.equal(getSupabasePublicConfig(), null);
    assert.equal(getPublicStorageUrl('covers/beat-id/cover.png'), null);
    assert.equal(getPublicStorageUrl('previews/beat-id/preview.mp3'), null);
    assert.throws(requireSupabasePublicConfig, /Supabase no está configurado para este entorno/);
  } finally {
    restoreSupabaseEnvironment();
  }
});

test('public storage uses only the explicitly configured Supabase project', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://preview-project.supabase.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'preview-public-key-fixture';
  try {
    assert.deepEqual(getSupabasePublicConfig(), {
      url: 'https://preview-project.supabase.invalid',
      key: 'preview-public-key-fixture',
    });
    assert.equal(
      getPublicStorageUrl('covers/beat-id/cover.png'),
      'https://preview-project.supabase.invalid/storage/v1/object/public/rgodbeat-public/covers/beat-id/cover.png',
    );
  } finally {
    restoreSupabaseEnvironment();
  }
});

test('application code has no hard-coded public Supabase storage endpoint', async () => {
  const sourceFiles = [
    'lib/storage/public.ts',
    'lib/mock-data.ts',
    'lib/supabase/client.ts',
    'lib/supabase/server.ts',
    'lib/supabase/admin.ts',
    'utils/supabase/client.ts',
    'utils/supabase/server.ts',
    'utils/supabase/middleware.ts',
    'contexts/PlayerContext.tsx',
    'components/auth/RecoveryLinkRedirect.tsx',
    'next.config.ts',
    'middleware.ts',
    'app/login/page.tsx',
    'app/account/page.tsx',
    'app/tickets/[purchaseId]/page.tsx',
    'app/gifts/claim/page.tsx',
    'app/test-supabase/page.tsx',
  ];
  const endpoint = /https?:\/\/[^\s"'`]+\.supabase\.co\/storage\/v1\/object\/public/i;
  for (const file of sourceFiles) {
    const source = await readFile(resolve(process.cwd(), file), 'utf8');
    assert.doesNotMatch(source, endpoint, `${file} must use configuration or no remote asset`);
  }
});

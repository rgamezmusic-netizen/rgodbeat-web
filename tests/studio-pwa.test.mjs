import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadSource } from './helpers/rg-fixtures.mjs';
import sharp from 'sharp';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
const require = createRequire(import.meta.url);
const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server');

test('Studio keeps the existing install identity and launches inside its explicit scope', () => {
  const origin = 'https://studio-fixture.invalid';
  const start = new URL(manifest.start_url, origin);
  assert.equal(new URL(manifest.id, origin).href, new URL('/studio', origin).href, 'same id as the previous implicit start_url identity');
  assert.equal(start.pathname, '/studio');
  assert.equal(manifest.scope, '/studio', 'bare /studio must remain inside scope without adding redirects');
  assert.ok(start.href.startsWith(new URL(manifest.scope, origin).href));
  for (const path of ['/', '/beats', '/account', '/admin/youtube', '/api/studio/project']) {
    assert.equal(new URL(path, origin).href.startsWith(new URL(manifest.scope, origin).href), false);
  }
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'any');
  assert.equal(manifest.lang, 'es');
});

test('all declared install icons have real sizes; the black RG adaptive icon keeps its mark inside the safe circle', async () => {
  assert.equal(manifest.name, 'RG');
  assert.equal(manifest.short_name, 'RG');
  assert.equal(manifest.background_color, '#000000');
  assert.equal(manifest.theme_color, '#000000');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('/') && !icon.src.includes('..'));
    const bytes = readFileSync('public' + icon.src);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
    assert.equal(icon.type, 'image/png');
    if (icon.purpose?.includes('maskable')) {
      const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
      assert.deepEqual([...data.subarray(0,3)],[0,0,0]);
      for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
        const offset=(y*info.width+x)*info.channels;
        if(data[offset]>16||data[offset+1]>16||data[offset+2]>16) assert.ok(Math.hypot(x-info.width/2,y-info.height/2)<info.width*0.4,'RG stays in the adaptive safe zone');
      }
    }
  }
});

test('Studio provides its own title, Apple icon and accessible viewport without branding the store as Studio', () => {
  const studio = loadSource('app/studio/layout.tsx');
  const root = loadSource('app/layout.tsx', { './globals.css': {}, '@/components/providers/AppProviders': {} });
  assert.equal(studio.metadata.applicationName, manifest.name);
  assert.equal(studio.metadata.manifest, '/manifest.json');
  assert.match(studio.metadata.title, /RGODBEAT Studio/);
  assert.equal(studio.metadata.appleWebApp.title, manifest.name);
  assert.equal(studio.metadata.icons.apple[0].url, '/apple-touch-icon.png');
  assert.equal(studio.viewport.userScalable, true);
  assert.ok(studio.viewport.maximumScale >= 2);
  assert.equal(root.metadata.manifest, '/manifest.json', 'the public site can promote the scoped Studio app');
  assert.equal(root.metadata.appleWebApp, undefined);
});

test('installation manifest is public while auth and API middleware coverage remains intact', () => {
  const { config } = loadSource('middleware.ts');
  for (const url of ['/manifest.json', '/manifest.json?version=test', '/sw.js', '/sw.js?version=test', '/icons/icon-512.png', '/apple-touch-icon.png']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), false, url);
  }
  for (const url of ['/studio', '/account', '/admin/youtube', '/login', '/api/studio/project', '/api/studio/youtube/publish', '/api/manifest.json', '/api/sw.js']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), true, url);
  }
});

test('manifest is served with the PWA media type without introducing offline caching headers', async () => {
  const config = loadSource('next.config.ts').default;
  const headers = (await config.headers()).find(entry => entry.source === '/manifest.json').headers;
  assert.equal(headers.find(header => header.key === 'Content-Type').value, 'application/manifest+json');
  assert.equal(headers.some(header => header.key.toLowerCase() === 'cache-control'), false);
});

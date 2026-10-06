import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');

// Execute the actual route/module source with only its external dependencies replaced.
export function loadSource(file, replacements = {}) {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const loadedModule = { exports: {} }; cache.set(path, loadedModule);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const localRequire = (name) => {
      if (Object.hasOwn(replacements, name)) return replacements[name];
      if (name === 'server-only') return {};
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? resolve(name.slice(2)) : resolve(dirname(path), name);
        const found = [base, base + '.ts', base + '.tsx'].find(existsSync);
        if (found) return load(found);
      }
      return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: path })(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load(resolve(file));
}

// Public fixture surfaces match fields verified in production OpenAPI.
// Auth is not exposed there: varchar exercises compatible email catalog metadata,
// not a claim about the production auth column's exact type.
// This is an isolated test database, never the configured Supabase connection.
export const dependencyFixture = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email varchar(255));
CREATE TABLE public.beats(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text,slug text,cover_path text,published boolean DEFAULT true);
CREATE TABLE public.customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL UNIQUE,name text,studio_access_until timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE public.youtube_export_jobs(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,status text,youtube_video_id text,finished_at timestamptz,created_at timestamptz DEFAULT now(),artist_name text,title text,privacy text);
CREATE TABLE public.youtube_channel_settings(id smallint PRIMARY KEY,channel_id text,encrypted_refresh_token text);
CREATE TABLE public.orders(id uuid PRIMARY KEY,customer_id uuid,stripe_checkout_session_id text,payment_status text);
CREATE TABLE public.order_items(id uuid PRIMARY KEY,order_id uuid,beat_id uuid,license_type_id uuid);
CREATE TABLE public.purchases(id uuid PRIMARY KEY,customer_id uuid,beat_id uuid,order_id uuid,order_item_id uuid);
CREATE TABLE public.license_types(id uuid PRIMARY KEY);
CREATE TABLE public.beat_licenses(id uuid PRIMARY KEY);
CREATE TABLE public.beat_votes(beat_id uuid);
CREATE TABLE public.beat_comments(beat_id uuid);
CREATE TABLE public.beat_ranking_history(id uuid PRIMARY KEY);
`;

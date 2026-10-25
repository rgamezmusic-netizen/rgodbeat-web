import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './helpers/rg-fixtures.mjs';
const { studioVideoMetadata } = loadSource('lib/youtube/metadata.ts');

test('defaults include the beat, artist, production credit, existing Top 23 information and website links', () => {
  const metadata = studioVideoMetadata({ artistName: 'LARY', beatTitle: 'WINGS', beatGenre: 'Trap', beatBpm: 126, beatKey: 'Fm' });
  assert.equal(metadata.title, 'WINGS x LARY | TOP 23 Prod RGodbeat');
  for (const value of ['Artista: LARY', 'Beat: WINGS', '126 BPM', 'Tonalidad: Fm', '14 días', 'RG Coins', '/ranking/season', '/studio', '/beats', '#Trap', '#LARY']) assert.ok(metadata.description.includes(value), value);
  assert.ok(Buffer.byteLength(metadata.description, 'utf8') < 5000);
});

test('long names preserve the production suffix within the title limit and sanitize tags', () => {
  const metadata = studioVideoMetadata({ artistName: '<Artista>\n' + 'ñ'.repeat(100), beatTitle: 'Beat'.repeat(40), beatGenre: 'R&B / Trap' });
  assert.ok(metadata.title.length <= 100);
  assert.ok(metadata.title.endsWith(' | TOP 23 Prod RGodbeat'));
  assert.ok(!/[<>\n]/.test(metadata.title));
  assert.ok(metadata.description.includes('#RBTrap'));
  assert.ok(!metadata.description.includes('undefined'));
});

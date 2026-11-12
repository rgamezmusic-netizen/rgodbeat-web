import test from 'node:test';
import assert from 'node:assert/strict';
import { esTranslations } from '../lib/studio/i18n/es.js';
import { enTranslations } from '../lib/studio/i18n/en.js';

test('Studio i18n: ES and EN dictionaries contain matching structure and non-empty strings', () => {
  const sections = ['common', 'topBar', 'player', 'presets', 'gallery', 'startup', 'export', 'settings', 'timeline'];

  for (const section of sections) {
    assert.ok(esTranslations[section], `esTranslations missing section: ${section}`);
    assert.ok(enTranslations[section], `enTranslations missing section: ${section}`);

    const esKeys = Object.keys(esTranslations[section]);
    const enKeys = Object.keys(enTranslations[section]);

    assert.deepEqual(esKeys.sort(), enKeys.sort(), `Keys mismatch in section: ${section}`);

    for (const key of esKeys) {
      assert.equal(typeof esTranslations[section][key], 'string', `es.${section}.${key} is not string`);
      assert.ok(esTranslations[section][key].trim().length > 0, `es.${section}.${key} is empty`);
      assert.equal(typeof enTranslations[section][key], 'string', `en.${section}.${key} is not string`);
      assert.ok(enTranslations[section][key].trim().length > 0, `en.${section}.${key} is empty`);
    }
  }

  // Key translations sanity check
  assert.equal(esTranslations.topBar.edit, 'Edición');
  assert.equal(enTranslations.topBar.edit, 'Edit');
  assert.equal(esTranslations.topBar.saveCloud, 'Guardar en la Nube');
  assert.equal(enTranslations.topBar.saveCloud, 'Save to Cloud');
  assert.equal(esTranslations.topBar.myProjects, 'Mis proyectos');
  assert.equal(enTranslations.topBar.myProjects, 'My Projects');
  assert.equal(esTranslations.player.tempo, 'TEMPO');
  assert.equal(enTranslations.player.tempo, 'TEMPO');
  assert.equal(esTranslations.presets.pro, 'Voz Pro');
  assert.equal(enTranslations.presets.pro, 'Pro Vocal');
  assert.equal(esTranslations.gallery.title, 'Mis proyectos en la nube');
  assert.equal(enTranslations.gallery.title, 'My Cloud Projects');
});


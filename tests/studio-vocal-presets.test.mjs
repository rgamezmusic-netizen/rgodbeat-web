import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

const {
  VOCAL_FX_PRESETS,
  getVocalPresetById,
  applyVocalPreset,
  resetVocalFXToNatural,
} = loadSource('lib/studio/audio/vocalPresets.ts');
const { restoredVocalFX } = loadSource('lib/studio/audio/restoredFX.ts');

function sampleFx() {
  return {
    tune: {
      enabled: true,
      speed: 0.7,
      rootKey: 'F#',
      scaleMode: 'minor',
      humanize: 0.15,
      tonalityId: 'Fsm_A',
    },
    eq: { lowCut: true, lowCutFreq: 100, low: 0, mid: 0, high: 0 },
    comp: { amount: 0.35 },
    saturation: { amount: 0.15 },
    delay: { division: 'OFF', mix: 0.25, feedback: 0.35 },
    reverb: { preset: 'PLATE', mix: 0.2 },
  };
}

test('exposes exactly 5 essential vocal presets including Radio', () => {
  assert.equal(VOCAL_FX_PRESETS.length, 5);
  const radio = getVocalPresetById('radio');
  assert.ok(radio, 'Radio preset must exist');
  assert.equal(radio.fx.eq.lowCut, true);
  assert.ok(radio.fx.eq.lowCutFreq >= 400);
  assert.equal(radio.fx.eq.highCut, true);
  assert.ok(radio.fx.eq.highCutFreq <= 3500);
  assert.ok(radio.fx.saturation.amount >= 0.5);

  const leadRoles = VOCAL_FX_PRESETS.filter((p) => p.role === 'Principal');
  const fxRoles = VOCAL_FX_PRESETS.filter((p) => p.role === 'Efecto');
  assert.equal(leadRoles.length, 2);
  assert.equal(fxRoles.length, 3);
});

test('applyVocalPreset applies FX chain while preserving Auto-Tune key and speed', () => {
  const base = sampleFx();
  const withRadio = applyVocalPreset(base, 'radio');

  assert.equal(withRadio.presetId, 'radio');
  assert.equal(withRadio.eq.lowCutFreq, 480);
  assert.equal(withRadio.eq.highCutFreq, 3100);
  assert.deepEqual(withRadio.tune, base.tune);

  const withHall = applyVocalPreset(withRadio, 'space_hall');
  assert.equal(withHall.presetId, 'space_hall');
  assert.equal(withHall.eq.highCut, false);
  assert.equal(withHall.reverb.preset, 'HALL');
  assert.equal(withHall.delay.division, '1/4');
  assert.deepEqual(withHall.tune, base.tune);
});

test('resetVocalFXToNatural clears preset and highCut while keeping tune settings', () => {
  const base = sampleFx();
  const radio = applyVocalPreset(base, 'radio');
  const clean = resetVocalFXToNatural(radio);

  assert.equal(clean.presetId, undefined);
  assert.equal(clean.eq.highCut, false);
  assert.equal(clean.delay.division, 'OFF');
  assert.deepEqual(clean.tune, base.tune);
});

test('restoredVocalFX backwards-compatibly restores highCut and presetId', () => {
  const legacy = restoredVocalFX({ comp: { amount: 0.4 } });
  assert.equal(legacy.presetId, undefined);
  assert.equal(legacy.eq.highCut, false);
  assert.equal(legacy.eq.highCutFreq, 18000);

  const radioSaved = restoredVocalFX(applyVocalPreset(sampleFx(), 'radio'));
  assert.equal(radioSaved.presetId, 'radio');
  assert.equal(radioSaved.eq.highCut, true);
  assert.equal(radioSaved.eq.highCutFreq, 3100);
});


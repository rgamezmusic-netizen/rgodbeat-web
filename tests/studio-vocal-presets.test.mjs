import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

const {
  VOCAL_FX_PRESETS,
  getVocalPresetById,
  getVocalPresetProfile,
  applyVocalPreset,
  resetVocalFXToNatural,
  makeVocalSaturationCurve,
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
    eq: { lowCut: true, lowCutFreq: 100, low: -1.5, mid: 2.0, high: 1.0 },
    comp: { amount: 0.35 },
    saturation: { amount: 0.15 },
    delay: { division: 'OFF', mix: 0.25, feedback: 0.35 },
    reverb: { preset: 'PLATE', mix: 0.2 },
  };
}

test('exposes 5 vocal presets with dedicated texture DSP profiles', () => {
  assert.equal(VOCAL_FX_PRESETS.length, 5);
  const radio = getVocalPresetById('radio');
  assert.ok(radio, 'Radio preset must exist');
  assert.equal(radio.profile.bandpassSlope24, true);
  assert.equal(radio.profile.saturationMode, 'radio');
  assert.ok(radio.fx.eq.lowCutFreq >= 480);
  assert.equal(radio.fx.eq.highCut, true);
  assert.ok(radio.fx.eq.highCutFreq <= 3100);
  assert.ok(radio.profile.intimacyGainDb >= 6.0);

  const urban = getVocalPresetById('urban_air');
  const hall = getVocalPresetById('space_hall');
  const slap = getVocalPresetById('slap_tape');
  assert.equal(urban.profile.saturationMode, 'glass');
  assert.ok(urban.profile.doublerMix >= 0.2);
  assert.ok(hall.profile.doublerMix >= 0.3);
  assert.equal(slap.profile.saturationMode, 'tape');
  assert.equal(slap.fx.delay.division, 'SLAP');

  const leadRoles = VOCAL_FX_PRESETS.filter((p) => p.role === 'Principal');
  const fxRoles = VOCAL_FX_PRESETS.filter((p) => p.role === 'Efecto');
  assert.equal(leadRoles.length, 2);
  assert.equal(fxRoles.length, 3);
});

test('applyVocalPreset applies character DSP while preserving post-FX 3-band balance and Auto-Tune', () => {
  const base = sampleFx();
  const withRadio = applyVocalPreset(base, 'radio');

  assert.equal(withRadio.presetId, 'radio');
  assert.equal(withRadio.eq.lowCutFreq, 520);
  assert.equal(withRadio.eq.highCutFreq, 2900);
  // Post-FX 3-band user balance and tune stay preserved across preset changes
  assert.equal(withRadio.eq.low, base.eq.low);
  assert.equal(withRadio.eq.mid, base.eq.mid);
  assert.equal(withRadio.eq.high, base.eq.high);
  assert.deepEqual(withRadio.tune, base.tune);
  assert.equal(getVocalPresetProfile(withRadio).saturationMode, 'radio');

  const withHall = applyVocalPreset(withRadio, 'space_hall');
  assert.equal(withHall.presetId, 'space_hall');
  assert.equal(withHall.eq.highCut, false);
  assert.equal(withHall.reverb.preset, 'HALL');
  assert.equal(withHall.eq.low, base.eq.low);
  assert.equal(withHall.eq.mid, base.eq.mid);
  assert.equal(withHall.eq.high, base.eq.high);
  assert.deepEqual(withHall.tune, base.tune);
});

test('resetVocalFXToNatural clears preset character while keeping tune and 3-band balance', () => {
  const base = sampleFx();
  const radio = applyVocalPreset(base, 'radio');
  const clean = resetVocalFXToNatural(radio);

  assert.equal(clean.presetId, undefined);
  assert.equal(clean.eq.highCut, false);
  assert.equal(clean.delay.division, 'OFF');
  assert.equal(clean.eq.low, base.eq.low);
  assert.equal(clean.eq.mid, base.eq.mid);
  assert.equal(clean.eq.high, base.eq.high);
  assert.deepEqual(clean.tune, base.tune);
});

test('saturation curves keep strict zero at silence and distinct harmonic characters', () => {
  for (const mode of ['tape', 'glass', 'radio']) {
    const curve = makeVocalSaturationCurve(0.75, mode);
    assert.equal(curve.length, 4097);
    const mid = curve[2048];
    assert.ok(Math.abs(mid) < 1e-6, `${mode} curve must pass through 0 cleanly, got ${mid}`);
    for (let i = 0; i < curve.length; i++) {
      assert.ok(Number.isFinite(curve[i]) && Math.abs(curve[i]) <= 1.0001);
    }
  }
  const radioCurve = makeVocalSaturationCurve(0.78, 'radio');
  // Radio diode overdrive must be noticeably asymmetrical for 2nd-harmonic crunch
  const posHalf = Math.abs(radioCurve[3072]);
  const negHalf = Math.abs(radioCurve[1024]);
  assert.notEqual(Math.round(posHalf * 100), Math.round(negHalf * 100));
});

test('restoredVocalFX backwards-compatibly restores highCut and presetId', () => {
  const legacy = restoredVocalFX({ comp: { amount: 0.4 } });
  assert.equal(legacy.presetId, undefined);
  assert.equal(legacy.eq.highCut, false);
  assert.equal(legacy.eq.highCutFreq, 18000);

  const radioSaved = restoredVocalFX(applyVocalPreset(sampleFx(), 'radio'));
  assert.equal(radioSaved.presetId, 'radio');
  assert.equal(radioSaved.eq.highCut, true);
  assert.equal(radioSaved.eq.highCutFreq, 2900);
});

import type { VocalFX } from '../types/audio';

/** Preserve available settings; older files may omit an effects section. */
export function restoredVocalFX(fx?: Partial<VocalFX> | null): VocalFX {
  return {
    presetId: fx?.presetId,
    tune: { enabled: false, speed: 0, rootKey: 'A', scaleMode: 'minor', humanize: 0, ...fx?.tune },
    eq: { lowCut: false, lowCutFreq: 100, highCut: false, highCutFreq: 18000, low: 0, mid: 0, high: 0, ...fx?.eq },
    comp: { amount: 0, ...fx?.comp }, saturation: { amount: 0, ...fx?.saturation },
    delay: { division: 'OFF', mix: 0, feedback: 0, ...fx?.delay },
    reverb: { preset: 'ROOM', mix: 0, ...fx?.reverb },
  };
}

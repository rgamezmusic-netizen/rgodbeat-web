// Real browser IndexedDB and AudioBuffers, isolated localhost origin/context.
// Abort/quota faults are injected; this does not simulate physical disk exhaustion
// or certify a real microphone, iPhone, Supabase, R2 or YouTube connection.
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH, 'Set STUDIO_PLAYWRIGHT_PATH to an existing external installation');
const { chromium } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
let server, browser, context, page, base, bundle;
before(async () => {
  bundle = (await build({ stdin: { contents: `
    export * from './lib/studio/audio/beatStorage';
    export * from './lib/studio/audio/sessionStorage';
    export * from './lib/studio/audio/recordingRecovery';
  `, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'StorageTest', platform: 'browser' })).outputFiles[0].text;
  server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Isolated Studio storage test</title>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.STUDIO_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
});
after(async () => { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); });
async function openPage() {
  const result = await context.newPage();
  await result.goto(base);
  await result.addScriptTag({ content: bundle });
  await result.evaluate(() => {
    window.audio = new AudioContext();
    window.owner = 'session_local@example.invalid';
    window.fx = { tune: { enabled: false, speed: 0, rootKey: 'C', scaleMode: 'minor', humanize: 0 },
      eq: { lowCut: false, lowCutFreq: 80, low: 0, mid: 0, high: 0 }, comp: { amount: 0 }, saturation: { amount: 0 },
      delay: { division: 'OFF', mix: 0, feedback: 0 }, reverb: { preset: 'ROOM', mix: 0 } };
    window.track = (values = [], id = 'lead1', clipId = 'take-a', start = 0) => {
      const buffer = values.length ? audio.createBuffer(1, values.length, 48000) : null;
      if (buffer) buffer.getChannelData(0).set(values);
      return { id, name: id, fx, volume: 1, pan: 0, isMuted: false, isSolo: false, buffer, tunedBuffer: null,
        duration: buffer?.duration ?? 0, startBeatOffset: start,
        clips: buffer ? [{ id: clipId, buffer, tunedBuffer: null, duration: buffer.duration, startBeatOffset: start, isLocked: true }] : [] };
    };
    window.chunk = (index = 0, projectId = 'project-a', takeId = 'take-a', values = [0.25, -0.25], trackId = 'lead1') =>
      ({ index, projectId, takeId, trackId, start: 0, sampleRate: 48000, samples: new Float32Array(values) });
    window.save = (tracks, projectId = 'project-a') => StorageTest.saveStudioSession(tracks, null, undefined, 0, 1, 'studio', 'local@example.invalid', undefined, projectId);
    window.beat = id => ({ id, title: id, bpm: 120, key: 'C', scale: 'minor', duration: 1, artworkGradient: '' });
    window.readStore = async (name = 'chunks', database = 'RGODBEAT_RECORDING_RECOVERY') => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open(database); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try { return await new Promise((resolve, reject) => { const tx = db.transaction(name); const r = tx.objectStore(name).getAll(); tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error); }); }
      finally { db.close(); }
    };
    window.failNext = (storeName, operation = 'put', mode = 'abort') => {
      const original = IDBObjectStore.prototype[operation];
      window.faultObserved = false;
      IDBObjectStore.prototype[operation] = function (...args) {
        if (this.name !== storeName) return original.apply(this, args);
        IDBObjectStore.prototype[operation] = original;
        if (mode === 'quota') { window.faultObserved = true; throw new DOMException('Injected storage quota exhaustion', 'QuotaExceededError'); }
        const request = original.apply(this, args), tx = this.transaction;
        request.addEventListener('success', () => { window.faultObserved = true; tx.abort(); });
        return request;
      };
    };
  });
  return result;
}
beforeEach(async () => { context = await browser.newContext(); page = await openPage(); });
afterEach(async () => { await context?.close(); });

test('beat audio and active selection commit atomically, never report request success after abort', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    failNext('saved_beats');
    const saved = await StorageTest.saveBeatToDatabase(beat('new'), new ArrayBuffer(8));
    return { saved, fault: faultObserved, beats: (await readStore('saved_beats', 'RGODBEAT_STUDIO_DB')).length,
      settings: (await readStore('studio_settings', 'RGODBEAT_STUDIO_DB')).length, local: localStorage.getItem('rgodbeat_active_beat_id') };
  }), { saved: false, fault: true, beats: 0, settings: 0, local: null });
});

test('failure of beat selection rolls back the audio in the same transaction', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    failNext('studio_settings');
    const saved = await StorageTest.saveBeatToDatabase(beat('new'), new ArrayBuffer(8));
    return [saved, (await readStore('saved_beats', 'RGODBEAT_STUDIO_DB')).length];
  }), [false, 0]);
});

test('concurrent beat writers in different pages enforce the 23-slot limit', async () => {
  await page.evaluate(async () => { for (let i = 0; i < 22; i++) if (!await StorageTest.saveBeatToDatabase(beat(String(i)), new ArrayBuffer(8))) throw Error('seed'); });
  const second = await openPage();
  const results = await Promise.all([page.evaluate(() => StorageTest.saveBeatToDatabase(beat('tab-a'), new ArrayBuffer(8))),
    second.evaluate(() => StorageTest.saveBeatToDatabase(beat('tab-b'), new ArrayBuffer(8)))]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await page.evaluate(async () => (await readStore('saved_beats', 'RGODBEAT_STUDIO_DB')).length), 23);
  assert.equal(await page.evaluate(() => StorageTest.saveBeatToDatabase(beat('0'), new ArrayBuffer(12))), true, 'updating an existing slot is still allowed');
});

test('selection and beat deletion report false on aborted transactions and preserve previous values', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.saveBeatToDatabase(beat('old'), new ArrayBuffer(8));
    failNext('studio_settings');
    const selection = await StorageTest.saveActiveBeatId('new', false);
    failNext('saved_beats', 'delete');
    const deletion = await StorageTest.deleteSavedBeat('old');
    return [selection, deletion, (await readStore('saved_beats', 'RGODBEAT_STUDIO_DB')).length, localStorage.getItem('rgodbeat_active_beat_id')];
  }), [false, false, 1, 'old']);
});

test('an aborted session snapshot leaves the previous WAV and recovery journal intact', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await save([track([0.5], 'lead1', 'old')]);
    await StorageTest.appendRecordingCheckpoint(owner, chunk());
    failNext('studio_sessions');
    const saved = await save([track([0.25, -0.25])]);
    const restored = await StorageTest.restoreLastStudioSession(audio, 'local@example.invalid');
    return [saved, faultObserved, restored.tracks[0].clips[0].id, restored.tracks[0].clips[0].buffer.getChannelData(0)[0], (await readStore()).length];
  }), [false, true, 'old', 0.5, 1]);
});

test('saveLastProjectBeat also waits for commit and preserves voices on abort', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await save([track([0.5], 'lead1', 'old')]);
    failNext('studio_sessions');
    const saved = await StorageTest.saveLastProjectBeat(beat('new'), 1, 'local@example.invalid');
    const restored = await StorageTest.restoreLastStudioSession(audio, 'local@example.invalid');
    return [saved, restored.tracks[0].clips[0].id];
  }), [false, 'old']);
});

test('first interrupted recording recovers without a base session and without writing one', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await Promise.all([0, 1, 2].map(i => StorageTest.appendRecordingCheckpoint(owner, chunk(i))));
    const result = await StorageTest.restoreRecoverableStudioSession(audio, 'local@example.invalid', [track()]);
    return { recovered: result.recovered, project: result.session.projectId, frames: result.session.tracks[0].clips[0].buffer.length,
      sessions: (await readStore('studio_sessions', 'RGODBEAT_STUDIO_DB')).length, chunks: (await readStore()).length, missingBeat: result.session.losses.includes('beat') };
  }), { recovered: 1, project: 'project-a', frames: 6, sessions: 0, chunks: 3, missingBeat: true });
});

test('no base session selects one recent orphan project and preserves all other projects', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk(0, 'project-a', 'a'));
    await StorageTest.appendRecordingCheckpoint(owner, chunk(0, 'project-b', 'b'));
    const result = await StorageTest.restoreRecoverableStudioSession(audio, 'local@example.invalid', [track()]);
    return [result.session.projectId, result.recovered, result.pending, result.session.tracks[0].clips.map(c => c.id), (await readStore()).length];
  }), ['project-b', 1, 1, ['b'], 2]);
});

test('existing valid session is never replaced or mixed with another orphan project', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await save([track([0.5], 'lead1', 'saved')], 'project-a');
    await StorageTest.appendRecordingCheckpoint(owner, chunk(0, 'project-b', 'orphan'));
    const result = await StorageTest.restoreRecoverableStudioSession(audio, 'local@example.invalid', [track()]);
    return [result.recovered, result.session.projectId, result.session.tracks[0].clips[0].id, (await readStore()).length];
  }), [0, 'project-a', 'saved', 1]);
});

test('overlapping or partial saved take recovers into a muted separate lane without overwriting valid audio', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk());
    const existing = track([0.5], 'lead1', 'take-a');
    const first = await StorageTest.recoverRecordingCheckpoints(owner, audio, [existing], 'project-a');
    const again = await StorageTest.recoverRecordingCheckpoints(owner, audio, first.tracks, 'project-a');
    return [first.recovered, first.tracks.length, first.tracks[0].clips[0].buffer.getChannelData(0)[0], first.tracks[1].isMuted,
      Array.from(first.tracks[1].clips[0].buffer.getChannelData(0)), again.recovered, (await readStore()).length];
  }), [1, 2, 0.5, true, [0.25, -0.25], 0, 1]);
});

test('orphan custom lane can be recovered even when that lane is absent from the base tracks', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk(0, 'project-a', 'a', [0.25], 'backing-custom'));
    const result = await StorageTest.recoverRecordingCheckpoints(owner, audio, [track()], 'project-a');
    return [result.recovered, result.tracks[1].id, result.tracks[1].clips[0].buffer.length];
  }), [1, 'backing-custom', 1]);
});

test('a missing chunk keeps only a contiguous prefix and does not duplicate it on repeated recovery', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk(0));
    await StorageTest.appendRecordingCheckpoint(owner, chunk(2));
    const first = await StorageTest.recoverRecordingCheckpoints(owner, audio, [track()], 'project-a');
    const second = await StorageTest.recoverRecordingCheckpoints(owner, audio, first.tracks, 'project-a');
    await StorageTest.retireRecordingCheckpoints(owner, first.tracks, 'project-a');
    return [first.tracks[0].clips[0].buffer.length, first.pending, second.recovered, (await readStore()).length];
  }), [2, 1, 0, 2]);
});

test('legacy unscoped fragments do not enter a known project and can recover without a session', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    const legacy = chunk(); delete legacy.projectId;
    await StorageTest.appendRecordingCheckpoint(owner, legacy);
    const known = await StorageTest.recoverRecordingCheckpoints(owner, audio, [track()], 'project-a');
    const orphan = await StorageTest.restoreRecoverableStudioSession(audio, 'local@example.invalid', [track()]);
    await save(orphan.session.tracks, orphan.session.projectId);
    return [known.recovered, orphan.recovered, Boolean(orphan.session.projectId), (await readStore()).length];
  }), [0, 1, true, 1]);
});

test('ambiguous legacy fragments never merge into an existing legacy session or into each other', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    const first = chunk(0, undefined, 'first'); delete first.projectId;
    const second = chunk(0, undefined, 'second'); delete second.projectId;
    await StorageTest.appendRecordingCheckpoint(owner, first);
    await StorageTest.appendRecordingCheckpoint(owner, second);
    const existing = await StorageTest.recoverRecordingCheckpoints(owner, audio, [track([0.5], 'lead1', 'saved')], null);
    const orphan = await StorageTest.restoreRecoverableStudioSession(audio, 'local@example.invalid', [track()]);
    return [existing.recovered, existing.pending, orphan.recovered, orphan.pending, orphan.session.tracks[0].clips.length, (await readStore()).length];
  }), [0, 2, 1, 1, 1, 2]);
});

test('cleanup removes only complete matching PCM of the committed project, never another owner/project', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk());
    await StorageTest.appendRecordingCheckpoint(owner, chunk(0, 'project-b', 'other'));
    await StorageTest.appendRecordingCheckpoint('session_other@example.invalid', chunk(0, 'project-a', 'private'));
    await save([track([0.25, -0.25])]);
    return (await readStore()).map(c => c.takeId).sort();
  }), ['other', 'private']);
});

test('partial snapshots, edited take IDs and mismatching PCM cannot retire the original fragments', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk());
    for (const candidate of [track([0.25]), track([0.25, -0.25], 'lead1', 'take-a-split'), track([0, 0])]) {
      await StorageTest.retireRecordingCheckpoints(owner, [candidate], 'project-a');
      if ((await readStore()).length !== 1) throw Error('journal lost');
    }
    await StorageTest.retireRecordingCheckpoints(owner);
    return (await readStore()).length;
  }), 1);
});

test('aborted cleanup rolls back journal deletion even after a successful delete request', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk());
    failNext('chunks', 'delete');
    const result = await StorageTest.retireRecordingCheckpoints(owner, [track([0.25, -0.25])], 'project-a');
    return [result, faultObserved, (await readStore()).length];
  }), [false, true, 1]);
});

test('project clearing/import preserve unrelated recovery fragments', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk(0, 'project-b', 'other'));
    await save([track([0.5], 'lead1', 'saved')]);
    await StorageTest.clearSavedStudioSession('local@example.invalid');
    const payload = { format: 'RGODBEAT_PROJECT_V1', version: 1, sessionData: { tracks: [] } };
    await StorageTest.importProjectFromDeviceFile(new File([JSON.stringify(payload)], 'test.rgodbeat'), audio, 'imported', 'local@example.invalid');
    return (await readStore()).map(c => c.projectId);
  }), ['project-b']);
});

test('injected quota exhaustion preserves previous audio and committed checkpoints; queue remains usable', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await save([track([0.5], 'lead1', 'saved')]);
    await StorageTest.appendRecordingCheckpoint(owner, chunk());
    failNext('studio_sessions', 'put', 'quota');
    const saved = await save([track([0.25, -0.25])]);
    failNext('chunks', 'put', 'quota');
    const failedChunk = await StorageTest.appendRecordingCheckpoint(owner, chunk(1));
    const next = await StorageTest.appendRecordingCheckpoint(owner, chunk(1));
    const restored = await StorageTest.restoreLastStudioSession(audio, 'local@example.invalid');
    return [saved, failedChunk, next, restored.tracks[0].clips[0].id, (await readStore()).length];
  }), [false, false, true, 'saved', 2]);
});

test('read abort is an error, not an empty session that may overwrite valid data', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await save([track([0.5], 'lead1', 'saved')]);
    failNext('studio_sessions', 'get');
    let rejected = false;
    try { await StorageTest.restoreRecoverableStudioSession(audio, 'local@example.invalid', [track()]); } catch { rejected = true; }
    failNext('studio_sessions', 'get');
    const saved = await save([track()]);
    const restored = await StorageTest.restoreLastStudioSession(audio, 'local@example.invalid');
    return [rejected, saved, restored.tracks[0].clips[0].id];
  }), [true, false, 'saved']);
});

test('concurrent snapshots keep the newest committed audio and do not retire a different project', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk(0, 'project-b', 'other'));
    const results = await Promise.all([save([track([0.25], 'lead1', 'old')]), save([track([0.5], 'lead1', 'new')])]);
    const restored = await StorageTest.restoreLastStudioSession(audio, 'local@example.invalid');
    return [results, restored.tracks[0].clips[0].id, (await readStore()).length];
  }), [[true, true], 'new', 1]);
});

test('concurrent checkpoint retries are idempotent and conflicting writers cannot overwrite PCM', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    const results = await Promise.all([
      StorageTest.appendRecordingCheckpoint(owner, chunk()), StorageTest.appendRecordingCheckpoint(owner, chunk()),
      StorageTest.appendRecordingCheckpoint(owner, chunk(0, 'project-b', 'take-a', [0.75]))]);
    const values = await readStore();
    return [results, values.length, values[0].projectId, Array.from(values[0].samples)];
  }), [[true, true, false], 1, 'project-a', [0.25, -0.25]]);
});

test('invalid blocks are retained without reconstructing non-finite audio or shifting later samples', async () => {
  assert.deepEqual(await page.evaluate(async () => {
    await StorageTest.appendRecordingCheckpoint(owner, chunk(0));
    await StorageTest.appendRecordingCheckpoint(owner, chunk(1, 'project-a', 'take-a', [NaN]));
    await StorageTest.appendRecordingCheckpoint(owner, chunk(2));
    const result = await StorageTest.recoverRecordingCheckpoints(owner, audio, [track()], 'project-a');
    await StorageTest.retireRecordingCheckpoints(owner, result.tracks, 'project-a');
    return [result.recovered, result.pending, result.tracks[0].clips[0].buffer.length, (await readStore()).length];
  }), [1, 1, 2, 3]);
});

test('closing the page after committed checkpoints recovers a first take in a fresh page', async () => {
  await page.evaluate(async () => { await StorageTest.appendRecordingCheckpoint(owner, chunk()); });
  await page.close({ runBeforeUnload: false });
  page = await openPage();
  assert.deepEqual(await page.evaluate(async () => {
    const result = await StorageTest.restoreRecoverableStudioSession(audio, 'local@example.invalid', [track()]);
    return [result.recovered, Array.from(result.session.tracks[0].clips[0].buffer.getChannelData(0))];
  }), [1, [0.25, -0.25]]);
});

test('closing after an aborted snapshot preserves the previous session and the recoverable take', async () => {
  await page.evaluate(async () => {
    await save([track([0.5], 'lead1', 'saved')]);
    await StorageTest.appendRecordingCheckpoint(owner, chunk());
    failNext('studio_sessions');
    if (await save([track([0.25, -0.25])])) throw Error('premature commit');
  });
  await page.close({ runBeforeUnload: false });
  page = await openPage();
  assert.deepEqual(await page.evaluate(async () => {
    const result = await StorageTest.restoreRecoverableStudioSession(audio, 'local@example.invalid', [track()]);
    return [result.recovered, result.session.tracks[0].clips[0].id, result.session.tracks.length];
  }), [1, 'saved', 2]);
});

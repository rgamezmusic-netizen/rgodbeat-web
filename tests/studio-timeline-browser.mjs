// Isolated rendering of the real timeline; no account, storage or microphone writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH, 'Set STUDIO_PLAYWRIGHT_PATH to the installed Playwright module');
const { chromium, webkit } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {TimelineWorkspace} from './components/studio/TimelineWorkspace';
    function App() {
      const [time, setTime] = useState(0);
      const [playing, setPlaying] = useState(false);
      const [recording, setRecording] = useState(false);
      const [clips, setClips] = useState([{id:'long', name:'Long take', buffer:new AudioBuffer({length:960000, sampleRate:8000}), duration:120, startBeatOffset:0, isLocked:true, waveformSample:[.1,.8,.2,.7]}]);
      const record = (action, id) => window.actions.push({action, id});
      window.actions ??= [];
      window.timelineTest = {setTime, setPlaying, setRecording, clips, shortTake: () => setClips([{id:'short', name:'Short take', startBeatOffset:0, isLocked:true, waveformSample:[.1,.8], duration:1, buffer:new AudioBuffer({length:8000, sampleRate:8000})}])};
      return <TimelineWorkspace beat={null} tracks={[{id:'lead1', name:'Lead 1', clips, buffer:null, duration:120, startBeatOffset:0, volume:1, pan:0, isMuted:false, isSolo:false, fx:{}}]}
        currentTime={time} isPlaying={playing} isRecording={recording} selectedTrackId='lead1'
        onPlayPause={() => setPlaying(v => !v)} onSeek={t => {record('seek',t); setTime(t)}}
        onMoveTake={(track,t,id) => {record('move',id); setClips(cs => cs.map(c => c.id===id ? {...c,startBeatOffset:t}:c))}}
        onToggleLockTake={(track,id) => {record('lock',id); setClips(cs => cs.map(c => c.id===id ? {...c,isLocked:!c.isLocked}:c))}}
        onDeleteTake={(track,id) => {record('delete',id); setClips(cs => cs.filter(c => c.id!==id))}}
        onSplitTake={(track,id) => record('split',id)} onDuplicateTake={()=>{}} onToggleMute={()=>{}}
        onToggleSolo={()=>{}} onOpenFX={()=>{}} onSelectTrack={()=>{}} />;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  ` },
  bundle: true, write: false, platform: 'browser', format: 'iife',
});
const styles = await postcss([tailwind()]).process(await readFile('app/globals.css', 'utf8'), { from: `${process.cwd()}/app/globals.css` });
const server = createServer((req, res) => {
  if (req.url === '/timeline.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(styles.css); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="margin:0"><div id="root"></div><script src="/timeline.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;

try {
  for (const [name, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    if (name !== (process.env.STUDIO_TEST_BROWSER ?? 'chromium')) continue;
    const browser = await launcher.launch({ headless: true, ...(name === 'chromium' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) });
    try {
      for (const width of [320, 390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 600, isMobile: width < 600 });
        page.setDefaultTimeout(10000);
        const press = button => width < 600 ? button.tap() : button.click();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(url);
        const clip = page.locator('[data-clip-item]').first();
        await clip.waitFor();
        const viewport = page.locator('div.overflow-x-auto.overflow-y-auto');
        const lock = clip.getByTitle(/Seguro ACTIVADO/);
        const remove = clip.getByTitle(/Borrar solo/);
        const visibleActions = async () => {
          const view = await viewport.boundingBox();
          for (const button of [clip.locator('button').first(), remove]) {
            const box = await button.boundingBox();
            assert.ok(box.x >= view.x + 120 && box.x + box.width <= view.x + view.width, `${name} ${width}: action must stay in visible audio lane: ${JSON.stringify(box)}`);
            // Ensure a sticky overlay is actually clickable, not just geometrically inside.
            await button.click({ trial: true });
          }
        };
        await visibleActions();
        for (const scroll of [900, 2100, 0]) {
          await viewport.evaluate((el, x) => { el.scrollLeft = x; }, scroll);
          await visibleActions();
        }
        await viewport.evaluate(el => { el.scrollLeft = 900; });
        const dragVisibleClip = async () => {
          const view = await viewport.boundingBox(), box = await clip.boundingBox();
          await page.mouse.move(view.x + 160, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(view.x + 205, box.y + box.height / 2, { steps: 5 });
          await page.mouse.up();
        };
        await dragVisibleClip();
        assert.equal(await page.evaluate(() => window.timelineTest.clips[0].startBeatOffset), 0, 'locked audio must remain stationary');
        await press(lock);
        assert.deepEqual(await page.evaluate(() => window.actions), [{action:'lock',id:'long'}], 'unlock must affect only the visible take, without seeking or moving it');
        await dragVisibleClip();
        assert.ok(await page.evaluate(() => window.timelineTest.clips[0].startBeatOffset > 0), 'unlocked audio must still move');
        assert.equal(await page.evaluate(() => window.timelineTest.clips[0].buffer.duration), 120);
        await press(clip.getByTitle(/Activar SEGURO/));
        await visibleActions();
        await page.evaluate(() => { window.actions = []; });

        const visiblePlayhead = async () => {
          await page.waitForFunction(() => {
            const el = document.querySelector('div.overflow-x-auto.overflow-y-auto');
            const head = el.querySelector('div.z-35');
            const v = el.getBoundingClientRect(), h = head.getBoundingClientRect();
            return h.x >= v.x+120 && h.x < v.right-15;
          });
        };
        await page.evaluate(() => { window.timelineTest.setPlaying(true); window.timelineTest.setTime(40); });
        await visiblePlayhead();
        for (const time of [41, 65, 115, 2]) {
          await page.evaluate(t => window.timelineTest.setTime(t), time);
          await visiblePlayhead();
          await visibleActions();
        }
        await page.evaluate(() => window.timelineTest.setTime(130));
        await visiblePlayhead();
        await page.getByTitle('Aumentar zoom', {exact:true}).click();
        await visiblePlayhead();
        await page.getByTitle('Reducir zoom', {exact:true}).click();
        await visiblePlayhead();
        // A paused user can still inspect a different section without a forced jump.
        await page.evaluate(() => window.timelineTest.setPlaying(false));
        await viewport.evaluate(el => { el.scrollLeft = 1500; });
        await page.waitForTimeout(150);
        assert.equal(await viewport.evaluate(el => el.scrollLeft), 1500);
        // Recording follows the clock even when playback flag is false.
        await page.evaluate(() => { window.timelineTest.setRecording(true); window.timelineTest.setTime(85); });
        await visiblePlayhead();
        await page.evaluate(() => window.timelineTest.setRecording(false));
        assert.equal(await page.evaluate(() => window.actions.some(a => a.action === 'seek' || a.action === 'move')), false, 'following must not change audio or seek');
        await press(remove);
        assert.equal(await page.locator('[data-clip-item]').count(), 0);
        assert.equal(await page.evaluate(() => window.actions.at(-1).id), 'long');
        await page.evaluate(() => { window.timelineTest.shortTake(); window.timelineTest.setTime(0); });
        await viewport.evaluate(el => { el.scrollLeft = 0; });
        await visibleActions();
        await press(clip.getByTitle(/Seguro ACTIVADO/));
        assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), {action:'lock',id:'short'});
        await press(remove);
        assert.equal(await page.locator('[data-clip-item]').count(), 0);
        assert.deepEqual(errors, []);
        console.log(`PASS ${name} ${width}: visible clip actions, playback/recording follow, loop return, paused scrolling, exact delete`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }

// Real Web Audio output, isolated from accounts, cloud storage and microphones.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH);
const launchers = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `
    import {AudioEngine} from './lib/studio/audio/audioEngine';
    const state = window.testAudio = {errors: [], ticks: [], recordings: [], probeNodes: {}, probes: {beat: [], voice: []}};
    const engine = state.engine = new AudioEngine({onTimeUpdate: t => state.ticks.push(t),
      onPlaybackEnded() {}, onCountInBeat() {}, onRecordingFinished(id,buffer,wave,start) {state.recordings.push({id,duration:buffer.duration,start});},
      onRecordingAborted() {}, onError: e => state.errors.push(e)});
    async function init() {
      const ctx = await engine.ensureAudioContext({resume:false});
      function tone(duration) {
        const buffer = ctx.createBuffer(1, Math.round(duration * ctx.sampleRate), ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i=0; i<samples.length; i++) samples[i] = .15 * Math.sin(2*Math.PI*240*i/ctx.sampleRate);
        return buffer;
      }
      const fx = {tune:{enabled:false,speed:0}, eq:{lowCut:false,low:0,mid:0,high:0},
        comp:{amount:0}, saturation:{amount:0}, delay:{division:'OFF',mix:0,feedback:0}, reverb:{preset:'ROOM',mix:0}};
      state.empty = {id:'empty',buffer:null,clips:[],fx};
      engine.updateVocalFX(state.empty,[state.empty]);
      state.emptyGraphs = engine.vocalNodes.size;
      const voice = {id:'voice', startBeatOffset:.25, duration:.3, buffer:tone(.3)};
      state.track = {id:'lead1',buffer:null,clips:[voice],fx,volume:1,pan:0,isMuted:false,isSolo:false};
      engine.setBeat({id:'test',buffer:tone(1.2),duration:1.2,bpm:1200});
      engine.setLoopSettings({enabled:true,bars:1,startBar:1,startSec:0,endSec:0});
      function probe(node, name) {
        const worklet = new AudioWorkletNode(ctx,'probe');
        state.probeNodes[name] = worklet;
        worklet.port.onmessage = e => {if(state.probeNodes[name] === worklet) state.probes[name].push(...e.data);};
        const silent = ctx.createGain(); silent.gain.value = 0;
        node.connect(worklet); worklet.connect(silent); silent.connect(ctx.destination);
      }
      document.querySelector('#play').onclick = async () => {
        await engine.play([state.empty,state.track]);
        await ctx.audioWorklet.addModule('/probe.js');
        probe(engine.beatGainNode,'beat');
        probe(engine.vocalNodes.get('lead1').trackGain,'voice');
        state.source = engine.beatSource;
        state.origin = engine.playbackStartCtxTime;
        state.started = true;
      };
      document.querySelector('#pause').onclick = () => engine.pause();
      state.ready = true;
    }
    init().catch(e => state.errors.push(e.message));
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife',
});
const probe = `class Probe extends AudioWorkletProcessor {
  constructor(){super();this.blocks=[];}
  process(inputs, outputs){
    const samples=inputs[0]?.[0];let energy=0;
    if(samples) for(const sample of samples) energy+=sample*sample;
    this.blocks.push({time:currentTime,rms:Math.sqrt(energy/(samples?.length||128))});
    if(this.blocks.length===32){this.port.postMessage(this.blocks);this.blocks=[];}
    return true;
  }
} registerProcessor('probe',Probe);`;
const recorder = await readFile('public/studio/pcm-recorder.js');
const server = createServer((req,res) => {
  if(req.url === '/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
  else if(req.url === '/probe.js'){res.setHeader('Content-Type','text/javascript');res.end(probe);}
  else if(req.url === '/studio/pcm-recorder.js'){res.setHeader('Content-Type','text/javascript');res.end(recorder);}
  else {res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><button id="play">Play</button><button id="pause">Pause</button><script src="/app.js"></script>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  for(const name of ['chromium','webkit','firefox']){
    if(process.env.STUDIO_TEST_BROWSER ? name!==process.env.STUDIO_TEST_BROWSER : name==='firefox') continue;
    const browser=await launchers[name].launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
    try {
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,...(name!=='firefox'?{isMobile:true}:{})});
      page.setDefaultTimeout(15000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.waitForFunction(()=>window.testAudio.ready);
      assert.equal(await page.evaluate(()=>testAudio.emptyGraphs),0,'empty channels allocate no FX graph');
      await page.getByText('Play',{exact:true}).tap();
      await page.waitForFunction(()=>testAudio.started);
      await page.waitForTimeout(400);
      const stall = await page.evaluate(()=>{
        const s=testAudio,ctx=s.engine.getAudioContext(),start=ctx.currentTime;
        const until=performance.now()+750;
        while(performance.now()<until){} // Several loop boundaries without UI frames or timers.
        return {start,end:ctx.currentTime};
      });
      await page.waitForTimeout(250);
      const result=await page.evaluate(({start,end})=>{
        const s=testAudio;
        return {sameSource:s.engine.beatSource===s.source,loop:s.source.loop,
          position:s.engine.getCurrentPlaybackPosition(),errors:s.errors,
          beat:s.probes.beat.filter(b=>b.time>start+.02 && b.time<end-.02),
          voice:s.probes.voice.filter(b=>b.time>start+.02 && b.time<end-.02),origin:s.origin};
      },stall);
      assert.ok(result.sameSource && result.loop,'loop must retain its native beat source');
      assert.ok(result.beat.length>100,'measure audio render blocks during UI stall');
      assert.ok(result.beat.every(b=>b.rms>.07),`${name}: no beat dropout during loop boundaries`);
      const phase=time=>((time-result.origin-.2)%.2+.2)%.2;
      const voiced=result.voice.filter(b=>phase(b.time)>.075 && phase(b.time)<.18);
      const silent=result.voice.filter(b=>phase(b.time)>.015 && phase(b.time)<.035);
      assert.ok(voiced.length>20 && voiced.every(b=>b.rms>.06),'scheduled voices stay audible across loops while UI stalls');
      assert.ok(silent.length>5 && silent.every(b=>b.rms<.01),`${name}: clips stop at loop end (allow filter decay): ${JSON.stringify({count:silent.length,max:Math.max(...silent.map(b=>b.rms))})}`);
      assert.ok(result.position>=.2 && result.position<.4,'playhead follows the audio loop');
      assert.deepEqual(result.errors,[]);
      await page.getByText('Pause',{exact:true}).tap();
      const paused=await page.evaluate(()=>({position:testAudio.engine.getCurrentPlaybackPosition(),
        playing:testAudio.engine.getIsPlaying(),sources:testAudio.engine.vocalSources.size,timer:testAudio.engine.loopScheduler}));
      assert.equal(paused.playing,false);assert.equal(paused.sources,0);assert.equal(paused.timer,null);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(()=>testAudio.engine.getCurrentPlaybackPosition()),paused.position);

      // Cancelling while activation is pending must never start late playback.
      await page.evaluate(async()=>{
        const e=testAudio.engine,original=e.unlockAudio.bind(e);let release;
        e.unlockAudio=()=>new Promise(resolve=>{release=resolve;});
        const pending=e.play([testAudio.track]);e.stop();release();await pending;e.unlockAudio=original;
      });
      assert.equal(await page.evaluate(()=>testAudio.engine.getIsPlaying()),false);
      await page.getByText('Play',{exact:true}).tap();
      await page.waitForFunction(()=>testAudio.engine.getIsPlaying());
      await page.waitForTimeout(800);
      await page.waitForFunction(()=>testAudio.engine.getCurrentPlaybackPosition()<.27);
      assert.equal(await page.evaluate(async()=>{
        const e=testAudio.engine,ctx=e.getAudioContext();
        e.getMicrophoneStream=async()=>{
          const dest=ctx.createMediaStreamDestination(),osc=ctx.createOscillator();
          osc.connect(dest);osc.start();e.micStream=dest.stream;return dest.stream;
        };
        return e.startRecording('lead1',[testAudio.track],false);
      }),true);
      await page.waitForFunction(()=>testAudio.recordings.length===1);
      const recording=await page.evaluate(()=>({take:testAudio.recordings[0],playing:testAudio.engine.getIsPlaying(),errors:testAudio.errors}));
      assert.ok(recording.take.duration>0 && recording.take.duration<.3,'punch-in ends at the current loop boundary');
      assert.ok(recording.take.start>=.17 && recording.take.start<.4,'recording offset uses the current loop cycle');
      assert.equal(recording.playing,false);assert.deepEqual(recording.errors,[]);
      // Turning off a loop during REC must let the beat and other voices continue.
      await page.getByText('Play',{exact:true}).tap();
      await page.waitForFunction(()=>testAudio.engine.getIsPlaying() && testAudio.engine.getCurrentPlaybackPosition()<.27);
      const continuation=await page.evaluate(async()=>{
        const e=testAudio.engine;
        const started=await e.startRecording('other',[testAudio.track],false);
        const origin=e.playbackStartCtxTime;
        e.setLoopSettings({enabled:false,bars:1,startBar:1,startSec:.2,endSec:.4});
        return {started,origin};
      });
      assert.equal(continuation.started,true);
      await page.waitForFunction(origin=>testAudio.engine.getAudioContext().currentTime>origin+.6,continuation.origin);
      const continued=await page.evaluate(origin=>({recording:testAudio.engine.getIsRecording(),
        beat:testAudio.probes.beat.filter(b=>b.time>origin+.45 && b.time<origin+.52),
        voice:testAudio.probes.voice.filter(b=>b.time>origin+.45 && b.time<origin+.52)}),continuation.origin);
      assert.equal(continued.recording,true);
      assert.ok(continued.beat.length>5 && continued.beat.every(b=>b.rms>.07),'beat continues after disabling loop during REC');
      assert.ok(continued.voice.length>5 && continued.voice.every(b=>b.rms>.06),'other voices continue after disabling loop during REC');
      await page.evaluate(()=>testAudio.engine.stopRecording());
      assert.equal(await page.evaluate(()=>testAudio.recordings.length),2);
      assert.deepEqual(errors,[]);
      console.log('PASS '+name+': real beat/voice output through UI stalls, native loops, clipped voices, pause clock, cancelled activation, empty-track DSP, loop punch-in and disable during REC');
    } finally {await browser.close();}
  }
} finally {await new Promise(resolve=>server.close(resolve));}

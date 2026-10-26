// Explicit synthetic beat selected through the real catalog UI. Never used by
// the app, and never sends audio/account data to a remote service.
import assert from 'node:assert/strict';

export const TEST_BEAT_TITLE = 'Beat de prueba local';
const rate = 48000, seconds = 20;
const wav = Buffer.alloc(44 + rate * seconds * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28); wav.writeUInt16LE(2,32);
wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
for(let i=0;i<rate*seconds;i++) wav.writeInt16LE(Math.round(3200*Math.sin(2*Math.PI*220*i/rate)),44+i*2);

export async function selectFixtureBeat(page, {alreadyOpen = false} = {}) {
  const origin = new URL(page.url()).origin;
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname));
  await page.route('**/api/beats/ranking', route => route.fulfill({json:{beats:[{
    id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',title:TEST_BEAT_TITLE,bpm:120,key:'Am',genre:'Prueba',
    currentRank:1,previewUrl:origin+'/studio-test-fixture.wav',
  }]}}));
  await page.route('**/studio-test-fixture.wav', route => route.fulfill({contentType:'audio/wav',body:wav}));
  await page.locator('[data-studio-ready="true"]').waitFor();
  const close = page.getByRole('button',{name:'Cerrar biblioteca de beats'});
  if(alreadyOpen || await close.isVisible()) await close.click();
  await page.getByTitle(/Clic para cambiar beat o cargar audio/).click();
  await page.getByRole('button',{name:'Top 23',exact:true}).click();
  await page.getByRole('button',{name:'Grabar',exact:true}).click();
  await page.getByText(TEST_BEAT_TITLE,{exact:true}).first().waitFor();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './helpers/rg-fixtures.mjs';
const {clearStudioUICache}=loadSource('lib/browser/studio-settings.ts');

test('UI cleanup targets only owned cache names and never other browser storage', async()=>{
  const original=globalThis.window;
  const stores=new Set(['rgodbeat-studio-ui-v1','rgodbeat-studio-ui-old','another-app','rgodbeat-project-audio']);
  const removed=[];
  globalThis.window={caches:{keys:async()=>[...stores],delete:async name=>{removed.push(name);return stores.delete(name);}}};
  try{
    assert.deepEqual(await clearStudioUICache(),{supported:true,cleared:2});
    assert.deepEqual(removed,['rgodbeat-studio-ui-v1','rgodbeat-studio-ui-old']);
    assert.deepEqual([...stores],['another-app','rgodbeat-project-audio']);
  }finally{if(original===undefined)delete globalThis.window;else globalThis.window=original;}
});

test('unsupported cache storage is distinct from successful cleanup', async()=>{
  const original=globalThis.window;globalThis.window={};
  try{assert.deepEqual(await clearStudioUICache(),{supported:false,cleared:0});}
  finally{if(original===undefined)delete globalThis.window;else globalThis.window=original;}
});

test('an aborted cache deletion rejects rather than reporting success', async()=>{
  const original=globalThis.window;
  globalThis.window={caches:{keys:async()=>['rgodbeat-studio-ui-v1'],delete:async()=>{throw new Error('storage denied');}}};
  try{await assert.rejects(clearStudioUICache(),/storage denied/);}
  finally{if(original===undefined)delete globalThis.window;else globalThis.window=original;}
});

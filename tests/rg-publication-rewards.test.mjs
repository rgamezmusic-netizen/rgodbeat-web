import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

const input = { userId:'owner',artistId:'artist',trackId:'track',beatId:null,youtubeExportJobId:'job',youtubeVideoId:'video' };
function fixture(options = {}) {
  const calls = [];
  const db = {
    async rpc(name,args) {
      calls.push([name,args]); assert.equal(name,'rg_reward_publication');
      if (options.throws) throw Error('temporary failure');
      return { data: options.result ?? { status:'awarded',points:23,creditedRg:23 }, error:options.error || null };
    },
    from(table) {
      assert.equal(table,'rg_spendable_balances');
      const q={ select(){return q;},eq(k,v){assert.equal(k,'user_id');assert.equal(v,'owner');return q;},
        async maybeSingle(){return {data:options.balanceMissing?null:{balance_rg:'23'},error:options.balanceError?{code:'NETWORK'}:null};} };return q;
    },
  };
  return { ...loadSource('lib/rg/publications.ts', {
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({data:'publication',error:null})})},
    '@/lib/rg/identity':{validateOwnedTrackForPublication:async()=>{if(options.foreign)throw Error('Wrong owner');},RG_UUID:/.*/,RgIdentityError:class extends Error{}},
    '@/lib/rg/phase2/database':{createPhase2AdminClient:()=>db},
  }), calls };
}
test('confirmed publication uses the atomic points + matching RG RPC and only reads the owner balance',async()=>{
  const f=fixture();
  for(let i=0;i<2;i++) assert.deepEqual((await f.recordConfirmedPublication(input)).rewards,
    {score:'recorded',points:23,credits:'credited',creditedRg:23,balanceRg:23,reason:'awarded'});
  assert.deepEqual(f.calls,[['rg_reward_publication',{p_publication_id:'publication'}],['rg_reward_publication',{p_publication_id:'publication'}]]);
});
test('a foreign identity cannot trigger the reward RPC',async()=>{
  const f=fixture({foreign:true});assert.equal((await f.recordConfirmedPublication(input)).linked,false);assert.equal(f.calls.length,0);
});
test('database errors and malformed award amounts leave rewards pending without failing YouTube',async()=>{
  for(const options of [{error:{code:'PGRST202'}},{error:{code:'P0001'}},{throws:true},{result:{status:'awarded',points:23,creditedRg:999}},{result:{status:'awarded',points:200,creditedRg:200}}]) {
    const result=await fixture(options).recordConfirmedPublication(input);
    assert.equal(result.linked,true);assert.equal(result.rewards.score,'pending');assert.equal(result.rewards.creditedRg,null);
  }
});
test('block limits, duplicate files and historical scores are confirmed zero-credit outcomes',async()=>{
  for(const status of ['limit_reached','duplicate_audio','legacy']) {
    const r={status,points:status==='legacy'?10:0,creditedRg:0};
    const result=await fixture({result:r}).recordConfirmedPublication(input);
    assert.equal(result.rewards.reason,status);assert.equal(result.rewards.credits,'not_awarded');assert.equal(result.rewards.creditedRg,0);
  }
});
test('a confirmed credit survives an unavailable balance without inventing zero',async()=>{
  for(const options of [{balanceMissing:true},{balanceError:true}]) {
    const result=await fixture(options).recordConfirmedPublication(input);
    assert.equal(result.rewards.credits,'credited');assert.equal(result.rewards.creditedRg,23);assert.equal(result.rewards.balanceRg,null);
  }
});
test('receipt text explains block limits and retries without claiming nonexistent RG',()=>{
  const {publicationRewardMessages}=loadSource('lib/rg/publication-rewards.ts');
  assert.match(publicationRewardMessages().score,/pendientes/);
  assert.doesNotMatch(publicationRewardMessages().credits,/acreditados/);
  assert.match(publicationRewardMessages({reason:'limit_reached',score:'recorded',points:0,credits:'not_awarded',creditedRg:0}).credits,/tres premios/);
  assert.equal(publicationRewardMessages({score:'recorded',points:23,credits:'credited',creditedRg:23}).credits,'23 RG acreditados en tu wallet.');
});

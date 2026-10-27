import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

const input = {userId:'owner',artistId:'artist',trackId:'track',beatId:null,youtubeExportJobId:'job',youtubeVideoId:'video'};
function fixture(options = {}) {
  const calls = []; let credits = 0;
  const db = {
    async rpc(name,args) {
      calls.push([name,args]);
      if(name==='rg_record_score_event') return {data:options.scoreError?null:'score-id',error:options.scoreError};
      if(name==='rg_award_verified_activity') {
        if(options.awardThrows) throw Error('temporary failure');
        if(options.awardError) return {data:null,error:options.awardError};
        if(options.notAwarded) return {data:null,error:null};
        credits = 200; return {data:'ledger-id',error:null};
      }
      throw Error('Unexpected RPC');
    },
    from(table) {
      const filters=[];
      const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},async maybeSingle(){
        calls.push([table,filters]);
        if(table==='rg_score_events') return {data:{score_points:10},error:null};
        assert.ok(filters.some(([k,v])=>k==='user_id'&&v==='owner'));
        if(table==='rg_coin_ledger') return {data:options.ledgerMissing?null:{amount:'200'},error:null};
        if(table==='rg_spendable_balances') return {data:options.balanceMissing?null:{balance_rg:String(credits)},error:options.balanceMissing?{code:'UNAVAILABLE'}:null};
        throw Error('Unexpected table');
      }};return q;
    },
  };
  const publicationModule = loadSource('lib/rg/publications.ts',{
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({data:'publication',error:null})})},
    '@/lib/rg/identity':{validateOwnedTrackForPublication:async()=>{if(options.foreign)throw Error('Wrong owner');},RG_UUID:/.*/,RgIdentityError:class extends Error{}},
    '@/lib/rg/phase2/database':{createPhase2AdminClient:()=>db},
  });
  return {...publicationModule,calls,getCredits:()=>credits};
}
test('confirmed publication records points then credits the wallet using only verified Score evidence; retries reuse the same evidence',async()=>{
  const f=fixture();
  for(let i=0;i<2;i++) {
    const result=await f.recordConfirmedPublication(input);
    assert.deepEqual(result.rewards,{score:'recorded',points:10,credits:'credited',creditedRg:200,balanceRg:200});
  }
  assert.equal(f.getCredits(),200);
  assert.deepEqual(f.calls.filter(([name])=>name==='rg_award_verified_activity').map(([,args])=>args),[{p_score_event_id:'score-id'},{p_score_event_id:'score-id'}]);
  assert.ok(f.calls.filter(([name])=>name==='rg_coin_ledger').every(([,filters])=>filters.some(([k,v])=>k==='source_id'&&v==='score-id')));
});
test('unverified ownership or failed Score cannot issue RG',async()=>{
  const foreign=fixture({foreign:true});assert.equal((await foreign.recordConfirmedPublication(input)).linked,false);assert.equal(foreign.calls.length,0);
  const f=fixture({scoreError:{code:'FAILED'}});const result=await f.recordConfirmedPublication(input);
  assert.equal(result.linked,true);assert.equal(result.rewards.score,'pending');assert.equal(result.rewards.creditedRg,null);
  assert.equal(f.calls.some(([name])=>name==='rg_award_verified_activity'),false);
});
test('missing migration, exhausted budget, disabled awards and network failures never masquerade as credited RG or a failed YouTube upload',async()=>{
  for(const [options,status] of [[{awardError:{code:'PGRST202'}},'unavailable'],[{awardError:{code:'P0001'}},'pending'],[{awardThrows:true},'pending'],[{notAwarded:true},'not_awarded'],[{ledgerMissing:true},'pending']]) {
    const result=await fixture(options).recordConfirmedPublication(input);
    assert.equal(result.linked,true);assert.equal(result.rewards.score,'recorded');assert.equal(result.rewards.points,10);
    assert.equal(result.rewards.credits,status);assert.equal(result.rewards.creditedRg,null);assert.equal(result.rewards.balanceRg,null);
  }
});
test('a confirmed credit survives a failed balance read without inventing a zero balance',async()=>{
  const result=await fixture({balanceMissing:true}).recordConfirmedPublication(input);
  assert.equal(result.rewards.credits,'credited');assert.equal(result.rewards.creditedRg,200);assert.equal(result.rewards.balanceRg,null);
});
test('receipt text distinguishes pending points and unconfirmed RG from an actual ledger credit',()=>{
  const {publicationRewardMessages}=loadSource('lib/rg/publication-rewards.ts');
  assert.match(publicationRewardMessages().score,/pendientes/);
  assert.doesNotMatch(publicationRewardMessages().credits,/acreditados/);
  assert.equal(publicationRewardMessages({score:'recorded',points:10,credits:'credited',creditedRg:200,balanceRg:200}).credits,'200 RG acreditados en tu wallet.');
});

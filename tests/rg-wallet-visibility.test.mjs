import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSource } from './helpers/rg-fixtures.mjs';
import { marketRows, marketProducts } from './helpers/rg-market-fixtures.mjs';

const summary = (changes = {}) => {
 const counts={availableBeatPasses:0,reservedBeatPasses:0,consumedBeatPasses:0,...changes};
 return { balanceRg:10000,beatPassEnabled:true,beatPassCostRg:10000,beatPassEligibleTiers:['mp3'],cashWithdrawalEnabled:false,tradingEnabled:false,
  products:marketProducts,passes:['available','reserved','consumed'].flatMap(status=>Array.from({length:counts[status+'BeatPasses']??0},(_,i)=>({id:status+i,productKey:'beat_pass',version:1,status}))),...counts };
};
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
const replacements = {
  'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
  'next/navigation': { useRouter: () => ({ refresh() {} }), redirect: () => { throw Error('REDIRECT'); } },
  './RgProduct.module.css': css, '@/components/ranking/RgProduct.module.css': css,
  '@/components/layout': { Navbar: () => null, Footer: () => null },
};
const markup = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('Wallet and account show earned RG, purchased inventory and consumed/reserved totals without ledger internals', async () => {
  for (const wallet of [summary(), summary({ balanceRg: 0, availableBeatPasses: 1 }), summary({ balanceRg: 0, consumedBeatPasses: 1 }), summary({ balanceRg: 0, reservedBeatPasses: 1 })]) {
    const mocks = { ...replacements, '@/lib/auth/server': { getCurrentUser: async () => ({ id: 'owner' }) },
      '@/lib/rg/product/wallet': { getRgWalletSummary: async id => { assert.equal(id, 'owner'); return wallet; } } };
    const page = loadSource('app/rg/wallet/page.tsx', mocks);
    const html = renderToStaticMarkup(await page.default());
    const card = markup(loadSource('components/rg/RgAccountWallet.tsx', mocks).RgAccountWallet, { wallet });
    for (const result of [html, card]) {
      assert.match(result, /RG BALANCE/);
      assert.ok(result.includes(`${wallet.balanceRg.toLocaleString('es-MX')} RG`));
      assert.ok(result.includes(`${wallet.availableBeatPasses} AVAILABLE`));
      assert.ok(result.includes(`${wallet.reservedBeatPasses} RESERVED`));
      assert.ok(result.includes(`${wallet.consumedBeatPasses} CONSUMED`));
      assert.doesNotMatch(result, /coin_ledger_id|purchase_request_key|user_id/);
    }
  }
  const { RgAccountWallet } = loadSource('components/rg/RgAccountWallet.tsx', replacements);
  const unavailable = markup(RgAccountWallet, { wallet: null });
  assert.match(unavailable, /role="alert"/);
  assert.doesNotMatch(unavailable, /0 RG|0 AVAILABLE/);
});

test('server inventory counts only the authenticated owner and keeps failed counts distinct from zero', async () => {
  const rows = ['available','reserved','consumed'].map(status=>({id:status,user_id:'owner',status,product_key:'beat_pass',product_version:1})).concat([{id:'other',user_id:'other',status:'available',product_key:'beat_pass',product_version:1}]);
  let failed = false;
  const db = { from(table) {
    const filters = [];
    const query = { range() { return query; }, order() { return query; }, select() { return query; }, eq(k, v) { filters.push([k, v]); return query; }, single() { return query; }, maybeSingle() { return query; },
      then(resolve) {
        if (table === 'rg_economy_config') return Promise.resolve({ data: { beat_pass_enabled: true, beat_pass_cost_rg: 10000, beat_pass_eligible_license_tiers: ['mp3'], max_rg_discount_percent: 50 }, error: null }).then(resolve);
        if (table === 'rg_market_products') return Promise.resolve({data:marketRows,error:null}).then(resolve);
        assert.ok(filters.some(([k, v]) => k === 'user_id' && v === 'owner'));
        if (table === 'rg_spendable_balances') return Promise.resolve({ data: { balance_rg: '0' }, error: null }).then(resolve);
        return Promise.resolve({ data: failed ? null : rows.filter(row=>filters.every(([k,v])=>row[k]===v)), count: failed ? null : rows.filter(row=>filters.every(([k,v])=>row[k]===v)).length, error: failed ? {message:'inventory unavailable'} : null }).then(resolve);
      } };
    return query;
  } };
  const getWallet = loadSource('lib/rg/product/wallet.ts', { '@/lib/rg/phase2/database': { createPhase2AdminClient: () => db } }).getRgWalletSummary;
  const wallet = await getWallet('owner');
  assert.equal(wallet.balanceRg, 0);
  assert.equal(wallet.availableBeatPasses, 1);
  assert.equal(wallet.reservedBeatPasses, 1);
  assert.equal(wallet.consumedBeatPasses, 1);
  failed = true;
  await assert.rejects(getWallet('owner'), /unavailable/);
});

// Drive the real client components with isolated hook storage and mocked network calls.
// These tests never connect to Production or execute real purchase/gift mutations.
function client(file, name, extra = {}) {
  let cursor = 0;
  const hooks = [], effects = [];
  const hookReact = { ...React,
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
    useCallback(fn, deps) {
      const i = cursor++, previous = hooks[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) hooks[i] = { deps, fn };
      return hooks[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++, previous = hooks[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) effects.push(() => { previous?.cleanup?.(); hooks[i] = { deps, cleanup: fn() }; });
    },
  };
  // React default and named imports must share the same isolated hooks.
  const component = loadSource(file, { ...replacements, ...extra, react: { __esModule: true, default: hookReact, ...hookReact } })[name];
  return {
    render(props = {}) { cursor = 0; return component(props); },
    async effects() { for (const effect of effects.splice(0)) effect(); await new Promise(resolve => setImmediate(resolve)); },
  };
}
function findElement(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) {
    const found = findElement(child, predicate); if (found) return found;
  }
  return null;
}
const textOf = tree => typeof tree === 'string' ? tree : React.Children.toArray(tree?.props?.children).map(textOf).join('');
async function environment(run) {
  const saved = { fetch: globalThis.fetch, window: globalThis.window, sessionStorage: globalThis.sessionStorage };
  const storage = new Map();
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  try { await run(); } finally { Object.assign(globalThis, saved); }
}

test('Market refreshes the real server summary after purchase, including a response without optimistic counts', () => environment(async () => {
  const calls = [];
  let readFails = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options?.method ?? 'GET' });
    return { ok: !readFails, json: async () => url === '/api/rg/market/pass' ? { passId: 'real-pass' } : summary({ balanceRg: 0, availableBeatPasses: 1 }) };
  };
  const market = client('components/rg/RgMarketClient.tsx', 'RgMarketClient');
  let tree = market.render({ initialWallet: summary() });
  assert.match(renderToStaticMarkup(tree), /10,000 RG/);
  await market.effects();
  const actionProps=findElement(tree, el=>el.type?.name==='RgPassActions'&&el.props.product.productKey==='beat_pass').props;
  const actions=client('components/rg/RgPassActions.tsx','RgPassActions');
  await findElement(actions.render(actionProps), el=>el.type==='button').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = market.render({ initialWallet: summary() });
  assert.match(renderToStaticMarkup(tree), />0 RG</);
  assert.match(renderToStaticMarkup(tree), /1 AVAILABLE/);
  assert.deepEqual(calls.map(call => call.url), ['/api/rg/market/pass', '/api/rg/wallet']);
  readFails = true;
  // Verify client read failures cannot turn into fabricated zero inventory.
  const { fetchRgWalletSummary } = loadSource('lib/rg/product/wallet-client.ts');
  await assert.rejects(fetchRgWalletSummary(), /consultar/);
}));

test('a successful purchase with an unavailable inventory read shows unknown status, never a fabricated pass', () => environment(async () => {
  globalThis.fetch = async url => ({ ok: url === '/api/rg/market/pass', json: async () => ({ passId: 'confirmed-pass' }) });
  const market = client('components/rg/RgMarketClient.tsx', 'RgMarketClient');
  const tree = market.render({ initialWallet: summary() });
  await market.effects();
  const actionProps=findElement(tree, el=>el.type?.name==='RgPassActions'&&el.props.product.productKey==='beat_pass').props;
  const actions=client('components/rg/RgPassActions.tsx','RgPassActions');
  await findElement(actions.render(actionProps), el=>el.type==='button').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  const after = renderToStaticMarkup(market.render({ initialWallet: summary() }));
  assert.match(renderToStaticMarkup(actions.render(actionProps)), /Pase agregado a MY PASSES/);
  assert.match(after, /sin confirmar/);
  assert.doesNotMatch(after, /1 AVAILABLE|0 AVAILABLE|10,000 RG<\/dd>/);
}));

test('client summary rejects missing counts and invalid balances instead of using zero defaults', () => environment(async () => {
  const { fetchRgWalletSummary } = loadSource('lib/rg/product/wallet-client.ts');
  for (const data of [{ balanceRg: 0 }, summary({ availableBeatPasses: null }), summary({ balanceRg: -1 })]) {
    globalThis.fetch = async () => ({ ok: true, json: async () => data });
    await assert.rejects(fetchRgWalletSummary(), /validar/);
  }
}));

test('Cart shows the selected pass and balance, then server-confirmed consumed inventory after checkout', () => environment(async () => {
  let redeemed = false;
  const calls = [];
  const cart = { items: [{ id: 'item', beat: { id: 'beat' }, licenseTier: 'mp3' }], isCartOpen: true, closeCart() {}, removeFromCart() {}, clearCart() { cart.items = []; }, totalAmount: 29, itemCount: 1 };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options?.method ?? 'GET' });
    if (url === '/api/checkout/rg-beat-pass') { redeemed = true; return { ok: true, json: async () => ({ purchases: [{ id: 'license', licenseTier: 'mp3', beatTitle: 'Beat' }] }) }; }
    assert.equal(url, '/api/rg/wallet');
    return { ok: true, json: async () => summary({ balanceRg: 0, availableBeatPasses: redeemed ? 0 : 1, consumedBeatPasses: redeemed ? 1 : 0 }) };
  };
  const drawer = client('components/cart/CartDrawer.tsx', 'CartDrawer', {
    '@/contexts/CartContext': { useCart: () => cart },
    '@/lib/commerce/gift-feature': { isGiftCheckoutVisible: () => false },
    './CartItemRow': { CartItemRow: () => null },
    '@/components/ui/Button': { Button: ({ children, ...props }) => React.createElement('button', props, children) },
    '@stripe/react-stripe-js': { EmbeddedCheckoutProvider: () => null, EmbeddedCheckout: () => null },
    '@/lib/stripe/client': { getStripeClient: () => { throw Error('Must not use Stripe'); } },
  });
  drawer.render(); await drawer.effects();
  let tree = drawer.render();
  findElement(tree, el => el.type === 'button' && textOf(el).startsWith('RG BEAT PASS')).props.onClick();
  tree = drawer.render(); await drawer.effects(); tree = drawer.render();
  const before = renderToStaticMarkup(tree);
  assert.match(before, />0 RG</); assert.match(before, /1 AVAILABLE/); assert.match(before, /consume 1 RG Beat Pass/);
  assert.equal(calls.filter(call => call.method === 'POST').length, 0, 'selecting payment must not redeem automatically');
  await findElement(tree, el => textOf(el) === 'CANJEAR RG BEAT PASS' && typeof el.props?.onClick === 'function').props.onClick();
  tree = drawer.render();
  const after = renderToStaticMarkup(tree);
  assert.match(after, />0 RG</); assert.match(after, /0 AVAILABLE/); assert.match(after, /1 CONSUMED/);
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
}));

test('MY PASSES shows ticket and Studio statuses and only available entitlements expose USE/GIFT',()=>{
 const wallet=summary({passes:[{id:'mp3',productKey:'mp3_25',version:1,status:'available'},{id:'wav',productKey:'wav_50',version:1,status:'reserved'},{id:'studio',productKey:'studio_30',version:1,status:'consumed'}]});
 const {RgMyPasses}=loadSource('components/rg/RgMyPasses.tsx',replacements);const result=markup(RgMyPasses,{wallet});
 assert.match(result,/MY PASSES/);assert.match(result,/25% MP3 Ticket/);assert.match(result,/50% WAV Ticket/);assert.match(result,/RG Studio Pass/);
 assert.match(result,/1 RESERVED/);assert.match(result,/1 CONSUMED/);assert.equal((result.match(/>USE</g)??[]).length,1);
});
test('Market Studio GET FOR ME uses the purchased server pass to activate Studio exactly once',()=>environment(async()=>{
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>url==='/api/rg/market/pass'?{passId:'server-studio-pass'}:{status:'fulfilled'}};};
 const actions=client('components/rg/RgPassActions.tsx','RgPassActions');const props={product:{...marketProducts.find(p=>p.productKey==='studio_30'),active:true}};
 await findElement(actions.render(props),el=>el.type==='button'&&textOf(el)==='GET FOR ME').props.onClick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls.map(c=>c.url),['/api/rg/market/pass','/api/checkout/rg-market']);assert.equal(calls[1].body.passId,'server-studio-pass');assert.equal(calls[1].body.recipientMode,'self');assert.equal(calls[1].body.giftPass,false);
 assert.match(renderToStaticMarkup(actions.render(props)),/Studio extendido por 30 días/);
}));

test('wallet reads every inventory page instead of silently truncating authoritative counts at the REST row limit',async()=>{
 const ownerRows=Array.from({length:1251},(_,i)=>({id:`owned-${i}`,product_key:'beat_pass',product_version:1,status:'available',coin_ledger_id:'PRIVATE'}));
 const ranges=[];
 const db={from(table){let start=0,end=Infinity;const q={select(){return q;},eq(k,v){if(table==='rg_beat_passes'||table==='rg_spendable_balances'){assert.equal(k,'user_id');assert.equal(v,'owner');}return q;},order(){return q;},range(a,b){start=a;end=b;ranges.push([a,b]);return q;},single(){return q;},maybeSingle(){return q;},then(resolve){const data=table==='rg_beat_passes'?ownerRows.slice(start,end+1):table==='rg_market_products'?marketRows:table==='rg_spendable_balances'?{balance_rg:0}:{beat_pass_enabled:true,market_v1_enabled:false};return Promise.resolve({data,count:ownerRows.length,error:null}).then(resolve);}};return q;}};
 const {getRgWalletSummary}=loadSource('lib/rg/product/wallet.ts',{'@/lib/rg/phase2/database':{createPhase2AdminClient:()=>db}});
 const result=await getRgWalletSummary('owner');assert.equal(result.availableBeatPasses,1251);assert.equal(result.passes.length,1251);assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|coin_ledger_id/);
});

test('cart total and confirmation button both use the server ticket quote while normal payment stays available',()=>environment(async()=>{
 const cart={items:[{id:'item',beat:{id:'beat'},licenseTier:'mp3'}],isCartOpen:true,closeCart(){},removeFromCart(){},clearCart(){},totalAmount:29,itemCount:1};
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,body:options?.body?JSON.parse(options.body):null});return{ok:true,json:async()=>url==='/api/rg/wallet'?summary({passes:[{id:'ticket',productKey:'mp3_25',version:1,status:'available'}]}):{remainingCents:2175,discountCents:725,passName:'25% MP3 Ticket'}};};
 const drawer=client('components/cart/CartDrawer.tsx','CartDrawer',{'@/contexts/CartContext':{useCart:()=>cart},'@/lib/commerce/gift-feature':{isGiftCheckoutVisible:()=>false},'./CartItemRow':{CartItemRow:()=>null},'@/components/ui/Button':{Button:({children,...props})=>React.createElement('button',props,children)},'@stripe/react-stripe-js':{EmbeddedCheckoutProvider:()=>null,EmbeddedCheckout:()=>null},'@/lib/stripe/client':{getStripeClient:()=>{throw Error('Must not start Stripe from selection');}}});
 drawer.render();await drawer.effects();let tree=drawer.render();findElement(tree,el=>el.type==='select').props.onChange({target:{value:'ticket'}});drawer.render();await drawer.effects();tree=drawer.render();
 const html=renderToStaticMarkup(tree);assert.match(html,/CONTINUAR AL PAGO \(\$21\.75\)/);assert.match(html,/PAY NORMALLY/);assert.match(html,/Se consumirá un pase/);
 assert.ok(calls.filter(call=>call.body).every(call=>call.body.quoteOnly===true),'selection is a server quote, never a redemption or gift');
}));

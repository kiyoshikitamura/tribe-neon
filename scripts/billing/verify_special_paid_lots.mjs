// Integrated local PostgreSQL acceptance: real Special RPCs + actual paid-lot triggers.
// No Supabase connection or payment provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.SPECIAL_GACHA_KEEP_DB = '1';
const { db, user, draw, catalog, exchange } = await import('../verify_special_gacha_release.mjs');
const sourceRoot = process.env.BILLING_TEST_ROOT || process.cwd();
const source = file => fs.readFileSync(path.join(sourceRoot,file),'utf8');
const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
const tickets = ['SPECIAL_TICKET_CHARACTER','SPECIAL_TICKET_SKILL','SPECIAL_TICKET_EQUIPMENT'];
// Existing free inventory has no lot and must remain free.
for (const ticket of tickets) await rows('update user_items set quantity=50 where user_id=$1 and item_id=$2',[user,ticket]);
await db.exec(`
create table presents(id uuid primary key default gen_random_uuid(),user_id uuid,item_id text,quantity integer,message text,status text,expire_at timestamptz,claimed_at timestamptz);
create table payment_transactions(id uuid default gen_random_uuid(),user_id uuid,product_id text,amount integer,currency text,status text);
create table user_shop_purchases(user_id uuid,product_id text,purchase_count integer,last_purchased_at timestamptz,primary key(user_id,product_id));
alter table user_equipments add column equipment_master_id text;
`);
await db.exec(source('scripts/billing/preview_schema.sql'));
await db.exec(source('supabase/migrations/20260913105839_billing_paid_pack_lots.sql'));
const claimSource=source('supabase/migrations/20260812000135_provisional_open_beta_missions.sql');
await db.exec(claimSource.slice(claimSource.indexOf('CREATE OR REPLACE FUNCTION public.grant_present_payload('),claimSource.indexOf('REVOKE ALL ON FUNCTION public.claim_present(uuid, uuid)')));
const buy = async session => {
 const order=(await rows("select billing_reserve_order($1,$2,'ticket_pack_01') data",[user,randomUUID()]))[0].data;
 await rows("select billing_grant_order($1,$2,$3,'jpy')",[order.id,session,order.amount_jpy]);
 await rows('select claim_all_presents()');
 return order.id;
};
const firstOrder = await buy('cs_test_integrationfirst');
const secondOrder = await buy('cs_test_integrationsecond');
// Later purchase expires first, so insertion order must not determine spending.
await rows("update billing_asset_lots set expires_at=now()+interval '10 days' where order_id=$1",[firstOrder]);
await rows("update billing_asset_lots set expires_at=now()+interval '1 day' where order_id=$1",[secondOrder]);
const inventory = async () => (await rows("select item_id,quantity from user_items where user_id=$1 and item_id=any($2::text[]) order by item_id",[user,tickets]));
const lotState = async () => (await rows('select order_id,item_id,remaining_quantity,expired_quantity from billing_asset_lots where user_id=$1 order by order_id,item_id',[user]));
const points = async () => (await catalog()).pity_points;
for (const row of await inventory()) assert.equal(row.quantity,60);
const data=await catalog();
let expectedPoints=await points();
const expectedBalance=Object.fromEntries(tickets.map(t=>[t,60]));
const expectedPaid=Object.fromEntries(tickets.map(t=>[t,{early:5,late:5}]));
for (const g of data.gachas) {
 const ticket = g.id.startsWith('CHAR_') ? tickets[0] : g.id==='SKILL_SPECIAL' ? tickets[1] : tickets[2];
 for (const currency of ['diamonds','ticket']) for (const count of [1,10]) {
  const request = randomUUID();
  const beforeLots=await lotState();
  const first=await draw(g.id,count,currency,request);
  expectedPoints+=count;
  assert.equal(first.pity_after,expectedPoints);
  if (currency==='ticket') {
   expectedBalance[ticket]-=count;
   let spend=count;
   for (const key of ['early','late']) { const take=Math.min(spend,expectedPaid[ticket][key]);expectedPaid[ticket][key]-=take;spend-=take; }
  } else assert.deepEqual(await lotState(),beforeLots,'DIA pull cannot consume ticket lots');
  for (const row of await inventory()) assert.equal(row.quantity,expectedBalance[row.item_id]);
  for (const lot of await lotState()) {
   const key=lot.order_id===secondOrder?'early':'late';
   assert.equal(lot.remaining_quantity,expectedPaid[lot.item_id][key],`${g.id}/${currency}/${count}: earliest paid lot first`);
  }
  const afterLots=await lotState(); const afterInventory=await inventory();
  assert.deepEqual(await draw(g.id,count,currency,request),first,'retry returns exact result');
  assert.deepEqual(await lotState(),afterLots,'retry never spends paid lot twice');
  assert.deepEqual(await inventory(),afterInventory,'retry never spends free ticket twice');
  assert.equal(await points(),expectedPoints,'retry never adds points twice');
 }
}
assert.ok((await lotState()).every(lot=>lot.remaining_quantity===0),'paid lots consumed before free tickets');
// Set up an expired-only balance using a real third purchase and Present claim.
for (const ticket of tickets) await rows('update user_items set quantity=0 where user_id=$1 and item_id=$2',[user,ticket]);
const thirdOrder=await buy('cs_test_integrationthird');
await rows("update billing_asset_lots set issued_at=now()-interval '121 days',expires_at=now()-interval '1 day' where order_id=$1",[thirdOrder]);
const expiredRequest=randomUUID(); const expiredBefore=await lotState(); const inventoryBefore=await inventory();
const historyBefore=(await rows('select count(*)::int n from gacha_execution_history where user_id=$1',[user]))[0].n;
await assert.rejects(draw('CHAR_JUSTICE_EVIL_SPECIAL',1,'ticket',expiredRequest),/EXPIRED_ASSET_BALANCE/);
assert.deepEqual(await lotState(),expiredBefore,'failed draw rolls back expiry/consumption');
assert.deepEqual(await inventory(),inventoryBefore);
assert.equal(await points(),expectedPoints);
assert.equal((await rows('select count(*)::int n from gacha_execution_history where user_id=$1',[user]))[0].n,historyBefore);
// Synchronize expiry, then the same request can succeed after legitimate free supply.
await rows('select billing_refresh_paid_assets()');
assert.ok((await inventory()).every(row=>row.quantity===0));
const expiredLots=(await lotState()).filter(lot=>lot.order_id===thirdOrder);
assert.ok(expiredLots.every(lot=>lot.remaining_quantity===0&&lot.expired_quantity===5));
await assert.rejects(draw('CHAR_JUSTICE_EVIL_SPECIAL',1,'ticket',expiredRequest),/insufficient gacha tickets/);
await rows('update user_items set quantity=10 where user_id=$1 and item_id=$2',[user,tickets[0]]);
const recovered=await draw('CHAR_JUSTICE_EVIL_SPECIAL',1,'ticket',expiredRequest);
assert.equal(recovered.results.length,1); expectedPoints++;
assert.equal((await inventory()).find(row=>row.item_id===tickets[0]).quantity,9);
// SSR exchange only consumes Pt; cash, DIA, paid lots and SP tickets remain intact.
const userBefore=(await rows('select cash,neon_diamonds from users where id=$1',[user]))[0];
const exchangeInventory=await inventory(); const exchangeLots=await lotState(); const exchangeRequest=randomUUID();
const result=await exchange('SKILL','SKILL_052',exchangeRequest);
assert.equal(result.current_points,expectedPoints-100);
assert.deepEqual(await exchange('SKILL','SKILL_052',exchangeRequest),result);
assert.deepEqual(await inventory(),exchangeInventory);
assert.deepEqual(await lotState(),exchangeLots);
assert.deepEqual((await rows('select cash,neon_diamonds from users where id=$1',[user]))[0],userBefore);
console.log('PASS: Special × paid lots: real purchase/Present, 16 draw conditions with triggers, expiry-order paid-first/free-last, ten-pull, retry, expired-only rejection/rollback, expiry sync, Pt-only exchange');
await db.close();

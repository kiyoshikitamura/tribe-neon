import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/app/context/hooks/useInventory.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function fixture({ response = { data: { status: 'success' } }, refreshFails = false, holdRpc = false, holdRefresh = false } = {}) {
  let calls = 0, refreshes = 0, dialog = null, locked = false, releaseRpc, releaseRefresh;
  const rpcGate = holdRpc ? new Promise(resolve => { releaseRpc = resolve; }) : Promise.resolve();
  const refreshGate = holdRefresh ? new Promise(resolve => { releaseRefresh = resolve; }) : Promise.resolve();
  const react = { useState: initial => [initial, () => {}], useRef: current => ({ current }), useCallback: fn => fn, useLayoutEffect() {} };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    exports: module.exports, module,
    require: name => name === 'react' ? react : name === '@/utils/supabase' ? { supabase: { rpc: async (name, args) => {
      assert.equal(name, 'use_action_resource_ticket');
      assert.ok(['PVP_POINT_TICKET', 'RAID_POINT_TICKET'].includes(args.p_item_id));
      calls++; await rpcGate; return response;
    } } } : name.endsWith('useImmediateActionLock') ? { useImmediateActionLock: () => ({ beginAction() { if (locked) return false; locked = true; return true; }, endAction() { locked = false; } }) }
      : name.endsWith('inventoryProjection') ? { buildInventoryQuantityProjection: () => ({}) } : {},
  });
  const hook = module.exports.useInventory({ user: { id: 'qa-a' } }, 0, () => {}, 0, () => {}, 0, () => {}, () => {}, async () => {
    refreshes++; await refreshGate; if (refreshFails) throw new Error('network refresh failed');
  }, value => { dialog = value; });
  return { hook, releaseRpc, releaseRefresh, get calls() { return calls; }, get refreshes() { return refreshes; }, get dialog() { return dialog; }, get locked() { return locked; } };
}
for (const id of ['PVP_POINT_TICKET', 'RAID_POINT_TICKET']) {
  const f = fixture(); await f.hook.handleUseItem(id);
  assert.match(f.dialog.message, /が1回復しました。$/); assert.equal(f.calls, 1); assert.equal(f.refreshes, 1); assert.equal(f.locked, false);
}
let f = fixture({ refreshFails: true }); await f.hook.handleUseItem('RAID_POINT_TICKET');
assert.equal(f.dialog.title, 'アイテム使用'); assert.match(f.dialog.message, /1回復しました。.*再読み込み/); assert.doesNotMatch(f.dialog.message, /再度お試し|もう一度お試し/); assert.equal(f.calls, 1);
for (const response of [{ error: new Error('server rejected') }, { data: null }, { data: { status: 'error' } }]) {
  f = fixture({ response }); await f.hook.handleUseItem('RAID_POINT_TICKET');
  assert.equal(f.dialog.title, 'アイテムを使用できませんでした'); assert.equal(f.refreshes, 0); assert.equal(f.locked, false);
}
f = fixture({ holdRpc: true });
let pending = f.hook.handleUseItem('RAID_POINT_TICKET'); await f.hook.handleUseItem('RAID_POINT_TICKET');
assert.equal(f.calls, 1); f.hook.resetUserItemsProjection('qa-b'); f.releaseRpc(); await pending;
assert.equal(f.dialog, null); assert.equal(f.refreshes, 0); assert.equal(f.locked, false);
f = fixture({ holdRefresh: true });
pending = f.hook.handleUseItem('RAID_POINT_TICKET'); await Promise.resolve(); await Promise.resolve();
f.hook.resetUserItemsProjection('qa-b'); f.releaseRefresh(); await pending;
assert.equal(f.dialog, null); assert.equal(f.locked, false);
console.log('PASS: Bag ticket receipts, post-commit refresh failure, failed/absent receipt, duplicate click and auth-owner changes. Actual hook with mocked transport; no DB tickets consumed.');

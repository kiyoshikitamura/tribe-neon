import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// 実コンポーネントのCTAを実行し、保存・確認・画面遷移の順序を検証する。
const source = fs.readFileSync('src/app/components/TutorialRuleGuide.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture({ anonymous = true, rpc, strictMode = false }) {
  const events = [];
  let stateIndex = 0;
  const game = {
    onboardingState: { tutorial_step: 'RULE_GUIDE', is_anonymous: anonymous },
    setOnboardingState: (value) => events.push(['state', value.tutorial_step]),
    setActiveTab: (value) => events.push(['tab', value]),
    setGlobalInteractionBlocking: (value) => events.push(['blocking', value]),
    playCyberSe: () => {},
  };
  const react = {
    useState: (initial) => {
      const index = stateIndex++;
      return [index === 2 ? 'FINAL_GUIDE' : initial, (value) => events.push(['local', index, value])];
    },
    useRef: (value) => ({ current: value }),
    useEffect: (effect) => {
      const cleanup = effect();
      if (strictMode && cleanup) { cleanup(); effect(); }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name.endsWith('GameContext')) return { useGame: () => game };
    if (name === '@/utils/supabase') return { supabase: { rpc } };
    if (name.endsWith('tutorialCompletionAssets')) return { getTutorialCompletionAssetStatus: () => 'ready', preloadTutorialCompletionAssets: async () => {} };
    return {};
  }});
  const tree = exports.default();
  const button = tree.props.children.props.children.find((node) => node?.type === 'button');
  return { events, click: button.props.onClick };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const complete = (anonymous = true) => ({ data: { tutorial_step: 'COMPLETE', gameplay_authorized: true, authentication_pending: anonymous }, error: null });
for (const anonymous of [true, false]) {
  let calls = 0;
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const f = fixture({ anonymous, strictMode: true, rpc: async (name) => {
    calls++;
    if (name === 'advance_tutorial_progress') return pending;
    return complete(anonymous);
  }});
  f.click(); f.click();
  assert.equal(calls, 1, '連打で保存を重複させない');
  assert(!f.events.some(([kind]) => kind === 'tab'), '保存確認前はHomeへ進まない');
  finish({ data: 'COMPLETE', error: null }); await flush();
  assert.deepEqual(f.events.filter(([kind]) => ['tab', 'state'].includes(kind)), [['tab', 'home'], ['state', 'COMPLETE']]);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'blocking'), [['blocking', true], ['blocking', false]]);
}
for (const failure of ['save-error', 'save-throw', 'state-error', 'state-throw', 'not-complete', 'unauthorized', 'anonymous-not-pending']) {
  let recovered = false;
  const f = fixture({ rpc: async (name) => {
    if (name === 'advance_tutorial_progress') {
      if (failure === 'save-throw') throw Error('connection lost');
      return { error: { message: 'Unexpected tutorial step' } };
    }
    if (recovered || failure.startsWith('save-')) return complete();
    if (failure === 'state-throw') throw Error('connection lost');
    if (failure === 'state-error') return { error: { message: 'failed' }, data: null };
    const result = complete();
    if (failure === 'not-complete') result.data.tutorial_step = 'RULE_GUIDE';
    if (failure === 'unauthorized') result.data.gameplay_authorized = false;
    if (failure === 'anonymous-not-pending') result.data.authentication_pending = false;
    return result;
  }});
  f.click(); await flush();
  if (failure.startsWith('save-')) {
    assert(f.events.some(([kind, value]) => kind === 'tab' && value === 'home'), '保存結果不明でもサーバー完了確認後は復帰');
  } else {
    assert(!f.events.some(([kind]) => kind === 'tab'), '確認失敗・未完了なら遷移しない');
    assert(f.events.some(([kind, index, value]) => kind === 'local' && index === 1 && typeof value === 'string'), '再試行可能なエラー表示');
    recovered = true; f.click(); await flush();
    assert.equal(f.events.filter(([kind]) => kind === 'tab').length, 1, '保存済み状態から再試行でHome復帰');
  }
}
console.log('PASS: Final Guide → confirmed COMPLETE → Home; anonymous/authenticated, StrictMode, duplicate tap, failed authority, transport loss and retry');

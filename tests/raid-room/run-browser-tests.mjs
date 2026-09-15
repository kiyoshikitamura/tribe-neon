/** scratch依存を利用。GameContextだけtest double、CSSはJSDOMで描画しない。 */
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const runtime = process.env.RAID_TEST_RUNTIME_DIR;
if (!runtime) throw new Error('RAID_TEST_RUNTIME_DIRにテスト用依存の格納ディレクトリを指定してください');
const runtimePath = resolve(runtime);
const require = createRequire(join(runtimePath, 'package.json'));
const { build } = require('esbuild');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await mkdtemp(join(runtimePath, 'raid-browser-'));
try {
  const output = join(temp, 'browser.test.cjs');
  await build({ entryPoints: [join(root, 'tests/raid-room/browser.test.tsx')], outfile: output, bundle: true,
    platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' },
    plugins: [{ name: 'test-game-context', setup(build) {
      build.onResolve({ filter: /GameContext$/ }, () => ({ path: 'game-context', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const useGame = () => ({ playCyberSe() {} });', loader: 'js' }));
    } }],
  });
  const setup = join(temp, 'dom.cjs');
  await writeFile(setup, `const {JSDOM}=require('jsdom'); const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost'}); for (const key of ['window','document','HTMLElement','HTMLButtonElement','Node','MutationObserver','getComputedStyle']) globalThis[key] = dom.window[key]; Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true}); globalThis.requestAnimationFrame=(fn)=>setTimeout(fn,0); globalThis.cancelAnimationFrame=clearTimeout; globalThis.IS_REACT_ACT_ENVIRONMENT=true;`);
  const run = spawnSync(process.execPath, ['--require', setup, '--test', output], { stdio: 'inherit' });
  process.exitCode = run.status ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }

/** ローカル一時DBのみ。接続URL・資格情報は受け取らない。 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = process.env.RAID_TEST_RUNTIME_DIR;
if (!runtime) throw Error('RAID_TEST_RUNTIME_DIRにPGliteとtsxを導入したscratchディレクトリを指定してください');
const require = createRequire(resolve(runtime, 'package.json'));
const result = spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href,
  '--test', 'tests/db/raid-room-condition-rules.test.mjs'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, RAID_TEST_RUNTIME: resolve(runtime) } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

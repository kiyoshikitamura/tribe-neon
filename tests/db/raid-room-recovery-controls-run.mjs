/** 一時PGliteのみで実行。外部接続URLや資格情報を使わない。 */
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const runtime=process.env.RAID_TEST_RUNTIME_DIR;
if(!runtime) throw Error('RAID_TEST_RUNTIME_DIRにPGlite導入ディレクトリを指定してください');
createRequire(resolve(runtime,'package.json')).resolve('@electric-sql/pglite');
const result=spawnSync(process.execPath,['--test','tests/db/raid-room-recovery-controls.test.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,RAID_TEST_RUNTIME:resolve(runtime)}});
if(result.error) throw result.error;
process.exitCode=result.status??1;

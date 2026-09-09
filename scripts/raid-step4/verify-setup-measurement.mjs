import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const runtime = process.env.RAID_TEST_RUNTIME_DIR;
assert.ok(runtime, 'RAID_TEST_RUNTIME_DIR is required');
const require = createRequire(join(resolve(runtime), 'package.json'));
const { build } = require('esbuild');
const temp = await mkdtemp(join(resolve(runtime), 'setup-contract-'));
const calls = [];
const store = new Map();
globalThis.document={referrer:''};
globalThis.window = { location:{href:'http://localhost/qa'}, sessionStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) } };
globalThis.__setupRpc = async (name, args) => { calls.push({ name, args }); return { data: null, error: null }; };
try {
  const output = join(temp, 'kpi.cjs');
  await build({ stdin: {contents: `export {recordAcquisitionObservation} from './src/utils/kpiInstrumentation'; export {recordWorldIntroObservation,initializeAcquisitionAttribution} from './src/utils/acquisitionAttribution';`,resolveDir:process.cwd(),loader:'ts'}, outfile: output, bundle: true, platform: 'node', format: 'cjs', plugins: [{ name: 'rpc-fixture', setup(builder) {
    builder.onResolve({ filter: /(?:utils\/|\.\/)supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const usingMockSupabase=false; export const supabase={rpc:(...args)=>globalThis.__setupRpc(...args)};', loader: 'js' }));
  } }] });
  const kpi = require(output);
  await Promise.all([kpi.recordAcquisitionObservation('WORLD_INTRO_STARTED'), kpi.recordAcquisitionObservation('WORLD_INTRO_STARTED')]);
  await kpi.recordAcquisitionObservation('WORLD_INTRO_COMPLETED');
  assert.equal(calls.filter(call => call.name === 'record_kpi_acquisition_landing_v1').length, 1);
  const observations = calls.filter(call => call.name === 'record_kpi_acquisition_observation_v1');
  assert.equal(new Set(calls.map(call => call.args.p_token)).size, 1);
  assert.equal(observations[0].args.p_idempotency_key, observations[1].args.p_idempotency_key);
  assert.deepEqual(observations.map(call => call.args.p_event_type), ['WORLD_INTRO_STARTED', 'WORLD_INTRO_STARTED', 'WORLD_INTRO_COMPLETED']);
  const sql = await readFile('supabase/migrations/20260906000249_kpi_authority_extensions.sql', 'utf8');
  for (const call of observations) assert.ok(sql.includes(`'${call.args.p_event_type}'`));
  const setup = await readFile('src/app/components/SetupView.tsx', 'utf8');
  assert.ok(setup.includes('from "@/utils/kpiInstrumentation"'));
  assert.ok(setup.includes('recordAcquisitionObservation("WORLD_INTRO_STARTED")'));
  assert.ok(setup.includes('recordAcquisitionObservation("WORLD_INTRO_COMPLETED")'));
  assert.ok(setup.includes('recordWorldIntroObservation'));
  kpi.recordWorldIntroObservation('WORLD_INTRO_VIEWED');
  kpi.recordWorldIntroObservation('WORLD_INTRO_SKIPPED');
  await kpi.initializeAcquisitionAttribution();
  await new Promise(resolve=>setTimeout(resolve,20));
  const worldSql=await readFile('supabase/migrations/20260907000251_world_intro_journey_events.sql','utf8');
  for(const event of ['WORLD_INTRO_VIEWED','WORLD_INTRO_SKIPPED']){assert.ok(setup.includes(event));assert.ok(worldSql.includes("'"+event+"'"));assert.ok(calls.some(call=>call.args.p_event_type===event));}
  assert.equal(new Set(calls.map(call=>call.args.p_token)).size,1);
  console.log('PASS 4 groups: existing RPC/shared token; stable retry key; SQL event contract; Production SQL250/251 Setup VIEWED/SKIPPED + shared token. HTTP persistence is not tested.');
} finally {
  await rm(temp, { recursive: true, force: true });
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.__setupRpc;
}

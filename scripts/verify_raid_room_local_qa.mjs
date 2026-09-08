// ローカルbuild済みQAのHTTP/SSR確認。実API・ブラウザ描画・実機の検証ではない。
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';

const port = 3138;
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => { logs = (logs + data.toString()).slice(-12000); });
try {
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`QA server exited: ${logs}`);
    try { response = await fetch(`http://127.0.0.1:${port}/qa/raid-room`, { signal: AbortSignal.timeout(5000) }); break; }
    catch { await pause(100); }
  }
  assert.ok(response, `QA server unavailable: ${logs}`);
  assert.equal(response.status, 200, `QA HTTP status ${response.status}: ${logs}`);
  const html = await response.text();
  assert.ok(html.includes('開発確認用のサンプルデータです'), 'QA sample label missing');
  assert.ok(html.includes('レイドRoom'), 'RaidRoomBrowser SSR missing');
  console.log('PASS: /qa/raid-room HTTP 200 and actual Room component SSR (mock build only)');
} finally {
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
}

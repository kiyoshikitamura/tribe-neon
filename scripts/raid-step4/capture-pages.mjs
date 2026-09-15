import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'docs/development/evidence/raid-step4/pages';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:3016/qa/raid-pages');
const report = [];
async function ready() {
  await page.waitForFunction(() => document.querySelectorAll('.spinner').length === 0);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {}))));
}
async function shot(name) { await ready(); await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' }); }
for (const [width, height] of [[375, 844], [390, 844], [430, 844], [390, 600]]) {
  await page.setViewportSize({ width, height });
  for (const view of ['selection', 'enemy', 'list', 'rescue', 'result']) {
    await page.getByLabel('検証画面').selectOption(view);
    await ready();
    const scroll = page.locator('.ui-hub-page-scroll');
    await scroll.evaluate(element => { element.scrollTop = 0; });
    await shot(`${view}-${width}x${height}-top`);
    const size = await page.locator('.ui-hub-page-content').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(size.scroll <= size.client + 1, `${view} ${width} overflow`);
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await shot(`${view}-${width}x${height}-bottom`);
    report.push({ view, width, height, size });
  }
}
await page.getByLabel('検証画面').selectOption('selection');
await ready();
await page.getByRole('group', { name: '本日の挑戦先' }).getByRole('button').last().click();
assert.equal(await page.getByTestId('qa-confirmed').textContent(), '0', 'selecting enemy must not create');
await page.getByRole('button', { name: 'この敵に挑む', exact: true }).click();
assert.equal(await page.getByTestId('qa-confirmed').textContent(), '1');
await page.getByLabel('検証画面').selectOption('rescue');
await ready();
const rescueId = await page.getByRole('region', { name: 'レイド救援' }).getAttribute('data-rescue-id');
await page.getByRole('button', { name: '救援先を開く' }).click();
assert.equal(await page.getByTestId('qa-action').textContent(), `open-rescue:${rescueId}`);
for (const scenario of ['member', 'rescue', 'cleared', 'expired', 'error', 'long-name', 'no-guild']) {
  await page.getByLabel('Mockシナリオ').selectOption(scenario);
  await shot(`rescue-${scenario}-390x600`);
  await page.getByLabel('検証画面').selectOption('result');
  await shot(`result-${scenario}-390x600`);
  if (scenario === 'member') {
    assert.match(await page.getByRole('region', { name: 'レイド戦績' }).textContent(), /敗北/);
    assert.match(await page.getByRole('region', { name: 'レイド戦績' }).textContent(), /開催中/);
  }
  await page.getByLabel('検証画面').selectOption('rescue');
}
assert.deepEqual(errors, []);
await writeFile(`${out}/report.json`, JSON.stringify({ report, errors, selectDoesNotCreate: 'PASS', rescueReference: 'PASS', personalDefeatVsRoomState: 'PASS' }, null, 2));
await browser.close();
console.log('PASS 20 viewport/view combinations, 7 rescue/result scenarios and operation contracts.');

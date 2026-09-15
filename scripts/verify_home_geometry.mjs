import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Mock harness only. Optional prior report must use identical viewport/scenario.
const base = new URL(process.argv[2] || 'http://127.0.0.1:3103');
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Only a local mock server is permitted');
const out = path.resolve(process.argv[3] || 'scratch/home-geometry');
const baselinePath = process.argv[4];
const baseline = baselinePath ? JSON.parse(await readFile(baselinePath, 'utf8')) : null;
await mkdir(out, { recursive: true });
const report = { status: 'PARTIAL', scope: 'Local mock Home geometry; not authenticated gameplay or final art acceptance', browserExecutable: chromium.executablePath(), browserExists: existsSync(chromium.executablePath()), baseline: baselinePath || null, cases: [], errors: [] };
let browser;
try {
  browser = await chromium.launch();
  for (const width of [320, 390, 412]) {
    for (const scenario of ['first-home-fresh', 'first-home-guild-out', 'first-home-guild-in', 'first-home-raid']) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const externalRequests = [];
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
          externalRequests.push(url.origin);
          await route.abort();
          return;
        }
        await route.continue();
      });
      page.on('pageerror', error => report.errors.push({ width, scenario, error: error.message }));
      await page.goto(new URL(`/qa/presentation?scenario=${scenario}`, base).href, { waitUntil: 'networkidle' });
      await page.locator(`[data-home-scenario="${scenario}"][data-cta-authority-ready="true"]`).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => {
        const box = selector => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          stage: box('.mypage-visual-area'),
          character: box('.mypage-leader-layer'),
          menu: box('.mypage-circle-menu-area'),
          banner: box('.mypage-event-banner-area'),
          labels: [...document.querySelectorAll('.circle-menu-label')].map(el => el.textContent),
          highlights: document.querySelectorAll('[data-recommended="true"]').length,
          missingImages: [...document.querySelectorAll('.mypage-view img')].filter(img => !img.complete || !img.naturalWidth).map(img => img.getAttribute('src')),
        };
      });
      // A baseline comparison is not fabricated when only the candidate server exists.
      const before = baseline?.cases.find(entry => entry.width === width && entry.scenario === scenario)?.geometry;
      const comparison = before ? {
        stageUnchanged: JSON.stringify(before.stage) === JSON.stringify(geometry.stage),
        characterUnchanged: before.character != null && JSON.stringify(before.character) === JSON.stringify(geometry.character),
        menuNotTaller: geometry.menu != null && before.menu != null && geometry.menu.height <= before.menu.height + 0.5,
        bannerNotLower: geometry.banner != null && before.banner != null && geometry.banner.y <= before.banner.y + 0.5,
      } : null;
      const checks = {
        fourEntries: JSON.stringify(geometry.labels) === JSON.stringify(['クエスト', 'バトル', 'レイド', 'ギルド']),
        atMostOneHighlight: geometry.highlights <= 1,
        menuWithinExistingHeight: geometry.menu != null && geometry.menu.height <= 68.5,
      };
      report.cases.push({ width, height: 844, scenario, geometry, checks, comparison, blockedExternalOrigins: [...new Set(externalRequests)] });
      await page.screenshot({ path: path.join(out, `${scenario}-${width}.png`), fullPage: true, animations: 'disabled' });
      await page.close();
    }
  }
  const failed = report.cases.some(entry => Object.values(entry.checks).includes(false) || (entry.comparison && Object.values(entry.comparison).includes(false)));
  report.status = failed || report.errors.length ? 'FAIL' : baseline ? 'GEOMETRY_PASS' : 'PARTIAL_NO_BASELINE';
  report.artAcceptance = report.cases.some(entry => entry.geometry.missingImages.length) ? 'INCOMPLETE_MISSING_ASSETS' : 'NOT_REVIEWED';
} catch (error) {
  report.status = 'BLOCKED';
  report.errors.push(String(error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

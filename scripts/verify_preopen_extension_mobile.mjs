import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';

const url = process.env.PREOPEN_PREVIEW_URL;
if (!url || !/^https:\/\/.+\.vercel\.app$/.test(url)) throw new Error('Explicit Vercel Preview URL required');
const assets = ['gvg_preopen_mission_keyvisual','mypage_banner_gvg_prep','guild_power_ranking_keyvisual','mypage_banner_guild_power_ranking'];
const browser = await chromium.launch({headless:true});
mkdirSync('test-results/preopen-extension',{recursive:true});
try {
  for (const width of [390,412]) {
    const height = width===390 ? 844 : 915;
    const context = await browser.newContext({viewport:{width,height}});
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-09-09T00:01:00+09:00'));
    // Isolate telemetry in the presentation harness. SQL time/authority tests
    // separately execute the deployed RPCs against Preview in a rollback.
    await page.route('**/rest/v1/rpc/**', async route => {
      const rpc = route.request().url().split('/').at(-1);
      const response = rpc==='get_pending_mission_event_dialog' ? {
        event_id:'GVG_PREP_20260904',jst_date:'2026-09-09',
        dialog_image_url:'/promotion/gvg_preopen_mission_keyvisual.webp',
      } : rpc==='mark_mission_event_dialog_viewed' ? true : null;
      await route.fulfill({json:response});
    });
    for (const name of assets) {
      const response = await context.request.get(`${url}/promotion/${name}.webp?v=20260905`);
      assert.equal(response.status(),200);
      assert.equal(createHash('sha256').update(await response.body()).digest('hex'),
        createHash('sha256').update(readFileSync(`public/promotion/${name}.webp`)).digest('hex'));
    }
    await page.goto(`${url}/qa/presentation?scenario=first-home-campaign`);
    await page.locator('.banner-card[data-banner-id="gvg-prep"]').waitFor();
    assert.equal(await page.locator('.banner-dots .dot').count(),2);
    const banner = page.locator('.banner-card img').first();
    await banner.evaluate(async image => { await image.decode(); });
    const geometry = await banner.evaluate(image => ({w:image.getBoundingClientRect().width,h:image.getBoundingClientRect().height,fit:getComputedStyle(image).objectFit,src:image.src}));
    assert.ok(Math.abs(geometry.w/geometry.h-6)<0.05,JSON.stringify(geometry));
    assert.ok(geometry.src.includes('v=20260905'));
    await page.screenshot({path:`test-results/preopen-extension/banner-${width}.png`});
    await page.locator('.banner-arrow.right').click();
    await page.locator('.banner-card[data-banner-id="guild-power-ranking"]').click();
    const ranking = page.getByRole('dialog',{name:'プレオープン限定ギルド総合力ランキングのご案内'});
    await ranking.waitFor();
    await ranking.locator('img').evaluate(async image=>{await image.decode();});
    assert.ok(await ranking.getByRole('button',{name:'ランキングを見る',exact:true}).isVisible());
    await page.screenshot({path:`test-results/preopen-extension/ranking-${width}.png`});
    await page.goto(`${url}/qa/presentation?scenario=first-home-prep`);
    const prep=page.getByRole('dialog',{name:'ギルドバトル準備ミッションのご案内'});
    await prep.waitFor();
    await prep.locator('img').evaluate(async image=>{await image.decode();});
    assert.ok(await prep.getByRole('button',{name:'準備ミッションを見る'}).isVisible());
    const body=await page.locator('body').innerText();
    assert.doesNotMatch(body,/9\/8|9\/9|9月9日|2099/);
    assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth));
    for (const image of await prep.locator('img').all()) {
      const box=await image.boundingBox();
      assert.ok(box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y+box.height<=height);
    }
    await page.screenshot({path:`test-results/preopen-extension/prep-${width}.png`});
    await context.close();
    console.log(`PASS ${width}x${height}: CDN hashes, 2 banners, both dialogs, no date text, no crop/overflow`);
  }
} finally { await browser.close(); }

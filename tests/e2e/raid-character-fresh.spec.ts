import questMaster from "../../src/domain/gameplay/canonical/data/quests_20260830.json";
import gachaMaster from "../../src/domain/gameplay/canonical/data/gacha_production_20260830.json";
import characterMaster from "../../src/domain/gameplay/canonical/data/characters_20260821.json";
import {expect,test} from "@playwright/test";
const canvasAuditViewports=[{width:390,height:844}];
test.use({viewport:{width:390,height:844}});
// Only immutable canonical master data and empty recovery read fixture; no user/progression state seeds.
test.beforeEach(async ({page}) => {
  const gachas=gachaMaster.gachas.filter(g=>g.domain==='CHARACTER');
  const pool=gachas.flatMap(g=>characterMaster.characters.flatMap(c=>{
    const rate=g.rates[c.rarity as keyof typeof g.rates];
    if(!rate)return [];
    const count=characterMaster.characters.filter(x=>x.rarity===c.rarity).length;
    return [{gacha_id:g.id,item_id:c.character_id,rarity:c.rarity,weight:rate/count}];
  }));
  await page.addInitScript(({gachas,pool,quests})=>{
    localStorage.setItem("mock_db_quests",JSON.stringify(quests.map(q=>({id:q.questId,name:q.name,town_id:q.townId,difficulty:q.difficulty,level_type:q.difficulty,duration_seconds:q.durationSec,cost_vitality:q.vitalityCost,cash_reward:q.cashReward,reward_xp:q.userExp,is_unlocked:q.unlockCondition.type==='OPEN'}))));
    localStorage.setItem('mock_rpc_fixture:empty_raid_recoveries','true');
    localStorage.setItem('mock_db_gacha_masters',JSON.stringify(gachas.map(g=>({id:g.id,gacha_type:g.domain,cost_cash:g.cashPerPull,is_active:true}))));
    localStorage.setItem('mock_db_gacha_items_master',JSON.stringify(pool));
  },{gachas,pool,quests:questMaster.quests});
});

async function assertCenteredGameCanvas(page: import("@playwright/test").Page, screenSelector: string) {
  for (const viewport of canvasAuditViewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator(screenSelector).first()).toBeVisible();
    const metrics = await page.locator(screenSelector).first().evaluate((screen) => {
      const canvas = document.querySelector(".app-container");
      if (!canvas) throw new Error("app-container is missing");
      const canvasRect = canvas.getBoundingClientRect();
      const screenRect = screen.getBoundingClientRect();
      return {
        canvasLeft: canvasRect.left,
        canvasRight: canvasRect.right,
        canvasWidth: canvasRect.width,
        canvasCenter: canvasRect.left + canvasRect.width / 2,
        screenLeft: screenRect.left,
        screenRight: screenRect.right,
        viewportCenter: innerWidth / 2,
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(metrics.canvasWidth).toBeLessThanOrEqual(Math.min(430, metrics.viewportWidth) + 1);
    expect(Math.abs(metrics.canvasCenter - metrics.viewportCenter)).toBeLessThanOrEqual(1);
    expect(metrics.screenLeft).toBeGreaterThanOrEqual(metrics.canvasLeft - 2);
    expect(metrics.screenRight).toBeLessThanOrEqual(metrics.canvasRight + 2);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function enterNameRegistration(page: import("@playwright/test").Page, auditCanvas = false) {
  await expect(page.locator('[data-entry-state="WORLD_INFORMATION"]')).toBeVisible();
  if (auditCanvas) await assertCenteredGameCanvas(page, ".setup-container");
  await expect(page.locator('[data-world-stage="4"] .setup-world-tap')).toBeVisible({ timeout: 30_000 });
  await page.locator(".setup-world-tap").click();
  await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toBeVisible({ timeout: 5_000 });
  if (auditCanvas) await assertCenteredGameCanvas(page, ".setup-container");
  await page.locator(".setup-ageha-presentation .setup-primary-action").click();
  await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
  if (auditCanvas) await assertCenteredGameCanvas(page, ".setup-container");
}

async function revealTutorialTenPull(page: import("@playwright/test").Page, captureVisuals = false) {
  await expect(page.locator(".cg-opening")).toBeVisible({ timeout: 15_000 });
  if (captureVisuals) await page.screenshot({ path: test.info().outputPath("G1-pull-gate.png") });
  await page.locator(".cg-opening").click();
  const reveal = page.locator(".cg-reveal");
  let finalCharacterId: string | null = null;
  let ssrCount = 0;
  for (let index = 0; index < 10; index += 1) {
    await expect(page.locator(".cg-top>span")).toHaveText(`${index + 1} / 10`);
    await expect(page.locator('[data-acceptance-state="TUTORIAL_SKILL_STEP"]')).toHaveCount(0);
    await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "SETTLED", { timeout: 5000 });
    await expect(reveal.locator(".cg-stats dt")).toHaveText(["HP", "ATK", "DEF"]);
    await expect.poll(() => reveal.locator(".cg-stats dd").allTextContents()).not.toContain("—");
    await expect(reveal).not.toContainText(/SPD|LUK|戦闘力/);
    await expect(reveal.locator(".cg-reveal-copy>blockquote")).not.toBeEmpty();
    await expect(reveal.locator(".cg-rarity-badge")).toHaveAttribute("alt", /^(N|R|SR|SSR)$/);
    await expect(page.locator(".cg-city")).toHaveAttribute("src", /bg_street_/);
    if (await reveal.getAttribute("data-presentation-state") === "SSR_REVEAL") ssrCount += 1;
    if (index === 9) finalCharacterId = await reveal.getAttribute("data-character-id");
    if (captureVisuals && index === 9) await page.screenshot({ path: test.info().outputPath("G4-rarity-SSR.png") });
    await reveal.click();
    await expect(page.locator(".gacha-character-logo-gate")).toHaveCount(0);
  }
  expect(ssrCount).toBeGreaterThanOrEqual(1);
  return finalCharacterId;
}

async function completeVisibleTutorialGrowth(page: import("@playwright/test").Page) {
  await expect(page.locator('[data-acceptance-state="TUTORIAL_SKILL_STEP"]')).toBeVisible();
  await expect(page.locator('[data-acceptance-state="TUTORIAL_SKILL_STEP"]')).toContainText("ストリートパンチ");
  await expect(page.locator('[data-acceptance-state="TUTORIAL_SKILL_STEP"]')).toContainText("タイプ");
  await expect(page.locator('[data-acceptance-state="TUTORIAL_SKILL_STEP"]')).toContainText("敵単体");
  await expect(page.locator('[data-acceptance-state="TUTORIAL_SKILL_STEP"]')).not.toContainText("ENEMY_SINGLE");
  await expect(page.locator('[data-acceptance-state="TUTORIAL_SKILL_STEP"]')).not.toContainText("DAMAGE 90% ATK");
  await page.getByRole("button", { name: "育成へ進む" }).click();
  const growth = page.locator('[data-acceptance-state="TUTORIAL_GROWTH_STEP"]');
  await expect(growth).toBeVisible();
  await expect(growth).toContainText("Lv.1 → Lv.7");
  await expect(growth).toContainText("強化ドリンク・小 ×6 / CASH 600");
  await page.getByRole("button", { name: "Lv.7まで強化" }).click();
  await expect(page.getByRole("heading", { name: "レベルアップ結果" })).toBeVisible();
  await expect(page.locator(".outlaw-confirm-dialog.kind-result")).toBeVisible();
  await expect(page.locator('[data-growth-result="level-up"]')).toContainText(/Lv\.1\s*→\s*Lv\.7/);
  await expect(page.locator('[data-growth-result="level-up"]')).toContainText("総合力");
  await page.getByRole("button", { name: "編成へ進む" }).click();
  await expect(page.locator('[data-acceptance-state="TUTORIAL_GROWTH_STEP"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "おすすめ編成にする" })).toBeVisible();
}

async function completeTutorialAutoFormation(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "おすすめ編成にする" }).click();
  const completion = page.locator('[data-acceptance-state="AUTO_FORMATION_COMPLETE"]');
  await expect(completion).toContainText("編成しました");
  await expect(page.locator('[data-acceptance-state="Q1"]')).toHaveCount(0);
  await page.evaluate(() => {
    const runtime = window as typeof window & {
      __TRIBE_TUTORIAL_FORMATION_FLASH__?: boolean;
      __TRIBE_TUTORIAL_FORMATION_OBSERVER__?: MutationObserver;
    };
    runtime.__TRIBE_TUTORIAL_FORMATION_FLASH__ = false;
    runtime.__TRIBE_TUTORIAL_FORMATION_OBSERVER__?.disconnect();
    runtime.__TRIBE_TUTORIAL_FORMATION_OBSERVER__ = new MutationObserver(() => {
      const characterPage = document.querySelector(".char-tab-container");
      const tutorialForeground = document.querySelector(".char-party-modal-backdrop");
      if (characterPage && !tutorialForeground) runtime.__TRIBE_TUTORIAL_FORMATION_FLASH__ = true;
      if (document.querySelector('[data-acceptance-state="Q1"]')) {
        runtime.__TRIBE_TUTORIAL_FORMATION_OBSERVER__?.disconnect();
      }
    });
    runtime.__TRIBE_TUTORIAL_FORMATION_OBSERVER__.observe(document.body, { childList: true, subtree: true });
  });
  await completion.getByRole("button", { name: "OK" }).click();
  await expect(page.locator('[data-acceptance-state="Q1"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __TRIBE_TUTORIAL_FORMATION_FLASH__?: boolean }).__TRIBE_TUTORIAL_FORMATION_FLASH__)).toBe(false);
}

async function completeRuleGuide(page: import("@playwright/test").Page) {
  if (await page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"]').isVisible()) {
    await expect(page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"]')).toContainText("これでチュートリアルは終わり。");
    await page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"] button').click();
  }
  await expect(page.getByRole("heading", { name: "いろんな奴が、この街で生きてる。" })).toBeVisible();
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByRole("heading", { name: "仲間を集めて、もっと強くなる。" })).toBeVisible();
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByRole("heading", { name: "気の合う奴らと、TRIBEへ。" })).toBeVisible();
  await page.getByRole("button", { name: "アカウント登録へ" }).click();
  await expect(page.locator(".modal-overlay.background-black-95 .modal-card")).toBeVisible();
}

test("fresh Mock journey with canonical masters and no progression seeds", async ({ page }) => {
  test.setTimeout(300_000);
  const timingStages = new Set<string>();
  const failedImages: string[] = [];
  const pageErrors: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "image" && !response.ok()) failedImages.push(`${response.status()} ${response.url()}`);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.log("FRESH_BROWSER_ERROR", message.text());
    if (!message.text().includes("[M9 scout timing]")) return;
    const stage = message.args()[1]?.evaluate((value: any) => value?.stage).catch(() => null);
    void stage.then((value) => { if (value) timingStages.add(value); });
  });

  await page.goto("/");
  await assertCenteredGameCanvas(page, ".title-view-overlay");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "はじめから" }).click();

  await enterNameRegistration(page, true);

  await expect(page.getByRole("heading", { name: "プレイヤー名" })).toBeVisible();
  await page.getByPlaceholder("プレイヤー名を入力").fill("新宿ナイン");
  await page.getByRole("button", { name: "この名前で始める" }).click();

  await expect(page.getByRole("dialog", { name: "アゲハからの案内" })).toBeVisible();
  await assertCenteredGameCanvas(page, ".tutorial-world-content");
  await expect(page.locator(".footer-mobile")).toHaveCount(0);
  await page.getByRole("button", { name: "次へ" }).click();

  await expect(page.getByRole("heading", { name: "最初の仲間を迎えよう" })).toBeVisible();
  await assertCenteredGameCanvas(page, ".gacha-view-root");
  await expect(page.getByRole("button", { name: "無料10連を引く" })).toBeVisible();
  await page.getByRole("button", { name: "無料10連を引く" }).click();
  await page.waitForTimeout(500);
  console.log("FRESH_MASTER_COUNTS", await page.evaluate(() => ({pool: JSON.parse(localStorage.getItem("mock_db_gacha_items_master") || "[]").length, masters: JSON.parse(localStorage.getItem("mock_db_gacha_masters") || "[]").length, progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]").map((x: {step_id:string})=>x.step_id)})));
  await revealTutorialTenPull(page);
  await expect(page.locator(".cg-summary")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "編成へ進む" }).click();
  await completeVisibleTutorialGrowth(page);
  await assertCenteredGameCanvas(page, ".char-party-modal-backdrop");
  await completeTutorialAutoFormation(page);
  await assertCenteredGameCanvas(page, ".patrol-container");
  await page.screenshot({ path: test.info().outputPath("Q1-dispatch-before.png"), fullPage: true });
  await expect(page.getByRole("button", { name: "新宿へ派遣する" })).toBeEnabled();
  await page.getByRole("button", { name: "新宿へ派遣する" }).click();
  await expect(page.locator('[data-acceptance-state="Q2"]')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("Q2-dispatch-started.png"), fullPage: true });
  await expect(page.locator('[data-acceptance-state="Q3"]')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("Q3-dispatch-progress.png"), fullPage: true });
  const speedUp = page.getByRole("button", { name: /すぐに時短する/ });
  await speedUp.click();
  await expect(page.locator('[data-acceptance-state="Q4"]')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("Q4-speed-up.png"), fullPage: true });
  await expect(page.locator('[data-acceptance-state="Q5"]')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("Q5-return.png"), fullPage: true });
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator('[data-acceptance-state="Q6"]')).toBeVisible();
  await expect(page.locator('[data-acceptance-state="Q6"] [data-encounter-ready="true"]')).toBeVisible({ timeout: 2_000 });
  const encounterAnimations = await page.locator(".tutorial-wire-encounter").evaluate((stage) => stage.getAnimations({ subtree: true }).map((animation) => (animation as CSSAnimation).animationName));
  expect(encounterAnimations).toEqual(expect.arrayContaining(["encounter-icon-impact", "encounter-title-in", "encounter-subtitle-in"]));
  await page.screenshot({ path: test.info().outputPath("Q6-battle-encounter.png"), fullPage: true });
  await page.getByRole("button", { name: "バトルへ" }).click();
  await expect(page.locator('[data-acceptance-state="B1"]')).toBeVisible();
  await expect(page.locator('[data-acceptance-state="B1"]').getByRole("button", {name:/の詳細$/})).toHaveCount(5);
  await assertCenteredGameCanvas(page, ".battle-screen");
  await page.screenshot({ path: test.info().outputPath("B1-battle-pre.png"), fullPage: true });
  await page.getByRole("button", { name: "バトルスタート" }).click();
  await expect(page.getByRole("region", {name:"味方パーティ"})).toBeVisible();
  await page.screenshot({path:test.info().outputPath("battle-playback.png")});
  await expect(page.locator('[data-acceptance-state="B6"]')).toBeVisible({timeout:120_000});
  await assertCenteredGameCanvas(page, ".battle-ending-screen");
  await expect(page.locator(".battle-result-canonical-rewards")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("B6-result.png"), fullPage: true });
  await expect(page.getByRole("button", { name: "勝利報酬を獲得" })).toHaveCount(0);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator(".tutorial-rule-screen")).toBeVisible();
  await assertCenteredGameCanvas(page, ".tutorial-rule-screen");
  await completeRuleGuide(page);
  await expect(page.getByText("クエスト結果")).toHaveCount(0);
  await page.waitForTimeout(750);
  await expect(page.getByText("クエスト結果")).toHaveCount(0);

  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  await assertCenteredGameCanvas(page, ".modal-overlay");
  await page.getByPlaceholder("メールアドレス").fill("m9@example.com");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("local-mock-pass");
  await page.getByRole("button", { name: "メールアカウントを連携" }).click();
  await expect(page.locator(".mypage-primary-cta")).toBeVisible();
  await page.waitForTimeout(750);
  await expect(page.getByText("クエスト結果")).toHaveCount(0);
  await expect(page.locator(".mypage-primary-cta")).toContainText("無料ガチャ");
  await expect(page.locator(".footer-mobile")).toBeVisible();
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const homeMetrics = await page.locator(".mypage-primary-cta").evaluate((cta) => ({
      right: cta.getBoundingClientRect().right,
      viewport: window.innerWidth,
      minHeight: cta.getBoundingClientRect().height,
    }));
    expect(homeMetrics.right).toBeLessThanOrEqual(homeMetrics.viewport);
    expect(homeMetrics.minHeight).toBeGreaterThanOrEqual(40);
    await page.screenshot({ path: test.info().outputPath(`m9-design-home-${width}.png`) });
  }

  await expect.poll(async () => page.evaluate(() => {
    const userId = localStorage.getItem("tribe_demo_uuid");
    return JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")
      .find((entry: any) => entry.user_id === userId)?.step_id;
  })).toBe("AUTHENTICATION");

  await expect.poll(() => timingStages.has("tap") && timingStages.has("server_response") && timingStages.has("result_display")).toBe(true);
  const actionMetrics = await page.evaluate(() => (
    (window as typeof window & { __TRIBE_ACTION_METRICS__?: unknown[] }).__TRIBE_ACTION_METRICS__ || []
  ));
  test.info().annotations.push({ type: "action-performance", description: JSON.stringify(actionMetrics) });
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  if (await loginBonus.isVisible()) await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.locator('.footer-item[aria-label="キャラ"]').click();
  await page.locator(".character-v2-card").first().click();
  await expect(page.locator(".character-home")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("fresh-character-home-390.png") });
  expect(failedImages).toEqual([]);
  expect(pageErrors).toEqual([]);
});

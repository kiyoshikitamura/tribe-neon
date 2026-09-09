import { expect, test } from "@playwright/test";
import { getCharacterTotalStats } from "../../src/utils/stats_calculator";
import { CHARACTERS_MASTER } from "../../src/utils/game_constants";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Fresh tutorial journeys have no outstanding Raid battle. Re-seed after
    // localStorage.clear()/reload when the Preview Raid room UI is enabled.
    localStorage.setItem("mock_rpc_fixture:empty_raid_recoveries", "true");
    localStorage.setItem("mock_db_gacha_masters", JSON.stringify([{
      id: "CHAR_NORMAL",
      name: "ノーマルガチャ",
      gacha_type: "CHARACTER",
      cost_cash: 1000,
      cost_diamond: 100,
      is_active: true,
    }]));
    const tutorialSsrId = sessionStorage.getItem("m9x_tutorial_ssr_override") || "char_reiji_01";
    localStorage.setItem("mock_db_gacha_items_master", JSON.stringify([
      { gacha_id: "CHAR_NORMAL", item_id: "char_yuji_01", rarity: "R", weight: 100 },
      { gacha_id: "CHAR_NORMAL", item_id: "char_go_01", rarity: "SSR", weight: 100 },
      { gacha_id: "CHAR_NORMAL", item_id: "char_kengo_01", rarity: "SSR", weight: 100 },
      { gacha_id: "CHAR_NORMAL", item_id: "char_mio_01", rarity: "SSR", weight: 100 },
      { gacha_id: "CHAR_SPECIAL", item_id: tutorialSsrId, rarity: "SSR", weight: 100 },
    ]));
    if (sessionStorage.getItem("m9x_use_canonical_quest") !== "true") {
      localStorage.setItem("mock_db_quests", JSON.stringify([{
        id: "q_shinjuku_short",
        name: "新宿: 見回り (短期)",
        duration_seconds: 60,
        cost_vitality: 5,
        cash_reward: 800,
        exp_reward: 120,
      }]));
    }
    const tutorialEnemy = { hp: 120, atk: 1, def: 0, spd: 20, luk: 0 };
    localStorage.setItem("mock_db_patrol_npcs", JSON.stringify([
      {
        id: "npc_tutorial_short",
        quest_id: "q_shinjuku_short",
        npc_name: "路地裏のならず者",
        enemy_data: tutorialEnemy,
      },
      {
        id: "npc_tutorial_canonical",
        quest_id: "q_shinjuku_1",
        npc_name: "路地裏のならず者",
        enemy_data: tutorialEnemy,
      },
    ]));
  });
});

const canvasAuditViewports = [
  { width: 375, height: 844 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const c2AcceptanceViewports = [
  { label: "iphone13", width: 390, height: 844 },
  { label: "pixel7", width: 412, height: 915 },
  { label: "desktop", width: 1024, height: 768 },
];
const captureAcceptanceVisuals = process.env.CAPTURE_ACCEPTANCE_VISUALS === "1";

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

async function beginNewTutorial(page: import("@playwright/test").Page) {
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  await expect(titleAction).toBeVisible();
  await titleAction.click();
  await page.getByRole("button", { name: "はじめから" }).click();
}

async function resumeRuleGuide(page: import("@playwright/test").Page) {
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: /続きから|チュートリアルを続ける/ });
  await expect(titleAction.or(continueAction)).toBeVisible();
  if (await titleAction.isVisible()) await titleAction.click();
  await expect(continueAction).toBeVisible();
  await continueAction.click();
}

function tutorialEncounterSnapshot(encounterId: string) {
  return {
    encounterId,
    questId: "q_shinjuku_1",
    townId: "shinjuku",
    difficulty: "EASY",
    enemyTactic: "BALANCED",
    partySignature: "char_tomoya_01|char_kenji_01|char_shin_01",
    members: [
      { slot: 1, characterId: "char_tomoya_01", rarity: "N", level: 5, awakening: 0, stats: { hp: 14000, atk: 1600, def: 1200, spd: 90, luk: 0 }, skillLoadout: ["SKILL_008"], equipmentLoadout: [] },
      { slot: 2, characterId: "char_kenji_01", rarity: "N", level: 5, awakening: 0, stats: { hp: 14000, atk: 1600, def: 1200, spd: 95, luk: 0 }, skillLoadout: ["SKILL_001"], equipmentLoadout: [] },
      { slot: 3, characterId: "char_shin_01", rarity: "R", level: 5, awakening: 0, stats: { hp: 14000, atk: 1600, def: 1200, spd: 85, luk: 0 }, skillLoadout: ["SKILL_006"], equipmentLoadout: [] },
    ],
  };
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

async function seedRuleGuideState(page: import("@playwright/test").Page, userId: string) {
  await page.addInitScript(({ userId }) => {
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "完了演出QA", cash: 10000, vitality: 95, level: 5, xp: 0, current_base_id: "shinjuku" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: `starter_${userId}`, user_id: userId, character_id: "char_reiji_01", level: 3, awakening_level: 0 }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "RULE_GUIDE" }]));
  }, { userId });
}

async function assertRuleGuideFrame(page: import("@playwright/test").Page, key: "WORLD" | "POWER" | "TRIBE") {
  const screen = page.locator(".tutorial-rule-screen");
  await expect(screen).toHaveAttribute("data-rule-slide", key);
  await expect(screen.locator(".tutorial-rule-card")).not.toHaveClass(/is-transitioning/);
  await expect(screen.locator("button")).toBeEnabled();
  const image = screen.getByRole("img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => ({ complete: element.complete, width: element.naturalWidth }))).toEqual(expect.objectContaining({ complete: true }));
  const metrics = await screen.evaluate((element) => {
    const card = element.querySelector<HTMLElement>(".tutorial-rule-card");
    const action = element.querySelector<HTMLElement>("button");
    const root = element.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    return {
      rootLeft: root.left,
      rootRight: root.right,
      rootTop: root.top,
      rootBottom: root.bottom,
      cardLeft: cardRect?.left || 0,
      cardRight: cardRect?.right || 0,
      cardWidth: cardRect?.width || 0,
      actionHeight: action?.getBoundingClientRect().height || 0,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      horizontalOverflow: element.scrollWidth > element.clientWidth,
    };
  });
  expect(metrics.rootLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.rootRight).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.rootTop).toBeGreaterThanOrEqual(0);
  expect(metrics.rootBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.cardLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.cardRight).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.cardWidth).toBeLessThanOrEqual(430);
  expect(metrics.actionHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.horizontalOverflow).toBe(false);
}

test("tutorial completion presentation uses final WORLD POWER TRIBE assets", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedImages: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "image" && !response.ok()) failedImages.push(`${response.status()} ${response.url()}`);
  });
  await seedRuleGuideState(page, "00000000-0000-4000-8000-000000000913");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await resumeRuleGuide(page);

  await expect(page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("M7-Ageha-Completion-Mobile.png") });
  await page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"] button').click();

  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await assertRuleGuideFrame(page, "WORLD");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("M8-WORLD-first-Mobile.png") });

  const nextButton = page.getByRole("button", { name: "次へ" });
  await nextButton.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await assertRuleGuideFrame(page, "POWER");
  await page.screenshot({ path: testInfo.outputPath("T2-POWER-Mobile.png") });
  await nextButton.click();
  await assertRuleGuideFrame(page, "TRIBE");
  await page.screenshot({ path: testInfo.outputPath("T3-TRIBE-Mobile.png") });

  expect(failedImages).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const desktopPage = await desktopContext.newPage();
  await seedRuleGuideState(desktopPage, "00000000-0000-4000-8000-000000000914");
  await desktopPage.goto("/");
  await resumeRuleGuide(desktopPage);
  await desktopPage.locator('[data-acceptance-state="COMPLETION_DIALOGUE"] button').click();
  for (const width of [1024, 1440, 1920]) {
    await desktopPage.setViewportSize({ width, height: 1000 });
    await assertRuleGuideFrame(desktopPage, "WORLD");
  }
  await desktopPage.setViewportSize({ width: 1440, height: 1000 });
  await desktopPage.screenshot({ path: testInfo.outputPath("T4-WORLD-Desktop-DPR2.png") });
  await desktopPage.getByRole("button", { name: "次へ" }).click();
  await assertRuleGuideFrame(desktopPage, "POWER");
  await desktopPage.screenshot({ path: testInfo.outputPath("T5-POWER-Desktop-DPR2.png") });
  await desktopPage.getByRole("button", { name: "次へ" }).click();
  await assertRuleGuideFrame(desktopPage, "TRIBE");
  await desktopPage.screenshot({ path: testInfo.outputPath("T6-TRIBE-Desktop-DPR2.png") });
  await desktopContext.close();
});

test("common app shell owns safe area through entry and tutorial overlay", async ({ page }) => {
  await page.goto("/");
  await page.locator("html").evaluate((root) => root.style.setProperty("--app-safe-top", "47px"));
  await expect(page.locator(".app-container")).toHaveCount(1);
  const titleMetrics = await page.locator(".app-container").evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    viewport: window.innerHeight,
    paddingTop: getComputedStyle(element).paddingTop,
    paddingBottom: getComputedStyle(element).paddingBottom,
  }));
  expect(titleMetrics.height).toBeLessThanOrEqual(titleMetrics.viewport);
  expect(Number.parseFloat(titleMetrics.paddingTop)).toBeGreaterThanOrEqual(47);

  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const titleCta = page.getByRole("button", { name: "TAP TO START" });
    await expect(titleCta).toHaveClass(/title-tap-text/);
    await expect(titleCta).toHaveCSS("min-height", "50px");
    await page.screenshot({ path: test.info().outputPath(`m9-design-title-${width}.png`) });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("TAP TO START").click();
  await expect(page.getByRole("button", { name: "はじめから" })).toHaveClass(/semantic-cta--primary/);
  await expect(page.getByRole("button", { name: "データをお持ちの方" })).toHaveClass(/semantic-cta--secondary/);
  await page.screenshot({ path: test.info().outputPath("m9-design-entry-390.png") });
  await page.getByRole("button", { name: "はじめから" }).click();
  // Fast auth may complete before Playwright observes the transient. Both the
  // acknowledged transition and the authoritative World Intro are valid; an
  // artificial minimum delay must not be reintroduced just for this assertion.
  await expect(page.locator(".game-start-transition").or(page.locator('[data-entry-state="WORLD_INFORMATION"]'))).toBeVisible();
  await expect(page.getByRole("button", { name: /準備中/ })).toHaveCount(0);
  await enterNameRegistration(page);
  await expect(page.getByRole("button", { name: "この名前で始める" })).toHaveClass(/semantic-cta--primary/);
  await page.screenshot({ path: test.info().outputPath("m9-design-registration-390.png") });
  await expect(page.locator(".app-container")).toHaveCount(1);
  await page.getByPlaceholder("プレイヤー名を入力").fill("境界確認");
  await page.getByRole("button", { name: "この名前で始める" }).click();

  await expect(page.getByRole("dialog", { name: "アゲハからの案内" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "アゲハからの案内" })).toContainText("境界確認ね。覚えた。よろしく。");
  await expect(page.getByText("ゲームを開始中")).toHaveCount(0);
  await expect(page.locator(".app-container .app-container")).toHaveCount(0);
  await expect(page.locator(".footer-mobile")).toHaveCount(0);
  const bounds = await page.locator(".tutorial-world").evaluate((overlay) => {
    const overlayRect = overlay.getBoundingClientRect();
    return { top: overlayRect.top, bottom: overlayRect.bottom, viewportHeight: innerHeight };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
  expect(titleMetrics.paddingTop).toBeDefined();
  expect(titleMetrics.paddingBottom).toBeDefined();
});

test("free gacha presents one CTA, feedback, result assets, and formation connection", async ({ page, browserName }) => {
  await page.goto("/");
  await beginNewTutorial(page);
  await enterNameRegistration(page);
  await page.getByPlaceholder("プレイヤー名を入力").fill("ガチャ確認");
  await page.getByRole("button", { name: "この名前で始める" }).click();
  const enabledDialogueNext = page.getByRole("button", { name: "次へ" });
  await expect(enabledDialogueNext).toBeEnabled();
  await expect(enabledDialogueNext).toHaveClass(/semantic-cta--primary/);
  await enabledDialogueNext.click();

  await expect(page.getByRole("heading", { name: "最初の仲間を迎えよう" })).toBeVisible();
  const tutorialBanner = page.locator(".tutorial-gacha-banner");
  await expect(tutorialBanner).toHaveAttribute("src", /gacha_normal_character\.png/);
  const tutorialBannerGeometry = await tutorialBanner.evaluate((image) => {
    const style = getComputedStyle(image);
    const box = image.getBoundingClientRect();
    return { ratio: box.width / box.height, objectFit: style.objectFit };
  });
  expect(tutorialBannerGeometry.ratio).toBeGreaterThan(1.95);
  expect(tutorialBannerGeometry.ratio).toBeLessThan(2.05);
  expect(tutorialBannerGeometry.objectFit).toBe("contain");
  await expect(page.locator(".tutorial-gacha-benefits")).toHaveText("無料10連 / SSR1体保証");
  await expect(page.getByText(/10枚目.*SSR確定/)).toHaveCount(0);
  await expect(page.getByText("SSR 10体からランダム")).toHaveCount(0);
  await expect(page.getByText("スペシャルガチャ")).toHaveCount(0);
  const enabledActions = page.locator(".gacha-view-root button:enabled");
  await expect(enabledActions).toHaveCount(1);
  await expect(enabledActions).toHaveAccessibleName("無料10連を引く");
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.locator(".gacha-view-root").evaluate((root) => {
      const cta = root.querySelector(".gacha-free-btn") as HTMLElement | null;
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        ctaHeight: cta?.getBoundingClientRect().height || 0,
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.ctaHeight).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`m9x-tutorial-gacha-${width}.png`) });
  }
  await page.screenshot({ path: test.info().outputPath("m9-0c-gacha-430.png"), fullPage: true });

  const startedAt = Date.now();
  await enabledActions.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByText(/ガチャ準備中|ガチャ実行中/)).toHaveCount(0);
  await expect(page.locator(".cg-opening, .cg-reveal").first()).toBeVisible();
  await expect(page.locator(".blocker-spinner")).toHaveCount(0);
  await revealTutorialTenPull(page, true);
  await expect(page.locator(".cg-summary")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".cg-mini")).toHaveCount(10);
  const elapsedMs = Date.now() - startedAt;
  test.info().annotations.push({ type: "gacha-result-ms", description: String(elapsedMs) });
  // Ten reveals are intentionally user-paced. The guaranteed SSR now includes
  // its canonical quote typewriter and flash before identity is revealed, so
  // retain a bounded journey budget without applying the old auto-flow cap.
  expect(elapsedMs).toBeLessThan(browserName === "webkit" ? 50_000 : 35_000);
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.locator(".cg-summary").evaluate((modal) => {
      const rect = modal.getBoundingClientRect();
      const cards = Array.from(modal.querySelectorAll(".cg-mini"));
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        cardCount: cards.length,
        columnCount: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size,
        rowCount: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top))).size,
        cardWidths: cards.map((card) => Math.round(card.getBoundingClientRect().width)),
        cardHeights: cards.map((card) => Math.round(card.getBoundingClientRect().height)),
        frameRects: cards.map((card) => {
          const cardRect = card.getBoundingClientRect();
          const frameRect = card.querySelector(".character-presentation")?.getBoundingClientRect();
          return frameRect ? {
            widthDelta: Math.abs(frameRect.width - cardRect.width),
            heightDelta: Math.max(0, frameRect.height - cardRect.height),
          } : null;
        }),
      };
    });
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.cardCount).toBe(10);
    expect(metrics.columnCount).toBe(5);
    expect(metrics.rowCount).toBe(2);
    expect(new Set(metrics.cardWidths).size).toBe(1);
    expect(Math.max(...metrics.cardHeights) - Math.min(...metrics.cardHeights)).toBeLessThanOrEqual(1);
    expect(metrics.frameRects.every((frame) => frame && frame.widthDelta <= 1 && frame.heightDelta <= 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`m9-1-gacha-result-${width}.png`), fullPage: true });
  }
  await expect(page.locator(".cg-mini .character-presentation-gacha-result-compact")).toHaveCount(10);
  await expect(page.locator(".cg-mini .cg-rarity-badge")).toHaveCount(10);
  await expect(page.locator(".cg-mini").filter({ hasText: "GEAR" })).toHaveCount(0);
  await expect(page.locator(".cg-mini .character-presentation img").first()).toBeVisible();
  const characterImage = await page.locator(".cg-mini .character-presentation img").first().evaluate((image) => {
    const rect = image.getBoundingClientRect();
    return { width: rect.width, height: rect.height, objectFit: getComputedStyle(image).objectFit, objectPosition: getComputedStyle(image).objectPosition };
  });
  expect(characterImage.width).toBeGreaterThanOrEqual(45);
  expect(characterImage.height).toBeGreaterThanOrEqual(45);
  expect(characterImage.objectFit).toBe("cover");
  expect(characterImage.objectPosition).toContain("0%");
  const resultBounds = await page.locator(".cg-summary").evaluate((modal) => {
    const rect = modal.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(resultBounds.left).toBeGreaterThanOrEqual(0);
  expect(resultBounds.right).toBeLessThanOrEqual(resultBounds.viewportWidth);
  expect(resultBounds.top).toBeGreaterThanOrEqual(0);
  expect(resultBounds.bottom).toBeLessThanOrEqual(resultBounds.viewportHeight);
  await page.screenshot({ path: test.info().outputPath("m9-0c-result-430.png"), fullPage: true });
  await page.getByRole("button", { name: "編成へ進む" }).click();
  await completeVisibleTutorialGrowth(page);
  await expect(page.locator(".char-party-candidates .character-presentation-card").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("m9-0c-formation-430.png"), fullPage: true });
  await expect.poll(async () => page.evaluate(() => {
    const userId = localStorage.getItem("tribe_demo_uuid");
    return JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")
      .find((entry: any) => entry.user_id === userId)?.step_id;
  })).toBe("AUTO_FORMATION");

  await page.reload();
  await resumeRuleGuide(page);
  await expect(page.getByRole("button", { name: "おすすめ編成にする" })).toBeVisible();
});

test("formation advances directly to the quest boundary and resumes there", async ({ page }) => {
  await page.goto("/");
  await beginNewTutorial(page);
  await enterNameRegistration(page);
  await page.getByPlaceholder("プレイヤー名を入力").fill("編成確認");
  await page.getByRole("button", { name: "この名前で始める" }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByRole("button", { name: "無料10連を引く" }).click();
  await revealTutorialTenPull(page);
  await expect(page.locator(".cg-summary")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "編成へ進む" }).click();
  await completeVisibleTutorialGrowth(page);
  const formationAction = page.getByRole("button", { name: "おすすめ編成にする" });
  await expect(formationAction).toBeVisible();
  await expect(page.locator(".char-party-modal button:enabled")).toHaveCount(1);
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.locator(".char-party-modal").evaluate((modal) => {
      const action = modal.querySelector(".char-party-auto-btn") as HTMLElement | null;
      const rect = modal.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewportWidth: innerWidth, actionHeight: action?.getBoundingClientRect().height || 0 };
    });
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
    await page.screenshot({ path: test.info().outputPath(`formation-canvas-${width}.png`) });
    expect(metrics.actionHeight).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: test.info().outputPath("m9-0d-formation-430.png"), fullPage: true });
  await formationAction.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.locator('[data-acceptance-state="AUTO_FORMATION_COMPLETE"]')).toContainText("編成しました");
  await expect(page.locator('[data-acceptance-state="Q1"]')).toHaveCount(0);
  await page.locator('[data-acceptance-state="AUTO_FORMATION_COMPLETE"]').getByRole("button", { name: "OK" }).click();
  await expect(page.locator('[data-acceptance-state="Q1"]')).toBeVisible();
  const starterSkillContract = await page.evaluate(() => {
    const userId = localStorage.getItem("tribe_demo_uuid");
    const skills = JSON.parse(localStorage.getItem("mock_db_user_skills") || "[]")
      .filter((skill: any) => skill.user_id === userId && skill.skill_card_id === "SKILL_001");
    return { count: skills.length, plusValue: skills[0]?.plus_val, slot: skills[0]?.slot_index };
  });
  expect(starterSkillContract).toEqual({ count: 1, plusValue: 0, slot: 0 });
  await expect.poll(async () => page.evaluate(() => {
    const userId = localStorage.getItem("tribe_demo_uuid");
    return JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")
      .find((entry: any) => entry.user_id === userId)?.step_id;
  })).toBe("DISPATCH");

  await page.reload();
  await resumeRuleGuide(page);
  await expect(page.locator('[data-acceptance-state="Q1"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "おまかせ編成" })).toHaveCount(0);
});

test("three random tutorial SSRs remain the same owned character through result and reload recovery", async ({ page }) => {
  // Three complete tutorial journeys include the production-paced Battle
  // presentation. Keep the assertion deterministic without truncating replay.
  test.setTimeout(420_000);
  const cases = [
    { id: "char_reiji_01", name: "レイジ" },
    { id: "char_ageha_01", name: "アゲハ" },
    { id: "char_karen_01", name: "カレン" },
  ].filter((entry) => !process.env.M9X_SSR_CASE || entry.name === process.env.M9X_SSR_CASE);
  const continueFromTitleIfNeeded = async () => {
    const tapToStart = page.getByRole("button", { name: "TAP TO START" });
    const resume = page.getByRole("button", { name: /続きから|チュートリアルを続ける/ });
    await expect(tapToStart.or(resume)).toBeVisible();
    if (await tapToStart.isVisible()) await tapToStart.click();
    await expect(resume).toBeVisible();
    await resume.click();
  };

  for (const [caseIndex, tutorialSsr] of cases.entries()) {
    await page.goto("/");
    await page.evaluate(({ id }) => {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem("m9x_tutorial_ssr_override", id);
    }, tutorialSsr);
    await page.reload();

    const tapToStart = page.getByRole("button", { name: "TAP TO START" });
    await expect(tapToStart).toBeVisible();
    await tapToStart.click();
    await page.getByRole("button", { name: "はじめから" }).click();
    await enterNameRegistration(page);
    await page.getByPlaceholder("プレイヤー名を入力").fill(`連続性${caseIndex + 1}`);
    await page.getByRole("button", { name: "この名前で始める" }).click();
    await page.getByRole("button", { name: "次へ" }).click();
    await page.getByRole("button", { name: "無料10連を引く" }).click();
    const ssrRevealId = await revealTutorialTenPull(page);
    expect(ssrRevealId).toBe(tutorialSsr.id);
    await expect(page.locator(".cg-summary")).toBeVisible();
    const ownedId = await page.evaluate((masterId) => {
      const userId = localStorage.getItem("tribe_demo_uuid");
      return JSON.parse(localStorage.getItem("mock_db_user_characters") || "[]")
        .find((row: any) => row.user_id === userId && row.character_id === masterId)?.id || null;
    }, tutorialSsr.id);
    expect(ownedId).toBeTruthy();

    await page.getByRole("button", { name: "編成へ進む" }).click();
    await completeVisibleTutorialGrowth(page);
    const guaranteedCandidate = page.locator(`.char-party-candidates [data-user-character-id="${ownedId}"]`);
    await expect(guaranteedCandidate).toHaveAttribute("data-character-id", tutorialSsr.id);
    await expect(guaranteedCandidate).toHaveClass(/is-selected/);
    await page.reload();
    const titleAction = page.getByRole("button", { name: "TAP TO START" });
    const continueAction = page.getByRole("button", { name: /続きから|チュートリアルを続ける/ });
    await expect(titleAction.or(continueAction)).toBeVisible();
    if (await titleAction.isVisible()) await titleAction.click();
    await continueFromTitleIfNeeded();
    await expect(page.getByRole("button", { name: "おすすめ編成にする" })).toBeVisible();
    await completeTutorialAutoFormation(page);
    await expect(page.locator(`.tutorial-wire-member[data-user-character-id="${ownedId}"]`)).toHaveAttribute("data-character-id", tutorialSsr.id);
    const formationContract = await page.evaluate(() => {
      const userId = localStorage.getItem("tribe_demo_uuid");
      const main = JSON.parse(localStorage.getItem("mock_db_user_main_formations") || "[]")
        .find((row: any) => row.user_id === userId && Number(row.slot) === 1);
      const defense = JSON.parse(localStorage.getItem("mock_db_pvp_defense_decks") || "[]")
        .find((row: any) => row.user_id === userId);
      return { main: main?.user_character_id || null, defense: defense?.character_1_id || null };
    });
    expect(formationContract).toEqual({ main: ownedId, defense: ownedId });

    await page.reload();
    await continueFromTitleIfNeeded();
    await expect(page.locator(`.tutorial-wire-member[data-user-character-id="${ownedId}"]`)).toBeVisible();
    await expect(page.locator(`.tutorial-wire-member[data-user-character-id="${ownedId}"]`)).toHaveAttribute("data-character-id", tutorialSsr.id);
  }
});

test("first quest connects dispatch, official battle, and one reward to the completion boundary", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000910";
  await page.addInitScript(({ userId }) => {
    // The application may refresh mock master projections while this journey
    // reloads between Q3 and Q5. Keep the canonical quest row available on
    // every document so the final reward claim uses the same quest authority.
    const quests = JSON.parse(localStorage.getItem("mock_db_quests") || "[]");
    if (!quests.some((quest: { id?: string }) => quest.id === "q_shinjuku_1")) {
      quests.push({ id: "q_shinjuku_1", name: "新宿・初級", town_id: "shinjuku", difficulty: "EASY", duration_seconds: 60, cost_vitality: 5, reward_xp: 120, reward_items: [], is_unlocked: true });
      localStorage.setItem("mock_db_quests", JSON.stringify(quests));
    }
    if (sessionStorage.getItem("m9_0e_seeded") === "true") return;
    sessionStorage.setItem("m9_0e_seeded", "true");
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "初戦確認", cash: 10000, vitality: 100, level: 1, xp: 0, current_base_id: "shinjuku" }]));
    // This focused contract intentionally uses a one-member deck. Give that
    // isolated member enough level to represent the five-member tutorial
    // formation used by the real journey, so reward assertions cannot land on
    // a fixture-only defeat.
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: `starter_${userId}`, user_id: userId, character_id: "char_reiji_01", level: 100, awakening_level: 0 }]));
    localStorage.setItem("mock_db_user_skills", JSON.stringify([
      { id: `skill_sr_${userId}`, user_id: userId, skill_card_id: "SKILL_021", equipped_character_id: `starter_${userId}`, slot_index: 0, plus_val: 0 },
      { id: `skill_ssr_${userId}`, user_id: userId, skill_card_id: "SKILL_036", equipped_character_id: `starter_${userId}`, slot_index: 1, plus_val: 0 },
    ]));
    localStorage.setItem("mock_db_skill_battle_master", JSON.stringify([
      { skill_id: "SKILL_021", display_name: "SR TEST BREAK", kind: "ATTACK", target: "ENEMY_SINGLE", power_percent: 160, cooldown: 2, initial_cooldown: 0, enabled: true },
      { skill_id: "SKILL_036", display_name: "SSR TEST BREAK", kind: "ATTACK", target: "ENEMY_SINGLE", power_percent: 240, cooldown: 3, initial_cooldown: 0, enabled: true },
    ]));
    localStorage.setItem("mock_db_pvp_defense_decks", JSON.stringify([{ id: `deck_${userId}`, user_id: userId, character_1_id: `starter_${userId}` }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "DISPATCH" }]));
    localStorage.setItem("mock_db_user_patrols", "[]");
    localStorage.setItem("mock_db_battle_replay_sessions", "[]");
    localStorage.setItem("mock_db_presents", "[]");
  }, { userId });

  await page.goto("/");
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueFromTitle = page.getByRole("button", { name: /続きから|チュートリアルを続ける/ });
  const resumeAfterReload = async () => {
    await expect(titleAction.or(continueFromTitle)).toBeVisible();
    if (await titleAction.isVisible()) await titleAction.click();
    await expect(continueFromTitle).toBeVisible();
    await continueFromTitle.click();
  };
  await expect(titleAction.or(continueFromTitle)).toBeVisible();
  if (await titleAction.isVisible()) await titleAction.click();
  await expect(continueFromTitle).toBeVisible();
  await continueFromTitle.click();
  await expect(page.locator('[data-acceptance-state="Q1"]')).toBeVisible();
  await expect(page.locator(".footer-mobile")).toHaveCount(0);
  await expect(page.locator(".tutorial-wire-member .character-presentation")).toBeVisible();

  const questAction = page.getByRole("button", { name: "新宿へ派遣する" });
  await expect(questAction).toBeEnabled();
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.locator(".patrol-container").evaluate((root) => {
      const action = root.querySelector("button") as HTMLElement | null;
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, actionHeight: action?.getBoundingClientRect().height || 0 };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.actionHeight).toBeGreaterThanOrEqual(44);
    if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath(`m9-1-quest-${width}.png`), fullPage: true });
  }
  const questStartedAt = Date.now();
  await questAction.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole("button", { name: /すぐに時短する/ })).toBeVisible();
  test.info().annotations.push({ type: "quest-start-ms", description: String(Date.now() - questStartedAt) });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_patrols") || "[]").length)).toBe(1);
  const dispatchRequests = await page.evaluate(() => ((window as any).__TRIBE_TUTORIAL_JOURNEY_TRACE__ || [])
    .filter((entry: any) => entry.phase === "dispatch_request").length);
  expect(dispatchRequests).toBe(1);

  await page.reload();
  await resumeAfterReload();
  await expect(page.locator('[data-acceptance-state="Q3"]')).toBeVisible();
  const instantAction = page.getByRole("button", { name: /すぐに時短する/ });
  await expect(instantAction).toBeVisible();
  const instantStartedAt = Date.now();
  await instantAction.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.locator('[data-acceptance-state="Q5"]')).toBeVisible();
  test.info().annotations.push({ type: "quest-instant-ms", description: String(Date.now() - instantStartedAt) });
  await expect(page.locator(".modal-card").filter({ hasText: "初回バトル" })).toHaveCount(0);

  await page.reload();
  await resumeAfterReload();
  await expect(page.locator('[data-acceptance-state="Q5"]')).toBeVisible();
  const nextToEncounter = page.getByRole("button", { name: "次へ" });
  await expect(nextToEncounter).toBeEnabled({ timeout: 15_000 });
  await nextToEncounter.click();
  const battlePromptAction = page.getByRole("button", { name: "バトルへ" });
  await expect(battlePromptAction).toBeVisible();
  await expect(page.locator('[data-acceptance-state="Q6"] [data-encounter-projection]')).toHaveAttribute("data-encounter-projection", "ready");
  if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath("Q6-battle-encounter-initial.png"), fullPage: true });
  if (captureAcceptanceVisuals) {
    await page.waitForTimeout(320);
    await page.screenshot({ path: test.info().outputPath("Q6-battle-encounter-impact.png"), fullPage: true });
  }
  await expect(page.locator('[data-acceptance-state="Q6"] [data-encounter-ready="true"]')).toBeVisible({ timeout: 2_000 });
  await expect(battlePromptAction).toBeEnabled();
  if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath("Q6-battle-encounter-ready.png"), fullPage: true });
  await battlePromptAction.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.locator('[data-acceptance-state="B1"]')).toBeVisible();
  await expect(page.getByLabel("出撃パーティ").locator(".character-presentation-thumbnail")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_battle_replay_sessions") || "[]").length)).toBe(1);

  // C3-R5's focused verification intentionally stops at the authoritative
  // Battle Start boundary. The default CI journey remains unchanged.
  if (process.env.C3R5_STOP_AT_BATTLE_START === "1") return;

  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const setupMetrics = await page.locator(".tutorial-battle-briefing").evaluate((setup) => {
      const cta = setup.querySelector(".start-battle-btn")?.getBoundingClientRect();
      return { scrollWidth: setup.scrollWidth, clientWidth: setup.clientWidth, ctaHeight: cta?.height || 0 };
    });
    expect(setupMetrics.scrollWidth).toBeLessThanOrEqual(setupMetrics.clientWidth + 1);
    expect(setupMetrics.ctaHeight).toBeGreaterThanOrEqual(44);
    if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath(`m9-battle-setup-${width}.png`), fullPage: true });
  }

  await page.getByRole("button", { name: "バトルスタート" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await page.setViewportSize({ width: 375, height: 844 });
  const battleViewer = page.locator(".quest-battle-viewer");
  await expect(battleViewer).toBeVisible();
  await expect(battleViewer).toHaveAttribute("data-battle-speed", "2");
  await expect(page.locator(".battle-log-box")).toHaveCount(0);
  await expect(page.locator(".battle-timeline-slot")).toHaveCount(0);
  await expect(page.getByLabel("味方パーティ").locator(".battle-unit-party")).toHaveCount(1);
  await expect(page.getByLabel("敵パーティ").locator(".battle-unit-party")).toHaveCount(3);
  await expect(page.locator(".battle-unit.is-actor").first()).toBeVisible();
  await expect(page.locator(".battle-unit.is-target").first()).toBeVisible();
  await expect(page.locator(".battle-unit-party.is-actor .battle-unit-identity-badges img").first()).toBeVisible();
  await expect(page.locator(".battle-action-sequence")).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const metrics = (window as any).__TRIBE_BATTLE_PRESENTATION__;
    return [metrics?.current, ...(metrics?.history || [])].some((entry) => entry?.kind === "normal" && entry?.impactAt);
  }), { timeout: 4_000 }).toBe(true);
  const normalImpactDuration = await page.evaluate(() => {
    const metrics = (window as any).__TRIBE_BATTLE_PRESENTATION__;
    const entry = [metrics?.current, ...(metrics?.history || []).slice().reverse()].find((item) => item?.kind === "normal" && item?.impactAt);
    return entry ? Math.round(entry.impactAt - entry.startedAt) : 0;
  });
  // The accepted presentation rhythm is 260ms at the now-default 2x speed.
  expect(normalImpactDuration).toBeGreaterThanOrEqual(240);
  expect(normalImpactDuration).toBeLessThanOrEqual(450);
  test.info().annotations.push({ type: "normal-impact-ms", description: String(normalImpactDuration) });
  if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath("M1-375-B3-normal-attack.png"), fullPage: true });
  await expect.poll(() => battleViewer.evaluate((viewer) => viewer.dataset.actionKind === "normal"
    && Boolean(viewer.querySelector(".battle-party-zone.is-enemy .battle-unit-party.is-actor"))), { timeout: 12_000 }).toBe(true);
  await expect(page.locator(".battle-party-zone.is-enemy .battle-unit-party.is-actor .battle-unit-identity-badges img").first()).toBeVisible();
  await expect(page.locator(".battle-skill-cutin")).toHaveCount(0);
  if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath("M1-375-enemy-current-actor.png"), fullPage: true });
  await expect(page.locator(".battle-skill-cutin.is-ssr")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".battle-cutin-copy")).toContainText("一騎当千・無慈悲の一撃");
  await expect(page.locator(".battle-skill-cutin")).toHaveCount(1);
  const ssrSkillActorId = await battleViewer.getAttribute("data-action-actor-id");
  expect(ssrSkillActorId).toBeTruthy();
  const ssrSkillId = "SKILL_036";
  if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath("M2-375-B4-skill-cutin.png"), fullPage: true });
  await expect.poll(() => page.evaluate((identity) => {
    const metrics = (window as any).__TRIBE_BATTLE_PRESENTATION__;
    return [metrics?.current, ...(metrics?.history || [])].some((entry) => entry?.kind === "skill" && entry?.actorId === identity.actorId && entry?.skillId === identity.skillId && entry?.impactAt);
  }, { actorId: ssrSkillActorId, skillId: ssrSkillId }), { timeout: 4_000 }).toBe(true);
  await expect(page.locator(".battle-skill-cutin")).toHaveCount(0);
  const skillImpactDuration = await page.evaluate((identity) => {
    const metrics = (window as any).__TRIBE_BATTLE_PRESENTATION__;
    const entry = [metrics?.current, ...(metrics?.history || []).slice().reverse()].find((item) => item?.kind === "skill" && item?.actorId === identity.actorId && item?.skillId === identity.skillId && item?.impactAt);
    return entry ? Math.round(entry.impactAt - entry.startedAt) : 0;
  }, { actorId: ssrSkillActorId, skillId: ssrSkillId });
  // The accepted SSR cut-in reaches impact at 520ms at 2x.
  expect(skillImpactDuration).toBeGreaterThanOrEqual(480);
  expect(skillImpactDuration).toBeLessThanOrEqual(750);
  test.info().annotations.push({ type: "skill-impact-ms", description: String(skillImpactDuration) });
  const pauseButton = page.getByRole("button", { name: "一時停止" });
  if (await pauseButton.isVisible()) {
    await pauseButton.click();
    await expect(page.getByRole("button", { name: "再開" })).toBeVisible();
  }
  if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath("M3-375-B4-impact.png"), fullPage: true });
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/effects/")).length)).toBeGreaterThanOrEqual(7);
  const effectPerformance = await page.evaluate(() => {
    const entries = performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/effects/")) as PerformanceResourceTiming[];
    return {
      count: entries.length,
      totalDurationMs: Math.round(entries.reduce((total, entry) => total + entry.duration, 0)),
      maxDurationMs: Math.round(Math.max(...entries.map((entry) => entry.duration), 0)),
      transferBytes: entries.reduce((total, entry) => total + entry.transferSize, 0),
    };
  });
  console.log(`BATTLE_EFFECT_PERF ${JSON.stringify(effectPerformance)}`);
  for (const width of [375, 390, 430]) {
    if (!(await page.locator(".quest-battle-viewer").isVisible())) break;
    await page.setViewportSize({ width, height: 844 });
    const battleMetrics = await page.locator(".quest-battle-viewer").evaluate((viewer) => {
      const rect = viewer.getBoundingClientRect();
      const hp = viewer.querySelector(".battle-unit-hp")?.getBoundingClientRect();
      const partyArt = viewer.querySelector(".battle-unit-party .battle-unit-art")?.getBoundingClientRect();
      const regions = [".battle-viewer-header", ".battle-timeline", ".battle-roster-stage", ".battle-viewer-controls"]
        .map((selector) => viewer.querySelector<HTMLElement>(selector)?.getBoundingClientRect())
        .filter(Boolean) as DOMRect[];
      const actionStage = viewer.querySelector(".battle-action-stage")?.getBoundingClientRect();
      const actionUnits = [...viewer.querySelectorAll<HTMLElement>(".battle-unit-action")].map((unit) => unit.getBoundingClientRect());
      const actionArt = [...viewer.querySelectorAll<HTMLElement>(".battle-unit-action .battle-unit-art")].map((art) => art.getBoundingClientRect());
      const actionFrames = [...viewer.querySelectorAll<HTMLElement>(".battle-unit-action .character-presentation")];
      const playerZone = viewer.querySelector(".battle-party-zone.is-player")?.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        viewportWidth: innerWidth,
        hpWidth: hp?.width || 0,
        partyArtHeight: partyArt?.height || 0,
        verticalOverlap: regions.some((region, index) => index > 0 && region.top < regions[index - 1].bottom - 1),
        actionUnitCollision: Boolean(actionStage && actionUnits.some((unit) => unit.left < actionStage.left - 1 || unit.right > actionStage.right + 1 || unit.top < actionStage.top - 1 || unit.bottom > actionStage.bottom + 1)),
        actionArtCollision: Boolean(actionStage && actionArt.some((art) => art.left < actionStage.left - 1 || art.right > actionStage.right + 1 || art.top < actionStage.top - 1 || art.bottom > actionStage.bottom + 1))
          || actionFrames.some((frame) => getComputedStyle(frame).overflow !== "hidden" || getComputedStyle(frame.querySelector<HTMLElement>(".character-presentation-art")!).overflow !== "hidden"),
        teamCollision: Boolean(playerZone && actionUnits.some((unit) => unit.bottom > playerZone.top + 1)),
      };
    });
    expect(battleMetrics.left).toBeGreaterThanOrEqual(0);
    expect(battleMetrics.right).toBeLessThanOrEqual(battleMetrics.viewportWidth);
    expect(battleMetrics.hpWidth).toBeGreaterThan(20);
    expect(battleMetrics.partyArtHeight).toBeGreaterThanOrEqual(45);
    expect(battleMetrics.verticalOverlap).toBe(false);
    expect(battleMetrics.actionUnitCollision).toBe(false);
    expect(battleMetrics.actionArtCollision).toBe(false);
    expect(battleMetrics.teamCollision).toBe(false);
    if (captureAcceptanceVisuals && width === 390) await page.screenshot({ path: test.info().outputPath("M5-390-B4-skill.png"), fullPage: true });
    if (captureAcceptanceVisuals && width === 430) await page.screenshot({ path: test.info().outputPath("M6-430-B4-skill.png"), fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 844 });
  const resumeButton = page.getByRole("button", { name: "再開" });
  if (await resumeButton.isVisible()) await resumeButton.click();
  if (await page.locator('[data-acceptance-state="B5"]').isVisible()) {
    if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath("M4-375-B5-final-hit.png"), fullPage: true });
  }
  await expect(page.locator('[data-acceptance-state="B6"]')).toBeVisible({ timeout: 35_000 });
  const rewardStartedAt = Date.now();
  await expect(page.locator(".battle-result-canonical-rewards")).toBeVisible();
  await expect(page.locator(".battle-result-canonical-rewards")).not.toContainText("CHAR_EXP_S");
  await expect(page.locator(".battle-result-canonical-rewards")).not.toContainText("CASH");
  await expect(page.locator(".battle-result-canonical-rewards")).toContainText("PLAYER XP");
  await expect(page.locator(".battle-result-canonical-rewards")).toContainText("強化ドリンク・小");
  await expect(page.locator('.battle-result-canonical-rewards img[alt="強化ドリンク・小"]')).toBeVisible();
  await expect(page.locator(".battle-result-summary")).toContainText("クエストクリア");
  await expect(page.locator(".battle-result-mvp")).toContainText("MVP");
  await expect(page.locator(".battle-result-opponent")).toContainText("VS");
  await expect(page.locator(".battle-result-mvp-hero b")).toContainText("PT");
  await expect(page.locator(".battle-result-score-grid > div")).toHaveCount(5);
  await expect(page.locator(".battle-result-comparison > div")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "勝利報酬を獲得" })).toHaveCount(0);
  test.info().annotations.push({ type: "quest-reward-ms", description: String(Date.now() - rewardStartedAt) });
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const rewardMetrics = await page.locator(".battle-result-summary").evaluate((modal) => {
      const action = modal.querySelector("button") as HTMLElement | null;
      const rect = modal.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, actionHeight: action?.getBoundingClientRect().height || 0 };
    });
    expect(rewardMetrics.left).toBeGreaterThanOrEqual(0);
    expect(rewardMetrics.right).toBeLessThanOrEqual(rewardMetrics.viewportWidth);
    expect(rewardMetrics.top).toBeGreaterThanOrEqual(0);
    expect(rewardMetrics.bottom).toBeLessThanOrEqual(rewardMetrics.viewportHeight);
    expect(rewardMetrics.actionHeight).toBeGreaterThanOrEqual(44);
    if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath(`m9-1-reward-${width}.png`), fullPage: true });
  }
  for (const viewport of c2AcceptanceViewports) {
    await page.setViewportSize(viewport);
    const resultLayout = await page.locator(".battle-result-summary").evaluate((modal) => {
      const rect = modal.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, scrollWidth: modal.scrollWidth, clientWidth: modal.clientWidth };
    });
    expect(resultLayout.left).toBeGreaterThanOrEqual(0);
    expect(resultLayout.right).toBeLessThanOrEqual(resultLayout.viewportWidth);
    expect(resultLayout.top).toBeGreaterThanOrEqual(0);
    expect(resultLayout.bottom).toBeLessThanOrEqual(resultLayout.viewportHeight);
    expect(resultLayout.scrollWidth).toBeLessThanOrEqual(resultLayout.clientWidth + 1);
  }
  await expect.poll(() => page.evaluate(() => {
    const presents = JSON.parse(localStorage.getItem("mock_db_presents") || "[]");
    return presents.some((present: any) => String(present.id).startsWith("patrol_item_") && present.item_id === "CHAR_EXP_S" && present.quantity === 1);
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_presents") || "[]")
    .filter((present: any) => String(present.id).startsWith("patrol_reward_")).length)).toBe(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("TUTORIAL_BATTLE");
  if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath("m9-0e-reward-430.png"), fullPage: true });

  await page.getByRole("button", { name: "次へ" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("RULE_GUIDE");
  await expect(page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"]')).toBeVisible();
  await expect(page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"]')).toContainText("最後に、TRIBE NEONの世界を紹介するね。");
  await page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"] button').click();
  await expect(page.getByRole("heading", { name: "いろんな奴が、この街で生きてる。" })).toBeVisible();
});

test.describe("first quest desktop presentation", () => {
test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });

test("reaches the battle action boundary", async ({ page }) => {
  const desktopUserId = "00000000-0000-4000-8000-000000000919";
  await page.addInitScript(({ desktopUserId }) => {
    localStorage.setItem("tribe_demo_uuid", desktopUserId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: desktopUserId, username: "DPR2 QA", cash: 10000, vitality: 100, level: 1, xp: 0, current_base_id: "shinjuku" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: `starter_${desktopUserId}`, user_id: desktopUserId, character_id: "char_reiji_01", level: 3, awakening_level: 0 }]));
    localStorage.setItem("mock_db_user_skills", JSON.stringify([{ id: `skill_${desktopUserId}`, user_id: desktopUserId, skill_card_id: "SKILL_036", equipped_character_id: `starter_${desktopUserId}`, slot_index: 0, plus_val: 0 }]));
    localStorage.setItem("mock_db_skill_battle_master", JSON.stringify([{ skill_id: "SKILL_036", display_name: "SSR TEST BREAK", kind: "ATTACK", target: "ENEMY_SINGLE", power_percent: 240, cooldown: 1, initial_cooldown: 0, enabled: true }]));
    localStorage.setItem("mock_db_pvp_defense_decks", JSON.stringify([{ id: `deck_${desktopUserId}`, user_id: desktopUserId, character_1_id: `starter_${desktopUserId}` }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: desktopUserId, step_id: "DISPATCH" }]));
    // Use the canonical first quest so start_patrol projects the authoritative
    // encounter snapshot required before the Q5 action becomes enabled.
    localStorage.setItem("mock_db_quests", JSON.stringify([{ id: "q_shinjuku_1", name: "新宿・初級", duration_seconds: 60, cost_vitality: 5, reward_xp: 120, reward_items: [] }]));
    localStorage.setItem("mock_db_user_patrols", "[]");
    localStorage.setItem("mock_db_battle_replay_sessions", "[]");
  }, { desktopUserId });

  await page.goto("/");
  await resumeRuleGuide(page);
  await expect(page.locator('[data-acceptance-state="Q1"]')).toBeVisible();
  await page.locator('[data-acceptance-state="Q1"] button').click();
  await expect(page.locator('[data-acceptance-state="Q3"]')).toBeVisible();
  await page.locator('[data-acceptance-state="Q3"] button').click();
  await expect(page.locator('[data-acceptance-state="Q5"]')).toBeVisible();
  const encounterContinue = page.locator('[data-acceptance-state="Q5"] button');
  await expect(encounterContinue).toBeEnabled({ timeout: 15_000 });
  await encounterContinue.click();
  await expect(page.locator('[data-acceptance-state="Q6"] [data-encounter-ready="true"]')).toBeVisible();
  await page.locator('[data-acceptance-state="Q6"] button').click();
  await page.locator('[data-acceptance-state="B1"] .start-battle-btn').click();
  await expect(page.locator('[data-acceptance-state="B4"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".battle-timeline-slot")).toHaveCount(0);
  const desktopRoster = await page.locator(".battle-roster-stage").evaluate((stage) => [...stage.querySelectorAll<HTMLElement>(".battle-party-zone")].map((zone) => ({
    declared: Number(zone.dataset.partySize || 0),
    rendered: zone.querySelectorAll(".battle-unit-party").length,
  })));
  expect(desktopRoster).toHaveLength(2);
  for (const side of desktopRoster) {
    expect(side.declared).toBeGreaterThanOrEqual(1);
    expect(side.declared).toBeLessThanOrEqual(5);
    expect(side.rendered).toBe(side.declared);
  }
  await expect(page.locator(".battle-skip-btn")).toHaveCount(0);
  const desktopCanvas = await page.locator(".app-container").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, center: rect.left + rect.width / 2, viewportCenter: innerWidth / 2 };
  });
  expect(desktopCanvas.width).toBeLessThanOrEqual(431);
  expect(Math.abs(desktopCanvas.center - desktopCanvas.viewportCenter)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }))).toEqual({ dpr: 2, width: 1440 });
  if (captureAcceptanceVisuals) await page.screenshot({ path: test.info().outputPath("M9-desktop-DPR2-B4.png"), fullPage: true });
});
});

test("naturally completed tutorial quest uses the same encounter and battle boundary as instant completion", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000914";
  await page.addInitScript(({ userId, encounterSnapshot }) => {
    const now = Date.now();
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "通常完了確認", cash: 10000, vitality: 95, level: 1, xp: 0, current_base_id: "shinjuku" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: `starter_${userId}`, user_id: userId, character_id: "char_reiji_01", level: 7, awakening_level: 0 }]));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify([{ user_id: userId, slot: 1, user_character_id: `starter_${userId}` }]));
    localStorage.setItem("mock_db_pvp_defense_decks", JSON.stringify([{ id: `deck_${userId}`, user_id: userId, character_1_id: `starter_${userId}` }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "FREE_INSTANT" }]));
    localStorage.setItem("mock_db_user_patrols", JSON.stringify([{
      id: `normal_complete_${userId}`,
      user_id: userId,
      course_id: "q_shinjuku_1",
      character_id: "char_reiji_01",
      started_at: new Date(now - 61_000).toISOString(),
      expires_at: new Date(now - 1_000).toISOString(),
      status: "ONGOING",
      has_battle_event: true,
      battle_resolved: false,
      encounter_snapshot: encounterSnapshot,
    }]));
  }, { userId, encounterSnapshot: tutorialEncounterSnapshot(`encounter_normal_${userId}`) });

  await page.goto("/");
  await page.waitForTimeout(150);
  await resumeRuleGuide(page);
  await expect(page.locator('[data-acceptance-state="Q5"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("TUTORIAL_BATTLE");
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator('[data-acceptance-state="Q6"] [data-encounter-projection]')).toHaveAttribute("data-encounter-projection", "ready");
  await expect(page.locator('[data-acceptance-state="Q6"] [data-encounter-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "バトルへ" }).click();
  await expect(page.locator('[data-acceptance-state="B1"]')).toBeVisible();
  await expect(page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_battle_replay_sessions") || "[]").length)).resolves.toBe(1);
});

test("tutorial instant completion projects quest complete without a reload", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000915";
  await page.addInitScript(({ userId, encounterSnapshot }) => {
    const now = Date.now();
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "時短連続確認", cash: 10000, vitality: 95, level: 1, xp: 0, current_base_id: "shinjuku" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: `starter_${userId}`, user_id: userId, character_id: "char_reiji_01", level: 7, awakening_level: 0 }]));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify([{ user_id: userId, slot: 1, user_character_id: `starter_${userId}` }]));
    localStorage.setItem("mock_db_pvp_defense_decks", JSON.stringify([{ id: `deck_${userId}`, user_id: userId, character_1_id: `starter_${userId}` }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "FREE_INSTANT" }]));
    localStorage.setItem("mock_db_battle_replay_sessions", "[]");
    localStorage.setItem("mock_db_user_patrols", JSON.stringify([{
      id: `instant_complete_${userId}`,
      user_id: userId,
      course_id: "q_shinjuku_1",
      character_id: "char_reiji_01",
      started_at: new Date(now).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
      status: "ONGOING",
      has_battle_event: true,
      battle_resolved: false,
      encounter_snapshot: encounterSnapshot,
    }]));
  }, { userId, encounterSnapshot: tutorialEncounterSnapshot(`encounter_instant_${userId}`) });

  await page.goto("/");
  await expect(page.getByText("セッション確認中")).toBeHidden();
  await resumeRuleGuide(page);
  await expect(page.locator('[data-acceptance-state="Q3"]')).toBeVisible();
  await page.getByRole("button", { name: /すぐに時短する/ }).click();
  await expect(page.locator('[data-acceptance-state="Q5"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("TUTORIAL_BATTLE");
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator('[data-acceptance-state="Q6"] [data-encounter-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "バトルへ" }).click();
  await expect(page.locator('[data-acceptance-state="B1"]')).toBeVisible();
  await expect(page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_battle_replay_sessions") || "[]").length)).resolves.toBe(1);
});

test("claimed tutorial reward resumes at the completion boundary after reload", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000911";
  await page.addInitScript(({ userId }) => {
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "報酬復帰", cash: 10000, vitality: 95, level: 1, xp: 120, current_base_id: "shinjuku" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: `starter_${userId}`, user_id: userId, character_id: "char_reiji_01", level: 3, awakening_level: 0 }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "TUTORIAL_BATTLE" }]));
    localStorage.setItem("mock_db_user_patrols", JSON.stringify([{
      id: "claimed_tutorial_patrol",
      user_id: userId,
      course_id: "q_shinjuku_short",
      character_id: "char_reiji_01",
      started_at: new Date(Date.now() - 120_000).toISOString(),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      status: "COMPLETED",
      has_battle_event: false,
      battle_resolved: true,
      battle_result: "VICTORY",
    }]));
  }, { userId });

  await page.goto("/");
  await resumeRuleGuide(page);
  await page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"] button').click();
  await expect(page.getByRole("heading", { name: "いろんな奴が、この街で生きてる。" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("RULE_GUIDE");
});

test("tutorial completion resumes through account save and exposes the Home next action", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000912";
  await page.addInitScript(({ userId }) => {
    localStorage.setItem("tribe_demo_uuid", userId);
    if (!localStorage.getItem("mock_db_users")) {
      localStorage.setItem("mock_auth_mode", "ANONYMOUS");
      localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "完了復帰", cash: 10000, vitality: 95, level: 5, xp: 0, current_base_id: "shinjuku" }]));
      localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: `starter_${userId}`, user_id: userId, character_id: "char_reiji_01", level: 3, awakening_level: 0 }]));
      localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "RULE_GUIDE" }]));
    }
  }, { userId });

  await page.goto("/");
  await resumeRuleGuide(page);
  await page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"] button').click();
  await expect(page.getByRole("heading", { name: "いろんな奴が、この街で生きてる。" })).toBeVisible();

  const completionMetrics = await page.locator(".tutorial-rule-screen").evaluate((screen) => {
    const action = screen.querySelector("button") as HTMLElement | null;
    const rect = screen.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, actionHeight: action?.getBoundingClientRect().height || 0 };
  });
  expect(completionMetrics.left).toBeGreaterThanOrEqual(0);
  expect(completionMetrics.right).toBeLessThanOrEqual(completionMetrics.viewportWidth);
  expect(completionMetrics.top).toBeGreaterThanOrEqual(0);
  expect(completionMetrics.bottom).toBeLessThanOrEqual(completionMetrics.viewportHeight);
  expect(completionMetrics.actionHeight).toBeGreaterThanOrEqual(44);

  await completeRuleGuide(page);
  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("COMPLETE");

  await page.reload();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("COMPLETE");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "チュートリアルを続ける" }).click();
  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  await page.getByPlaceholder("メールアドレス").fill("m9-f@example.com");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("m9-f-preview-pass");
  await page.getByRole("button", { name: "メールアカウントを連携" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(page.locator(".mypage-primary-cta")).toContainText("無料スキル／装備ガチャを引こう");
  await expect(page.locator(".footer-mobile")).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("AUTHENTICATION");

  await page.reload();
  await resumeRuleGuide(page);
  await expect(page.locator(".mypage-primary-cta")).toContainText("無料スキル／装備ガチャを引こう");
  await expect(page.getByText("ゲームデータを保存")).toBeHidden();
});

test("new mobile player completes the guided first session without footer navigation", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    sessionStorage.setItem("m9x_use_canonical_quest", "true");
    localStorage.setItem("mock_db_quests", JSON.stringify([{
      id: "q_shinjuku_1",
      name: "新宿・初級",
      town_id: "shinjuku",
      difficulty: "EASY",
      duration_seconds: 60,
      cost_vitality: 5,
      reward_xp: 120,
      reward_items: [],
      is_unlocked: true,
    }]));
  });
  const timingStages = new Set<string>();
  const failedImages: string[] = [];
  const pageErrors: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "image" && !response.ok()) failedImages.push(`${response.status()} ${response.url()}`);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
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
  await expect(page.getByRole("button", { name: "次へ" })).toHaveClass(/semantic-cta--primary/);
  await page.getByRole("button", { name: "次へ" }).click();

  await expect(page.getByRole("heading", { name: "最初の仲間を迎えよう" })).toBeVisible();
  await assertCenteredGameCanvas(page, ".gacha-view-root");
  await expect(page.getByRole("button", { name: "無料10連を引く" })).toBeVisible();
  await expect(page.getByRole("button", { name: "無料10連を引く" })).toHaveClass(/semantic-cta--primary/);
  await page.getByRole("button", { name: "無料10連を引く" }).click();
  await revealTutorialTenPull(page);
  await expect(page.locator(".cg-summary")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "編成へ進む" })).toHaveClass(/semantic-cta--primary/);
  await page.getByRole("button", { name: "編成へ進む" }).click();
  await completeVisibleTutorialGrowth(page);
  await assertCenteredGameCanvas(page, ".char-party-modal-backdrop");
  await expect(page.getByRole("button", { name: "おすすめ編成にする" })).toHaveClass(/semantic-cta--primary/);
  await completeTutorialAutoFormation(page);
  await assertCenteredGameCanvas(page, ".patrol-container");
  await page.screenshot({ path: test.info().outputPath("Q1-dispatch-before.png"), fullPage: true });
  await expect(page.getByRole("button", { name: "新宿へ派遣する" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "新宿へ派遣する" })).toHaveClass(/variant-primary/);
  await page.getByRole("button", { name: "新宿へ派遣する" }).click();
  await expect(page.locator('[data-acceptance-state="Q2"]')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("Q2-dispatch-started.png"), fullPage: true });
  await expect(page.locator('[data-acceptance-state="Q3"]')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("Q3-dispatch-progress.png"), fullPage: true });
  const speedUp = page.getByRole("button", { name: /すぐに時短する/ });
  await expect(speedUp).toHaveClass(/variant-primary/);
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
  // Current Production uses StreetBattle presentation; canonical tutorial flow is unchanged.
  await expect(page.getByRole("heading", { name: "出撃準備" })).toBeVisible();
  await page.getByRole("button", { name: "バトルスタート", exact: true }).click();
  await expect(page.locator(".sf-matchup")).toBeVisible();
  await expect(page.locator(".sb-root")).toBeVisible();
  await expect(page.locator(".battle-result-summary")).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: test.info().outputPath("B6-result.png"), fullPage: true });
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(page.locator(".tutorial-rule-screen")).toBeVisible();
  await assertCenteredGameCanvas(page, ".tutorial-rule-screen");
  await completeRuleGuide(page);
  await expect(page.getByText("クエスト結果")).toHaveCount(0);
  await page.waitForTimeout(750);
  await expect(page.getByText("クエスト結果")).toHaveCount(0);

  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  await assertCenteredGameCanvas(page, ".modal-overlay");
  await page.getByPlaceholder("メールアドレス").fill("m9@example.com");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("m9-preview-pass");
  await expect(page.getByRole("button", { name: "Googleアカウントを連携" })).toHaveClass(/semantic-cta--primary/);
  await expect(page.getByRole("button", { name: "メールアカウントを連携" })).toHaveClass(/semantic-cta--secondary/);
  await page.getByRole("button", { name: "メールアカウントを連携" }).click();
  await expect(page.locator(".mypage-primary-cta")).toBeVisible();
  await page.waitForTimeout(750);
  await expect(page.getByText("クエスト結果")).toHaveCount(0);
  await expect(page.locator(".mypage-primary-cta")).toHaveClass(/semantic-cta--primary/);
  await expect(page.locator(".mypage-primary-cta")).toContainText("無料スキル／装備ガチャを引こう");
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
  // Fresh-user grant must exist in the DB adapter and match the shared Context UI.
  const persisted = await page.evaluate(() => ({
    equipment: JSON.parse(localStorage.getItem("mock_db_user_equipments") || "[]"),
    characters: JSON.parse(localStorage.getItem("mock_db_user_characters") || "[]"),
  }));
  expect(persisted.equipment).toHaveLength(5);
  const owner = persisted.characters.find((entry: any) => entry.id === persisted.equipment[0].equipped_character_id);
  const ownerMaster = CHARACTERS_MASTER.find(entry => entry.id === owner.character_id)!;
  const stats = getCharacterTotalStats(owner, persisted.equipment);
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  if (await loginBonus.isVisible()) await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.locator('.footer-item[aria-label="キャラ"]').click();
  await page.getByRole("button", {name: "キャラ一覧", exact: true}).click();
  await page.locator(".character-v2-card").filter({ has: page.locator("strong", { hasText: ownerMaster.jpName }) }).click();
  await expect(page.locator(".character-home-power strong")).toHaveText((stats.hp + stats.atk + stats.def).toLocaleString());
  await expect(page.locator(".character-home").getByRole("button", { name: /装備/ })).toContainText("5 / 7");
  await page.screenshot({ path: test.info().outputPath("fresh-persisted-equipment-home.png") });
  expect(failedImages).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("visible growth remains the post-gacha gate and resumes idempotently", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000909";
  await page.addInitScript(({ userId }) => {
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "再開確認", cash: 10000, vitality: 100, current_base_id: "shinjuku" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: `starter_${userId}`, user_id: userId, character_id: "char_reiji_01", level: 1, awakening_level: 0 }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTO_FORMATION" }]));
    localStorage.setItem("mock_db_user_items", JSON.stringify([{ user_id: userId, item_id: "CHAR_EXP_S", quantity: 0 }]));
    localStorage.setItem("mock_db_gacha_execution_history", JSON.stringify([{ user_id: userId, gacha_id: "CHAR_NORMAL", pull_count: 10, result_payload: { tutorial: true, results: [{ character_id: "char_reiji_01", tutorial_slot: 10 }] } }]));
  }, { userId });

  await page.goto("/");
  await resumeRuleGuide(page);
  await expect(page.locator('[data-acceptance-state="TUTORIAL_SKILL_STEP"]')).toBeVisible();
  await page.reload();
  await resumeRuleGuide(page);
  await completeVisibleTutorialGrowth(page);
  await completeTutorialAutoFormation(page);
  const result = await page.evaluate(() => ({
    step: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id,
    quantity: JSON.parse(localStorage.getItem("mock_db_user_items") || "[]")[0]?.quantity,
  }));
  expect(result).toEqual({ step: "DISPATCH", quantity: 0 });
});

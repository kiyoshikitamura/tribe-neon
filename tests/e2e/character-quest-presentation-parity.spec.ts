import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000829";
    const now = new Date().toISOString();
    const cycleDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{ user_id: userId, current_day: 1, total_logins: 1, last_claimed_date: cycleDate }]));
    if (!localStorage.getItem("mock_db_users")) {
      localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "Presentation QA", current_base_id: "shinjuku", favorite_character_id: "char_reiji_01", level: 10, cash: 50000, vitality: 100 }]));
    }
    localStorage.setItem("mock_db_user_characters", JSON.stringify([
      { id: "character-owned-1", user_id: userId, character_id: "char_reiji_01", level: 12, awakening_level: 3, created_at: now },
      { id: "character-owned-2", user_id: userId, character_id: "char_rui_01", level: 10, awakening_level: 1, created_at: now },
      { id: "character-owned-3", user_id: userId, character_id: "char_chang_01", level: 9, awakening_level: 0, created_at: now },
    ]));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify([
      { user_id: userId, slot: 1, user_character_id: "character-owned-1" },
      { user_id: userId, slot: 2, user_character_id: "character-owned-2" },
      { user_id: userId, slot: 3, user_character_id: "character-owned-3" },
    ]));
    localStorage.setItem("mock_db_user_skills", JSON.stringify([
      { id: "skill-owned-1", user_id: userId, skill_card_id: "SKILL_001", level: 4, plus_val: 3, equipped_character_id: "character-owned-1", slot_index: 0 },
      { id: "skill-owned-2", user_id: userId, skill_card_id: "SKILL_005", level: 2, plus_val: 1, equipped_character_id: null, slot_index: null },
    ]));
    localStorage.setItem("mock_db_skill_battle_master", JSON.stringify([
      { skill_id: "SKILL_001", display_name: "ストリートパンチ", enabled: true, kind: "ATTACK", target: "ENEMY_SINGLE", cooldown: 2 },
      { skill_id: "SKILL_005", display_name: "毒針", enabled: true, kind: "ATTACK", target: "ENEMY_SINGLE", cooldown: 2 },
    ]));
    localStorage.setItem("mock_db_user_equipments", JSON.stringify([
      { id: "equipment-owned-1", user_id: userId, equipment_id: "WEAPON_001", level: 8, plus_val: 2, equipped_character_id: "character-owned-1", slot_index: 0, created_at: now },
      { id: "equipment-owned-2", user_id: userId, equipment_id: "BODY_001", level: 4, plus_val: 0, equipped_character_id: null, slot_index: null, created_at: now },
    ]));
    localStorage.setItem("mock_db_user_items", JSON.stringify([
      { id: "item-char-s", user_id: userId, item_id: "CHAR_EXP_S", quantity: 10 },
      { id: "item-char-m", user_id: userId, item_id: "CHAR_EXP_M", quantity: 5 },
      { id: "item-char-l", user_id: userId, item_id: "CHAR_EXP_L", quantity: 2 },
      { id: "item-awaken", user_id: userId, item_id: "AWAKENING_BOOK", quantity: 1 },
      { id: "item-equip-s", user_id: userId, item_id: "EQUIP_EXP_S", quantity: 5 },
      { id: "item-equip-m", user_id: userId, item_id: "EQUIP_EXP_M", quantity: 4 },
      { id: "item-equip-l", user_id: userId, item_id: "EQUIP_EXP_L", quantity: 2 },
      { id: "item-skill-manual", user_id: userId, item_id: "SKILL_MANUAL", quantity: 1 },
    ]));
    localStorage.setItem("mock_db_quests", JSON.stringify([
      { id: "QUEST_SHINJUKU_EASY", name: "歌舞伎町一番街", town_id: "shinjuku", level_type: "EASY", duration_seconds: 300, cost_vitality: 3, cash_reward: 0, exp_reward: 100 },
      { id: "QUEST_SHINJUKU_NORMAL", name: "職安通り", town_id: "shinjuku", level_type: "NORMAL", duration_seconds: 3600, cost_vitality: 10, cash_reward: 0, exp_reward: 400 },
    ]));
    localStorage.setItem("mock_db_user_quest_first_clears", JSON.stringify([{ user_id: userId, quest_id: "QUEST_SHINJUKU_EASY", cleared_at: now }]));
    localStorage.setItem("mock_db_patrol_npcs", JSON.stringify([
      { id: "npc_shinjuku_easy", quest_id: "QUEST_SHINJUKU_EASY", npc_name: "Canonical EASY Party", npc_level: 5, members: [{ characterId: "char_tomoya_01", level: 5 }, { characterId: "char_kenji_01", level: 5 }, { characterId: "char_shin_01", level: 5 }] },
      { id: "npc_shinjuku_normal", quest_id: "QUEST_SHINJUKU_NORMAL", npc_name: "Canonical NORMAL Party", npc_level: 12, members: [{ characterId: "char_tomoya_01", level: 12 }, { characterId: "char_kenji_01", level: 12 }, { characterId: "char_shin_01", level: 12 }, { characterId: "char_takuro_01", level: 12 }, { characterId: "char_leon_01", level: 12 }] },
    ]));
  });
});

async function enterGame(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await loginBonus.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await loginBonus.isVisible()) {
    await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  }
}

async function continueAfterReload(page: import("@playwright/test").Page) {
  const tapToStart = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  await expect(tapToStart.or(continueAction)).toBeVisible();
  if (await tapToStart.isVisible()) {
    await tapToStart.click();
  }
  await continueAction.click();
}

async function expectMobileGeometry(page: import("@playwright/test").Page, selector: string) {
  const geometry = await page.locator(selector).evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right,
    viewport: window.innerWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
}

test("Character, Party, Growth, Skill and Equipment follow the fixed mobile hierarchy", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterGame(page);
  await page.getByRole("button", { name: /MENU/ }).click();
  await page.getByRole("button", { name: "バッグ", exact: true }).click();
  await expect(page.locator(".bag-item-card", { hasText: "強化ドリンク・小" })).toContainText("所持数: 10");
  await expect(page.locator(".bag-item-card", { hasText: "カスタムオイル・小" })).toContainText("所持数: 5");
  await page.locator('.footer-item[aria-label="キャラ"]').click();
  await expect(page.locator(".character-v2-shell")).toBeVisible();
  await expect(page.locator(".character-v2-character-grid .character-v2-card")).toHaveCount(3);
  await expectMobileGeometry(page, ".character-v2-shell");
  await page.screenshot({ path: test.info().outputPath("character-list-390.png") });

  await page.locator(".character-v2-character-grid .character-v2-card").first().click();
  await expect(page.getByRole("region", { name: "キャラクターホーム" })).toBeVisible();
  await expect(page.locator(".character-home-power")).toContainText("総合力");
  await page.screenshot({ path: test.info().outputPath("character-home-390.png") });
  await page.getByRole("button", { name: "育成する", exact: true }).click();
  await expect(page.getByText("強化ドリンク・小", { exact: true })).toBeVisible();
  await expect(page.getByText("強化ドリンク・中", { exact: true })).toBeVisible();
  await expect(page.getByText("強化ドリンク・大", { exact: true })).toBeVisible();
  await expect(page.getByText("覚醒の書", { exact: true })).toBeVisible();
  await expect(page.locator(".character-v2-material", { hasText: "強化ドリンク・小" })).toContainText("所持 10 / 使用 0");
  await expect(page.getByText("同一Character Duplicate取得時は自動覚醒します。", { exact: true })).toHaveCount(0);
  await page.locator(".character-v2-material").first().locator("button").last().click();
  await expect(page.locator(".character-v2-current-after").first()).toContainText("Lv.13");
  await expect(page.locator(".character-v2-preview-stats")).toBeVisible();

  await page.locator(".character-v2-main-nav").getByRole("button", { name: "パーティ", exact: true }).click();
  await expect(page.locator(".character-v2-party-slots > *")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "おまかせ編成", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "おまかせ装備", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "パーティ保存", exact: true })).toBeVisible();

  await page.locator(".character-v2-main-nav").getByRole("button", { name: "スキル", exact: true }).click();
  await expect(page.locator(".character-v2-asset-grid .character-v2-asset-card")).toHaveCount(2);
  await page.locator(".character-v2-asset-grid .character-v2-asset-card").first().click();
  await expect(page.locator(".character-v2-mini-detail")).toBeVisible();
  await expect(page.locator(".canonical-dialog-close")).toHaveCount(0);
  await page.getByRole("button", { name: "強化", exact: true }).click();
  await expect(page.locator(".character-v2-asset-growth")).toBeVisible();
  await expect(page.locator(".character-v2-material", { hasText: "スキル指南書" })).toContainText("所持 1 / 必要 1");
  await expect(page.locator(".character-v2-current-after")).toContainText("After");
  await page.getByRole("button", { name: "戻る", exact: true }).click();

  await page.locator(".character-v2-main-nav").getByRole("button", { name: "装備", exact: true }).click();
  await expect(page.locator(".character-v2-asset-grid .character-v2-asset-card")).toHaveCount(2);
  await page.locator(".character-v2-asset-grid .character-v2-asset-card").first().click();
  await page.getByRole("button", { name: "強化", exact: true }).click();
  await expect(page.locator(".character-v2-asset-growth")).toBeVisible();
  await expect(page.locator(".character-v2-current-after").first()).toContainText("After");
  await expectMobileGeometry(page, ".character-v2-shell");

  await page.setViewportSize({ width: 412, height: 915 });
  await expectMobileGeometry(page, ".character-v2-shell");
  await page.screenshot({ path: test.info().outputPath("character-system-412.png"), fullPage: true });
});

test("canonical Leader changes update Home and Header immediately and persist across navigation and reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterGame(page);
  await expect(page.locator('.mypage-leader-layer[data-character-authority="char_reiji_01"]')).toBeVisible();
  await expect(page.locator('.header-mobile img[alt="Presentation QAのリーダー"]')).toHaveAttribute("src", /reiji_transparent_asset/);

  await page.locator('.footer-item[aria-label="キャラ"]').click();
  await page.locator('.character-v2-card').first().click();
  await page.getByRole('button', { name: /PARTY/ }).click();
  await page.getByRole("button", { name: "リーダー変更", exact: true }).first().click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_users") || "[]")[0]?.favorite_character_id)).toBe("char_rui_01");
  await expect(page.locator('.header-mobile img[alt="Presentation QAのリーダー"]')).toHaveAttribute("src", /rui_transparent_asset/);

  await page.locator('.footer-item[aria-label="マイページ"]').click();
  await expect(page.locator('.mypage-leader-layer[data-character-authority="char_rui_01"]')).toBeVisible();
  await page.locator('.footer-item[aria-label="キャラ"]').click();
  await page.locator('.footer-item[aria-label="マイページ"]').click();
  await expect(page.locator('.mypage-leader-layer[data-character-authority="char_rui_01"]')).toBeVisible();

  await page.setViewportSize({ width: 412, height: 915 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.reload();
  await continueAfterReload(page);
  await expect(page.locator('.mypage-leader-layer[data-character-authority="char_rui_01"]')).toBeVisible();
  await expect(page.locator('.header-mobile img[alt="Presentation QAのリーダー"]')).toHaveAttribute("src", /rui_transparent_asset/);

  await page.locator('.footer-item[aria-label="キャラ"]').click();
  await page.locator('.character-v2-card').first().click();
  await page.getByRole('button', { name: /PARTY/ }).click();
  await page.getByRole("button", { name: "リーダー変更", exact: true }).last().click();
  await page.locator('.footer-item[aria-label="マイページ"]').click();
  await expect(page.locator('.mypage-leader-layer[data-character-authority="char_chang_01"]')).toBeVisible();
  await expect(page.locator('.header-mobile img[alt="Presentation QAのリーダー"]')).toHaveAttribute("src", /chang_transparent_asset/);

  await page.evaluate(() => {
    const users = JSON.parse(localStorage.getItem("mock_db_users") || "[]");
    users[0].favorite_character_id = "invalid_character";
    localStorage.setItem("mock_db_users", JSON.stringify(users));
  });
  await page.reload();
  await continueAfterReload(page);
  await expect(page.locator('.mypage-leader-layer[data-character-authority="placeholder"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("Normal Quest uses the tutorial-passed identity, reward and progress grammar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterGame(page);
  await page.locator(".circle-menu-btn.conquest").click();
  await expect(page.locator(".quest-v2-shell")).toBeVisible();
  await expect(page.locator(".quest-v2-shell > .ui-page-header")).toHaveCount(0);
  await expect(page.locator(".quest-v2-identity")).toContainText("クエスト選択");
  await expect(page.locator(".quest-v2-metrics")).toContainText("所要時間");
  await expect(page.locator(".quest-v2-enemies")).toContainText("出現する敵");
  // Production generates the exact enemy party for each dispatch. The Quest
  // progression projection must not invent a static party before dispatch.
  await expect(page.locator(".quest-v2-enemies article")).toHaveCount(0);
  await expect(page.locator(".quest-v2-rewards").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "新宿へ派遣する", exact: true })).toBeVisible();
  await expect(page.locator("[data-quest-state]" )).toHaveCount(0);
  await expectMobileGeometry(page, ".quest-v2-shell");

  const hometownCharacter = page.locator('.quest-v2-character-grid button[aria-label*="地元一致ボーナス"]').first();
  await expect(hometownCharacter).toBeVisible();
  await hometownCharacter.click();
  await expect(page.locator(".quest-v2-hometown-note")).toContainText("地元一致ボーナス対象");
  await page.getByRole("button", { name: "新宿へ派遣する", exact: true }).click();
  await expect(page.locator('[data-quest-state="PROGRESS"]')).toBeVisible();
  await expect(page.locator(".quest-v2-identity")).toHaveCount(0);
  await page.getByRole("button", { name: "別のクエストへ派遣", exact: true }).click();
  await expect(page.locator(".quest-v2-identity")).toBeVisible();
  const deployed = page.locator(".quest-v2-character-grid button.deployed");
  await expect(deployed).toHaveCount(1);
  await expect(deployed.locator(".quest-v2-character-visual > b")).toHaveText("派遣中");
  await deployed.click();
  await expect(page.locator('[data-quest-state="PROGRESS"]')).toBeVisible();
  await page.getByRole("button", { name: "別のクエストへ派遣", exact: true }).click();
  await page.locator(".quest-v2-courses").getByRole("button", { name: /中級/ }).click();
  await page.locator(".quest-v2-character-grid button:not(.deployed)").first().click();
  await page.getByRole("button", { name: "新宿へ派遣する", exact: true }).click();
  await expect(page.locator('[data-quest-state="PROGRESS"]')).toBeVisible();
  await page.getByRole("button", { name: "別のクエストへ派遣", exact: true }).click();
  await expect(page.locator(".quest-v2-character-grid button.deployed")).toHaveCount(2);
  await page.locator(".quest-v2-character-grid button.deployed").first().click();
  await expect(page.locator('[data-quest-state="PROGRESS"]')).toBeVisible();
  await page.getByRole("button", { name: "無料時短", exact: true }).click();
  const battleReady = page.locator('[data-quest-state="BATTLE_READY"]');
  await expect(battleReady).toBeVisible();
  await expect(page.locator('[data-quest-state="PROGRESS"]')).toHaveCount(0);
  await expect(battleReady.locator(".quest-v2-battle-ready-identity h2")).toHaveText("バトル発生");
  await expect(battleReady.locator(".quest-v2-battle-enemies article").first()).toContainText(/Lv \d+/);
  await expect(battleReady.getByRole("button", { name: "バトルへ", exact: true })).toBeVisible();
  const battleGeometry390 = await page.evaluate(() => {
    const state = document.querySelector<HTMLElement>('[data-quest-state="BATTLE_READY"]')!;
    const title = state.querySelector<HTMLElement>("h2")!;
    const cta = [...state.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "バトルへ")!;
    const footer = document.querySelector<HTMLElement>(".footer-mobile")!;
    const titleStyle = getComputedStyle(title);
    return { stateWidth: state.scrollWidth, stateClientWidth: state.clientWidth, titleHeight: title.getBoundingClientRect().height, titleLineHeight: parseFloat(titleStyle.lineHeight), titleWhiteSpace: titleStyle.whiteSpace, ctaBottom: cta.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top };
  });
  expect(battleGeometry390.stateWidth).toBeLessThanOrEqual(battleGeometry390.stateClientWidth + 1);
  expect(battleGeometry390.titleWhiteSpace).toBe("nowrap");
  expect(battleGeometry390.titleHeight).toBeLessThanOrEqual(battleGeometry390.titleLineHeight * 1.2);
  expect(battleGeometry390.ctaBottom).toBeLessThanOrEqual(battleGeometry390.footerTop);

  await page.setViewportSize({ width: 412, height: 915 });
  await expectMobileGeometry(page, ".quest-v2-shell");
  const battleGeometry412 = await page.evaluate(() => {
    const cta = [...document.querySelectorAll<HTMLButtonElement>('[data-quest-state="BATTLE_READY"] button')].find((button) => button.textContent?.trim() === "バトルへ")!;
    const footer = document.querySelector<HTMLElement>(".footer-mobile")!;
    return { ctaBottom: cta.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(battleGeometry412.ctaBottom).toBeLessThanOrEqual(battleGeometry412.footerTop);
  expect(battleGeometry412.overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("quest-parity-412.png"), fullPage: true });
});

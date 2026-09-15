import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(60_000);
const captureAcceptanceVisuals = process.env.CAPTURE_ACCEPTANCE_VISUALS === "1";

test("normal Quest starts its Canonical battle from the per-dispatch encounter snapshot", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000925";
    const now = Date.now();
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: "通常クエストQA",
      level: 5,
      xp: 0,
      cash: 10000,
      vitality: 95,
      current_base_id: "shinjuku",
      favorite_character_id: "char_reiji_01",
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: userId, auth_method: "GOOGLE" }]));
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: userId, provider: "google" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{
      id: `starter_${userId}`,
      user_id: userId,
      character_id: "char_reiji_01",
      level: 5,
      awakening_level: 0,
    }]));
    localStorage.setItem("mock_db_quests", JSON.stringify([{
      id: "QUEST_SHINJUKU_EASY",
      name: "歌舞伎町一番街",
      town_id: "shinjuku",
      level_type: "EASY",
      duration_seconds: 300,
      cost_vitality: 3,
      cash_reward: 0,
      exp_reward: 100,
    }]));
    localStorage.setItem("mock_db_user_patrols", JSON.stringify([{
      id: "normal-natural-expiry",
      user_id: userId,
      course_id: "QUEST_SHINJUKU_EASY",
      character_id: "char_reiji_01",
      started_at: new Date(now - 285_000).toISOString(),
      expires_at: new Date(now + 15_000).toISOString(),
      status: "ONGOING",
      has_battle_event: true,
      battle_resolved: false,
      battle_result: null,
      encounter_snapshot: {
        encounterId: "encounter_QUEST_SHINJUKU_EASY_natural_expiry",
        questId: "QUEST_SHINJUKU_EASY",
        townId: "shinjuku",
        difficulty: "EASY",
        enemyTactic: "BALANCED",
        partySignature: "char_kenji_01|char_shin_01|char_tomoya_01",
        members: [
          { slot: 1, characterId: "char_tomoya_01", rarity: "N", level: 5, awakening: 0, growthPattern: "BALANCED", stats: { hp: 14000, atk: 1600, def: 1200, spd: 90, luk: 0 }, skillLoadout: ["SKILL_008"], equipmentLoadout: [] },
          { slot: 2, characterId: "char_kenji_01", rarity: "N", level: 5, awakening: 0, growthPattern: "ATTACKER", stats: { hp: 14000, atk: 1600, def: 1200, spd: 95, luk: 0 }, skillLoadout: ["SKILL_001"], equipmentLoadout: [] },
          { slot: 3, characterId: "char_shin_01", rarity: "R", level: 5, awakening: 0, growthPattern: "DEFENDER", stats: { hp: 14000, atk: 1600, def: 1200, spd: 85, luk: 0 }, skillLoadout: ["SKILL_006"], equipmentLoadout: [] },
        ],
      },
    }]));
  });

  await page.goto("/");
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  await expect(titleAction.or(continueAction)).toBeVisible();
  if (await titleAction.isVisible()) await titleAction.click();
  await expect(continueAction).toBeVisible();
  await continueAction.click();
  const header = page.locator(".header-mobile");
  await expect(header).toBeVisible();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await expect(loginBonus).toBeVisible();
  await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();

  await page.locator(".circle-menu-btn.conquest").click();
  await expect(page.locator(".patrol-container")).toBeVisible();
  await expect(page.getByText(/残り時間 00:\d{2}/)).toBeVisible();
  const battleStart = page.getByRole("button", { name: "バトルへ" });
  await expect(battleStart).toBeVisible({ timeout: 20_000 });
  await expect(battleStart).toBeEnabled();
  await expect(page.locator('[data-quest-state="BATTLE_READY"]')).toBeVisible();
  await expect(page.locator(".quest-v2-battle-enemies article")).toHaveCount(3);
  if (captureAcceptanceVisuals) await page.screenshot({ path: testInfo.outputPath("before-canonical-quest-battle-start.png"), fullPage: true });

  await battleStart.click();
  const sortieAction = page.getByRole("button", { name: "バトルスタート", exact: true });
  await expect(page.locator(".battle-screen")).toBeVisible({ timeout: 20_000 });
  await expect(sortieAction).toBeVisible();
  await expect(sortieAction).toBeEnabled();
  if (captureAcceptanceVisuals) await page.screenshot({ path: testInfo.outputPath("after-canonical-quest-battle-start.png"), fullPage: true });

  const geometry = await page.locator(".battle-screen").evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
});

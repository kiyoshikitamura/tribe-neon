import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("fresh start preserves Ageha handoffs and enters Free Gacha through World Introduction", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mock_rpc_fixture:empty_raid_recoveries", "true");
    localStorage.setItem("mock_db_gacha_masters", JSON.stringify([{ id: "CHAR_NORMAL", name: "ノーマルガチャ", gacha_type: "CHARACTER", cost_cash: 1000, cost_diamond: 100, is_active: true }]));
    localStorage.setItem("mock_db_gacha_items_master", JSON.stringify([
      { gacha_id: "CHAR_NORMAL", item_id: "char_yuji_01", rarity: "R", weight: 100 },
      { gacha_id: "CHAR_NORMAL", item_id: "char_go_01", rarity: "SSR", weight: 100 },
      { gacha_id: "CHAR_NORMAL", item_id: "char_kengo_01", rarity: "SSR", weight: 100 },
      { gacha_id: "CHAR_NORMAL", item_id: "char_mio_01", rarity: "SSR", weight: 100 },
      { gacha_id: "CHAR_SPECIAL", item_id: "char_reiji_01", rarity: "SSR", weight: 100 },
    ]));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await page.getByRole("button", { name: "はじめから" }).click();
  await expect(page.locator('[data-entry-state="WORLD_INFORMATION"]')).toBeVisible();
  await page.getByRole("button", { name: "SKIP" }).click();
  await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toContainText("ようこそ、TRIBE NEONへ！");
  await page.locator(".setup-ageha-presentation .setup-primary-action").click();
  await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toContainText("キミの名前を教えて？");
  await page.getByLabel("プレイヤー名（8文字まで）").fill("短縮QA");
  await page.getByRole("button", { name: "この名前で始める" }).click();
  await expect(page.locator(".tutorial-world")).toContainText("まずは仲間を集めよっか。");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("WORLD_INTRO");
  await page.locator(".tutorial-world-next-cta").click();
  await expect(page.getByRole("button", { name: "無料10連を引く" })).toBeVisible();
  const step = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id);
  expect(step).toBe("FREE_GACHA");
  await page.getByRole("button", { name: "無料10連を引く" }).click();
  await expect(page.locator(".cg-opening")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cg-opening").click();
  const reveal = page.locator(".cg-reveal");
  for (let index = 0; index < 10; index += 1) {
    await expect(page.locator(".cg-top>span")).toHaveText(`${index + 1} / 10`);
    await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "SETTLED", { timeout: 5_000 });
    await reveal.click();
  }
  await expect(page.getByRole("button", { name: "編成へ進む" })).toBeVisible();
  await page.getByRole("button", { name: "編成へ進む" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("AUTO_FORMATION");
  await expect(page.getByRole("button", { name: "おすすめ編成にする" })).toBeVisible();
  await expect(page.getByRole("button", { name: "バトルへ進む" })).toHaveCount(0);
});

test("AUTO_FORMATION resume remains on the accepted Character tutorial", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000003120";
  await page.addInitScript(({ userId }) => {
    const now = new Date().toISOString();
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "Resume QA", level: 1, cash: 10000, vitality: 100, pvp_points: 5, current_base_id: "shinjuku" }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTO_FORMATION" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: "resume-char", user_id: userId, character_id: "char_reiji_01", level: 1, awakening_level: 0, created_at: now }]));
    localStorage.setItem("mock_db_user_main_formations", "[]");
    localStorage.setItem("mock_db_user_power_rankings", "[]");
    localStorage.setItem("mock_db_user_patrols", "[]");
    localStorage.setItem("mock_db_user_equipments", "[]");
    localStorage.setItem("mock_db_user_skills", "[]");
    localStorage.setItem("mock_db_patrol_npcs", JSON.stringify([{ id: "npc-tutorial", quest_id: "q_shinjuku_1", npc_name: "路地裏のならず者", enemy_data: { hp: 120, atk: 1, def: 0, spd: 20, luk: 0 } }]));
  }, { userId });
  await page.goto("/");
  const tap = page.getByRole("button", { name: "TAP TO START" });
  await expect(tap).toBeVisible();
  await tap.click();
  const continuation = page.getByRole("button", { name: /続きから|チュートリアルを続ける/ });
  await expect(continuation).toBeVisible();
  await continuation.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("AUTO_FORMATION");
  await expect(page.locator(".char-tab-container")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_patrols") || "[]").length)).toBe(0);
  await expect(page.getByRole("button", { name: "バトル開始" })).toHaveCount(0);
});

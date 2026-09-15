import { expect, test, type Page } from "@playwright/test";
import { AsyncTransitionProbe } from "./support/async-transition-probe";

const USER_ID = "00000000-0000-4000-8000-000000009983";
const DELAYS = [0, 500, 1500, 3000] as const;

test.setTimeout(120_000);
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ userId }) => {
    const now = new Date().toISOString();
    const cycleDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const mission = {
      id: "MIS_D_002", title: "派遣に出よう", description: "派遣に出よう", category: "DAILY",
      display_group: "PROGRESS", trigger_type: "QUEST_COMPLETE_COUNT", target_value: 1,
      reward_item_id: "CHAR_EXP_S", reward_quantity: 1, cash_reward: 0,
      display_order: 20, is_enabled: true, preopen: true,
    };
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "Async QA", level: 10, cash: 50000, vitality: 100, current_base_id: "shinjuku", favorite_character_id: "char_reiji_01" }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: userId, auth_method: "EMAIL" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: "async-character", user_id: userId, character_id: "char_reiji_01", level: 10, awakening_level: 1, created_at: now }]));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify([{ user_id: userId, slot: 1, user_character_id: "async-character" }]));
    localStorage.setItem("mock_db_user_items", "[]");
    localStorage.setItem("mock_db_missions", JSON.stringify([mission]));
    localStorage.setItem("mock_db_user_missions", JSON.stringify([{ id: "async-user-mission", user_id: userId, mission_id: mission.id, cycle_date: cycleDate, current_progress: 1, status: "CLEAR", claimed_at: null, missions: mission }]));
    localStorage.setItem("mock_db_presents", JSON.stringify([{ id: "async-present", user_id: userId, item_id: "EQUIP_EXP_M", quantity: 2, message: "非同期プレゼント", status: "UNCLAIMED", created_at: now, sent_at: now, expire_at: new Date(Date.now() + 86400000).toISOString() }]));
  }, { userId: USER_ID });
});

async function enterGame(page: Page) {
  await page.goto("/");
  const tapToStart = page.getByRole("button", { name: "TAP TO START" });
  await expect(tapToStart).toBeVisible();
  await tapToStart.click();
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await loginBonus.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await loginBonus.isVisible()) {
    await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  }
}

for (const delay of DELAYS) {
  test(`Mission ${delay}ms preserves pending paint through result paint`, async ({ page }, testInfo) => {
    await enterGame(page);
    await page.locator(".mypage-sub-icons-left .sub-icon-unit").filter({ hasText: "ミッション" }).click();
    await page.evaluate((value) => localStorage.setItem("mock_rpc_delay_ms:claim_mission_reward", String(value)), delay);

    const probe = new AsyncTransitionProbe(page, "mission", delay);
    const operation = page.locator(".mission-operation-surface");
    const claim = page.getByRole("button", { name: "受け取る", exact: true });
    await probe.tap(claim, { double: true });
    await probe.pendingPaint(page.locator('.mission-operation-surface[aria-busy="true"]'));
    await probe.mark("lock_active", { observedBy: 'fieldset[aria-busy="true"]', owner: "mission" });
    await expect(page.locator(".outlaw-interaction-blocker")).toHaveCount(0);
    await probe.serverCompletion(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_missions") || "[]")[0]?.status === "CLAIMED"));
    const receipt = page.getByRole("dialog", { name: "報酬獲得" });
    await probe.destinationPaint(receipt);
    await probe.unlock(operation);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_presents") || "[]").filter((row: { message?: string }) => row.message === "ミッション報酬").length)).toBe(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_items") || "[]").find((row: { item_id?: string; quantity?: number }) => row.item_id === "CHAR_EXP_S")?.quantity)).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_mission_reward_delivery_ledger") || "[]").filter((row: { delivery_status?: string }) => row.delivery_status === "DELIVERED").length)).toBe(1);
    probe.assertContract();
    await probe.attach(testInfo);
  });

  test(`Present ${delay}ms owns its surface until the receipt is dismissed`, async ({ page }, testInfo) => {
    await enterGame(page);
    await page.getByRole("button", { name: /MENU/ }).click();
    await page.getByRole("dialog", { name: "ホームメニュー" }).getByRole("button", { name: /プレゼント/ }).click();
    await page.evaluate((value) => localStorage.setItem("mock_rpc_delay_ms:claim_all_presents", String(value)), delay);

    const probe = new AsyncTransitionProbe(page, "present", delay);
    const claim = page.getByRole("button", { name: "一括受け取り", exact: true });
    const pending = page.locator(".inbox-panel-pending");
    await probe.tap(claim, { double: true });
    await probe.pendingPaint(pending);
    await probe.mark("lock_active", { observedBy: ".inbox-panel-pending", owner: "present" });
    await expect(page.locator(".outlaw-interaction-blocker")).toHaveCount(0);
    await probe.serverCompletion(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_presents") || "[]")[0]?.status === "CLAIMED"));
    const receipt = page.getByRole("dialog", { name: "報酬獲得" });
    await probe.destinationPaint(receipt);
    await expect(pending).toBeVisible();
    await receipt.locator(".canonical-dialog-actions").getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(pending).toHaveCount(0);
    await probe.mark("unlock", { observedBy: ".inbox-panel-pending removed" });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_presents") || "[]").filter((row: { id?: string; status?: string }) => row.id === "async-present" && row.status === "CLAIMED").length)).toBe(1);
    probe.assertContract();
    await probe.attach(testInfo);
  });
}

test("Global Navigation paints its destination synchronously without acquiring a mutation lock", async ({ page }, testInfo) => {
  await enterGame(page);
  const probe = new AsyncTransitionProbe(page, "global-navigation", 0);
  const gacha = page.getByRole("button", { name: "ガチャ", exact: true });
  await probe.mark("tap", { operation: "navigateTab" });
  await gacha.click();
  await probe.pendingPaint(page.locator(".gacha-view-root"));
  await probe.mark("lock_active", { owner: "none", synchronousNavigation: true });
  await probe.mark("server_completion", { serverWork: "none" });
  await probe.destinationPaint(page.locator(".gacha-view-root"));
  await probe.mark("unlock", { owner: "none" });
  await expect(page.locator(".outlaw-interaction-blocker")).toHaveCount(0);
  probe.assertContract();
  await probe.attach(testInfo);
});

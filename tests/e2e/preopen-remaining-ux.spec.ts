import { expect, test, type Page } from "@playwright/test";

const USER_ID = "00000000-0000-4000-8000-000000000829";
const OTHER_ID = "00000000-0000-4000-8000-000000000830";

test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ userId, otherId }) => {
    const now = new Date().toISOString();
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("mock_db_users", JSON.stringify([
      { id: userId, username: "Sweep検証", level: 10, xp: 0, cash: 50000, vitality: 100, current_base_id: "shinjuku", favorite_character_id: "char_reiji_01", bio: "プレオープン検証" },
      { id: otherId, username: "掲示板ユーザー", level: 8, current_base_id: "shibuya", favorite_character_id: "char_mio_01" },
    ]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: userId, auth_method: "GOOGLE" }]));
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: userId, provider: "google" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([
      { id: "10000000-0000-4000-8000-000000000829", user_id: userId, character_id: "char_reiji_01", level: 10, awakening_level: 1, awakening_progress: 0, created_at: now },
      { id: "10000000-0000-4000-8000-000000000830", user_id: otherId, character_id: "char_mio_01", level: 8, awakening_level: 0, awakening_progress: 0, created_at: now },
    ]));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify([{ user_id: userId, slot: 1, user_character_id: "10000000-0000-4000-8000-000000000829" }]));
    localStorage.setItem("mock_db_user_skills", JSON.stringify([{ id: "skill-sweep", user_id: userId, skill_card_id: "SKILL_001", equipped_character_id: "10000000-0000-4000-8000-000000000829", slot_index: 0, plus_val: 0 }]));
    localStorage.setItem("mock_db_skill_battle_master", JSON.stringify([{ skill_id: "SKILL_001", display_name: "ストリートパンチ", enabled: true, kind: "ATTACK", target: "ENEMY_SINGLE", cooldown: 2 }]));
    localStorage.setItem("mock_db_user_equipments", JSON.stringify([{ id: "equipment-sweep", user_id: userId, equipment_id: "WEAPON_001", equipped_character_id: "10000000-0000-4000-8000-000000000829", slot_index: 0, level: 1, plus_val: 0, created_at: now }]));
    localStorage.setItem("mock_db_user_items", JSON.stringify([{ id: "item-sweep", user_id: userId, item_id: "CHAR_EXP_S", quantity: 3 }]));
    localStorage.setItem("mock_db_quests", JSON.stringify([{
      id: "QUEST_SHINJUKU_EASY", name: "歌舞伎町一番街", town_id: "shinjuku", level_type: "EASY", duration_seconds: 300, cost_vitality: 3,
      cash_reward: 300, exp_reward: 100, recommended_level: 1, recommended_power: 1000, enemy_member_count: 1,
      enemy_members: [{ characterId: "char_takeshi_01", skillLoadout: ["SKILL_001"] }], enemy_attributes: ["EVIL"], enemy_tactic: "BALANCED",
      reward_items: [{ item_id: "CHAR_EXP_S", quantity: 1, probability_bp: 10000 }], first_clear_items: [], first_clear_user_exp: 100,
    }]));
    localStorage.setItem("mock_db_user_patrols", "[]");
    localStorage.setItem("mock_db_bbs_threads", JSON.stringify([{ id: "bbs-sweep", category: "RECRUIT", title: "仲間募集", content: "一緒に遊びましょう", user_id: otherId, author_name: "旧表示名", created_at: now, updated_at: now }]));
    localStorage.setItem("mock_db_bbs_posts", "[]");
    const cycleDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const mission = { id: "MIS_D_003", title: "キャラクターを強化しよう", description: "キャラクターを1回強化", category: "DAILY", trigger_type: "CHARACTER_LEVEL_UP", target_value: 1, reward_item_id: "CHAR_EXP_M", reward_quantity: 1, condition_params: { cta_tab: "character", cta_label: "キャラへ" }, display_order: 30, is_enabled: true, is_provisional: false };
    localStorage.setItem("mock_db_missions", JSON.stringify([mission]));
    localStorage.setItem("mock_db_user_missions", JSON.stringify([{ id: "mission-sweep", user_id: userId, mission_id: mission.id, cycle_date: cycleDate, current_progress: 1, status: "CLEAR", claimed_at: null, missions: mission }]));
    localStorage.setItem("mock_db_presents", JSON.stringify([{ id: "present-sweep", user_id: userId, item_id: "EQUIP_EXP_M", quantity: 2, message: "Sweep検証プレゼント", status: "UNCLAIMED", created_at: now }]));
  }, { userId: USER_ID, otherId: OTHER_ID });
});

async function enterGame(page: Page) {
  await page.goto("/");
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueButton = page.getByRole("button", { name: "続きから" });
  await expect(titleAction.or(continueButton)).toBeVisible();
  if (await titleAction.isVisible()) await titleAction.click();
  await expect(continueButton).toBeVisible();
  await continueButton.click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await expect(loginBonus).toBeVisible();
  await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
}

async function openUtility(page: Page, label: "設定" | "プレゼント") {
  await page.getByRole("button", { name: /^MENU(?:\s|$)/ }).click();
  const menu = page.getByRole("dialog", { name: "ホームメニュー" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: label, exact: true }).click();
}

async function expectNoOverflow(page: Page, selector: string) {
  const result = await page.locator(selector).first().evaluate((node) => {
    const root = node.getBoundingClientRect();
    const offenders = Array.from(node.querySelectorAll<HTMLElement>("*")).flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > root.right + 1 || rect.left < root.left - 1
        ? [{ className: element.className, left: rect.left, right: rect.right }]
        : [];
    }).slice(0, 8);
    return { clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, offenders };
  });
  expect(result.scrollWidth, JSON.stringify(result.offenders)).toBeLessThanOrEqual(result.clientWidth + 1);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`Home routes and editable Settings remain mobile-safe at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enterGame(page);

    const community = page.locator(".footer-mobile").getByRole("button", { name: "コミュニティ", exact: true });
    const ranking = page.locator(".mypage-sub-icons-left").getByRole("button", { name: /ランキング/ });
    await expect(community).toBeVisible();
    await expect(ranking).toBeVisible();
    await ranking.click();
    await expect(page.locator(".ranking-tab-view")).toBeVisible();

    await page.getByRole("button", { name: /マイページ/ }).click();
    await page.getByRole("button", { name: "拠点移動" }).click();
    const moveDialog = page.getByRole("dialog", { name: "拠点移動" });
    const baseButtons = moveDialog.locator(".move-base-btn");
    await expect(baseButtons).toHaveCount(7);
    const yokohama = baseButtons.filter({ hasText: "横浜" });
    await yokohama.scrollIntoViewIfNeeded();
    await expect(yokohama).toBeVisible();
    const overflowY = await moveDialog.locator(".move-base-body").evaluate((node) => getComputedStyle(node).overflowY);
    expect(overflowY).toBe("auto");
    await expect(moveDialog.getByText("ジャンクバザール")).toHaveCount(0);
    await moveDialog.getByRole("button", { name: "閉じる" }).click();

    await openUtility(page, "設定");
    await expect(page.getByText("設定 / プロフィール", { exact: true })).toBeVisible();
    await expect(page.locator(".settings-panel-container-inner select")).toHaveCount(0);
    await page.locator(".editable-setting-section").first().getByRole("button", { name: "編集" }).click();
    await expect(page.getByLabel("プレイヤー名")).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "称号" })).toHaveCount(0);
    await page.getByLabel("自己紹介").fill(`保存確認${viewport.width}`);
    await page.locator(".editable-setting-section").first().getByRole("button", { name: "保存", exact: true }).click();
    const saved = page.getByRole("dialog", { name: "保存完了" });
    await expect(saved).toContainText("設定を保存しました");
    await saved.getByRole("button", { name: "OK" }).click();
    await expect(page.locator(".editable-setting-section").first()).toContainText(`保存確認${viewport.width}`);
    await expectNoOverflow(page, ".settings-panel-container-inner");
  });
}

test("Quest, Character and BBS consume canonical presentation contracts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterGame(page);

  await page.locator(".circle-menu-btn.conquest").click();
  const easyCourse = page.locator(".quest-v2-courses").getByRole("button", { name: /初級/ });
  await expect(easyCourse).toBeVisible();
  await easyCourse.click();
  await expect(page.locator(".quest-v2-brief")).toContainText("歌舞伎町一番街");
  await expect(page.locator(".quest-v2-brief")).toContainText("出現する敵");
  await expect(page.locator(".quest-v2-brief")).toContainText("所要時間");
  await expect(page.locator(".quest-v0-summary")).toHaveCount(0);
  await page.locator(".quest-v2-character-grid").getByRole("button", { name: /レイジ Lv\.10/ }).click();
  const dispatch = page.getByRole("button", { name: "新宿へ派遣する" });
  await expect(dispatch).toBeEnabled();
  await expect(page.locator(".patrol-container")).not.toContainText("CHAR_EXP_S");
  await expect(page.locator(".patrol-container")).toContainText("強化ドリンク・小");
  await expectNoOverflow(page, ".patrol-container");

  await page.getByRole("button", { name: "キャラ", exact: true }).click();
  await expect(page.locator(".character-v2-character-grid .character-v2-card")).toHaveCount(1);
  await page.locator(".character-v2-character-grid .character-v2-card").click();
  await expect(page.locator(".character-v2-stage-meta")).toContainText("レイジ");
  await expect(page.locator(".character-v2-status-block")).toContainText("総合力");
  await expect(page.locator(".character-v2-primary-actions").getByRole("button", { name: "強化" })).toBeVisible();
  await expect(page.locator(".character-v2-primary-actions").getByRole("button", { name: "スキル・装備" })).toBeVisible();
  await page.locator(".character-v2-primary-actions").getByRole("button", { name: "強化" }).click();
  await expect(page.locator(".character-v2-growth")).toContainText("Current");
  await expect(page.locator(".character-v2-growth")).toContainText("After");
  await expect(page.locator(".character-v2-growth")).not.toContainText("CHAR_EXP_S");
  await expectNoOverflow(page, ".character-v2-shell");

  await page.getByRole("button", { name: /マイページ/ }).click();
  await page.locator(".footer-mobile").getByRole("button", { name: "コミュニティ", exact: true }).click();
  await page.getByRole("button", { name: "BBSを開く" }).click();
  const thread = page.locator(".bbs-thread-card").filter({ hasText: "仲間募集" });
  await expect(thread).toBeVisible();
  await expect(thread.locator(".user-identity-row")).toContainText("掲示板ユーザー");
  await expect(thread.locator(".character-presentation-character")).toHaveAttribute("src", /mio_transparent_asset/);
  await expectNoOverflow(page, ".bbs-view-container");
});

test("Mission and Present mutations retain canonical item receipts", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await enterGame(page);

  await page.locator(".mypage-sub-icons-left .sub-icon-unit").filter({ hasText: "ミッション" }).click();
  await expect(page.locator(".sub-tab-badge")).toContainText("1");
  const missionHeight = await page.locator(".mission-item").first().evaluate((node) => node.getBoundingClientRect().height);
  expect(missionHeight).toBeLessThan(150);
  await page.evaluate(() => localStorage.setItem("mock_rpc_delay_ms:claim_mission_reward", "500"));
  await page.getByRole("button", { name: "受け取る", exact: true }).click();
  await expect(page.locator(".mission-operation-surface")).toHaveAttribute("disabled", "");
  await expect(page.locator(".mission-operation-surface")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".fullscreen-close-btn")).toBeDisabled();
  const missionReceipt = page.getByRole("dialog", { name: "報酬獲得" });
  await expect(missionReceipt).toContainText("強化ドリンク・中");
  await expect(missionReceipt).not.toContainText("CHAR_EXP_M");
  await missionReceipt.getByRole("button", { name: "OK" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow(page, ".mission-panel-container-inner");
  await page.getByRole("button", { name: "閉じる" }).click();

  await openUtility(page, "プレゼント");
  const present = page.locator(".inbox-present-item").filter({ hasText: "Sweep検証プレゼント" });
  await expect(present).toContainText("カスタムオイル・中");
  await expect(present).not.toContainText("EQUIP_EXP_M");
  await expect(present.locator(".inbox-present-reward-icon")).toBeVisible();
  expect(await present.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(110);
  await present.getByRole("button", { name: "受け取る", exact: true }).click();
  const presentReceipt = page.getByRole("dialog", { name: "報酬獲得" });
  await expect(presentReceipt).toContainText("カスタムオイル・中");
  await expectNoOverflow(page, ".canonical-dialog");
});

test("Present bulk claim locks its surface through the canonical receipt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterGame(page);
  await openUtility(page, "プレゼント");
  const reward = page.locator(".inbox-present-reward").first();
  await expect(reward.locator(".inbox-present-reward-icon")).toBeVisible();
  await expect(reward).toContainText("× 2");
  await expect(reward).not.toContainText("EQUIP_EXP_M");
  await page.evaluate(() => localStorage.setItem("mock_rpc_delay_ms:claim_all_presents", "800"));
  const bulkClaim = page.getByRole("button", { name: "一括受け取り", exact: true });
  await bulkClaim.click();
  const pendingPanel = page.locator(".inbox-panel-pending");
  await expect(pendingPanel).toBeVisible();
  // OutlawButton swaps its accessible label while loading, so the original
  // exact-name locator correctly disappears after the tap.
  await expect(page.getByRole("button", { name: "一括受取中…", exact: true })).toBeDisabled();

  // Exercise real pointer hit-testing while the RPC is pending. The pending
  // surface must own both tab and close coordinates instead of passing the
  // taps through to the panel or the Home screen behind it.
  for (const target of [
    page.getByRole("button", { name: "お知らせ", exact: true }),
    page.getByRole("button", { name: "閉じる", exact: true }).last(),
  ]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest(".inbox-panel-pending")), point)).toBe(true);
    await page.mouse.click(point.x, point.y);
    await expect(pendingPanel).toBeVisible();
    await expect(reward).toBeVisible();
  }
  const receipt = page.getByRole("dialog", { name: "報酬獲得" });
  await expect(receipt).toBeVisible();
  await expect(pendingPanel).toHaveCount(1);
  await expect(receipt).toContainText("カスタムオイル・中");
  await expect(receipt.locator(".reward-receipt-mark")).toBeVisible();
  await receipt.locator(".canonical-dialog-actions").getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(pendingPanel).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("mock_rpc_delay_ms:claim_all_presents"));
});

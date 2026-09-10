import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

test.beforeEach(async ({ page }, testInfo) => {
  const raidActive = !testInfo.title.includes("inactive Raid");
  await page.addInitScript(({ raidActive }) => {
    const me = "00000000-0000-4000-8000-000000000901";
    const guildId = "30000000-0000-4000-8000-000000000901";
    const now = new Date().toISOString();
    localStorage.setItem("tribe_demo_uuid", me);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_users", JSON.stringify([
      { id: me, username: "Activation", level: 5, cash: 10000, pvp_points: 4, current_base_id: "shinjuku", last_active_at: now },
    ]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: me, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: me, auth_method: "EMAIL" }]));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{ user_id: me, current_day: 1, total_logins: 1, last_claimed_date: today }]));
    localStorage.setItem("mock_db_user_funnel_milestones", JSON.stringify([
      { user_id: me, milestone: "tutorial_complete", occurrence_count: 1 },
      { user_id: me, milestone: "first_free_skill_ten_pull", occurrence_count: 1 },
      { user_id: me, milestone: "first_free_equipment_ten_pull", occurrence_count: 1 },
      { user_id: me, milestone: "first_main_loadout", occurrence_count: 1 },
      { user_id: me, milestone: "post_tutorial_quest", occurrence_count: 1 },
      { user_id: me, milestone: "first_pvp", occurrence_count: 1 },
    ]));
    localStorage.setItem("mock_db_guilds", JSON.stringify([
      { id: guildId, name: "NEON WOLVES", leader_id: "00000000-0000-4000-8000-000000000902", level: 6,
        xp: 1200, member_count: 1, member_limit: 10, approval_required: false, description: "毎日活動中", main_alignment: "CHAOS" },
    ]));
    localStorage.setItem("mock_db_guild_members", JSON.stringify([
      { id: "member-1", guild_id: guildId, user_id: "00000000-0000-4000-8000-000000000902", role: "MASTER" },
    ]));
    localStorage.setItem("mock_db_raid_bosses", JSON.stringify(raidActive ? [
      { id: "20000000-0000-4000-8000-000000000901", boss_master_id: "BOSS_001", boss_name: "雷神連合総長", level: 99,
        current_hp: 7500000, max_hp: 10000000, base_id: "shinjuku", status: "ACTIVE", expires_at: new Date(Date.now() + 86400000).toISOString() },
    ] : []));
  }, { raidActive });
});

async function enterGame(page: import("@playwright/test").Page) {
  await page.goto("/");
  const tapToStart = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  const header = page.locator(".header-mobile");
  await expect(tapToStart.or(continueAction).or(header)).toBeVisible();
  if (await tapToStart.isVisible()) await tapToStart.click();
  if (await continueAction.isVisible()) await continueAction.click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const loginBonusClose = page.locator(".login-bonus-modal-overlay").getByRole("button", { name: "閉じる" });
  if (await loginBonusClose.isVisible()) await loginBonusClose.click();
}

test("First PvP milestone resumes through Raid without requiring Ranking or Guild", async ({ page }) => {
  await enterGame(page);
  await expect(page.locator(".mypage-primary-cta")).toContainText("強敵に挑戦");
  await page.locator(".mypage-primary-cta").click();
  await expect(page.locator(".raid-view")).toBeVisible();

  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await expect(page.locator(".guild-lobby-view")).toBeVisible();
  await page.locator(".guild-detail-trigger").first().click();
  await expect(page.locator(".guild-public-status-grid")).toContainText("直近7日アクティブ");
  await expect(page.locator(".guild-public-status-grid")).toContainText("総合力");
  const detailKeys = await page.evaluate(() => {
    const events = JSON.parse(localStorage.getItem("mock_db_client_funnel_events") || "[]");
    return events.filter((entry: any) => entry.event_name === "guild_detail_view").length;
  });
  expect(detailKeys).toBe(1);
});

test("Ranking never advertises an inactive Raid and continues to a valid social action", async ({ page }) => {
  await enterGame(page);
  await page.locator(".sub-icon-unit").filter({ hasText: "ランキング" }).click();
  await expect(page.locator(".ranking-tab-view")).toBeVisible();
  await expect(page.getByRole("button", { name: "次はレイドへ挑戦" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "おすすめTRIBEを見る" })).toBeVisible();
});

test("Guild recommendations are visible before Lv3 while server join remains locked", async ({ page }) => {
  await page.addInitScript(() => {
    const users = JSON.parse(localStorage.getItem("mock_db_users") || "[]");
    users[0].level = 1;
    localStorage.setItem("mock_db_users", JSON.stringify(users));
  });
  await enterGame(page);
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await expect(page.locator(".guild-detail-trigger").first()).toBeVisible();
  await page.locator(".guild-detail-trigger").first().click();
  await expect(page.getByRole("button", { name: "このギルドに加入する", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "このギルドに加入する", exact: true }).click();
  await expect(page.getByText(/レベル3/)).toBeVisible();
});

test("Guild Home omits closed GvG combat projection on mobile", async ({ page }) => {
  await page.addInitScript(() => {
    const me = localStorage.getItem("tribe_demo_uuid");
    const guildId = "30000000-0000-4000-8000-000000000901";
    const members = JSON.parse(localStorage.getItem("mock_db_guild_members") || "[]");
    members.push({ id: "member-me", guild_id: guildId, user_id: me, role: "MEMBER" });
    localStorage.setItem("mock_db_guild_members", JSON.stringify(members));
    const users = JSON.parse(localStorage.getItem("mock_db_users") || "[]");
    users[0].guild_id = guildId;
    localStorage.setItem("mock_db_users", JSON.stringify(users));
    const milestones = JSON.parse(localStorage.getItem("mock_db_user_funnel_milestones") || "[]");
    milestones.push({ user_id: me, milestone: "guild_activation", occurrence_count: 1 });
    localStorage.setItem("mock_db_user_funnel_milestones", JSON.stringify(milestones));
  });
  await enterGame(page);
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await expect(page.locator(".guild-gvg-coming-soon")).toHaveCount(0);
  await expect(page.getByText(/HP \+20%|ATK \+20%|GvGの攻撃力/)).toHaveCount(0);
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const frame = await page.locator(".guild-main-container").evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth + 1);
  }
});

test("Pre-open operations hides closed surfaces and rejects closed deep links", async ({ page }) => {
  await page.goto("/?tab=friend");
  const tapToStart = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  const header = page.locator(".header-mobile");
  await expect(tapToStart.or(continueAction).or(header)).toBeVisible();
  if (await tapToStart.isVisible()) await tapToStart.click();
  if (await continueAction.isVisible()) await continueAction.click();
  await expect(header).toBeVisible();
  await expect(page.getByText(/フレンド一覧|フレンドを探/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ショップは準備中です" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "ギルドバトルは準備中です" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /フレンド/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ギルド", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "クエスト", exact: true })).toBeVisible();

  await page.goto("/?tab=shop");
  const restart = page.getByRole("button", { name: "TAP TO START" });
  const resume = page.getByRole("button", { name: "続きから" });
  await expect(restart.or(resume)).toBeVisible();
  if (await restart.isVisible()) await restart.click();
  if (await resume.isVisible()) await resume.click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  await expect(page.getByText(/通常ショップ|月額パス/)).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>new URL(location.href).searchParams.get("tab"))).toBe("home");
});

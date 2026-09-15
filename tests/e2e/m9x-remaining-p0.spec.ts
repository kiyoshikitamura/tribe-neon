import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const me = "00000000-0000-4000-8000-000000009930";
const master = "00000000-0000-4000-8000-000000009931";
const guildId = "30000000-0000-4000-8000-000000009930";

async function assertMobileWave(page: Page, selector: string, wave: string) {
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.locator(selector).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, viewport: innerWidth };
    });
    expect(metrics.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    await page.screenshot({ path: test.info().outputPath(`${wave}-${width}.png`) });
  }
}

async function seedAuthenticatedPlayer(page: Page, asMaster = false) {
  await page.addInitScript(({ me, master, guildId, asMaster }) => {
    if (sessionStorage.getItem("m9x_remaining_seeded") === "1") return;
    sessionStorage.setItem("m9x_remaining_seeded", "1");
    const now = new Date().toISOString();
    localStorage.setItem("tribe_demo_uuid", me);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    const todayJst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{ user_id: me, current_day: 1, total_logins: 1, last_claimed_date: todayJst }]));
    localStorage.setItem("mock_db_users", JSON.stringify([
      { id: me, username: asMaster ? "Welcome Master" : "Journey Player", level: 8, cash: 10000, pvp_points: 5, rank_points: 1200, total_power: 20000, current_base_id: "shinjuku", last_active_at: now, guild_id: asMaster ? guildId : null },
      { id: master, username: "Human Master", level: 20, cash: 10000, total_power: 10000, current_base_id: "shinjuku", last_active_at: now, guild_id: guildId },
    ]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: me, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: me, auth_method: "EMAIL" }]));
    localStorage.setItem("mock_db_user_funnel_milestones", JSON.stringify([{ user_id: me, milestone: "tutorial_complete", occurrence_count: 1 }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([
      { id: `starter_${me}`, user_id: me, character_id: "char_reiji_01", level: 10, awakening_level: 0 },
      { id: `second_${me}`, user_id: me, character_id: "char_chang_01", level: 8, awakening_level: 0 },
    ]));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify([
      { user_id: me, slot: 1, user_character_id: `starter_${me}` },
      { user_id: me, slot: 2, user_character_id: `second_${me}` },
    ]));
    localStorage.setItem("mock_db_guilds", JSON.stringify([{ id: guildId, name: "HUMAN NEON", leader_id: master, level: 6, xp: 1200, member_count: asMaster ? 1 : 1, member_limit: 10, approval_required: false, description: "毎晩活動中", welcome_message: "来てくれてありがとう。まずは挨拶しよう。" }]));
    localStorage.setItem("mock_db_guild_members", JSON.stringify([{ id: "master-member", guild_id: guildId, user_id: asMaster ? me : master, role: "MASTER", joined_at: now }]));
    if (asMaster) sessionStorage.setItem(`tribe-neon:guild-welcome-shown:${me}:${guildId}`, "1");
    localStorage.setItem("mock_db_board_posts", "[]");
    localStorage.setItem("mock_db_pvp_defense_logs", "[]");
    localStorage.setItem("mock_db_pvp_match_rewards_master", JSON.stringify([
      { result: "VICTORY", cash_reward: 0, diamond_reward: 0, exp_reward: 0 },
      { result: "DEFEAT", cash_reward: 0, diamond_reward: 0, exp_reward: 0 },
    ]));
    localStorage.setItem("mock_db_presents", "[]");
  }, { me, master, guildId, asMaster });
}

async function enterHome(page: Page) {
  await page.goto("/");
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  const header = page.locator(".header-mobile");
  await expect(titleAction.or(continueAction).or(header)).toBeVisible();
  if (await titleAction.isVisible()) await titleAction.click();
  if (await continueAction.isVisible()) await continueAction.click();
  await expect(header).toBeVisible();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await loginBonus.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await loginBonus.isVisible()) await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
}

test("PvP uses the main formation, offers a weaker first opponent, and has no defense-deck UI", async ({ page }) => {
  await seedAuthenticatedPlayer(page);
  await enterHome(page);
  await page.getByRole("button", { name: "バトル", exact: true }).click();
  await expect(page.getByRole("button", { name: "防衛・履歴" })).toHaveCount(0);
  await expect(page.getByText(/防衛デッキ|防衛設定/)).toHaveCount(0);
  await expect(page.locator('.pvp-opponent-card')).toHaveCount(1);
  await expect(page.locator('.pvp-opponent-card')).toContainText("格下");
  await page.getByText("公式戦・模擬戦のルール").click();
  await expect(page.locator("p").filter({ hasText: "勝敗報酬なし" })).toHaveCount(2);
  await assertMobileWave(page, ".pvp-view", "pvp-no-defense-first-match");
});

test("Guild master edits the welcome message through the existing secure contract", async ({ page }) => {
  await seedAuthenticatedPlayer(page, true);
  await enterHome(page);
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await expect(page.locator(".guild-welcome-compact")).toContainText("来てくれてありがとう");
  await page.getByRole("button", { name: "ギルド設定" }).click();
  const welcome = page.locator(".editable-setting-section").filter({ hasText: "歓迎メッセージ" });
  await welcome.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("新メンバーへの歓迎メッセージ").fill("ようこそ。挨拶のあと、みんなでレイドへ行こう！");
  await welcome.getByRole("button", { name: "保存" }).click();
  await expect(welcome).toContainText("みんなでレイドへ行こう");
  await assertMobileWave(page, ".guild-secondary-view", "guild-welcome-editor");
  await page.getByRole("button", { name: "ギルドマイページへ戻る" }).click();
  await page.reload();
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  await expect(titleAction.or(continueAction).or(page.locator(".header-mobile"))).toBeVisible();
  if (await titleAction.isVisible()) await titleAction.click();
  if (await continueAction.isVisible()) await continueAction.click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await expect(page.locator(".guild-welcome-compact")).toContainText("みんなでレイドへ行こう");
});

test("Title to Guild human response journey remains visible across every mobile wave", async ({ page }) => {
  await page.goto("/");
  await assertMobileWave(page, ".title-view-overlay", "journey-title");
  await seedAuthenticatedPlayer(page);
  await page.reload();
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  await expect(titleAction.or(continueAction).or(page.locator(".header-mobile"))).toBeVisible();
  if (await titleAction.isVisible()) await titleAction.click();
  if (await continueAction.isVisible()) await continueAction.click();
  await assertMobileWave(page, ".mypage-view", "journey-home");
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await assertMobileWave(page, ".guild-lobby-view", "journey-guild-discovery");
  await page.locator(".guild-detail-trigger").first().click();
  await expect(page.locator(".guild-public-status-grid")).toBeVisible();
  await page.getByRole("button", { name: "このギルドに加入する" }).click();
  await page.getByRole("button", { name: "ギルドチャットを見る" }).click();
  await expect(page.getByPlaceholder("ギルドへ送信...")).toBeVisible();
  await page.getByPlaceholder("ギルドへ送信...").fill("はじめまして！よろしくお願いします！");
  await page.getByRole("button", { name: "送信" }).click();
  await expect(page.locator(".tribe-msg-bubble")).toContainText("はじめまして");
  await page.evaluate(({ master, guildId }) => {
    const posts = JSON.parse(localStorage.getItem("mock_db_board_posts") || "[]");
    posts.push({ id: "human-response", user_id: master, author_id: master, author_name: "Human Master", content: "参加ありがとう！次のレイドで待ってるよ。", target_type: "GUILD", target_id: guildId, is_system: false, created_at: new Date(Date.now() + 1000).toISOString() });
    localStorage.setItem("mock_db_board_posts", JSON.stringify(posts));
  }, { master, guildId });
  await page.reload();
  const reloadedTitleAction = page.getByRole("button", { name: "TAP TO START" });
  const reloadedContinueAction = page.getByRole("button", { name: "続きから" });
  await expect(reloadedTitleAction.or(reloadedContinueAction).or(page.locator(".header-mobile"))).toBeVisible();
  if (await reloadedTitleAction.isVisible()) await reloadedTitleAction.click();
  if (await reloadedContinueAction.isVisible()) await reloadedContinueAction.click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const community = page.getByRole("button", { name: "コミュニティ", exact: true });
  await expect(community.locator(".footer-unread-badge")).toHaveAttribute("aria-label", "コミュニティ未読1件");
  await community.click();
  const guildChannel = page.getByRole("button", { name: "ギルド (1)", exact: true });
  await expect(guildChannel).toBeVisible();
  await guildChannel.click();
  await expect(page.locator(".tribe-chat-panel").getByRole("button", { name: "ギルド", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".tribe-msg-bubble").filter({ hasText: "次のレイドで待ってるよ" })).toBeVisible();
  await assertMobileWave(page, ".tribe-modal-container-inner", "journey-human-response");
});

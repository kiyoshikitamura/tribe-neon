import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

const me = "00000000-0000-4000-8000-000000004001";
const openLeader = "00000000-0000-4000-8000-000000004011";
const approvalLeader = "00000000-0000-4000-8000-000000004012";
const openSubmaster = "00000000-0000-4000-8000-000000004013";
const openMember = "00000000-0000-4000-8000-000000004014";
const openGuild = "30000000-0000-4000-8000-000000004001";
const approvalGuild = "30000000-0000-4000-8000-000000004002";

async function seedGuildVisitor(page: Page, level = 5, initialGuildRole: string | null = null, cash = 10000, lastGuildLeftAt: string | null = null) {
  await page.addInitScript(({ me, openLeader, approvalLeader, openSubmaster, openMember, openGuild, approvalGuild, level, initialGuildRole, cash, lastGuildLeftAt }) => {
    if (sessionStorage.getItem("phase4_guild_seeded") === "1") return;
    sessionStorage.setItem("phase4_guild_seeded", "1");
    const now = new Date().toISOString();
    localStorage.setItem("tribe_demo_uuid", me);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_users", JSON.stringify([
      { id: me, username: "Guild Visitor", level, cash, current_base_id: "shinjuku", last_active_at: now, last_guild_left_at: lastGuildLeftAt, favorite_character_id: "char_reiji_01", guild_id: initialGuildRole ? openGuild : null },
      { id: openLeader, username: "Open Leader", level: 20, cash: 10000, current_base_id: "shinjuku", last_active_at: now, favorite_character_id: "char_kengo_01", guild_id: openGuild },
      { id: approvalLeader, username: "Approval Leader", level: 18, cash: 10000, current_base_id: "shinjuku", last_active_at: now, favorite_character_id: "char_chang_01", guild_id: approvalGuild },
      { id: openSubmaster, username: "Neon Submaster", level: 16, cash: 10000, current_base_id: "shinjuku", last_active_at: now, favorite_character_id: "char_haruka_01", guild_id: openGuild },
      { id: openMember, username: "Long Guild Member Name", level: 12, cash: 10000, current_base_id: "shinjuku", last_active_at: now, favorite_character_id: "char_shun_01", guild_id: openGuild },
    ]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: me, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: me, auth_method: "EMAIL" }]));
    const cycleDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{
      user_id: me, current_day: 1, total_logins: 1, last_claimed_date: cycleDate,
    }]));
    localStorage.setItem("mock_db_guilds", JSON.stringify([
      { id: openGuild, name: "OPEN NEON", leader_id: openLeader, level: 6, xp: 1200, member_limit: 10, recruitment_mode: "OPEN_JOIN", approval_required: false, description: "毎晩レイドへ挑戦しています。", main_alignment: "CHAOS", sub_alignment: "JUSTICE" },
      { id: approvalGuild, name: "承認制ギルド", leader_id: approvalLeader, level: 5, xp: 900, member_limit: 10, recruitment_mode: "APPLICATION_REQUIRED", approval_required: true, description: "落ち着いて活動するギルドです。", main_alignment: "ORDER", sub_alignment: "EVIL" },
      { id: "30000000-0000-4000-8000-000000004003", name: "FULL EDGE", leader_id: approvalLeader, level: 4, xp: 600, member_limit: 1, recruitment_mode: "OPEN_JOIN", approval_required: false, description: "満員です。", main_alignment: "ORDER", sub_alignment: "JUSTICE" },
      { id: "30000000-0000-4000-8000-000000004004", name: "NIGHT LINK", leader_id: openLeader, level: 3, xp: 350, member_limit: 10, recruitment_mode: "OPEN_JOIN", approval_required: false, description: "初心者歓迎です。", main_alignment: "JUSTICE", sub_alignment: "CHAOS" },
    ]));
    localStorage.setItem("mock_db_guild_members", JSON.stringify([
      { id: "open-master", guild_id: openGuild, user_id: openLeader, role: "MASTER", joined_at: now },
      { id: "open-submaster", guild_id: openGuild, user_id: openSubmaster, role: "SUB_MASTER", joined_at: now },
      { id: "open-member", guild_id: openGuild, user_id: openMember, role: "MEMBER", joined_at: now },
      ...(initialGuildRole ? [{ id: "current-member", guild_id: openGuild, user_id: me, role: initialGuildRole, joined_at: now }] : []),
      { id: "approval-master", guild_id: approvalGuild, user_id: approvalLeader, role: "MASTER", joined_at: now },
      { id: "full-master", guild_id: "30000000-0000-4000-8000-000000004003", user_id: approvalLeader, role: "MASTER", joined_at: now },
    ]));
    localStorage.setItem("mock_db_guild_join_requests", "[]");
    localStorage.setItem("mock_db_board_posts", "[]");
  }, { me, openLeader, approvalLeader, openSubmaster, openMember, openGuild, approvalGuild, level, initialGuildRole, cash, lastGuildLeftAt });
}

async function enterGuild(page: Page) {
  await page.goto("/");
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  const header = page.locator(".header-mobile");
  const welcomeDialog = page.locator(".canonical-dialog").filter({ hasText: "ギルドへようこそ" });
  await expect(titleAction.or(continueAction).or(header)).toBeVisible();
  if (await welcomeDialog.isVisible()) await welcomeDialog.getByRole("button", { name: "閉じる", exact: true }).last().click();
  if (await titleAction.isVisible()) await titleAction.click();
  if (await continueAction.isVisible()) await continueAction.click();
  await expect(header).toBeVisible();
  if (await welcomeDialog.isVisible()) await welcomeDialog.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
}

async function resumeAfterReload(page: Page) {
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  const header = page.locator(".header-mobile");
  const welcomeDialog = page.locator(".canonical-dialog").filter({ hasText: "ギルドへようこそ" });
  await expect(titleAction.or(continueAction).or(header)).toBeVisible();
  if (await welcomeDialog.isVisible()) await welcomeDialog.getByRole("button", { name: "閉じる", exact: true }).last().click();
  if (await titleAction.isVisible()) await titleAction.click();
  if (await continueAction.isVisible()) await continueAction.click();
  await expect(header).toBeVisible();
  if (await welcomeDialog.isVisible()) await welcomeDialog.getByRole("button", { name: "閉じる", exact: true }).last().click();
}

async function expectNoOverflow(page: Page, selector: string) {
  const geometry = await page.locator(selector).evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

test("unaffiliated discovery uses compact Japanese-first Guild presentation", async ({ page }) => {
  await seedGuildVisitor(page);
  await enterGuild(page);
  await expect(page.locator(".guild-lobby-section-heading").first()).toBeVisible();
  await expect(page.locator(".guild-lobby-hero")).toHaveCount(0);
  await expect(page.getByText("現在ギルドに所属していません")).toHaveCount(0);
  await expect(page.locator(".guild-lobby-unlock")).toHaveCount(0);
  await expect(page.locator(".guild-lobby-progress")).toHaveCount(0);
  await expect(page.getByText("参加しやすいギルド")).toHaveCount(0);
  const sectionHeadings = await page.locator(".guild-lobby-section-heading > span").allTextContents();
  expect(sectionHeadings).toEqual(["おすすめギルド", "ギルドを検索"]);
  await expect(page.locator(".guild-lobby-guild-card")).toHaveCount(3);
  const creation = await page.locator(".guild-lobby-create").evaluate((element) => {
    const details = element as HTMLDetailsElement;
    return { open: details.open, ready: details.classList.contains("is-ready") };
  });
  expect(creation).toEqual({ open: false, ready: true });
  const searchGeometry = await page.locator(".guild-search-form").evaluate((node) => {
    const input = node.querySelector("input")!;
    const button = node.querySelector("button")!;
    return { inputWidth: input.getBoundingClientRect().width, buttonWidth: button.getBoundingClientRect().width, fontSize: parseFloat(getComputedStyle(input).fontSize) };
  });
  expect(searchGeometry.inputWidth).toBeGreaterThan(searchGeometry.buttonWidth * 2);
  expect(searchGeometry.fontSize).toBeGreaterThanOrEqual(16);
  await expect(page.locator(".guild-activity-line").first()).toContainText("直近7日アクティブ");
  await expect(page.locator(".guild-activity-line").first()).toContainText("レイド貢献");
  await expect(page.locator(".guild-activity-line").first()).toContainText("総合力");
  await expect(page.locator(".guild-attribute-line").first()).toContainText("メイン属性");
  await expect(page.locator(".guild-attribute-line").first()).not.toContainText("NEUTRAL");
  await page.locator(".guild-detail-trigger").first().click();
  await expect(page.locator(".canonical-dialog")).toBeVisible();
  await expect(page.locator(".guild-public-status-grid")).toContainText("参加方法");
  await expect(page.locator(".guild-public-status-grid")).toContainText("空き枠");
  await expect(page.locator(".guild-public-detail")).toContainText("メイン属性: 混沌");
  await expect(page.locator(".guild-public-detail")).toContainText("サブ属性: 正義");
  await expect(page.locator(".guild-public-master")).toContainText("ギルドマスター");
  await expect(page.locator(".guild-public-member-row")).toHaveCount(3);
  await expect(page.locator(".guild-public-member-row").nth(0)).toContainText("ギルドマスター");
  await expect(page.locator(".guild-public-member-row").nth(1)).toContainText("副団長");
  await expect(page.locator(".guild-public-member-row").nth(2)).toContainText("メンバー");
  await expect(page.getByRole("button", { name: "Open Leaderのプロフィールを開く" }).first()).toBeVisible();
  for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    await expectNoOverflow(page, ".canonical-dialog");
  }
  await page.getByRole("button", { name: "Neon Submasterのプロフィールを開く" }).click();
  await expect(page.locator(".canonical-dialog")).toContainText("Neon Submaster");
});

test("direct join refreshes membership and opens persistent Guild Chat without reload", async ({ page }) => {
  await seedGuildVisitor(page);
  await enterGuild(page);
  await page.locator(".guild-detail-trigger").filter({ hasText: "OPEN NEON" }).click();
  await page.getByRole("button", { name: "このギルドに加入する" }).click();
  await expect(page.locator(".canonical-dialog")).toContainText("ギルドへようこそ");
  await expect(page.locator(".canonical-dialog").getByRole("button", { name: "レイドへ" })).toHaveCount(0);
  await expect(page.getByText("OPEN NEON", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "ギルドチャットを見る" }).click();
  const guildChatInput = page.getByPlaceholder("ギルドへ送信...");
  await expect(guildChatInput).toBeVisible();
  await expect(page.getByRole("dialog", { name: "ギルドへようこそ" })).toHaveCount(0);
  // Give the asynchronous membership/milestone effect enough time to settle.
  // A late response must not place a second welcome dialog over the composer.
  await page.waitForTimeout(300);
  await expect(page.getByRole("dialog", { name: "ギルドへようこそ" })).toHaveCount(0);
  await guildChatInput.fill("参加しました。よろしくお願いします！");
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await expect(page.locator(".tribe-msg-bubble")).toContainText("参加しました");
  await expect(page.locator(".tribe-msg-identity .character-presentation")).toBeVisible();
  const membership = await page.evaluate(({ me, openGuild }) => {
    const rows = JSON.parse(localStorage.getItem("mock_db_guild_members") || "[]");
    return rows.filter((row: any) => row.user_id === me && row.guild_id === openGuild);
  }, { me, openGuild });
  expect(membership).toHaveLength(1);
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.locator(".guild-main-container")).toBeVisible();
  await expect(page.locator(".guild-lobby-create")).toHaveCount(0);
  await expect(page.locator(".guild-visual-identity")).toContainText("OPEN NEON");
  await expect(page.locator(".guild-visual-identity")).toContainText("メンバー");
  await expect(page.locator(".guild-status-strip")).toContainText("直近7日アクティブ");
  await expect(page.locator(".guild-action-grid")).toContainText("準備中");
  await expect(page.locator(".guild-action-grid")).toContainText("COMING SOON");
  await expect(page.getByRole("button", { name: "ギルド設定" })).toHaveCount(0);
  await page.locator(".guild-action-grid button").filter({ hasText: /^メンバー/ }).click();
  await expect(page.locator(".guild-member-row")).toHaveCount(4);
  await expect(page.locator(".guild-member-row").nth(0)).toContainText("ギルドマスター");
  await expect(page.locator(".guild-member-row").nth(1)).toContainText("副団長");
  await expect(page.getByRole("button", { name: "Open Leaderのプロフィールを開く" })).toBeVisible();
  await page.getByRole("button", { name: "ギルドマイページへ戻る" }).click();
  await page.reload();
  await resumeAfterReload(page);
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await expect(page.locator(".guild-main-container")).toBeVisible();
  await expect(page.locator(".guild-visual-identity")).toBeVisible();
  await page.getByRole("button", { name: /ギルドチャット/ }).click();
  await expect(page.locator(".tribe-msg-bubble")).toContainText("参加しました");
  for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    await expectNoOverflow(page, ".tribe-modal-container-inner");
  }
});

test("24-hour leave cooldown uses the same canonical dialog for join and application but never blocks creation", async ({ page }) => {
  await seedGuildVisitor(page, 5, null, 10000, new Date().toISOString());
  await enterGuild(page);
  await expect.poll(() => page.evaluate(({ me }) => JSON.parse(localStorage.getItem("mock_db_users") || "[]").find((user: any) => user.id === me)?.last_guild_left_at || null, { me })).not.toBeNull();

  await page.locator(".guild-detail-trigger").filter({ hasText: "OPEN NEON" }).click();
  await page.getByRole("button", { name: "このギルドに加入する" }).click();
  const cooldownDialog = page.locator(".canonical-dialog");
  await expect(cooldownDialog).toContainText("ギルドに加入できません");
  await expect(cooldownDialog).toContainText("ギルド脱退後24時間は、別のギルドに加入できません。");
  await expect(cooldownDialog.getByRole("button", { name: "OK" })).toHaveCount(1);
  await expect(cooldownDialog.getByRole("button", { name: "キャンセル" })).toHaveCount(0);
  await cooldownDialog.getByRole("button", { name: "OK" }).click();

  await page.getByPlaceholder("ギルド名で検索").fill("承認制ギルド");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.locator(".guild-search-results .guild-detail-trigger").click();
  await page.getByRole("button", { name: "加入申請する" }).click();
  await page.getByRole("button", { name: "申請する" }).click();
  await expect(cooldownDialog).toContainText("ギルドに加入できません");
  await expect(cooldownDialog).toContainText("ギルド脱退後24時間は、別のギルドに加入できません。");
  for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    await expectNoOverflow(page, ".canonical-dialog");
  }
  await cooldownDialog.getByRole("button", { name: "OK" }).click();
  const deniedState = await page.evaluate(({ me }) => ({
    memberships: JSON.parse(localStorage.getItem("mock_db_guild_members") || "[]").filter((row: any) => row.user_id === me).length,
    requests: JSON.parse(localStorage.getItem("mock_db_guild_join_requests") || "[]").filter((row: any) => row.user_id === me).length,
  }), { me });
  expect(deniedState).toEqual({ memberships: 0, requests: 0 });

  await page.locator(".guild-lobby-create summary").click();
  await page.getByPlaceholder("ギルド名を入力 (12文字)").fill("COOL NEON");
  await page.getByRole("button", { name: "創設する" }).click();
  await page.getByRole("button", { name: "設立する" }).click();
  await expect(cooldownDialog).toContainText("「COOL NEON」を設立しました。");
});

test("member leave uses a destructive canonical dialog and returns to unaffiliated state", async ({ page }) => {
  await seedGuildVisitor(page);
  await enterGuild(page);
  await page.locator(".guild-detail-trigger").filter({ hasText: "OPEN NEON" }).click();
  await page.getByRole("button", { name: "このギルドに加入する" }).click();
  await page.locator(".canonical-dialog").getByRole("button", { name: "閉じる", exact: true }).last().click();
  await page.getByRole("button", { name: "ギルドを脱退" }).click();
  await expect(page.locator(".canonical-dialog")).toContainText("ギルドを脱退");
  await expect(page.locator(".canonical-dialog")).toContainText("「OPEN NEON」を脱退しますか？");
  await expect(page.locator(".canonical-dialog").getByRole("button", { name: "脱退する" })).toHaveClass(/danger/);
  await page.locator(".canonical-dialog").getByRole("button", { name: "脱退する" }).click();
  await expect(page.locator(".canonical-dialog")).toContainText("ギルドから正常に脱退しました。");
  await expect(page.locator(".canonical-dialog").getByRole("button", { name: "キャンセル" })).toHaveCount(0);
  await page.locator(".canonical-dialog").getByRole("button", { name: "OK" }).click();
  await expect(page.getByText("おすすめギルド")).toBeVisible();
  await expect(page.locator(".guild-visual-identity")).toHaveCount(0);
});

test("Lv5 user creates a Guild, becomes master, and persists saved attributes", async ({ page }) => {
  await seedGuildVisitor(page, 5);
  await enterGuild(page);
  await page.locator(".guild-lobby-create summary").click();
  await page.getByPlaceholder("ギルド名を入力 (12文字)").fill("FINAL NEON");
  await page.getByRole("button", { name: "創設する" }).click();
  const confirmation = page.locator(".canonical-dialog");
  await expect(confirmation).toContainText("「FINAL NEON」を設立しますか？");
  await expect(confirmation).toContainText("500キャッシュ");
  await expect(confirmation.getByRole("button", { name: "キャンセル" })).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "設立する" })).not.toHaveClass(/danger/);
  await page.evaluate(() => localStorage.setItem("mock_guild_mutation_delay_ms", "250"));
  await confirmation.getByRole("button", { name: "設立する" }).click();
  await expect(confirmation.getByRole("button", { name: "作成中…" })).toBeDisabled();
  await expect(confirmation).toContainText("「FINAL NEON」を設立しますか？");
  await expect(confirmation).toContainText("「FINAL NEON」を設立しました。");
  await page.evaluate(() => localStorage.removeItem("mock_guild_mutation_delay_ms"));
  const creationState = await page.evaluate(() => {
    const guilds = JSON.parse(localStorage.getItem("mock_db_guilds") || "[]").filter((guild: any) => guild.name === "FINAL NEON");
    const user = JSON.parse(localStorage.getItem("mock_db_users") || "[]")[0];
    const membership = JSON.parse(localStorage.getItem("mock_db_guild_members") || "[]").find((row: any) => row.user_id === user.id && row.guild_id === guilds[0]?.id);
    return { guildCount: guilds.length, cash: user.cash, role: membership?.role };
  });
  expect(creationState).toEqual({ guildCount: 1, cash: 9500, role: "MASTER" });
  await expect(confirmation.getByRole("button", { name: "キャンセル" })).toHaveCount(0);
  await confirmation.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".guild-visual-identity")).toContainText("FINAL NEON");
  await expect(page.locator(".guild-visual-identity")).toContainText("ギルドマスター");
  await page.locator(".guild-action-grid button").filter({ hasText: /^メンバー/ }).click();
  await expect(page.locator(".guild-member-row")).toHaveCount(1);
  await expect(page.locator(".guild-member-row")).toContainText("ギルドマスター");
  await page.getByRole("button", { name: "ギルドマイページへ戻る" }).click();
  await page.getByRole("button", { name: "ギルド設定" }).click();
  await expect(page.locator(".guild-settings-sections textarea")).toHaveCount(0);
  await expect(page.locator(".guild-settings-sections select")).toHaveCount(0);
  await page.locator(".editable-setting-section").filter({ hasText: "ギルド属性" }).getByRole("button", { name: "編集" }).click();
  await page.getByRole("radio", { name: "悪", exact: true }).first().click();
  await page.getByRole("radio", { name: "混沌", exact: true }).last().click();
  await page.evaluate(() => localStorage.setItem("mock_guild_mutation_delay_ms", "250"));
  await page.getByRole("button", { name: "属性を保存" }).click();
  await expect(page.getByRole("button", { name: "保存中…" })).toBeDisabled();
  await expect(confirmation).toContainText("ギルド属性を保存しました。");
  await page.evaluate(() => localStorage.removeItem("mock_guild_mutation_delay_ms"));
  await confirmation.getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: "ギルドマイページへ戻る" }).click();
  await expect(page.locator(".guild-identity-attributes")).toContainText("メイン属性 悪");
  await expect(page.locator(".guild-identity-attributes")).toContainText("サブ属性 混沌");
  await page.reload();
  await resumeAfterReload(page);
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await expect(page.locator(".guild-identity-attributes")).toContainText("メイン属性 悪");
  await expect(page.locator(".guild-identity-attributes")).toContainText("サブ属性 混沌");
});

test("Guild creation entry is first and Lv4 or insufficient CASH remains gated", async ({ page }) => {
  await seedGuildVisitor(page, 4);
  await enterGuild(page);
  const creation = page.locator(".guild-lobby-create");
  const recommendations = page.locator(".guild-lobby-section").filter({ hasText: "おすすめギルド" }).first();
  await expect(creation).toContainText("Lv.5 / 500キャッシュ");
  expect(await creation.evaluate((node) => node.nextElementSibling?.textContent?.includes("おすすめギルド"))).toBe(true);
  await creation.locator("summary").click();
  await expect(page.getByPlaceholder("ギルド名を入力 (12文字)")).toBeDisabled();
  await expect(creation.getByRole("button", { name: "Lv.5で解放" })).toBeDisabled();
  await expect(recommendations).toBeVisible();

  await page.evaluate(() => {
    const users = JSON.parse(localStorage.getItem("mock_db_users") || "[]");
    users[0].level = 5;
    users[0].cash = 499;
    localStorage.setItem("mock_db_users", JSON.stringify(users));
  });
  await page.reload();
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  const continueAction = page.getByRole("button", { name: "続きから" });
  await expect(titleAction.or(continueAction)).toBeVisible();
  if (await titleAction.isVisible()) await titleAction.click();
  await expect(continueAction).toBeVisible();
  await continueAction.click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await page.locator(".guild-lobby-create summary").click();
  await expect(page.locator(".guild-lobby-create").getByRole("button", { name: "資金不足" })).toBeDisabled();
});

test("Guild My Page geometry is compact at 390 and 412", async ({ page }) => {
  await seedGuildVisitor(page);
  await enterGuild(page);
  await page.locator(".guild-detail-trigger").filter({ hasText: "OPEN NEON" }).click();
  await page.getByRole("button", { name: "このギルドに加入する" }).click();
  await page.locator(".canonical-dialog").getByRole("button", { name: "閉じる", exact: true }).last().click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    await expectNoOverflow(page, ".guild-main-container");
    const geometry = await page.locator(".guild-my-page-scroll").evaluate((node) => ({ height: node.scrollHeight, viewport: window.innerHeight }));
    expect(geometry.height).toBeLessThanOrEqual(geometry.viewport * 1.3);
    await expect(page.locator(".guild-action-grid")).toBeVisible();
  }
});

test("Guild settings share read, edit, pending, save, and cancel semantics", async ({ page }) => {
  await seedGuildVisitor(page, 8, "MASTER");
  await enterGuild(page);
  await page.getByRole("button", { name: "ギルド設定" }).click();

  const welcome = page.locator(".editable-setting-section").filter({ hasText: "歓迎メッセージ" });
  const publicSettings = page.locator(".editable-setting-section").filter({ hasText: "加入・公開設定" });
  const attributes = page.locator(".editable-setting-section").filter({ hasText: "ギルド属性" });
  await expect(welcome.getByRole("button", { name: "編集" })).toBeVisible();
  await expect(publicSettings.getByRole("button", { name: "編集" })).toBeVisible();
  await expect(attributes.getByRole("button", { name: "編集" })).toBeVisible();
  await expect(page.locator(".guild-settings-sections textarea")).toHaveCount(0);
  await expect(page.locator(".guild-settings-sections select")).toHaveCount(0);

  await welcome.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("新メンバーへの歓迎メッセージ").fill("ようこそ、OPEN NEONへ！");
  await page.evaluate(() => localStorage.setItem("mock_guild_mutation_delay_ms", "250"));
  await welcome.getByRole("button", { name: "保存" }).click();
  await expect(welcome.getByRole("button", { name: "保存中…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "ギルドマイページへ戻る" })).toBeDisabled();
  await expect(welcome).toContainText("保存しました。");
  await page.evaluate(() => localStorage.removeItem("mock_guild_mutation_delay_ms"));
  await expect(welcome.getByLabel("新メンバーへの歓迎メッセージ")).toHaveCount(0);

  await publicSettings.getByRole("button", { name: "編集" }).click();
  await expect(publicSettings.locator("select")).toHaveCount(0);
  await expect(publicSettings.getByRole("radio", { name: "即時加入" })).toBeChecked();
  await publicSettings.getByRole("radio", { name: "加入申請・承認制" }).click();
  await page.evaluate(() => localStorage.setItem("mock_guild_mutation_delay_ms", "250"));
  await publicSettings.getByRole("button", { name: "設定を保存" }).click();
  await expect(publicSettings.getByRole("button", { name: "保存中…" })).toBeDisabled();
  const success = page.locator(".canonical-dialog");
  await expect(success).toContainText("ギルド設定を更新しました。");
  await page.evaluate(() => localStorage.removeItem("mock_guild_mutation_delay_ms"));
  await success.getByRole("button", { name: "OK" }).click();
  await expect(publicSettings).toContainText("加入申請・承認制");

  await publicSettings.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("ギルド紹介").fill("失敗後も残す入力値");
  await page.evaluate(({ me, openGuild }) => {
    const memberships = JSON.parse(localStorage.getItem("mock_db_guild_members") || "[]");
    localStorage.setItem("mock_db_guild_members", JSON.stringify(memberships.map((row: any) => row.user_id === me && row.guild_id === openGuild ? { ...row, role: "MEMBER" } : row)));
  }, { me, openGuild });
  await publicSettings.getByRole("button", { name: "設定を保存" }).click();
  await expect(page.locator(".canonical-dialog")).toContainText("ギルド設定の更新に失敗しました。");
  await page.locator(".canonical-dialog").getByRole("button", { name: "閉じる" }).last().click();
  await expect(page.getByLabel("ギルド紹介")).toHaveValue("失敗後も残す入力値");
  await publicSettings.getByRole("button", { name: "キャンセル" }).click();

  for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    await welcome.getByRole("button", { name: "編集" }).click();
    await expectNoOverflow(page, ".guild-secondary-view");
    await welcome.getByRole("button", { name: "キャンセル" }).click();
    await publicSettings.getByRole("button", { name: "編集" }).click();
    await expect(publicSettings.locator("select")).toHaveCount(0);
    await expectNoOverflow(page, ".guild-secondary-view");
    await publicSettings.getByRole("button", { name: "キャンセル" }).click();
    await attributes.getByRole("button", { name: "編集" }).click();
    await expect(attributes.getByRole("radio", { name: "混沌" })).toHaveCount(2);
    await expectNoOverflow(page, ".guild-secondary-view");
    await attributes.getByRole("button", { name: "キャンセル" }).click();
    await expect(attributes.getByRole("radio")).toHaveCount(0);
  }
});

test("role navigation exposes settings to submasters and master leave remains safe", async ({ page }) => {
  await seedGuildVisitor(page, 8, "SUB_MASTER");
  await enterGuild(page);
  await expect(page.locator(".guild-visual-identity")).toContainText("副団長");
  await page.getByRole("button", { name: "ギルド設定" }).click();
  await expect(page.getByText("GvGでのみ有効")).toBeVisible();
  await page.locator(".editable-setting-section").filter({ hasText: "ギルド属性" }).getByRole("button", { name: "編集" }).click();
  await expect(page.getByRole("radio", { name: "正義", exact: true }).first()).toBeEnabled();

  await page.evaluate(({ me, openGuild }) => {
    const rows = JSON.parse(localStorage.getItem("mock_db_guild_members") || "[]");
    localStorage.setItem("mock_db_guild_members", JSON.stringify(rows.map((row: any) => row.user_id === me && row.guild_id === openGuild ? { ...row, role: "MASTER" } : row)));
  }, { me, openGuild });
  await page.reload();
  await resumeAfterReload(page);
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await page.getByRole("button", { name: "ギルドを脱退" }).click();
  await expect(page.getByText("脱退する前に、マスター権限を譲渡してください。")).toBeVisible();
  await expect(page.locator(".guild-lobby-view")).toHaveCount(0);
});

test("privileged member mutation owns the management cluster through projection paint", async ({ page }) => {
  await seedGuildVisitor(page, 8, "MASTER");
  await enterGuild(page);
  await page.locator(".guild-action-grid button").filter({ hasText: /^メンバー/ }).click();
  await page.evaluate(() => localStorage.setItem("mock_rpc_delay_ms:set_guild_member_role", "500"));
  const targetRow = page.locator(".guild-member-row").filter({ hasText: "Long Guild Member Name" });
  await targetRow.getByRole("button", { name: "昇格", exact: true }).click();
  await expect(page.locator(".guild-member-management button").first()).toBeDisabled();
  await expect(page.locator(".guild-member-management button").last()).toBeDisabled();
  await expect(page.locator(".canonical-dialog")).toContainText("役職を副団長へ変更しました");
  await expect(page.locator(".guild-member-management button").first()).toBeEnabled();
  const savedRole = await page.evaluate(({ openMember }) => JSON.parse(localStorage.getItem("mock_db_guild_members") || "[]").find((row: any) => row.user_id === openMember)?.role, { openMember });
  expect(savedRole).toBe("SUB_MASTER");
  await page.setViewportSize({ width: 412, height: 915 });
  await expectNoOverflow(page, ".guild-secondary-view");
});

test("master can review a pending join request from the member view", async ({ page }) => {
  await seedGuildVisitor(page, 8, "MASTER");
  await page.addInitScript(({ openGuild }) => {
    const applicantId = "00000000-0000-4000-8000-000000004099";
    const users = JSON.parse(localStorage.getItem("mock_db_users") || "[]");
    users.push({ id: applicantId, username: "Join Applicant", level: 9, cash: 10000, guild_id: null, favorite_character_id: "char_shun_01" });
    localStorage.setItem("mock_db_users", JSON.stringify(users));
    localStorage.setItem("mock_db_guild_join_requests", JSON.stringify([{ id: "pending-final", guild_id: openGuild, user_id: applicantId, status: "PENDING", requested_at: new Date().toISOString() }]));
  }, { openGuild });
  await enterGuild(page);
  await page.locator(".guild-action-grid button").filter({ hasText: /^メンバー/ }).click();
  await expect(page.getByText("加入申請", { exact: true })).toBeVisible();
  await expect(page.getByText("Join Applicant")).toBeVisible();
  await page.getByRole("button", { name: "承認", exact: true }).click();
  await expect(page.locator(".canonical-dialog")).toContainText("加入申請を承認しました。");
  await expect(page.locator(".canonical-dialog").getByRole("button", { name: "キャンセル" })).toHaveCount(0);
  await page.locator(".canonical-dialog").getByRole("button", { name: "OK" }).click();
  await expect(page.getByText("Join Applicant")).toBeVisible();
  const approved = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_guild_join_requests") || "[]")[0]?.status);
  expect(approved).toBe("APPROVED");
});

test("approval request becomes pending and survives reload", async ({ page }) => {
  await seedGuildVisitor(page);
  await enterGuild(page);
  await page.getByPlaceholder("ギルド名で検索").fill("承認制ギルド");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.locator(".guild-search-results .guild-lobby-guild-card")).toHaveCount(1);
  await page.locator(".guild-search-results .guild-detail-trigger").click();
  await page.getByRole("button", { name: "加入申請する" }).click();
  await expect(page.locator(".canonical-dialog")).toContainText("「承認制ギルド」へ加入申請を送りますか？");
  await page.getByRole("button", { name: "申請する" }).click();
  await expect(page.locator(".canonical-dialog")).toContainText("「承認制ギルド」へ加入申請を送りました。");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("button", { name: "申請中（取消）" }).first()).toBeVisible();
  await page.reload();
  await resumeAfterReload(page);
  await page.getByRole("button", { name: "ギルド", exact: true }).click();
  await expect(page.getByRole("button", { name: "申請中（取消）" }).first()).toBeVisible();
});

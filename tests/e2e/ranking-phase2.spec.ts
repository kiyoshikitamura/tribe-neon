import { expect, test, type Page } from "@playwright/test";

const ME = "00000000-0000-4000-8000-000000000701";
const USERS = [ME, "00000000-0000-4000-8000-000000000702", "00000000-0000-4000-8000-000000000703", "00000000-0000-4000-8000-000000000704", "00000000-0000-4000-8000-000000000705"];
const CHARACTER_IDS = ["char_ageha_01", "char_reiji_01", "char_kengo_01", "char_koharu_01", "char_mio_01"];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ me, users, characterIds }) => {
    const now = new Date().toISOString();
    const guilds = [
      { id: "guild-1", name: "NEON WOLVES" },
      { id: "guild-2", name: "夜街連合" },
      { id: "guild-3", name: "CYAN EDGE" },
    ];
    localStorage.setItem("tribe_demo_uuid", me);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: me, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: me, auth_method: "EMAIL" }]));
    localStorage.setItem("mock_db_users", JSON.stringify(users.map((id: string, index: number) => ({
      id,
      username: index === 0 ? "RankingTester" : index === 1 ? "非常に長いプレイヤーネームがランキングを壊さない" : `Player${index + 1}`,
      favorite_character_id: characterIds[index % characterIds.length],
      level: 10,
      current_base_id: "shinjuku",
      last_active_at: now,
    }))));
    localStorage.setItem("mock_db_guilds", JSON.stringify(guilds));
    localStorage.setItem("mock_db_guild_members", JSON.stringify([
      { user_id: users[1], guild_id: guilds[0].id, role: "MASTER" },
      { user_id: users[2], guild_id: guilds[1].id, role: "MASTER" },
      { user_id: users[3], guild_id: guilds[2].id, role: "MASTER" },
    ]));
    const owned: any[] = [];
    const formations: any[] = [];
    users.forEach((userId: string, userIndex: number) => {
      const count = [5, 1, 3, 0, 5][userIndex];
      for (let slot = 0; slot < count; slot += 1) {
        const ownedId = `owned-${userIndex}-${slot}`;
        owned.push({ id: ownedId, user_id: userId, character_id: characterIds[slot], level: 10 });
        formations.push({ user_id: userId, slot: slot + 1, user_character_id: ownedId });
      }
    });
    localStorage.setItem("mock_db_user_characters", JSON.stringify(owned));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify(formations));
    localStorage.setItem("mock_db_user_power_rankings", JSON.stringify([
      { user_id: users[1], total_power: 99100, rank_position: location.search.includes("unranked=1") ? null : location.search.includes("top3=1") ? 1 : 7, updated_at: now },
      { user_id: users[2], total_power: 88200, rank_position: location.search.includes("top3=1") ? 2 : 8, updated_at: now },
      { user_id: users[3], total_power: 77300, rank_position: location.search.includes("top3=1") ? 3 : 9, updated_at: now },
      { user_id: users[4], total_power: 66400, rank_position: 10, updated_at: now },
      { user_id: users[0], total_power: 55300, rank_position: 11, updated_at: now },
    ]));
    localStorage.setItem("mock_db_pvp_ranks", JSON.stringify(users.map((userId: string, index: number) => ({ user_id: userId, rank_points: 1500 - index * 100, daily_wins: 5 - index, updated_at: now }))));
    localStorage.setItem("mock_db_raid_damage_logs", JSON.stringify([
      ...users.flatMap((userId: string, index: number) => [{ user_id: userId, guild_id: index < 2 ? "guild-1" : index === 2 ? "guild-2" : "guild-3", raw_damage: 50000 - index * 5000, created_at: now, raid_boss_instance_id: "raid-1" }]),
      { user_id: me, guild_id: "guild-1", raw_damage: 9999999, created_at: "2026-08-01T00:00:00.000Z", raid_boss_instance_id: "raid-old" },
    ]));
    localStorage.setItem("mock_db_raid_bosses", JSON.stringify([{ id: "raid-1", status: "ACTIVE", expires_at: new Date(Date.now() + 86400000).toISOString() }]));
    localStorage.setItem("mock_db_user_funnel_milestones", JSON.stringify([{ user_id: me, milestone: "ranking_viewed" }]));
  }, { me: ME, users: USERS, characterIds: CHARACTER_IDS });
});

async function openRanking(page: Page, path = "/") {
  await page.goto(path);
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await page.getByRole("button", { name: "続きから" }).click();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await loginBonus.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await loginBonus.isVisible()) {
    await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  }
  const rankingEntry = page.locator(".mypage-sub-icons-left .sub-icon-unit").filter({ hasText: "ランキング" });
  await expect(rankingEntry).toBeVisible();
  await rankingEntry.click();
  await expect(page.locator(".ranking-tab-view")).toBeVisible();
  await expect(page.locator(".ranking-skeleton")).toHaveCount(0);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`Ranking mobile hierarchy and server authority ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openRanking(page);
    await expect(page.locator(".ranking-category-nav .sub-tab-item")).toHaveText(["総合力", "バトル", "ギルド"]);
    await expect(page.locator(".ranking-category-nav").getByRole("button", { name: "レイド", exact: true })).toHaveCount(0);
    await expect(page.locator(".ranking-position").first()).toHaveText("7位");
    await expect(page.locator(".ranking-position").first()).not.toHaveText("1位");
    await expect(page.locator(".ranking-user-row")).toHaveCount(5);
    await expect(page.locator(".ranking-user-row").nth(0).locator(".ranking-deck .character-presentation")).toHaveCount(1);
    await expect(page.locator(".ranking-user-row").nth(1).locator(".ranking-deck .character-presentation")).toHaveCount(3);
    await expect(page.locator(".ranking-user-row").nth(2).locator(".ranking-deck")).toHaveCount(0);
    await expect(page.locator(".ranking-user-row .character-presentation-meta")).toHaveCount(0);
    const geometry = await page.locator(".ranking-tab-view").evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    const thirdTop = await page.locator(".ranking-user-row").nth(2).evaluate((node) => node.getBoundingClientRect().top);
    expect(thirdTop).toBeLessThan(viewport.height);
    const longNameRow = page.locator(".ranking-user-row").first();
    expect(await longNameRow.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });
}

test("Ranking categories isolate metrics and profiles preserve identity context", async ({ page }) => {
  await openRanking(page);
  await page.locator(".ranking-user-row").first().locator(".user-identity-row").click();
  await expect(page.getByRole("dialog", { name: /非常に長いプレイヤーネーム/ })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("NEON WOLVES");
  await expect(page.getByRole("dialog").locator(".public-profile-deck h3")).toHaveText("DECK");
  await expect(page.getByRole("dialog")).not.toContainText("MY DECK");
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.locator(".ranking-category-nav .sub-tab-item.active")).toHaveText("総合力");

  await page.getByRole("button", { name: "バトル", exact: true }).click();
  await expect(page.locator(".ranking-skeleton")).toHaveCount(0);
  await expect(page.locator(".ranking-metric small").first()).toHaveText("RATE");
  await expect(page.locator(".ranking-metric small").first()).not.toHaveText("総合力");

  await page.locator(".ranking-category-nav").getByRole("button", { name: "ギルド", exact: true }).click();
  await expect(page.locator(".ranking-skeleton")).toHaveCount(0);
  await expect(page.locator(".ranking-guild-row")).toHaveCount(3);

  await expect(page.locator(".ranking-category-nav").getByRole("button", { name: "レイド", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "総合力", exact: true }).click();
  await expect(page.locator(".ranking-skeleton")).toHaveCount(0);
  // Preserve long-number layout coverage on the remaining power metric.
  const metric = page.locator(".ranking-user-row .ranking-metric").first();
  const metricRow = page.locator(".ranking-user-row").first();
  for (const value of ["7,630", "24,033", "9,999,999", "123,456,789", "9,999,999,999"]) {
    await metric.evaluate((node, nextValue) => { if (node.firstChild) node.firstChild.textContent = nextValue; }, value);
    expect(await metricRow.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
  await page.locator(".ranking-current .user-identity-row").click();
  const selfProfile = page.getByRole("dialog", { name: "RankingTesterの公開プロフィール" });
  await expect(selfProfile).toBeVisible();
  await expect(selfProfile.locator(".public-profile-deck h3")).toHaveText("MY DECK");
  await expect(selfProfile.getByRole("button", { name: "DMを送る" })).toHaveCount(0);
});

test("Top three rank stays compact beside identity and PvP Daily keeps canonical current user", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRanking(page, "/?top3=1");
  await expect(page.locator(".ranking-position").nth(0)).toHaveText("1位");
  await expect(page.locator(".ranking-position").nth(1)).toHaveText("2位");
  await expect(page.locator(".ranking-position").nth(2)).toHaveText("3位");
  const rankBox = await page.locator(".ranking-position").first().evaluate((node) => node.getBoundingClientRect().toJSON());
  const leaderBox = await page.locator(".ranking-user-row .user-identity-row .character-presentation").first().evaluate((node) => node.getBoundingClientRect().toJSON());
  expect(rankBox.width).toBeLessThanOrEqual(30);
  expect(rankBox.height).toBeLessThanOrEqual(26);
  expect(rankBox.width).toBeLessThanOrEqual(leaderBox.width);

  await page.getByRole("button", { name: "バトル", exact: true }).click();
  await expect(page.locator(".ranking-skeleton")).toHaveCount(0);
  expect(await page.locator(".ranking-position").first().evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(30);

  await expect(page.locator(".ranking-category-nav").getByRole("button", { name: "レイド", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "デイリー", exact: true }).click();
  await expect(page.locator(".ranking-skeleton")).toHaveCount(0);
  const current = page.locator(".ranking-current");
  await expect(current).toContainText("RankingTester");
  await expect(current).not.toContainText("プレイヤー");
  await expect(current.locator(".character-presentation-missing")).toHaveCount(0);
});

test("RankPresentation uses 圏外 for missing server placement", async ({ page }) => {
  await openRanking(page, "/?unranked=1");
  await expect(page.locator(".ranking-position").first()).toHaveText("圏外");
  await expect(page.locator(".ranking-tab-view")).not.toContainText(/(?:^|\D)0位|undefined位|null位|#0/);
});

test("Remaining ranking rewards use frozen canonical definitions and retired Raid has no category", async ({ page }) => {
  await openRanking(page);
  await page.getByRole("button", { name: "報酬確認" }).click();
  const powerRewards = page.getByRole("dialog", { name: "ランキング報酬確認" });
  await expect(powerRewards).toContainText("このランキングのシーズン報酬はありません");
  const dailyRewardTab = powerRewards.getByRole("button", { name: "デイリー", exact: true });
  await dailyRewardTab.click();
  await expect(dailyRewardTab).toHaveAttribute("aria-pressed", "true");
  await expect(powerRewards).toContainText("強化ドリンク・大");
  await expect(powerRewards).toContainText("カスタムオイル・大");
  await powerRewards.getByRole("button", { name: "閉じる" }).last().click();

  await page.locator(".ranking-category-nav").getByRole("button", { name: "バトル", exact: true }).click();
  await page.getByRole("button", { name: "報酬確認" }).click();
  const pvpRewards = page.getByRole("dialog", { name: "ランキング報酬確認" });
  await expect(pvpRewards).toContainText("日次");
  const seasonRewardTab = pvpRewards.getByRole("button", { name: "シーズン", exact: true });
  await seasonRewardTab.click();
  await expect(seasonRewardTab).toHaveAttribute("aria-pressed", "true");
  await expect(pvpRewards).toContainText("月次");
  await expect(pvpRewards).toContainText("ランダムSPガチャチケット");
  await pvpRewards.getByRole("button", { name: "閉じる" }).last().click();

  await page.locator(".ranking-category-nav").getByRole("button", { name: "ギルド", exact: true }).click();
  await page.getByRole("button", { name: "報酬確認" }).click();
  const guildRewards = page.getByRole("dialog", { name: "ランキング報酬確認" });
  await expect(guildRewards).toContainText("プレオープン参加記念ギルド装飾");
  await expect(guildRewards).toContainText("プレオープン第1位限定ギルド装飾");
  await guildRewards.getByRole("button", { name: "閉じる" }).last().click();

  await expect(page.locator(".ranking-category-nav .sub-tab-item")).toHaveText(["総合力", "バトル", "ギルド"]);
  await expect(page.locator(".ranking-category-nav").getByRole("button", { name: "レイド", exact: true })).toHaveCount(0);
});

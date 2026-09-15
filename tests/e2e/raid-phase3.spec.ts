import { expect, test, type Page } from "@playwright/test";

const ME = "00000000-0000-4000-8000-000000000801";
const RAID_ID = "20000000-0000-4000-8000-000000000801";
const CHARACTER_IDS = ["char_ageha_01", "char_reiji_01", "char_kengo_01", "char_koharu_01", "char_mio_01"];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ me, raidId, characterIds }) => {
    const now = new Date().toISOString();
    const raidTown = new URLSearchParams(location.search).get("raidTown") || "roppongi";
    const raidVariant = raidTown === "kawasaki"
      ? { id: "RAID_KAWASAKI_V1", name: "ブレイクダウン" }
      : raidTown === "yokohama"
        ? { id: "RAID_YOKOHAMA_V1", name: "ブルー・レクイエム" }
        : { id: "RAID_ROPPONGI_V1", name: "ロイヤル・フラッシュ" };
    localStorage.setItem("tribe_demo_uuid", me);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: me, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: me, auth_method: "EMAIL" }]));
    localStorage.setItem("mock_db_users", JSON.stringify([
      { id: me, username: "RaidTester", current_base_id: "shinjuku", favorite_character_id: characterIds[0], level: 10, raid_points: location.search.includes("emptyRp=1") ? 0 : 3, raid_free_entry_consumed: true, cash: 10000, neon_diamonds: 200 },
      ...[1, 2, 3].map((rank) => ({ id: `raid-rival-${rank}`, username: `RaidRival${rank}`, level: 10 })),
    ]));
    const owned = characterIds.map((characterId: string, index: number) => ({ id: `owned-raid-${index}`, user_id: me, character_id: characterId, level: 12 - index, awakening_level: index % 2, created_at: now }));
    localStorage.setItem("mock_db_user_characters", JSON.stringify(owned));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify(owned.map((entry: any, index: number) => ({ user_id: me, slot: index + 1, user_character_id: entry.id }))));
    localStorage.setItem("mock_db_user_power_rankings", JSON.stringify([{ user_id: me, total_power: 61096, rank_position: 4, updated_at: now }]));
    localStorage.setItem("mock_db_user_items", JSON.stringify([{ id: "raid-ticket", user_id: me, item_id: "RAID_POINT_TICKET", quantity: 2 }]));
    localStorage.setItem("mock_db_raid_bosses", JSON.stringify([{ id: raidId, raid_day_key: now.slice(0, 10), boss_master_id: raidVariant.id, boss_name: raidVariant.name, level: 30, current_hp: 25500000, max_hp: 34000000, base_id: raidTown, profile_type: "PARTY", status: "ACTIVE", expires_at: new Date(Date.now() + 20 * 3600_000).toISOString(), skill_loadout: [] }]));
    localStorage.setItem("mock_db_raid_boss_master", JSON.stringify([{ id: raidVariant.id, boss_name: raidVariant.name, level: 30, max_hp: 34000000, atk: 8700, def: 7700, spd: 390, luk: 0, skills: [] }]));
    localStorage.setItem("mock_db_raid_damage_logs", JSON.stringify([
      { user_id: me, raid_boss_instance_id: raidId, raw_damage: 123456, created_at: now },
      ...[1, 2, 3].map((rank) => ({ user_id: `raid-rival-${rank}`, raid_boss_instance_id: raidId, raw_damage: 500000 - rank * 50000, created_at: now })),
    ]));
    localStorage.setItem("mock_db_guilds", JSON.stringify([]));
    localStorage.setItem("mock_db_guild_members", JSON.stringify([]));
  }, { me: ME, raidId: RAID_ID, characterIds: CHARACTER_IDS });
});

async function openRaid(page: Page, path = "/") {
  await page.goto(path);
  const tapToStart = page.getByRole("button", { name: "TAP TO START" });
  await expect(tapToStart).toBeVisible();
  if (await tapToStart.isVisible()) await tapToStart.click();
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await loginBonus.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await loginBonus.isVisible()) {
    await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  }
  await page.locator(".mypage-sub-icons-left .sub-icon-unit").filter({ hasText: "レイド" }).click();
  await expect(page.locator(".raid-view")).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`Raid Top and pre-battle show the canonical five members ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await openRaid(page);
    await expect(page.locator(".raid-context")).toHaveCount(0);
    await expect(page.locator(".raid-view")).not.toContainText("出現中の強敵");
    await expect(page.locator(".raid-party-heading")).toContainText("ロイヤル・フラッシュ");
    const topRoster = page.locator('.raid-view .raid-enemy-roster[data-raid-variant-id="RAID_ROPPONGI_V1"]');
    await expect(topRoster).toHaveAttribute("data-roster-ready", "true");
    await expect(topRoster).toContainText("メンバー");
    await expect(topRoster.locator(".pvp-deck-member")).toHaveCount(5);
    await expect(topRoster.locator('[data-character-id="char_kaede_01"]')).toHaveCount(1);
    await expect(topRoster.locator('[data-character-id="char_cecile_01"]')).toHaveCount(1);
    await expect(page.locator(".raid-hp-text")).toContainText("25,500,000 / 34,000,000");
    await expect(page.locator(".raid-status-grid")).toContainText("3 / 5");
    await expect(page.locator(".raid-status-grid")).toContainText("CONTRIBUTION");
    await expect(page.locator(".raid-status-grid")).toContainText("123,456");
    await expect(page.locator(".raid-status-grid")).not.toContainText(/(?:\d+位|RANK)/);
    const topGeometry = await page.locator(".raid-view").evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(topGeometry.scrollWidth).toBeLessThanOrEqual(topGeometry.clientWidth + 1);
    const challenge = page.getByRole("button", { name: "挑戦する" });
    expect(await challenge.evaluate((node) => node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: testInfo.outputPath(`after-raid-top-${viewport.width}x${viewport.height}.png`), fullPage: true });

    await challenge.click();
    await expect(page.locator(".raid-battle-setup")).toBeVisible();
    await expect(page.locator(".raid-battle-target")).toContainText("ロイヤル・フラッシュ");
    const briefingRoster = page.locator('.raid-battle-target .raid-enemy-roster[data-raid-variant-id="RAID_ROPPONGI_V1"]');
    await expect(briefingRoster).toHaveAttribute("data-roster-ready", "true");
    await expect(briefingRoster).toContainText("メンバー");
    await expect(briefingRoster.locator(".pvp-deck-member")).toHaveCount(5);
    expect(await page.locator(".raid-battle-setup").evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("bg_street_roppongi.jpg");
    await expect(page.locator(".raid-battle-deck .character-presentation")).toHaveCount(5);
    await expect(page.locator(".raid-battle-deck")).toContainText("総合力");
    await expect(page.locator(".raid-battle-resource")).toContainText("3 / 5");
    await expect(page.getByRole("button", { name: "討伐開始" })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_users") || "[]")[0].raid_points)).toBe(3);
    const briefingGeometry = await page.locator(".raid-battle-setup").evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(briefingGeometry.scrollWidth).toBeLessThanOrEqual(briefingGeometry.clientWidth + 1);
    await page.screenshot({ path: testInfo.outputPath(`after-raid-briefing-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "レイドへ戻る" }).click();
    await expect(page.locator(".raid-view")).toBeVisible();
  });
}

test("RP zero opens canonical recovery without starting Raid", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRaid(page, "/?emptyRp=1");
  await page.evaluate(({ me }) => localStorage.setItem("mock_db_user_items", JSON.stringify([{ id: "raid-ticket", user_id: me, item_id: "RAID_POINT_TICKET", quantity: 2 }])), { me: ME });
  await page.getByRole("button", { name: "最新状態へ更新" }).click();
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "挑戦する" }).click();
  await expect(page.getByRole("dialog", { name: "RPが不足しています" })).toBeVisible();
  await page.getByRole("button", { name: "回復する" }).click();
  await expect(page.getByRole("dialog", { name: "RP回復" })).toContainText("所持 ×2");
  await expect(page.locator(".raid-battle-setup")).toHaveCount(0);
});

for (const town of [
  { id: "kawasaki", label: "川崎" },
  { id: "yokohama", label: "横浜" },
]) {
  test(`Raid ${town.label} decodes and keeps its canonical battle background`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRaid(page, `/?raidTown=${town.id}`);
    await expect(page.getByRole("tab", { name: town.label })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "挑戦する" }).click();
    await expect(page.locator(".raid-battle-setup")).toBeVisible();
    expect(await page.locator(".raid-battle-setup").evaluate((node) => getComputedStyle(node).backgroundImage)).toContain(`bg_street_${town.id}.jpg`);
  });
}

test("Raid does not expose a gradient-only battle screen while its background decodes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backgroundPattern = "**/bg/bg_street_kawasaki.jpg";
  await page.route(backgroundPattern, (route) => route.abort());
  await openRaid(page, "/?raidTown=kawasaki");
  await page.unroute(backgroundPattern);
  let releaseBackground: (() => void) | undefined;
  const backgroundReleased = new Promise<void>((resolve) => { releaseBackground = resolve; });
  await page.route(backgroundPattern, async (route) => {
    await backgroundReleased;
    await route.continue();
  });
  await page.getByRole("button", { name: "挑戦する" }).click();
  await expect(page.locator(".outlaw-interaction-blocker")).toBeVisible();
  await expect(page.locator(".raid-battle-setup")).toHaveCount(0);
  releaseBackground?.();
  await expect(page.locator(".raid-battle-setup")).toBeVisible();
  await expect(page.locator(".outlaw-interaction-blocker")).toHaveCount(0);
});

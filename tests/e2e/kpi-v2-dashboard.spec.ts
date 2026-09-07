import { expect, test, type Page } from "@playwright/test";

const metric = (key: string, numerator: number | null, denominator: number | null, value: number | null, target: number | null, status = "PASS") => ({
  metric_key: key, definition_version: "kpi-v2-20260906", numerator, denominator, value, target, status,
  coverage: { from: "2026-08-08", to: "2026-09-06" }, observation_status: value == null ? "incomplete" : "complete",
  as_of: "2026-09-06T12:00:00+09:00", timezone: "Asia/Tokyo", reason: value == null ? "no_data" : null,
});
const fixtureDate = (offset: number) => { const value = new Date("2026-09-06T00:00:00Z"); value.setUTCDate(value.getUTCDate() - offset); return value.toISOString().slice(0, 10); };
const fixtures: Record<string, unknown> = {
  daily: { timezone:"Asia/Tokyo", rows:Array.from({ length:30 }, (_, index) => ({
    date:fixtureDate(index),
    new_users:index === 0 ? 20 : Math.max(0, 12-index),
    tutorial:index < 2 ? metric("tutorial.canonical_complete_rate", index === 0 ? 14 : null, 20, index === 0 ? .7 : null, .6, index === 0 ? "PASS" : "NOT_READY") : metric("tutorial.canonical_complete_rate", null, 0, null, .6, "NOT_READY"),
    guild:metric("guild.conversion_rate", index === 0 ? 7 : null, index === 0 ? 14 : 0, index === 0 ? .5 : null, .4, index === 0 ? "PASS" : "NOT_READY"),
    chat:metric("guild.chat_activation_rate", index === 0 ? 3 : null, index === 0 ? 7 : 0, index === 0 ? .429 : null, .3, index === 0 ? "PASS" : "NOT_READY"),
    retention:[1,2,3,4,5].map((day) => ({ day, ...metric(`retention.d${day}`, day <= index ? 4 : null, day <= index ? 10 : null, day <= index ? .4 : null, [0,.38,.3,.26,.23,.21][day], day <= index ? "PASS" : "NOT_READY") })),
  })) },
  validation: {
    acquisition: metric("acquisition.game_start_rate", 84, 100, .84, .8), tutorial: metric("tutorial.canonical_complete_rate", 62, 84, .738, .6),
    guild_conversion: metric("guild.conversion_rate", 30, 62, .484, .4), guild_chat_activation: metric("guild.chat_activation_rate", 11, 30, .367, .3),
    marketing: { status: "AVAILABLE", days: [{ cpc: metric("marketing.cpc", null, null, 18.2, 28.5), clicks: metric("marketing.clicks", null, null, 420, 350) }] },
    formal_open: { status:"GO", reasons:[], retention:Object.fromEntries([1,2,3,4,5].map((day) => [`d${day}`, { ...metric(`formal_open.retention.d${day}`, 30, 75, .4, [0,.38,.3,.26,.23,.21][day]), mature_cohort_count:3, cohorts_used:["2026-08-31","2026-09-01","2026-09-02"] }])), effective_active_guild:{ status:"PASS", target:18, required_consecutive_days:3, current_consecutive_days:3, daily_series:[] } },
  },
  acquisition: { metric: metric("acquisition.game_start_rate", 84, 100, .84, .8), journeys: { bound: 84, unbound: 16 }, steps: [
    ["TITLE_ARRIVED",100], ["TAP_TO_START",94], ["WORLD_INTRO_STARTED",91], ["WORLD_INTRO_COMPLETED",88], ["NAME_COMPLETED",85], ["GAME_START_BOUND",84],
  ].map(([event_type, journeys]) => ({ event_type, journeys })) },
  tutorial: { metric: metric("tutorial.canonical_complete_rate",62,84,.738,.6), strong_target:.7, steps: [
    ["GAME_START",84,"complete"], ["TUTORIAL_GACHA_COMPLETED",78,"partial"], ["TUTORIAL_BATTLE_COMPLETED",72,"partial"], ["AUTH_CHOICE_SELECTED",68,"partial"], ["AUTH_CHOICE_RESOLVED",65,"partial"], ["FIRST_MYPAGE_ACCESS_CONFIRMED",62,"complete"],
  ].map(([fact_type, subjects, observation_status]) => ({ fact_type, subjects, observation_status })) },
  guild: { conversion: metric("guild.conversion_rate",30,62,.484,.4), conversion_strong_target:.6, chat_activation: metric("guild.chat_activation_rate",11,30,.367,.3), create:8, join:22 },
  retention: { identity:"subject_id", account_switch_diagnostic_count:2, cohorts:[{ cohort_date:"2026-09-03", game_start_uu:20, days:[
    metric("retention.d1",8,20,.4,.38), metric("retention.d2",6,20,.3,.3), metric("retention.d3",null,null,null,.26,"NOT_READY"), metric("retention.d4",null,null,null,.23,"NOT_READY"), metric("retention.d5",null,null,null,.21,"NOT_READY"),
  ].map((value, index) => ({ day:index+1,...value })) }] },
  community: { target:18, continuity_status:"PASS", effective_active_guild:{ status:"PASS", target:18, required_consecutive_days:3, current_consecutive_days:3, daily_series:[] }, series:[{ date:"2026-09-06", guild_active_uu:78, active_guild_count:22, guild_chat_active_uu:31, guild_chat_message_count:146, effective_active_guild_count:19 }] },
  marketing: { status:"PASS", grain:"CAMPAIGN", rows:[{ id:"m1", report_date_jst:"2026-09-06", reporting_grain:"CAMPAIGN", campaign_name:"TRIBE NEON 正式オープン前Validation・とても長いキャンペーン名称・モバイル折返し確認用", external_key:"long", spend:7644, impressions:60000, clicks:420, ctr:.007, cpc:18.2, cpm:127.4 }] },
  "post-tutorial": { cohort:62, metrics:[{key:"SKILL_NORMAL",label:"スキルガチャ",uu:44},{key:"EQUIP_NORMAL",label:"装備ガチャ",uu:39},{key:"CHARACTER",label:"Character",uu:null,observation_status:"unavailable"},{key:"BATTLE",label:"Battle",uu:48},{key:"RAID",label:"Raid",uu:27}] },
};

async function mockApi(page: Page, options: { empty?: boolean; fail?: string } = {}) {
  await page.route("**/api/admin/kpi/v2/**", async (route) => {
    const key = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (options.fail === key) return route.fulfill({ status: 500, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify({ error: "fixture failure" }) });
    let body = fixtures[key];
    if (options.empty && key === "marketing") body = { status:"NOT_READY", reason:"no_data", grain:"CAMPAIGN", rows:[] };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control":"no-store" }, body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: `Basic ${Buffer.from("m3:local-only").toString("base64")}` });
});

for (const viewport of [{ width:390, height:844 }, { width:412, height:915 }]) {
  test(`KPI daily mobile ${viewport.width}px scroll and detail`, async ({ page }) => {
    await page.setViewportSize(viewport); await mockApi(page); await page.goto("/admin/kpi");
    await expect(page.getByRole("heading", { name:"日次KPI" })).toBeVisible();
    const mobile = page.locator(".daily-mobile");
    await expect(mobile.getByText("新規ユーザー").first()).toBeVisible();
    await expect(mobile.getByText("Tutorial").first()).toBeVisible();
    await expect(mobile.getByText("Guild").first()).toBeVisible();
    await expect(mobile.getByText("Chat").first()).toBeVisible();
    await expect(mobile.getByText("D5").first()).toBeVisible();
    await expect(page.getByText("FROM")).toHaveCount(0);
    const shell = page.locator(".kpi-shell");
    await shell.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    expect(await shell.evaluate((node) => node.scrollTop > 0 && Math.ceil(node.scrollTop + node.clientHeight) >= node.scrollHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("link", { name:"2026-09-06 の詳細" }).click();
    await expect(page).toHaveURL(/\/admin\/kpi\/day\/2026-09-06$/);
    await expect(page.getByRole("heading", { name:"2026-09-06 JST" })).toBeVisible();
    await expect(page.getByText("84 / 100").first()).toBeVisible();
    const retention = page.locator(".v2-retention-scroll");
    expect(await retention.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  });
}

test("KPI daily desktop table and automatic error state", async ({ page }) => {
  await page.setViewportSize({ width:1440, height:900 }); await mockApi(page); await page.goto("/admin/kpi");
  await expect(page.locator(".daily-desktop table")).toBeVisible();
  await expect(page.locator(".daily-desktop tbody tr")).toHaveCount(30);
  await expect(page.locator(".daily-desktop tbody tr").first()).toContainText("2026-09-06");
  await expect(page.getByText("表示条件")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

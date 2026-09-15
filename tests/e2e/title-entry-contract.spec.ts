import { expect, test, type Page } from "@playwright/test";

const EXISTING_USER_ID = "00000000-0000-4000-8000-000000000321";

async function seedExistingSave(page: Page, step = "COMPLETE", authMode = "ANONYMOUS") {
  await page.addInitScript(({ userId, tutorialStep, mode }) => {
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", mode);
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: "継続確認",
      current_base_id: "town_shinjuku",
      favorite_character_id: "char_ageha_01",
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{
      user_id: userId,
      step_id: tutorialStep,
    }]));
  }, { userId: EXISTING_USER_ID, tutorialStep: step, mode: authMode });
}

async function activateTitle(page: Page) {
  const titleAction = page.getByRole("button", { name: "TAP TO START" });
  await expect(titleAction).toBeVisible();
  await titleAction.click();
}

test("fresh title visit creates no anonymous identity and exposes both entry choices", async ({ page }) => {
  await page.goto("/");
  await activateTitle(page);
  await expect(page.getByRole("button", { name: "はじめから" })).toBeVisible();
  await expect(page.getByRole("button", { name: "データをお持ちの方" })).toBeVisible();

  for (let visit = 0; visit < 9; visit += 1) await page.reload();

  const state = await page.evaluate(() => ({
    authUserId: localStorage.getItem("tribe_demo_uuid"),
    authMode: localStorage.getItem("mock_auth_mode"),
    profiles: JSON.parse(localStorage.getItem("mock_db_users") || "[]").length,
  }));
  expect(state).toEqual({ authUserId: null, authMode: null, profiles: 0 });
  await activateTitle(page);
  await expect(page.getByRole("button", { name: "はじめから" })).toBeVisible();
  await expect(page.getByRole("button", { name: "データをお持ちの方" })).toBeVisible();
});

test("continue without a session opens existing-account login", async ({ page }) => {
  await page.goto("/");
  await activateTitle(page);
  await page.getByRole("button", { name: "データをお持ちの方" }).click();
  await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test("fresh start creates exactly one anonymous lifecycle when selected", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => localStorage.getItem("tribe_demo_uuid"))).toBeNull();
  await activateTitle(page);
  await page.getByRole("button", { name: "はじめから" }).click();
  await expect(page.getByRole("region", { name: "TRIBE NEON プロローグ" })).toBeVisible();
  const firstUserId = await page.evaluate(() => localStorage.getItem("tribe_demo_uuid"));
  expect(firstUserId).toMatch(/^00000000-0000-4000-8000-/);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("mock_auth_mode"))).toBe("ANONYMOUS");
  await page.reload();
  await activateTitle(page);
  await expect(page.getByRole("button", { name: "チュートリアルを続ける" })).toBeVisible();
  await expect(page.getByRole("button", { name: "はじめから" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("tribe_demo_uuid"))).toBe(firstUserId);
});

test("existing authenticated save stays at title and exposes continue only", async ({ page }) => {
  await seedExistingSave(page, "AUTHENTICATION", "GOOGLE");
  await page.goto("/");
  await activateTitle(page);
  await expect(page.getByRole("button", { name: "続きから" })).toBeVisible();
  await expect(page.getByRole("button", { name: "はじめから" })).toHaveCount(0);
  await expect(page.locator(".home-container, .first-home-shell")).toHaveCount(0);
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.locator(".header-mobile")).toBeVisible();
});

test("existing anonymous save stays at title and resumes through continue", async ({ page }) => {
  await seedExistingSave(page, "FREE_INSTANT", "ANONYMOUS");
  await page.goto("/");
  await activateTitle(page);
  await expect(page.getByRole("button", { name: "チュートリアルを続ける" })).toBeVisible();
  await expect(page.getByRole("button", { name: "はじめから" })).toHaveCount(0);
  await page.getByRole("button", { name: "チュートリアルを続ける" }).click();
  await expect(page.locator('[data-acceptance-state="Q3"]')).toBeVisible();
});

test("anonymous session created before name entry is recoverable and cannot fork another lifecycle", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tribe_demo_uuid", "00000000-0000-4000-8000-000000000322");
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
  });
  await page.goto("/");
  await activateTitle(page);
  await expect(page.getByRole("button", { name: "チュートリアルを続ける" })).toBeVisible();
  await expect(page.getByRole("button", { name: "はじめから" })).toHaveCount(0);
  await page.getByRole("button", { name: "チュートリアルを続ける" }).click();
  await expect(page.getByRole("region", { name: "TRIBE NEON プロローグ" })).toBeVisible();
});

test("authenticated identity without a save is classified fresh only after server projection signs it out", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tribe_demo_uuid", "00000000-0000-4000-8000-000000000777");
    localStorage.setItem("mock_auth_mode", "GOOGLE");
  });
  await page.goto("/");
  await activateTitle(page);
  await expect(page.getByRole("button", { name: "はじめから" })).toBeVisible();
  await expect(page.getByRole("button", { name: "データをお持ちの方" })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_demo_uuid"))).toBeNull();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`title choices fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await activateTitle(page);
    await expect(page.getByRole("button", { name: "はじめから" })).toBeVisible();
    const geometry = await page.locator(".title-view-container").evaluate((container) => {
      const rect = container.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.horizontalOverflow).toBe(0);
  });
}

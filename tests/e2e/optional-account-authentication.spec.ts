import { expect, test, type Page } from "@playwright/test";

const anonymousUserId = "00000000-0000-4000-8000-000000000217";

async function seedPlayer(page: Page, authenticated = false) {
  await page.addInitScript(({ userId, authenticated }) => {
    if (localStorage.getItem("mock_db_users")) return;
    const todayJst = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", authenticated ? "EMAIL" : "ANONYMOUS");
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: authenticated ? "認証済み確認" : "認証保留確認",
      current_base_id: "shinjuku",
      favorite_character_id: "char_reiji_01",
      cash: 0,
      neon_diamonds: 0,
    }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{
      id: `starter_${userId}`,
      user_id: userId,
      character_id: "char_reiji_01",
      level: 7,
      awakening_level: 0,
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{
      user_id: userId,
      step_id: authenticated ? "AUTHENTICATION" : "COMPLETE",
      authentication_pending: false,
    }]));
    if (authenticated) {
      localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{
        user_id: userId,
        auth_method: "EMAIL",
      }]));
      localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{
        user_id: userId,
        current_day: 1,
        total_logins: 1,
        last_claimed_date: todayJst,
      }]));
    }
  }, { userId: anonymousUserId, authenticated });
}

async function enterFromTitle(page: Page, label: "チュートリアルを続ける" | "続きから") {
  await page.goto("/");
  const tapToStart = page.getByRole("button", { name: "TAP TO START" });
  await expect(tapToStart).toBeVisible({ timeout: 20_000 });
  await tapToStart.click();
  const entry = page.getByRole("button", { name: label });
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await entry.click();
}

test("anonymous COMPLETE can defer authentication and receives ordered exactly-once guidance", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPlayer(page);
  await enterFromTitle(page, "チュートリアルを続ける");

  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  await page.getByRole("button", { name: "そのまま続ける" }).click();
  await expect(page.locator(".mypage-view")).toBeVisible({ timeout: 20_000 });

  const storedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]);
  expect(storedProgress).toMatchObject({ step_id: "COMPLETE", authentication_pending: true });

  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await expect(loginBonus).toBeVisible();
  await expect(page.getByRole("dialog", { name: "アカウント認証のご案内" })).toHaveCount(0);
  await loginBonus.getByRole("button", { name: "閉じる" }).click();

  const reminder = page.getByRole("dialog", { name: "アカウント認証のご案内" });
  await expect(reminder).toBeVisible();
  await reminder.getByRole("button", { name: "今すぐ認証" }).click();
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByRole("button", { name: "未認証：アカウント認証を開く" })).toBeVisible();

  await page.getByRole("button", { name: "ガチャ", exact: true }).click();
  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "ログインボーナス" })).toHaveCount(0);

  const manualLoginBonus = page.locator(".sub-icon-unit").filter({ hasText: "ボーナス" });
  await manualLoginBonus.click();
  await expect(loginBonus).toBeVisible();
  await loginBonus.getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("button", { name: "ガチャ", exact: true }).click();
  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await expect(loginBonus).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await expect(page.getByRole("button", { name: "続きから" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.locator(".mypage-view")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("dialog", { name: "ログインボーナス" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "アカウント認証のご案内" })).toHaveCount(0);
});

test("an open provider processes the next Login Bonus after the JST date changes", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-01T14:59:00Z"));
  await seedPlayer(page);
  await enterFromTitle(page, "チュートリアルを続ける");
  await page.getByRole("button", { name: "そのまま続ける" }).click();

  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await expect(loginBonus).toBeVisible();
  await loginBonus.getByRole("button", { name: "閉じる" }).click();
  const reminder = page.getByRole("dialog", { name: "アカウント認証のご案内" });
  await expect(reminder).toBeVisible();
  await reminder.getByRole("button", { name: "閉じる" }).click();
  await expect(reminder).toHaveCount(0);

  await page.getByRole("button", { name: "ガチャ", exact: true }).click();
  await page.clock.setFixedTime(new Date("2026-09-01T15:01:00Z"));
  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await expect(loginBonus).toBeVisible();
});

test("pending icon reuses the authentication modal, preserves collisions, and disappears after email authentication", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPlayer(page);
  await page.addInitScript((userId) => {
    const todayJst = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{
      user_id: userId, step_id: "COMPLETE", authentication_pending: true,
    }]));
    localStorage.setItem(`tribe_account_authentication_reminder:${userId}`, todayJst);
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{
      user_id: userId, current_day: 1, total_logins: 1, last_claimed_date: todayJst,
    }]));
  }, anonymousUserId);
  await enterFromTitle(page, "続きから");

  const icon = page.getByRole("button", { name: "未認証：アカウント認証を開く" });
  await expect(icon).toBeVisible();
  await icon.click();
  await expect(page.getByRole("button", { name: "閉じる" })).toBeVisible();
  await page.getByRole("button", { name: "閉じる" }).click();

  await page.evaluate(() => localStorage.setItem("mock_google_identity_collision", "true"));
  await icon.click();
  await page.getByRole("button", { name: "Googleアカウントを連携" }).click();
  await expect(page.getByText("登録済みのGoogleアカウントが見つかりました")).toBeVisible();
  const collisionState = await page.evaluate((userId) => ({
    profileExists: JSON.parse(localStorage.getItem("mock_db_users") || "[]").some((row: { id: string }) => row.id === userId),
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0],
  }), anonymousUserId);
  expect(collisionState.profileExists).toBe(true);
  expect(collisionState.progress).toMatchObject({ step_id: "COMPLETE", authentication_pending: true });
  await page.getByRole("button", { name: "別のGoogleアカウントを選ぶ" }).click();

  await page.locator('input[type="email"]').fill("optional@example.com");
  await page.locator('input[type="password"]').fill("password123");
  await page.getByRole("button", { name: "メールアカウントを連携" }).click();
  await expect(icon).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "アカウント認証のご案内" })).toHaveCount(0);
  const authenticatedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]);
  expect(authenticatedProgress).toMatchObject({ step_id: "AUTHENTICATION", authentication_pending: false });
});

test("existing authenticated player never receives pending authentication UI", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPlayer(page, true);
  await enterFromTitle(page, "続きから");
  await expect(page.locator(".mypage-view")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "未認証：アカウント認証を開く" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "アカウント認証のご案内" })).toHaveCount(0);
});

test("authenticated session suppresses stale pending UI and preserves the Japanese username", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPlayer(page, true);
  await page.addInitScript((userId) => {
    const users = JSON.parse(localStorage.getItem("mock_db_users") || "[]");
    localStorage.setItem("mock_db_users", JSON.stringify(users.map((user: { id: string; username: string }) =>
      user.id === userId ? { ...user, username: "ててててて" } : user
    )));
    // Reproduce the OAuth-return race: the live session is authenticated but
    // the compact onboarding projection still contains the pre-link snapshot.
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{
      user_id: userId, step_id: "COMPLETE", authentication_pending: true,
    }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{
      user_id: userId, auth_method: "GOOGLE",
    }]));
  }, anonymousUserId);
  await enterFromTitle(page, "続きから");

  await expect(page.getByText("ててててて", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "未認証：アカウント認証を開く" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "アカウント認証のご案内" })).toHaveCount(0);
});

test("pending Google authentication keeps the user id, callback origin, and clears pending UI", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPlayer(page);
  await page.addInitScript((userId) => {
    const todayJst = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{
      user_id: userId, step_id: "COMPLETE", authentication_pending: true,
    }]));
    localStorage.setItem(`tribe_account_authentication_reminder:${userId}`, todayJst);
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{
      user_id: userId, current_day: 1, total_logins: 1, last_claimed_date: todayJst,
    }]));
  }, anonymousUserId);
  await enterFromTitle(page, "続きから");

  const icon = page.getByRole("button", { name: "未認証：アカウント認証を開く" });
  await icon.click();
  await page.getByRole("button", { name: "Googleアカウントを連携" }).click();
  await expect(icon).toHaveCount(0);
  const result = await page.evaluate(() => ({
    userId: localStorage.getItem("tribe_demo_uuid"),
    redirectTo: localStorage.getItem("mock_last_oauth_redirect_to"),
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0],
  }));
  expect(result.userId).toBe(anonymousUserId);
  expect(result.redirectTo).toBe(`${new URL(page.url()).origin}/auth/callback`);
  expect(result.progress).toMatchObject({ step_id: "AUTHENTICATION", authentication_pending: false });
});


test("deferred anonymous Google collision appears immediately without tapping the badge", async ({ page }) => {
  await seedPlayer(page);
  await page.addInitScript(() => {
    const rows = JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]");
    rows.forEach((row: { authentication_pending?: boolean }) => { row.authentication_pending = true; });
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify(rows));
  });
  await page.goto("/?account_switch=google");
  const dialog = page.getByRole("dialog", { name: "登録済みのGoogleアカウントが見つかりました" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("現在の未認証データへの連携は完了していません");
  expect(await page.evaluate(() => localStorage.getItem("mock_auth_mode"))).toBe("ANONYMOUS");
});

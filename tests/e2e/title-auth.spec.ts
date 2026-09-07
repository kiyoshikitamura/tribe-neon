import { expect, test } from "@playwright/test";

async function enterNameRegistration(page: import("@playwright/test").Page) {
  await expect(page.locator('[data-entry-state="WORLD_INFORMATION"]')).toBeVisible();
  await expect(page.locator('[data-world-stage="4"] .setup-world-tap')).toBeVisible({ timeout: 30_000 });
  await page.locator(".setup-world-tap").click();
  await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toBeVisible();
  await page.locator(".setup-ageha-presentation .setup-primary-action").click();
  await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
  await expect(page.getByPlaceholder("プレイヤー名を入力")).toBeVisible();
}

async function seedCompletedAnonymous(page: import("@playwright/test").Page, confirmationRequired = false) {
  await page.addInitScript(({ confirmationRequired }) => {
    if (localStorage.getItem("m1_completed_anonymous_seeded") === "true") return;
    localStorage.setItem("m1_completed_anonymous_seeded", "true");
    const userId = "00000000-0000-4000-8000-000000000099";
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    if (confirmationRequired) localStorage.setItem("mock_email_confirmation_required", "true");
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: "認証待ち",
      current_base_id: "neon_tower",
      favorite_character_id: "char_reiji_01",
    }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{
      id: `starter_${userId}`,
      user_id: userId,
      character_id: "char_reiji_01",
      level: 1,
      awakening_level: 0,
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "COMPLETE" }]));
  }, { confirmationRequired });
}

async function openCompletedAnonymousAuthentication(page: import("@playwright/test").Page) {
  const tapToStart = page.getByRole("button", { name: "TAP TO START" });
  await tapToStart.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  if (await tapToStart.isVisible()) await tapToStart.click();
  const resume = page.getByRole("button", { name: /^(チュートリアルを続ける|続きから)$/ });
  await resume.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
  if (await resume.isVisible()) await resume.click();
}

test("title screen opens the authentication menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("TAP TO START")).toBeVisible();
  await expect(page.locator(".title-logo-text")).toHaveCount(0);
  await expect(page.locator(".title-view-container")).toHaveCSS("background-image", /branding\/title-key-visual\.png/);
  await expect(page.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/legal/terms");
  await expect(page.getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute("href", "/legal/privacy");
  await expect(page.getByRole("link", { name: "特定商取引法に基づく表記" })).toHaveAttribute("href", "/legal/tokusho");

  await page.getByText("TAP TO START").click();

  await page.getByRole("button", { name: "データをお持ちの方" }).click();

  await expect(page.getByText("TRIBE NEON")).toBeVisible();
  await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Googleでログイン" })).toHaveClass(/semantic-cta--primary/);
});

test("title Google login always asks the browser to select an account", async ({ page }) => {
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "データをお持ちの方" }).click();
  await page.getByRole("button", { name: "Googleでログイン" }).click();

  await expect.poll(async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem("mock_last_oauth_query_params") || "{}")
  )).toEqual({ prompt: "select_account" });
});

test("authentication menu opens the email login form", async ({ page }) => {
  await page.goto("/");
  const tapToStart = page.getByText("TAP TO START");
  await expect(tapToStart).toBeVisible();
  await tapToStart.click();

  await page.getByRole("button", { name: "データをお持ちの方" }).click();

  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("email login without a game profile uses provider-neutral guidance", async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000778";
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: userId, provider: "email", email: "empty@example.com" }]));
  });
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "データをお持ちの方" }).click();
  await page.getByPlaceholder("メールアドレス").fill("empty@example.com");
  await page.getByPlaceholder("パスワード (6文字以上)").fill("secure-pass-123");
  await page.getByRole("button", { name: "メールでログイン" }).click();

  await expect(page.getByText(/この認証アカウントにはゲームデータがありません/)).toBeVisible();
  await expect(page.getByText(/このGoogleアカウントにはゲームデータがありません/)).toHaveCount(0);
});

test("a new player explicitly creates an anonymous session before name setup", async ({ page }) => {
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "はじめから" }).click();
  await enterNameRegistration(page);

  await expect(page.getByRole("heading", { name: "プレイヤー名" })).toBeVisible();
  await expect(page.getByPlaceholder("プレイヤー名を入力")).toBeVisible();
  await expect(page.locator(".setup-invite-details")).toHaveCount(0);
  await expect(page.getByPlaceholder("8文字の招待コード")).toHaveCount(0);
  const nameInputMetrics = await page.getByPlaceholder("プレイヤー名を入力").evaluate((input) => {
    const rect = input.getBoundingClientRect();
    return { fontSize: Number.parseFloat(getComputedStyle(input).fontSize), height: rect.height };
  });
  expect(nameInputMetrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(nameInputMetrics.height).toBeGreaterThanOrEqual(52);
});

test("an invitation URL carries its code without adding a primary form field", async ({ page }) => {
  await page.goto("/?invite=AB12CD34&utm_source=x");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "はじめから" }).click();
  await enterNameRegistration(page);

  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByPlaceholder("8文字の招待コード")).toHaveCount(0);
});

test("an authenticated Google user without game data cannot enter anonymous name setup", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tribe_demo_uuid", "00000000-0000-4000-8000-000000000777");
    localStorage.setItem("mock_auth_mode", "GOOGLE");
  });
  await page.goto("/");
  await page.getByText("TAP TO START").click();

  await expect(page.getByText(/この認証アカウントにはゲームデータがありません/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "プレイヤー名" })).toBeHidden();

  await page.locator(".title-entry-primary").click();
  await enterNameRegistration(page);
  await expect(page.getByRole("heading", { name: "プレイヤー名" })).toBeVisible();
  await expect(page.getByPlaceholder("プレイヤー名を入力")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("mock_auth_mode"))).toBe("ANONYMOUS");
});

test("name-only initialization is idempotent and resumes the tutorial after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "はじめから" }).click();
  await enterNameRegistration(page);
  await page.getByPlaceholder("プレイヤー名を入力").fill("新宿太郎");
  await page.getByRole("button", { name: "この名前で始める" }).evaluate((button: HTMLButtonElement) => {
    // Simulate a rapid duplicate submission before React can repaint the
    // disabled state. Initialization must still create one profile/progress row;
    // characters are granted later by the authoritative tutorial gacha.
    button.click();
    button.click();
  });

  await expect(page.getByRole("dialog", { name: "アゲハからの案内" })).toBeVisible();
  const storedCounts = await page.evaluate(() => ({
    users: JSON.parse(localStorage.getItem("mock_db_users") || "[]").length,
    characters: JSON.parse(localStorage.getItem("mock_db_user_characters") || "[]").length,
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]").length,
  }));
  expect(storedCounts).toEqual({ users: 1, characters: 0, progress: 1 });

  await page.reload();
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "チュートリアルを続ける" }).click();
  await expect(page.getByRole("dialog", { name: "アゲハからの案内" })).toBeVisible();
  const resumedNext = page.getByRole("button", { name: "次へ" });
  await expect(resumedNext).toBeEnabled();
  await resumedNext.click();
  await expect(page.getByRole("button", { name: "無料10連を引く" })).toBeVisible();
  await page.reload();
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "チュートリアルを続ける" }).click();
  await expect(page.getByRole("button", { name: "無料10連を引く" })).toBeVisible();
  const reloadedCounts = await page.evaluate(() => ({
    users: JSON.parse(localStorage.getItem("mock_db_users") || "[]").length,
    characters: JSON.parse(localStorage.getItem("mock_db_user_characters") || "[]").length,
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]").length,
  }));
  expect(reloadedCounts).toEqual(storedCounts);
});

test("name-only initialization rejects a normalized duplicate username", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: "other-user", username: "NEON" }]));
  });
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "はじめから" }).click();
  await enterNameRegistration(page);
  await page.getByPlaceholder("プレイヤー名を入力").fill(" neon ");
  await page.setViewportSize({ width: 390, height: 844 });
  const beforeErrorHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.getByRole("button", { name: "この名前で始める" }).click();

  await expect(page.getByText("このユーザー名は既に使用されています。")).toBeVisible();
  await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
  await expect(page.getByPlaceholder("プレイヤー名を入力")).toHaveValue(" neon ");
  const errorGeometry = await page.getByRole("alertdialog", { name: "エラー" }).evaluate((modal) => {
    const rect = modal.getBoundingClientRect();
    return {
      centerDelta: Math.abs((rect.top + rect.height / 2) - window.innerHeight / 2),
      documentHeight: document.documentElement.scrollHeight,
    };
  });
  expect(errorGeometry.centerDelta).toBeLessThan(2);
  expect(errorGeometry.documentHeight).toBe(beforeErrorHeight);
  await page.getByRole("button", { name: "閉じる" }).click();
  await page.getByPlaceholder("プレイヤー名を入力").fill("NEON2");
  await page.getByRole("button", { name: "この名前で始める" }).click();
  await expect(page.getByRole("dialog", { name: "アゲハからの案内" })).toBeVisible();
  await expect(page.getByText("このユーザー名は既に使用されています。")).toHaveCount(0);
  await page.waitForTimeout(350);
  await expect(page.getByText("このユーザー名は既に使用されています。")).toHaveCount(0);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`world introduction renders black pixels outside its cinematic container at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByText("TAP TO START").click();
    await page.getByRole("button", { name: "はじめから" }).click();
    await expect(page.getByRole("region", { name: "TRIBE NEON プロローグ" })).toBeVisible();
    const geometry = await page.locator(".setup-container.is-world-entry").evaluate((outer) => {
      const inner = outer.querySelector<HTMLElement>(".setup-world-presentation")!;
      const outerStyle = getComputedStyle(outer);
      const outerBox = outer.getBoundingClientRect();
      const innerBox = inner.getBoundingClientRect();
      return {
        backgroundColor: outerStyle.backgroundColor,
        backgroundImage: outerStyle.backgroundImage,
        outer: { top: outerBox.top, right: outerBox.right, bottom: outerBox.bottom, left: outerBox.left },
        inner: { top: innerBox.top, right: innerBox.right, bottom: innerBox.bottom, left: innerBox.left },
      };
    });
    expect(geometry.backgroundColor).toBe("rgb(0, 0, 0)");
    expect(geometry.backgroundImage).toBe("none");
    expect(geometry.inner.top).toBeGreaterThan(geometry.outer.top);
    expect(geometry.inner.right).toBeLessThan(geometry.outer.right);
    expect(geometry.inner.bottom).toBeLessThan(geometry.outer.bottom);
    expect(geometry.inner.left).toBeGreaterThan(geometry.outer.left);
    await page.screenshot({ path: `test-results/world-intro-${viewport.width}x${viewport.height}.png` });
  });
}

test("tutorial gacha failure overlays the intact offer and remains retryable", async ({ page }) => {
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "はじめから" }).click();
  await enterNameRegistration(page);
  await page.getByPlaceholder("プレイヤー名を入力").fill("失敗確認");
  await page.getByRole("button", { name: "この名前で始める" }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await page.evaluate(() => localStorage.setItem("mock_tutorial_gacha_error", "true"));
  await page.getByRole("button", { name: "無料10連を引く" }).click();

  await expect(page.getByText("ガチャの実行に失敗しました。通信状態を確認して、もう一度お試しください。")).toBeVisible();
  await expect(page.locator(".tutorial-gacha-page")).toBeVisible();
  await expect(page.locator(".gacha-presentation-stage, .tutorial-gacha-reveal")).toHaveCount(0);
  await page.getByRole("dialog", { name: "エラー" }).getByRole("button", { name: "閉じる" }).last().click();
  await expect(page.getByRole("button", { name: "無料10連を引く" })).toBeEnabled();
});

test("email linking keeps the anonymous user id and completes onboarding once", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);
  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  await page.getByPlaceholder("メールアドレス").fill("new@example.com");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("secure-pass-123");
  await page.getByRole("button", { name: "メールアカウントを連携" }).click();

  await expect(page.getByText("ゲームデータを保存")).toBeHidden();
  const state = await page.evaluate(() => ({
    userId: localStorage.getItem("tribe_demo_uuid"),
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"),
    methods: JSON.parse(localStorage.getItem("mock_db_user_account_auth_methods") || "[]"),
  }));
  expect(state.userId).toBe("00000000-0000-4000-8000-000000000099");
  expect(state.progress).toEqual([{ user_id: state.userId, step_id: "AUTHENTICATION", authentication_pending: false }]);
  expect(state.methods).toEqual([{ user_id: state.userId, auth_method: "EMAIL" }]);
});

test("email linking fails closed when immediate completion returns another user id", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.addInitScript(() => {
    localStorage.setItem("mock_email_link_user_id", "00000000-0000-4000-8000-000000000298");
  });
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);
  await page.getByPlaceholder("メールアドレス").fill("mismatch@example.com");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("secure-pass-123");
  await page.getByRole("button", { name: "メールアカウントを連携" }).click();

  await expect(page.getByText(/メール連携の開始時と異なるユーザーが検出されました/)).toBeVisible();
  const result = await page.evaluate(() => ({
    userId: localStorage.getItem("tribe_demo_uuid"),
    authMode: localStorage.getItem("mock_auth_mode"),
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"),
    methods: JSON.parse(localStorage.getItem("mock_db_user_account_auth_methods") || "[]"),
  }));
  expect(result.userId).toBe("00000000-0000-4000-8000-000000000099");
  expect(result.authMode).toBe("ANONYMOUS");
  expect(result.progress).toContainEqual(expect.objectContaining({
    user_id: "00000000-0000-4000-8000-000000000099",
    step_id: "COMPLETE",
  }));
  expect(result.methods).toEqual([]);
});

test("email confirmation wait survives reload and finalizes after the callback session", async ({ page }) => {
  await seedCompletedAnonymous(page, true);
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);
  await page.getByPlaceholder("メールアドレス").fill("confirm@example.com");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("secure-pass-123");
  await page.getByRole("button", { name: "メールアカウントを連携" }).click();

  await expect(page.getByRole("status")).toContainText("確認メールを confirm@example.com に送信しました");
  await page.reload();
  await openCompletedAnonymousAuthentication(page);
  await expect(page.getByRole("status")).toContainText("確認メールを confirm@example.com に送信しました");

  await page.evaluate(() => {
    const userId = localStorage.getItem("tribe_demo_uuid");
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.removeItem("mock_pending_email");
    localStorage.removeItem("mock_email_confirmation_required");
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: userId, provider: "email", email: "confirm@example.com" }]));
  });
  await page.reload();
  await openCompletedAnonymousAuthentication(page);
  await expect(page.getByRole("status")).toContainText("メール確認が完了しました");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("secure-pass-123");
  await page.getByRole("button", { name: "パスワードを設定して完了" }).click();
  await expect(page.getByText("ゲームデータを保存")).toBeHidden();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("AUTHENTICATION");
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_onboarding_email_intent"))).toBeNull();
});

test("verified email return without local intent resumes finalization before home", async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000099";
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.removeItem("tribe_onboarding_email_intent");
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: "メール確認済み",
      current_base_id: "neon_tower",
      favorite_character_id: "char_reiji_01",
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{
      user_id: userId,
      step_id: "COMPLETE",
      authentication_pending: false,
    }]));
    localStorage.setItem("mock_db_user_account_auth_methods", "[]");
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{
      user_id: userId,
      provider: "email",
      email: "confirmed@example.com",
    }]));
  });

  await page.goto("/");

  await expect(page.getByRole("dialog", { name: "ゲームデータを保存" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("メール確認が完了しました");
  await expect(page.getByRole("button", { name: "そのまま続ける" })).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);

  await page.getByPlaceholder("パスワード（6文字以上）").fill("secure-pass-123");
  await page.getByRole("button", { name: "パスワードを設定して完了" }).click();

  await expect(page.getByRole("dialog", { name: "ゲームデータを保存" })).toBeHidden();
  await expect.poll(async () => page.evaluate(() => ({
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id,
    method: JSON.parse(localStorage.getItem("mock_db_user_account_auth_methods") || "[]")[0]?.auth_method,
  }))).toEqual({ progress: "AUTHENTICATION", method: "EMAIL" });
  await expect(page.locator("header")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
});

test("email confirmation return with a different uid is rejected before finalization", async ({ page }) => {
  const sourceUserId = "00000000-0000-4000-8000-000000000099";
  const returnedUserId = "00000000-0000-4000-8000-000000000299";
  await page.addInitScript(({ sourceUserId, returnedUserId }) => {
    localStorage.setItem("tribe_demo_uuid", returnedUserId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("tribe_onboarding_email_intent", JSON.stringify({
      method: "EMAIL",
      userId: sourceUserId,
      email: "confirm@example.com",
      startedAt: Date.now(),
    }));
    localStorage.setItem("mock_db_users", JSON.stringify([
      { id: sourceUserId, username: "元データ" },
      { id: returnedUserId, username: "別データ" },
    ]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([
      { user_id: sourceUserId, step_id: "COMPLETE", authentication_pending: true },
      { user_id: returnedUserId, step_id: "AUTHENTICATION", authentication_pending: false },
    ]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([
      { user_id: returnedUserId, auth_method: "EMAIL" },
    ]));
  }, { sourceUserId, returnedUserId });
  await page.goto("/");

  await expect(page.getByText(/メール連携を開始したゲームデータと異なるユーザーが検出されました/)).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_demo_uuid"))).toBeNull();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"));
  expect(progress.find((row: any) => row.user_id === sourceUserId)?.step_id).toBe("COMPLETE");
});

test("email identity collision can be cancelled without changing anonymous tutorial data", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.addInitScript(() => {
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: "other-user", provider: "email", email: "used@example.com" }]));
  });
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);
  await page.getByPlaceholder("メールアドレス").fill("used@example.com");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("secure-pass-123");
  await page.getByRole("button", { name: "メールアカウントを連携" }).click();

  await expect(page.getByRole("dialog", { name: "既存のゲームデータが見つかりました" })).toBeVisible();
  await page.getByRole("button", { name: "別のメールアドレスを選ぶ" }).click();
  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"));
  expect(progress[0].step_id).toBe("COMPLETE");
});

test("Google linking keeps the anonymous user id and completes onboarding once", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "チュートリアルを続ける" }).click();
  await page.getByRole("button", { name: "Googleアカウントを連携" }).click();

  await expect(page.getByText("ゲームデータを保存")).toBeHidden();
  const state = await page.evaluate(() => ({
    userId: localStorage.getItem("tribe_demo_uuid"),
    intent: localStorage.getItem("tribe_onboarding_auth_intent"),
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"),
    methods: JSON.parse(localStorage.getItem("mock_db_user_account_auth_methods") || "[]"),
  }));
  expect(state.userId).toBe("00000000-0000-4000-8000-000000000099");
  expect(state.intent).toBeNull();
  expect(state.progress).toEqual([{ user_id: state.userId, step_id: "AUTHENTICATION", authentication_pending: false }]);
  expect(state.methods).toEqual([{ user_id: state.userId, auth_method: "GOOGLE" }]);
});

test("Google OAuth redirect resumes with the same anonymous user id", async ({ page }) => {
  test.setTimeout(60_000);
  await seedCompletedAnonymous(page);
  await page.addInitScript(() => localStorage.setItem("mock_google_redirect_required", "true"));
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);
  await page.getByRole("button", { name: "Googleアカウントを連携" }).click();

  const intent = await page.evaluate(() => JSON.parse(localStorage.getItem("tribe_onboarding_auth_intent") || "null"));
  expect(intent).toMatchObject({ method: "GOOGLE", userId: "00000000-0000-4000-8000-000000000099" });
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("mock_last_oauth_redirect_to")))
    .toBe(`${new URL(page.url()).origin}/auth/callback`);

  await page.evaluate(() => {
    const userId = localStorage.getItem("tribe_demo_uuid");
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.removeItem("mock_google_redirect_required");
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: userId, provider: "google" }]));
  });
  await page.reload();

  await expect(page.getByText("TAP TO START")).toBeHidden();
  await expect(page.getByText("ゲームデータを保存")).toBeHidden();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("AUTHENTICATION");
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_onboarding_auth_intent"))).toBeNull();
});

test("Google linking callback fails closed when the source anonymous session is missing", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tribe_demo_uuid", "00000000-0000-4000-8000-000000000302");
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("tribe_onboarding_auth_intent", JSON.stringify({
      method: "GOOGLE",
      userId: "00000000-0000-4000-8000-000000000099",
      startedAt: Date.now(),
    }));
  });

  await page.goto("/auth/callback?code=mock-google-code");

  await expect(page).toHaveURL(/\/auth\/callback/);
  await expect(page.getByText(/Google連携を開始したゲームデータのセッションを確認できませんでした/)).toBeVisible();
  await expect(page.getByText(/このGoogleアカウントにはゲームデータがありません/)).toHaveCount(0);
});

test("Google linking callback restores the anonymous player when Google returns another user id", async ({ page }) => {
  const sourceUserId = "00000000-0000-4000-8000-000000000099";
  await page.addInitScript(({ sourceUserId }) => {
    localStorage.setItem("tribe_demo_uuid", sourceUserId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    localStorage.setItem("mock_oauth_callback_user_id", "00000000-0000-4000-8000-000000000302");
    localStorage.setItem("tribe_onboarding_auth_intent", JSON.stringify({
      method: "GOOGLE",
      userId: sourceUserId,
      startedAt: Date.now(),
    }));
  }, { sourceUserId });

  await page.goto("/auth/callback?code=mock-google-code");

  await expect(page).toHaveURL(/\/auth\/callback/);
  await expect(page.getByText(/選択されたGoogleアカウントは別のユーザーに登録されています/)).toBeVisible();
  await expect.poll(async () => page.evaluate(() => ({
    userId: localStorage.getItem("tribe_demo_uuid"),
    authMode: localStorage.getItem("mock_auth_mode"),
  }))).toEqual({ userId: sourceUserId, authMode: "ANONYMOUS" });
  await expect(page.getByText(/このGoogleアカウントにはゲームデータがありません/)).toHaveCount(0);
});

test("existing Google login returns directly to the game without the war-entry dialog", async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000099";
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("tribe_existing_google_login_intent", JSON.stringify({ startedAt: Date.now() }));
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: "Google Player",
      current_base_id: "neon_tower",
      favorite_character_id: "char_reiji_01",
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{
      user_id: userId,
      step_id: "AUTHENTICATION",
    }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{
      user_id: userId,
      auth_method: "GOOGLE",
    }]));
  });

  await page.goto("/");

  await expect(page.getByText("TAP TO START")).toBeHidden();
  await expect(page.locator(".header-mobile")).toBeVisible();
  await expect(page.getByRole("button", { name: "抗争に参入する" })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_existing_google_login_intent"))).toBeNull();
});

test("a core onboarding authority failure uses the canonical error dialog and retries in place", async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000303";
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("mock_onboarding_state_error", "true");
    localStorage.setItem("tribe_existing_google_login_intent", JSON.stringify({ startedAt: Date.now(), sourceUserId: userId }));
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: "Authority Error",
      current_base_id: "shinjuku",
      favorite_character_id: "char_reiji_01",
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: userId, auth_method: "GOOGLE" }]));
  });

  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "続きから" }).click();

  const errorDialog = page.getByRole("dialog", { name: "エラー" });
  await expect(errorDialog).toBeVisible();
  await expect(errorDialog).toContainText("プレイヤーデータを確認できませんでした。再度お試しください。");
  await expect(errorDialog.getByRole("button", { name: "再試行" })).toBeVisible();
  await expect(page.getByText("プレイヤーデータを確認中")).toHaveCount(0);
  await expect(page.locator(".header-mobile")).toHaveCount(0);

  await page.evaluate(() => localStorage.removeItem("mock_onboarding_state_error"));
  await errorDialog.getByRole("button", { name: "再試行" }).click();
  await expect(errorDialog).toHaveCount(0);
  await expect(page.locator(".header-mobile")).toContainText("Authority Error");
});

test("OAuth callback ignores the restored old session and bootstraps the exchanged Google account", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("p0_google_callback_fixture_seeded") === "true") return;
    localStorage.setItem("p0_google_callback_fixture_seeded", "true");
    const oldId = "00000000-0000-4000-8000-000000000301";
    const googleId = "00000000-0000-4000-8000-000000000302";
    localStorage.setItem("tribe_demo_uuid", oldId);
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("mock_oauth_callback_user_id", googleId);
    localStorage.setItem("mock_oauth_exchange_delay_ms", "250");
    localStorage.setItem("tribe_existing_google_login_intent", JSON.stringify({
      startedAt: Date.now(),
      sourceUserId: oldId,
    }));
    sessionStorage.setItem("tribe-neon.home-resume-visual.v1", JSON.stringify({
      userId: oldId,
      backgroundUrl: "/backgrounds/town_shinjuku.webp",
      leaderImageUrl: "/characters/reiji.webp",
      leaderName: "旧セッション",
    }));
    localStorage.setItem("mock_db_users", JSON.stringify([
      { id: oldId, username: "旧セッション", current_base_id: "shinjuku", favorite_character_id: "char_reiji_01", cash: 1111, neon_diamonds: 11 },
      { id: googleId, username: "正しいGoogle", current_base_id: "shibuya", favorite_character_id: "char_ageha_01", cash: 8765, neon_diamonds: 87 },
    ]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([
      { id: `old_${oldId}`, user_id: oldId, character_id: "char_reiji_01", level: 3, awakening_level: 0 },
      { id: `google_${googleId}`, user_id: googleId, character_id: "char_ageha_01", level: 8, awakening_level: 1 },
    ]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([
      { user_id: oldId, step_id: "AUTHENTICATION" },
      { user_id: googleId, step_id: "AUTHENTICATION" },
    ]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([
      { user_id: oldId, auth_method: "GOOGLE" },
      { user_id: googleId, auth_method: "GOOGLE" },
    ]));
    localStorage.setItem("mock_db_guilds", JSON.stringify([
      { id: "guild-google-owner", name: "正しいギルド", level: 2, member_capacity: 10 },
    ]));
    localStorage.setItem("mock_db_guild_members", JSON.stringify([
      { guild_id: "guild-google-owner", user_id: googleId, role: "MEMBER" },
    ]));
  });

  await page.goto("/auth/callback?code=mock-google-code");
  await page.waitForTimeout(100);
  await expect(page).toHaveURL(/\/auth\/callback/);
  await expect(page.getByText("Googleログインを完了しています...")).toBeVisible();

  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  await expect(page.locator(".header-mobile")).toContainText("正しいGoogle");
  await expect(page.locator(".header-mobile")).toContainText("正しいギルド");
  await expect(page.locator(".header-mobile-stat-cash")).toHaveText("8,765");
  await expect(page.getByAltText("正しいGoogleのリーダー")).toBeVisible();
  await expect(page.locator(".header-mobile")).not.toContainText("旧セッション");
  await expect(page.locator('[data-home-resume-shell="true"]')).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_demo_uuid"))).toBe("00000000-0000-4000-8000-000000000302");
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_existing_google_login_intent"))).toBeNull();
});

test("Google identity collision can be cancelled without changing anonymous tutorial data", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.goto("/?account_switch=google");

  await expect(page.getByRole("dialog", { name: "登録済みのGoogleアカウントが見つかりました" })).toBeVisible();
  await page.getByRole("button", { name: "別のGoogleアカウントを選ぶ" }).click();
  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  const state = await page.evaluate(() => ({
    mode: localStorage.getItem("mock_auth_mode"),
    intent: localStorage.getItem("tribe_onboarding_auth_intent"),
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"),
  }));
  expect(state.mode).toBe("ANONYMOUS");
  expect(state.intent).toBeNull();
  expect(state.progress[0].step_id).toBe("COMPLETE");
});

test("authentication and account warning screens can return to title without discarding tutorial data", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "チュートリアルを続ける" }).click();
  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  await page.getByRole("button", { name: "タイトルに戻る" }).click();
  await expect(page.getByText("TAP TO START")).toBeVisible();
  await expect(page.getByText("ゲームデータを保存")).toBeHidden();

  await page.goto("/?account_switch=google");
  await expect(page.getByRole("dialog", { name: "登録済みのGoogleアカウントが見つかりました" })).toBeVisible();
  await page.getByRole("button", { name: "タイトルに戻る" }).click();
  await expect(page.getByText("TAP TO START")).toBeVisible();
  await expect(page).not.toHaveURL(/account_switch=/);
  const state = await page.evaluate(() => ({
    mode: localStorage.getItem("mock_auth_mode"),
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"),
  }));
  expect(state.mode).toBe("ANONYMOUS");
  expect(state.progress[0].step_id).toBe("COMPLETE");
});

test("Google OAuth callback converts an existing-identity error into the collision dialog", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.goto("/auth/callback?error=identity_already_exists&error_code=identity_already_exists&error_description=Identity%20is%20already%20linked%20to%20another%20user");
  await expect(page).toHaveURL(/account_switch=google/);
  await expect(page.getByRole("dialog", { name: "登録済みのGoogleアカウントが見つかりました" })).toBeVisible();
  await page.getByRole("button", { name: "別のGoogleアカウントを選ぶ" }).click();
  await expect(page).not.toHaveURL(/account_switch=/);
});

test("Google identity collision discards only anonymous data and resumes the existing save", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.addInitScript(() => {
    const existingId = "00000000-0000-4000-8000-000000000200";
    localStorage.setItem("mock_google_identity_collision", "true");
    localStorage.setItem("mock_existing_google_user_id", existingId);
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: existingId, provider: "google" }]));
    const users = JSON.parse(localStorage.getItem("mock_db_users") || "[]");
    users.push({ id: existingId, username: "既存Google", current_base_id: "shibuya", favorite_character_id: "char_ageha_01" });
    localStorage.setItem("mock_db_users", JSON.stringify(users));
    const progress = JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]");
    progress.push({ user_id: existingId, step_id: "AUTHENTICATION" });
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify(progress));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: existingId, auth_method: "GOOGLE" }]));
  });
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "チュートリアルを続ける" }).click();
  await page.getByRole("button", { name: "Googleアカウントを連携" }).click();
  await page.getByRole("button", { name: "既存データへ切り替える" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_demo_uuid"))).toBe("00000000-0000-4000-8000-000000000200");
  await expect(page.locator(".header-mobile")).toBeVisible();
  const state = await page.evaluate(() => ({
    discarded: localStorage.getItem("mock_discarded_anonymous_user_id"),
    users: JSON.parse(localStorage.getItem("mock_db_users") || "[]"),
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"),
  }));
  expect(state.discarded).toBe("00000000-0000-4000-8000-000000000099");
  expect(state.users.some((row: any) => row.id === state.discarded)).toBe(false);
  expect(state.users.find((row: any) => row.id === "00000000-0000-4000-8000-000000000200")?.username).toBe("既存Google");
  expect(state.progress.some((row: any) => row.user_id === state.discarded)).toBe(false);
});

test("Google account switch keeps tutorial data when the authenticated identity has no game profile", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.addInitScript(() => {
    const existingId = "00000000-0000-4000-8000-000000000204";
    localStorage.setItem("mock_google_identity_collision", "true");
    localStorage.setItem("mock_existing_google_user_id", existingId);
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: existingId, provider: "google" }]));
  });
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "チュートリアルを続ける" }).click();
  await page.getByRole("button", { name: "Googleアカウントを連携" }).click();
  await page.getByRole("button", { name: "既存データへ切り替える" }).click();

  await expect(page.getByText("このGoogleアカウントにはゲームデータがありません。現在のチュートリアルデータは保持されています。別のGoogleアカウントを選んでください。")).toBeVisible();
  const state = await page.evaluate(() => ({
    userId: localStorage.getItem("tribe_demo_uuid"),
    mode: localStorage.getItem("mock_auth_mode"),
    discarded: localStorage.getItem("mock_discarded_anonymous_user_id"),
    users: JSON.parse(localStorage.getItem("mock_db_users") || "[]"),
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"),
  }));
  expect(state.userId).toBe("00000000-0000-4000-8000-000000000099");
  expect(state.mode).toBe("ANONYMOUS");
  expect(state.discarded).toBeNull();
  expect(state.users.some((row: any) => row.id === state.userId)).toBe(true);
  expect(state.progress.some((row: any) => row.user_id === state.userId && row.step_id === "COMPLETE")).toBe(true);
});

test("email identity collision verifies credentials before discard and resumes the existing save", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.addInitScript(() => {
    const existingId = "00000000-0000-4000-8000-000000000201";
    localStorage.setItem("mock_existing_email_password", "existing-pass");
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: existingId, provider: "email", email: "existing@example.com" }]));
    const users = JSON.parse(localStorage.getItem("mock_db_users") || "[]");
    users.push({ id: existingId, username: "既存Email", current_base_id: "ikebukuro", favorite_character_id: "char_mio_01" });
    localStorage.setItem("mock_db_users", JSON.stringify(users));
    const progress = JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]");
    progress.push({ user_id: existingId, step_id: "AUTHENTICATION" });
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify(progress));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: existingId, auth_method: "EMAIL" }]));
  });
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);
  await page.getByPlaceholder("メールアドレス").fill("existing@example.com");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("existing-pass");
  await page.getByRole("button", { name: "メールアカウントを連携" }).click();
  await expect(page.getByRole("dialog", { name: "既存のゲームデータが見つかりました" })).toBeVisible();
  await page.getByRole("button", { name: "既存データへ切り替える" }).click();

  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_demo_uuid"))).toBe("00000000-0000-4000-8000-000000000201");
  await expect(page.locator(".header-mobile")).toBeVisible();
  const users = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_users") || "[]"));
  expect(users.some((row: any) => row.id === "00000000-0000-4000-8000-000000000099")).toBe(false);
  expect(users.find((row: any) => row.id === "00000000-0000-4000-8000-000000000201")?.username).toBe("既存Email");
});

test("email account switch keeps anonymous data when the destination authority is incomplete", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.addInitScript(() => {
    const existingId = "00000000-0000-4000-8000-000000000202";
    localStorage.setItem("mock_existing_email_password", "existing-pass");
    localStorage.setItem("mock_db_auth_identities", JSON.stringify([{ user_id: existingId, provider: "email", email: "unsafe@example.com" }]));
    const users = JSON.parse(localStorage.getItem("mock_db_users") || "[]");
    users.push({ id: existingId, username: "未完了Email" });
    localStorage.setItem("mock_db_users", JSON.stringify(users));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([]));
  });
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);
  await page.getByPlaceholder("メールアドレス").fill("unsafe@example.com");
  await page.getByPlaceholder("パスワード（6文字以上）").fill("existing-pass");
  await page.getByRole("button", { name: "メールアカウントを連携" }).click();
  await page.getByRole("button", { name: "既存データへ切り替える" }).click();

  await expect(page.getByText(/既存のメール認証済みゲームデータを確認できませんでした/)).toBeVisible();
  const state = await page.evaluate(() => ({
    userId: localStorage.getItem("tribe_demo_uuid"),
    discarded: localStorage.getItem("mock_discarded_anonymous_user_id"),
    users: JSON.parse(localStorage.getItem("mock_db_users") || "[]"),
  }));
  expect(state.userId).toBe("00000000-0000-4000-8000-000000000099");
  expect(state.discarded).toBeNull();
  expect(state.users.some((row: any) => row.id === state.userId)).toBe(true);
});

test("Google OAuth cancellation returns to onboarding and can be retried", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.goto("/?error=access_denied&error_description=cancelled");
  await openCompletedAnonymousAuthentication(page);

  await expect(page.getByText("Google連携はキャンセルされました。もう一度お試しください。")).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "Googleアカウントを連携" }).click();
  await expect(page.getByText("ゲームデータを保存")).toBeHidden();
});

test("two supported identities cannot complete tutorial authentication", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.addInitScript(() => {
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("mock_session_identity_providers", JSON.stringify(["email", "google"]));
  });
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);

  await expect(page.getByText("メールとGoogleの両方が検出されました。データ保護のため認証完了を中止しました。")).toBeVisible();
  const state = await page.evaluate(() => ({
    progress: JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"),
    methods: JSON.parse(localStorage.getItem("mock_db_user_account_auth_methods") || "[]"),
  }));
  expect(state.progress[0].step_id).toBe("COMPLETE");
  expect(state.methods).toEqual([]);
});

test("a completed account with two auth methods is blocked on revisit", async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000099";
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_session_identity_providers", JSON.stringify(["email", "google"]));
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: "認証済み",
      current_base_id: "neon_tower",
      favorite_character_id: "char_reiji_01",
    }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{
      id: `starter_${userId}`,
      user_id: userId,
      character_id: "char_reiji_01",
      level: 1,
      awakening_level: 0,
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "AUTHENTICATION" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: userId, auth_method: "EMAIL" }]));
  });
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);

  await expect(page.getByText("アカウント認証エラー")).toBeVisible();
  await expect(page.getByText(/ゲームデータへのアクセスを停止しました/)).toBeVisible();
  await expect(page.getByRole("button", { name: "ログアウトして戻る" })).toBeVisible();
});

test("switching from a recorded email method to Google is refused", async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000099";
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("mock_session_identity_providers", JSON.stringify(["google"]));
    localStorage.setItem("mock_db_users", JSON.stringify([{
      id: userId,
      username: "認証待ち",
      current_base_id: "neon_tower",
      favorite_character_id: "char_reiji_01",
    }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{
      id: `starter_${userId}`,
      user_id: userId,
      character_id: "char_reiji_01",
      level: 1,
      awakening_level: 0,
    }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "COMPLETE" }]));
    localStorage.setItem("mock_db_user_account_auth_methods", JSON.stringify([{ user_id: userId, auth_method: "EMAIL" }]));
  });
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);

  await expect(page.getByText("A different authentication method is already linked")).toBeVisible();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]"));
  expect(progress[0].step_id).toBe("COMPLETE");
});

test("an expired Google linking intent is discarded", async ({ page }) => {
  await seedCompletedAnonymous(page);
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000099";
    localStorage.setItem("tribe_onboarding_auth_intent", JSON.stringify({
      method: "GOOGLE",
      userId,
      startedAt: Date.now() - 31 * 60 * 1000,
    }));
  });
  await page.goto("/");
  await openCompletedAnonymousAuthentication(page);

  await expect(page.getByText("ゲームデータを保存")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_onboarding_auth_intent"))).toBeNull();
});

test.describe("X in-app browser Google OAuth guard", () => {
  test.describe("iOS", () => {
    test.use({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Twitter for iPhone/10.50",
    });

    test("blocks OAuth before it starts and retains the invitation URL", async ({ page }) => {
      await page.goto("/?invite=FRIEND-X-IOS");
      await page.getByText("TAP TO START").click();
      await page.getByRole("button", { name: "データをお持ちの方" }).click();
      await page.locator(".auth-btn-google").click();

      await expect(page.getByText("Googleログインを続けるには、SafariまたはChromeでTRIBE NEONを開いてください。")).toBeVisible();
      const externalLink = page.getByRole("link", { name: "ブラウザで開く" });
      await expect(externalLink).toHaveAttribute("href", /\?invite=FRIEND-X-IOS$/);
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("mock_auth_mode"))).toBeNull();
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_existing_google_login_intent"))).toBeNull();
    });
  });

  test.describe("Android", () => {
    test.use({
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 TwitterAndroid/10.50 Chrome/131.0 Mobile Safari/537.36",
    });

    test("blocks anonymous identity linking before OAuth starts", async ({ page }) => {
      await seedCompletedAnonymous(page);
      await page.goto("/?invite=FRIEND-X-ANDROID");
      await openCompletedAnonymousAuthentication(page);
      await expect(page.getByText("ゲームデータを保存")).toBeVisible();
      await page.getByRole("button", { name: "Googleアカウントを連携" }).click();

      await expect(page.getByText("Googleログインを続けるには、SafariまたはChromeでTRIBE NEONを開いてください。")).toBeVisible();
      await expect(page.getByRole("link", { name: "ブラウザで開く" })).toHaveAttribute("href", /\?invite=FRIEND-X-ANDROID/);
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_onboarding_auth_intent"))).toBeNull();
    });
  });
});

test.describe("external browsers keep normal Google OAuth behavior", () => {
  for (const browserProfile of [
    { name: "Safari", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" },
    { name: "Chrome", userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36" },
  ]) {
    test.describe(browserProfile.name, () => {
      test.use({ userAgent: browserProfile.userAgent });
      test("starts Google OAuth and uses the existing intent contract", async ({ page }) => {
        await page.goto("/?invite=DIRECT-BROWSER");
        await page.getByText("TAP TO START").click();
        await page.getByRole("button", { name: "データをお持ちの方" }).click();
        await page.locator(".auth-btn-google").click();

        await expect.poll(async () => page.evaluate(() => localStorage.getItem("mock_auth_mode"))).toBe("GOOGLE");
        await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_existing_google_login_intent"))).not.toBeNull();
        await expect.poll(async () => page.evaluate(() => localStorage.getItem("mock_last_oauth_redirect_to")))
          .toBe(`${new URL(page.url()).origin}/auth/callback?invite=DIRECT-BROWSER`);
        await expect(page.getByText("外部ブラウザで開いてください")).toBeHidden();
      });
    });
  }
});

test("OAuth callback restores the persisted session and retains the invitation code", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tribe_demo_uuid", "00000000-0000-4000-8000-000000000888");
    localStorage.setItem("mock_auth_mode", "GOOGLE");
  });
  await page.goto("/auth/callback?invite=CALLBACK-FRIEND");

  await expect(page).toHaveURL(/\/\?invite=CALLBACK-FRIEND$/);
  await expect(page.getByText("TAP TO START")).toBeVisible();
});

test("OAuth callback restores a remembered KPI destination when the provider drops return_to", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("tribe_demo_uuid", "00000000-0000-4000-8000-000000000888");
    localStorage.setItem("mock_auth_mode", "GOOGLE");
    localStorage.setItem("tribe_oauth_return_intent", JSON.stringify({
      returnTo: "/admin/kpi",
      origin: window.location.origin,
      startedAt: Date.now(),
    }));
  });
  await page.goto("/auth/callback?code=mock-google-code");

  await expect(page).toHaveURL(/\/admin\/kpi$/);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("tribe_oauth_return_intent"))).toBeNull();
});

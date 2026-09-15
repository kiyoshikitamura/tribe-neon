import { expect, test } from "@playwright/test";

const seedProfile = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("settings_mobile_seeded") === "1") return;
    sessionStorage.setItem("settings_mobile_seeded", "1");
    const userId = "00000000-0000-4000-8000-0000000000b1";
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "設定確認", bio: "新宿で活動中", current_base_id: "shinjuku", favorite_character_id: "char_reiji_01", title_equipped: "半グレの首領" }]));
    localStorage.setItem("mock_db_feature_operating_states", JSON.stringify([{ feature_key: "PRE_OPEN", state: "OPEN" }]));
    localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: "settings-char-1", user_id: userId, character_id: "char_reiji_01", level: 1, awakening_level: 0 }]));
  });
};

const enterGame = async (page: import("@playwright/test").Page) => {
  const tapToStart = page.getByRole("button", { name: "TAP TO START" });
  const continueButton = page.getByRole("button", { name: "続きから" });
  const header = page.locator(".header-mobile");
  await expect(tapToStart.or(continueButton).or(header)).toBeVisible();
  if (await tapToStart.isVisible()) await tapToStart.click();
  if (await continueButton.isVisible()) await continueButton.click();
  await expect(header).toBeVisible();
  const loginBonus = page.locator(".login-bonus-modal-overlay");
  await loginBonus.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await loginBonus.isVisible()) {
    await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  }
};

const openSettings = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await enterGame(page);
  await page.getByRole("button", { name: /MENU/ }).click();
  await page.getByRole("dialog", { name: "ホームメニュー" }).getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.locator(".editable-setting-section").first()).toBeVisible();
};

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`Settings profile edit geometry is usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedProfile(page);
    await openSettings(page);
    await expect(page.getByText("ホーム演出", { exact: true })).toHaveCount(0);
    const profile = page.locator(".editable-setting-section").first();
    await expect(profile.locator("input, textarea, select")).toHaveCount(0);
    await profile.getByRole("button", { name: "編集" }).click();
    const name = profile.getByLabel("プレイヤー名");
    const bio = profile.getByLabel("自己紹介");
    const save = profile.getByRole("button", { name: "保存", exact: true });
    const cancel = profile.getByRole("button", { name: "キャンセル" });
    const geometry = await profile.evaluate((node) => {
      const controls = Array.from(node.querySelectorAll<HTMLElement>("label,input,textarea,select,button"));
      const rects = controls.map((control) => ({ tag: control.tagName, text: control.textContent?.trim() || "", rect: control.getBoundingClientRect().toJSON(), fontSize: getComputedStyle(control).fontSize }));
      const fieldOverlap = Array.from(node.querySelectorAll<HTMLElement>(".settings-field")).some((field) => {
        const label = field.querySelector("label")?.getBoundingClientRect();
        const control = field.querySelector("input,textarea,select")?.getBoundingClientRect();
        return Boolean(label && control && label.bottom > control.top);
      });
      const actionButtons = Array.from(node.querySelectorAll<HTMLElement>(".settings-edit-actions button")).map((button) => button.getBoundingClientRect());
      const actionOverlap = actionButtons.length === 2 && actionButtons[0].right > actionButtons[1].left;
      return { rects, fieldOverlap, actionOverlap, maxHeight: getComputedStyle(node).maxHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
    });
    await expect(name).toBeVisible();
    await expect(bio).toBeVisible();
    await expect(save).toBeVisible();
    await expect(cancel).toBeVisible();
    expect(await name.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    expect((await name.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual(viewport.height);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.maxHeight).toBe("none");
    expect(geometry.fieldOverlap).toBe(false);
    expect(geometry.actionOverlap).toBe(false);
    const interactiveRects = geometry.rects.filter((item) => ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(item.tag));
    for (let index = 1; index < interactiveRects.length; index += 1) expect(interactiveRects[index].rect.y).toBeGreaterThanOrEqual(interactiveRects[index - 1].rect.y);
  });
}

test("Settings profile cancel and save keep the existing persistence authority", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedProfile(page);
  await openSettings(page);
  const profile = page.locator(".editable-setting-section").first();
  await profile.getByRole("button", { name: "編集" }).click();
  await profile.getByLabel("プレイヤー名").fill("取消確認");
  await profile.getByRole("button", { name: "キャンセル" }).click();
  await expect(profile).toContainText("設定確認");
  await profile.getByRole("button", { name: "編集" }).click();
  await profile.getByLabel("プレイヤー名").fill("保存確認");
  await profile.getByRole("button", { name: "保存", exact: true }).click();
  const saved = page.getByRole("dialog", { name: "保存完了" });
  await expect(saved).toBeVisible();
  await saved.getByRole("button", { name: "OK" }).click();
  await page.reload();
  await enterGame(page);
  await page.getByRole("button", { name: /MENU/ }).click();
  await page.getByRole("dialog", { name: "ホームメニュー" }).getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.locator(".editable-setting-section").first()).toContainText("保存確認");
});

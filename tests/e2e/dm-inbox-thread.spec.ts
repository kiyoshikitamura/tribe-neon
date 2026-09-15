import { expect, test, type Page } from "@playwright/test";

const currentUserId = "00000000-0000-4000-8000-000000000701";
const userAId = "00000000-0000-4000-8000-000000000702";
const userBId = "00000000-0000-4000-8000-000000000703";

async function seedDmState(page: Page) {
  await page.addInitScript(({ currentId, firstId, secondId }) => {
    localStorage.setItem("tribe_demo_uuid", currentId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    const todayJst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{ user_id: currentId, current_day: 1, total_logins: 1, last_claimed_date: todayJst }]));
    localStorage.setItem("mock_db_users", JSON.stringify([
      { id: currentId, username: "検証ユーザー", level: 5, current_base_id: "shinjuku" },
      { id: firstId, username: "アキラ", level: 5, current_base_id: "shinjuku" },
      { id: secondId, username: "ミナト", level: 5, current_base_id: "shinjuku" },
    ]));
    localStorage.setItem("mock_db_direct_messages", JSON.stringify([
      { id: "dm-a-1", sender_id: firstId, recipient_id: currentId, message: "前の連絡です", created_at: "2026-09-01T10:00:00.000Z", is_read: true },
      { id: "dm-a-2", sender_id: currentId, recipient_id: firstId, message: "確認しました", created_at: "2026-09-01T10:05:00.000Z", is_read: true },
      { id: "dm-b-1", sender_id: secondId, recipient_id: currentId, message: "新しい連絡です", created_at: "2026-09-01T11:00:00.000Z", is_read: false },
    ]));
  }, { currentId: currentUserId, firstId: userAId, secondId: userBId });
}

async function enterGame(page: Page) {
  await page.goto("/");
  await page.getByText("TAP TO START").click();
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const welcomeAction = page.getByRole("button", { name: "抗争に参入する" });
  await welcomeAction.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await welcomeAction.isVisible()) await welcomeAction.click();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`DM一覧から会話確認と送信ができる ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedDmState(page);
    await enterGame(page);

    const communityButton = page.getByRole("button", { name: "コミュニティ" });
    await expect(communityButton).toBeVisible();
    await communityButton.click();
    await expect(page.locator(".tribe-chat-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: "全体", exact: true })).toHaveClass(/active/);
    await page.getByRole("button", { name: /個人\(DM\)/ }).click();

    const panel = page.locator(".tribe-chat-panel");
    const inbox = panel.locator('[aria-label="DM一覧"]');
    await expect(inbox.getByRole("button")).toHaveCount(2);
    await expect(inbox.getByRole("button").first()).toContainText("ミナト");
    await expect(inbox.getByRole("button").first()).toContainText("新しい連絡です");
    await expect(inbox.getByLabel("未読1件")).toBeVisible();
    await expect(inbox.getByRole("button").nth(1)).toContainText("アキラ");

    await inbox.getByRole("button", { name: "アキラとの会話を開く" }).click();
    await expect(panel.getByText("前の連絡です", { exact: true })).toBeVisible();
    await expect(panel.getByText("確認しました", { exact: true })).toBeVisible();

    await panel.getByPlaceholder("暗号DMを入力...").fill("次の連絡です");
    await panel.getByRole("button", { name: "送信", exact: true }).click();
    await expect(panel.getByText("次の連絡です", { exact: true })).toBeVisible();
    await expect(panel.locator(".tribe-dm-thread-header strong")).toHaveText("アキラ");
    await expect(panel.locator(".tribe-dm-thread-header strong")).not.toHaveText(/^(null|undefined)$/i);

    await panel.getByRole("button", { name: "DM一覧に戻る" }).click();
    await expect(panel.locator('[aria-label="DM一覧"]')).toBeVisible();
    const geometry = await panel.evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);

    await panel.getByRole("button", { name: "BBSを開く" }).click();
    await expect(page.locator(".bbs-view-container")).toBeVisible();
    await expect(page.getByRole("button", { name: "ショップは準備中です" })).toContainText("準備中");
  });
}

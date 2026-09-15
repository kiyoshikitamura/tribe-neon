import { expect, test } from "@playwright/test";

const helperText = "アプリのダウンロード不要でプレイできます。";
const legalLinks = [
  { name: "利用規約", href: "/legal/terms" },
  { name: "プライバシーポリシー", href: "/legal/privacy" },
  { name: "特定商取引法に基づく表記", href: "/legal/tokusho" },
] as const;

test("初期HTMLから補足文と正式なリーガル導線を認識できる", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const html = await response.text();

  expect(html).toContain(helperText);
  for (const legal of legalLinks) {
    expect(html).toContain(`href="${legal.href}"`);
    expect(html).toContain(legal.name);
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1280, height: 900 },
]) {
  test(`タイトルの補足文とリーガル導線が表示領域内に収まる ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/");

    const tapToStart = page.getByRole("button", { name: "TAP TO START" });
    const helper = page.getByText(helperText, { exact: true });
    const navigation = page.getByRole("navigation", { name: "法的情報" });
    await expect(tapToStart).toBeVisible();
    await expect(helper).toBeVisible();
    await expect(navigation).toBeVisible();

    const geometry = await page.locator(".title-view-container").evaluate((container) => {
      const tap = container.querySelector<HTMLElement>(".title-tap-text")!;
      const helperTextElement = container.querySelector<HTMLElement>(".title-play-note")!;
      const links = Array.from(container.querySelectorAll<HTMLElement>(".title-legal-links a"));
      const containerRect = container.getBoundingClientRect();
      const tapRect = tap.getBoundingClientRect();
      const helperRect = helperTextElement.getBoundingClientRect();
      const linkRects = links.map((link) => link.getBoundingClientRect());

      return {
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
        tapBottom: tapRect.bottom,
        helperTop: helperRect.top,
        helperBottom: helperRect.bottom,
        minLinkHeight: Math.min(...linkRects.map((rect) => rect.height)),
        linksWithinViewport: linkRects.every((rect) => (
          rect.left >= containerRect.left - 1
          && rect.right <= containerRect.right + 1
          && rect.bottom <= containerRect.bottom + 1
        )),
      };
    });

    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.helperTop).toBeGreaterThanOrEqual(geometry.tapBottom);
    expect(geometry.helperBottom).toBeLessThanOrEqual(viewport.height);
    expect(geometry.minLinkHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.linksWithinViewport).toBe(true);

    for (const legal of legalLinks) {
      await expect(navigation.getByRole("link", { name: legal.name })).toHaveAttribute("href", legal.href);
    }
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test("3つのリーガル操作はゲーム開始扱いにならず戻る操作でタイトルへ復帰できる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  for (const legal of legalLinks) {
    await page.getByRole("navigation", { name: "法的情報" }).getByRole("link", { name: legal.name }).click();
    await expect(page).toHaveURL(new RegExp(`${legal.href}$`));
    await expect(page.getByRole("heading", { name: legal.name, level: 1 })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "TAP TO START" })).toBeVisible();
    await expect(page.getByRole("button", { name: "はじめから" })).toHaveCount(0);
  }
});

test("TAP TO STARTは従来どおり開始選択を開く", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await expect(page.getByRole("button", { name: "はじめから" })).toBeVisible();
  await expect(page.getByRole("button", { name: "データをお持ちの方" })).toBeVisible();
});

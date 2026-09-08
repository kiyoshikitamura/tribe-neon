import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`rich gacha: result order, detail, tutorial CTA, replay ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/qa/presentation?scenario=gacha-character-v3");
    const shell = page.locator('[data-gacha-presentation="arrival"]');
    await expect(shell).toHaveAttribute("data-stage", "OPENING");
    await expect(page.locator(".cg-card-back")).toHaveCount(0);
    await expect(page.locator(".cg-approach img")).toHaveCount(3);
    await page.getByRole("button", { name: "SKIP", exact: true }).click();
    await expect(shell).toHaveAttribute("data-stage", "SUMMARY");
    const cards = page.locator(".cg-mini");
    await expect(cards).toHaveCount(10);
    expect(await cards.locator(".cg-mini-rarity").allTextContents()).toEqual(["N", "R", "SR", "SSR", "N", "SR", "R", "SSR", "R", "SR"]);
    const rects = await cards.evaluateAll((nodes) => nodes.map((node) => ({x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y})));
    expect(new Set(rects.slice(0, 5).map((rect) => rect.y)).size).toBe(1);
    expect(rects[5].y).toBeGreaterThan(rects[0].y);
    expect(await shell.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const expectedId = await cards.nth(7).getAttribute("data-character-id");
    await cards.nth(7).click();
    await expect(page.locator(".cg-reveal")).toHaveAttribute("data-character-id", expectedId!);
    await expect(page.locator(".cg-reveal blockquote")).not.toBeEmpty();
    await page.getByRole("button", { name: "一覧へ戻る", exact: true }).click();
    await expect(cards).toHaveCount(10);
    await page.getByRole("button", { name: "編成へ進む" }).click();
    await expect(shell).toHaveCount(0);
    await expect(page.locator("[data-gacha-v3-fixture]")).toHaveAttribute("data-destination", "character");
    await page.getByRole("button", { name: "演出を再生" }).click();
    await expect(shell).toHaveAttribute("data-stage", "OPENING");
  });
}

test("SSR typing completes on tap; skip cancels timers; single normal pull closes", async ({ page }) => {
  await page.goto("/qa/presentation?scenario=gacha-character-v3&single=true&tutorial=false");
  await page.clock.install();
  await page.getByRole("button", { name: "ガチャ結果を開く", exact: true }).click();
  await page.clock.runFor(650);
  const shell = page.locator(".cg-shell");
  await expect(shell).toHaveAttribute("data-stage", "QUOTE");
  await expect(page.locator(".cg-reveal")).not.toHaveAttribute("data-character-id");
  await page.locator(".cg-reveal").click();
  const quote = page.locator(".cg-quote-intro blockquote");
  expect(await quote.textContent()).toBe(await quote.getAttribute("aria-label"));
  await page.getByRole("button", { name: "SKIP", exact: true }).click();
  await page.clock.runFor(5000);
  await expect(shell).toHaveAttribute("data-stage", "SUMMARY");
  await expect(page.locator(".cg-mini")).toHaveCount(1);
  await page.getByRole("button", { name: "ガチャへ戻る" }).click();
  await expect(shell).toHaveCount(0);
});

test("N/R/SR advance directly; fast taps complete animation without skipping cards", async ({ page }) => {
  await page.goto("/qa/presentation?scenario=gacha-character-v3");
  await page.clock.install();
  await page.getByRole("button", { name: "ガチャ結果を開く", exact: true }).click();
  await page.clock.runFor(650);
  const reveal = page.locator(".cg-reveal");
  await reveal.dblclick();
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "SETTLED");
  await expect(page.locator(".cg-top>span")).toHaveText("1 / 10");
  await expect(reveal.locator("blockquote")).not.toBeEmpty();
  await page.clock.runFor(250);
  await reveal.click();
  await expect(page.locator(".cg-top>span")).toHaveText("2 / 10");
  await page.clock.runFor(800);
  await reveal.click();
  await expect(page.locator(".cg-top>span")).toHaveText("3 / 10");
  await expect(reveal.locator("blockquote")).not.toBeEmpty();
  await expect(page.locator(".gacha-character-logo-gate")).toHaveCount(0);
});

test("reduced motion and keyboard keep controls reachable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/qa/presentation?scenario=gacha-character-v3&single=true");
  await page.getByRole("button", { name: "ガチャ結果を開く", exact: true }).click();
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "SETTLED");
  await page.keyboard.press("Escape");
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "SUMMARY");
  await page.getByRole("button", { name: "編成へ進む" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".cg-mini")).toBeFocused();
});

test("cold images gate the entire scene and arrival animation", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/characters/**", async (route) => { await gate; await route.continue(); });
  await page.goto("/qa/presentation?scenario=gacha-character-v3", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status")).toHaveText("仲間を迎える準備中…");
  await expect(page.locator(".cg-city, .cg-approach, .cg-reveal")).toHaveCount(0);
  release();
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "OPENING");
  expect(await page.locator(".cg-approach img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.getByRole("button", { name: "SKIP", exact: true }).click();
  await expect(page.locator(".cg-summary")).toBeVisible();
  expect(await page.locator(".cg-summary img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.locator(".cg-mini")).toHaveCount(10);
});

test("background failure supports image-only retry and text results", async ({ page }) => {
  await page.route("**/gacha/arrival/tokyo-alley.webp", (route) => route.abort());
  await page.goto("/qa/presentation?scenario=gacha-character-v3");
  await expect(page.getByRole("status")).toHaveText("画像を読み込めませんでした");
  await expect(page.locator(".cg-city")).toHaveCount(0);
  await page.unroute("**/gacha/arrival/tokyo-alley.webp");
  await page.getByRole("button", { name: "画像を再読み込み" }).click();
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "OPENING");
  await page.route("**/gacha/arrival/tokyo-alley.webp", (route) => route.abort());
  await page.reload();
  await page.getByRole("button", { name: "獲得結果を文字で確認" }).click();
  await expect(page.locator(".cg-loading li")).toHaveCount(10);
  await page.getByRole("button", { name: "編成へ進む" }).click();
  await expect(page.locator("[data-gacha-v3-fixture]")).toHaveAttribute("data-destination", "character");
});

import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`rich gacha: result order, detail, tutorial CTA, replay ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/qa/presentation?scenario=gacha-character-v3");
    const shell = page.locator('[data-gacha-presentation="arrival"]');
    await expect(shell).toHaveAttribute("data-stage", "OPENING");
    await expect(page.locator(".cg-card-back")).toHaveCount(0);
    await expect(page.locator(".cg-approach")).toHaveCount(0);
    await expect(page.locator(".cg-city-scene img")).toHaveCount(7);
    await page.getByRole("button", { name: "SKIP", exact: true }).click();
    await expect(shell).toHaveAttribute("data-stage", "SUMMARY");
    const cards = page.locator(".cg-mini");
    await expect(cards).toHaveCount(10);
    await expect(cards.nth(5).locator(".cg-acquisition-badge")).toHaveAttribute("src", "/ui/rarity/badge-awakening-plus-1.png");
    await expect(cards.locator("small")).toHaveCount(0);
    expect(await cards.locator(".cg-rarity-badge").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("alt")))).toEqual(["N", "R", "SR", "SSR", "N", "SR", "R", "SSR", "R", "SR"]);
    const rects = await cards.evaluateAll((nodes) => nodes.map((node) => ({x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y})));
    expect(new Set(rects.slice(0, 5).map((rect) => rect.y)).size).toBe(1);
    expect(rects[5].y).toBeGreaterThan(rects[0].y);
    await expect.poll(() => shell.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const expectedId = await cards.nth(7).getAttribute("data-character-id");
    await cards.nth(7).click();
    await expect(page.locator(".cg-reveal")).toHaveAttribute("data-character-id", expectedId!);
    await expect(page.locator(".cg-reveal-copy>blockquote")).not.toBeEmpty();
    const revealBox = await page.locator(".cg-reveal").boundingBox();
    const shellBox = await shell.boundingBox();
    expect(revealBox!.width).toBeCloseTo(shellBox!.width, 0);
    expect(revealBox!.height).toBeGreaterThanOrEqual(shellBox!.height - 1);
    const portraitBox = await page.locator(".cg-portrait").boundingBox();
    const copyBox = await page.locator(".cg-reveal-copy").boundingBox();
    expect(copyBox!.y - portraitBox!.y).toBeGreaterThan(viewport.height * .35);
    await expect(page.locator(".cg-stats dd").first()).toHaveCSS("color", "rgb(243, 237, 224)");
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
  await expect(page.locator(".cg-opening")).toBeEnabled();
  await page.waitForTimeout(300);
  await page.clock.install();
  await page.getByRole("button", { name: "ガチャ結果を開く", exact: true }).click();
  await page.clock.runFor(650);
  const shell = page.locator(".cg-shell");
  await expect(shell).toHaveAttribute("data-stage", "QUOTE");
  await expect(page.locator(".cg-reveal")).not.toHaveAttribute("data-character-id");
  await page.locator(".cg-reveal").dispatchEvent("click");
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
  await expect(page.locator(".cg-opening")).toBeEnabled();
  await page.waitForTimeout(300);
  await page.clock.install();
  await page.getByRole("button", { name: "ガチャ結果を開く", exact: true }).click();
  await page.clock.runFor(650);
  const reveal = page.locator(".cg-reveal");
  await reveal.dblclick();
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "SETTLED");
  await expect(page.locator(".cg-top>span")).toHaveText("1 / 10");
  await expect(reveal.locator(".cg-reveal-copy>blockquote")).not.toBeEmpty();
  await page.clock.runFor(250);
  await reveal.click();
  await expect(page.locator(".cg-top>span")).toHaveText("2 / 10");
  await expect(page.locator(".cg-shell")).not.toHaveClass(/cg-waiting/);
  await page.clock.runFor(800);
  await reveal.click();
  await expect(page.locator(".cg-top>span")).toHaveText("3 / 10");
  await expect(reveal.locator(".cg-reveal-copy>blockquote")).not.toBeEmpty();
  await expect(page.locator(".gacha-character-logo-gate")).toHaveCount(0);
});

test("SSR uses a simple reveal without added light layers", async ({ page }) => {
  await page.goto("/qa/presentation?scenario=gacha-character-v3&single=true&rarity=SSR");
  await page.getByRole("button", { name: "ガチャ結果を開く", exact: true }).click();
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "QUOTE");
  await page.locator(".cg-reveal").click();
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "SETTLED");
  await expect(page.locator(".cg-ssr-transition")).toHaveCount(0);
  await expect(page.locator(".cg-rarity-badge")).toHaveAttribute("src", "/ui/rarity/rarity-badge-ssr.png");
  await expect(page.locator(".cg-rarity-line>span")).toHaveCount(1);
});
test("intro holds TAP until the four then three city sequence completes", async ({ page }) => {
  const startTime = new Date("2026-09-08T00:00:00Z");
  await page.clock.install({ time: startTime });
  await page.clock.pauseAt(startTime);
  await page.goto("/qa/presentation?scenario=gacha-character-v3");
  await expect(page.locator(".cg-shell")).not.toHaveClass(/cg-waiting/);
  const tap = page.getByRole("button", { name: "ガチャ結果を開く", exact: true });
  await expect(tap).toBeDisabled();
  await expect(page.locator(".cg-opening-copy")).toHaveCount(0);
  await expect(page.locator(".cg-city-group-0 .cg-city-scene")).toHaveCount(4);
  expect(await page.locator(".cg-city-group-1 .cg-city-scene>span").allTextContents()).toEqual(["新宿", "渋谷", "六本木"]);
  await page.clock.runFor(2900);
  await expect(tap).toBeDisabled();
  await page.clock.runFor(110);
  await expect(tap).toBeEnabled();
  await expect(page.locator(".cg-opening-copy")).toBeVisible();
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
  expect(await page.locator(".cg-city-scene img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.getByRole("button", { name: "SKIP", exact: true }).click();
  await expect(page.locator(".cg-summary")).toBeVisible();
  expect(await page.locator(".cg-summary img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.locator(".cg-mini")).toHaveCount(10);
});

test("background failure supports image-only retry and text results", async ({ page }) => {
  await page.route("**/bg/bg_street_yokohama.jpg", (route) => route.abort());
  await page.goto("/qa/presentation?scenario=gacha-character-v3");
  await expect(page.getByRole("status")).toHaveText("画像を読み込めませんでした");
  await expect(page.locator(".cg-city")).toHaveCount(0);
  await page.unroute("**/bg/bg_street_yokohama.jpg");
  await page.getByRole("button", { name: "画像を再読み込み" }).click();
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "OPENING");
  await page.route("**/bg/bg_street_yokohama.jpg", (route) => route.abort());
  await page.reload();
  await page.getByRole("button", { name: "獲得結果を文字で確認" }).click();
  await expect(page.locator(".cg-loading li")).toHaveCount(10);
  await page.getByRole("button", { name: "編成へ進む" }).click();
  await expect(page.locator("[data-gacha-v3-fixture]")).toHaveAttribute("data-destination", "character");
});

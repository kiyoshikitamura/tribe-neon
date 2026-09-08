import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const openTransitionFixture = async (
  page: Page,
  options: { delay?: number; rarity?: "ssr"; outcome?: "error" } = {},
) => {
  const query = new URLSearchParams({ scenario: "gacha-asset-transition" });
  if (options.delay !== undefined) query.set("delay", String(options.delay));
  if (options.rarity) query.set("rarity", options.rarity);
  if (options.outcome) query.set("outcome", options.outcome);
  await page.goto(`/qa/presentation?${query}`);
  return page.locator("[data-gacha-asset-transition-fixture]");
};

const completeCommonOpening = async (page: Page) => {
  const gate = page.locator("[data-gacha-logo-gate]");
  await expect(gate).toBeVisible();
  await expect(gate.locator('img[src="/branding/tribe-neon-logo.png"]')).toBeVisible();
  await expect(gate).toContainText("TAP!");
  const promptFont = await gate.locator("span").evaluate((node) => getComputedStyle(node).fontFamily);
  expect(promptFont).toContain("Rajdhani");
  await gate.click();
  await expect(page.locator('[data-gacha-transition-state="show_results"]')).toBeVisible();
};

test("character arrival and SKIP remain safe at iPhone 14 geometry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openTransitionFixture(page, { delay: 500 });
  await page.locator('[data-gacha-category="CHARACTER"]').click();
  await page.getByRole("button", { name: "10回 10,000キャッシュ" }).click();
  await expect(page.locator(".cg-city-scene img")).toHaveCount(7);
  const skip = page.getByRole("button", { name: "SKIP", exact: true });
  await expect(skip).toBeVisible();
  const rect = await skip.boundingBox();
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(390);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(844);
  await skip.click();
  await expect(page.locator(".cg-mini")).toHaveCount(10);
  await expect(fixture).toHaveAttribute("data-mutation-count", "1");
});

const readFirstPaintedProcessingSurface = (page: Page) => page.evaluate(() => new Promise<Record<string, unknown>>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const overlay = document.querySelector<HTMLElement>('[data-gacha-transition-state="processing"]');
    const effect = overlay?.querySelector<HTMLElement>("[data-gacha-short-effect]");
    const stage = overlay?.querySelector<HTMLElement>("[data-gacha-common-opening]");
    const city = overlay?.querySelector<HTMLElement>(".gacha-opening-city");
    const fieldset = document.querySelector<HTMLFieldSetElement>("fieldset.gacha-view-root");
    const style = overlay ? getComputedStyle(overlay) : null;
    const stageStyle = stage ? getComputedStyle(stage) : null;
    const rect = overlay?.getBoundingClientRect();
    const stageRect = stage?.getBoundingClientRect();
    const hit = overlay && rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
    const leftHit = overlay && rect ? document.elementFromPoint(rect.left + 2, rect.top + rect.height / 2) : null;
    const rightHit = overlay && rect ? document.elementFromPoint(rect.right - 2, rect.top + rect.height / 2) : null;
    const cityStyle = city ? getComputedStyle(city) : null;
    resolve({
      state: overlay?.dataset.gachaTransitionState ?? null,
      mounted: Boolean(effect),
      domExists: Boolean(overlay),
      pending: fieldset?.disabled ?? false,
      display: style?.display ?? null,
      visibility: style?.visibility ?? null,
      opacity: style?.opacity ?? null,
      zIndex: style?.zIndex ?? null,
      position: style?.position ?? null,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      stageWidth: stageRect?.width ?? 0,
      stageHeight: stageRect?.height ?? 0,
      visual: overlay?.dataset.gachaVisual ?? null,
      surfaceBackgroundSize: style?.backgroundSize ?? null,
      stageBackground: stageStyle?.backgroundImage ?? null,
      topmost: Boolean(hit && overlay?.contains(hit)),
      leftTopmost: Boolean(leftHit && overlay?.contains(leftHit)),
      rightTopmost: Boolean(rightHit && overlay?.contains(rightHit)),
      cityBackground: cityStyle?.backgroundImage ?? null,
      motionState: cityStyle?.animationPlayState ?? null,
      motionName: cityStyle?.animationName ?? null,
    });
  }));
}));

for (const category of ["SKILL", "EQUIPMENT"] as const) {
  test(`${category} free draw first painted post-tap state is the topmost processing surface`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTransitionFixture(page, { delay: 1500 });
    await page.locator(`[data-gacha-category="${category}"]`).click();
    await page.getByRole("button", { name: "本日10連無料" }).click();
    const painted = await readFirstPaintedProcessingSurface(page);
    expect(painted).toMatchObject({
      state: "processing",
      mounted: true,
      domExists: true,
      pending: true,
      display: "grid",
      visibility: "visible",
      opacity: "1",
      zIndex: "20000",
      position: "fixed",
      visual: "tokyo-night-opening",
      stageBackground: "none",
      topmost: true,
      leftTopmost: true,
      rightTopmost: true,
      motionState: "running",
      motionName: "gacha-city-wake",
    });
    expect(String(painted.cityBackground)).toContain("bg_street_shibuya.jpg");
    expect(Number(painted.width)).toBeGreaterThanOrEqual(389);
    expect(Number(painted.height)).toBeGreaterThanOrEqual(843);
    expect(Number(painted.stageWidth)).toBeCloseTo(Number(painted.width), 0);
    expect(Number(painted.stageHeight)).toBeCloseTo(Number(painted.height), 0);
    await completeCommonOpening(page);
    await expect(page.locator(".gacha-result-card")).toHaveCount(10);
  });
}

for (const category of ["SKILL", "EQUIPMENT"] as const) {
  for (const delay of [0, 500, 1500, 3000]) {
    test(`${category} ${delay}ms response keeps foreground processing feedback`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const fixture = await openTransitionFixture(page, { delay });
      await page.locator(`[data-gacha-category="${category}"]`).click();
      const draw = page.getByRole("button", { name: "1回 1,000キャッシュ" });
      await draw.click();
      await expect(page.locator('[data-gacha-transition-state="processing"]')).toBeVisible();
      await expect(page.locator("[data-gacha-short-effect]")).toHaveAttribute("aria-label", "ガチャ抽選結果を同期中");
      if (delay >= 500) {
        await page.waitForTimeout(Math.min(Math.max(100, delay - 300), 900));
        await expect(page.locator('[data-gacha-transition-state="processing"]')).toBeVisible();
      }
      await completeCommonOpening(page);
      await expect(page.locator(".gacha-result-card")).toHaveCount(1);
      await expect(fixture).toHaveAttribute("data-mutation-count", "1");
    });
  }
}

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`asset transition is mobile-contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const fixture = await openTransitionFixture(page, { delay: 500 });
    await page.locator('[data-gacha-category="SKILL"]').click();
    await page.getByRole("button", { name: "10回 10,000キャッシュ" }).click();
    await expect(page.locator("[data-gacha-short-effect]")).toBeVisible();
    const geometry = await fixture.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    await completeCommonOpening(page);
    await expect(page.locator(".gacha-result-card")).toHaveCount(10);
  });
}

test("fast response retains a recognizable minimum transition", async ({ page }) => {
  await openTransitionFixture(page);
  await page.locator('[data-gacha-category="SKILL"]').click();
  const startedAt = Date.now();
  await page.getByRole("button", { name: "1回 1,000キャッシュ" }).click();
  await expect(page.locator("[data-gacha-short-effect]")).toBeVisible();
  await expect(page.locator("[data-gacha-logo-gate]")).toBeVisible();
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1250);
  await completeCommonOpening(page);
});

test("server-authoritative SSR adds only the brief pre-result presence pulse", async ({ page }) => {
  const fixture = await openTransitionFixture(page, { delay: 500, rarity: "ssr" });
  await page.locator('[data-gacha-category="EQUIPMENT"]').click();
  await page.getByRole("button", { name: "1回 1,000キャッシュ" }).click();
  await expect(page.locator('[data-gacha-transition-state="processing"]')).toBeVisible();
  await expect(fixture).toHaveAttribute("data-ssr-pulse-count", "1");
  await completeCommonOpening(page);
  await expect(page.locator('[data-gacha-transition-state="show_results"] .rarity-ssr')).toHaveCount(1);
});

test("draw error ends the transition and restores the retryable canonical state", async ({ page }) => {
  await openTransitionFixture(page, { delay: 500, outcome: "error" });
  await page.locator('[data-gacha-category="SKILL"]').click();
  await page.getByRole("button", { name: "1回 1,000キャッシュ" }).click();
  await expect(page.locator("[data-gacha-short-effect]")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "エラー" })).toBeVisible();
  await expect(page.locator("[data-gacha-short-effect]")).toHaveCount(0);
  await page.getByRole("dialog", { name: "エラー" }).getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "1回 1,000キャッシュ" })).toBeEnabled();
});

test("double tap remains exactly once while the transition owns the foreground", async ({ page }) => {
  const fixture = await openTransitionFixture(page, { delay: 1500 });
  await page.locator('[data-gacha-category="EQUIPMENT"]').click();
  const draw = page.getByRole("button", { name: "1回 1,000キャッシュ" });
  await draw.dblclick();
  await expect(page.locator("[data-gacha-short-effect]")).toBeVisible();
  await expect(fixture).toHaveAttribute("data-mutation-count", "1");
  await completeCommonOpening(page);
  await expect(page.locator(".gacha-result-card")).toHaveCount(1);
});

for (const category of ["SKILL", "EQUIPMENT"] as const) {
  for (const draw of [
    { name: "本日10連無料", count: 10 },
    { name: "1回 1,000キャッシュ", count: 1 },
    { name: "10回 10,000キャッシュ", count: 10 },
    { name: /チケット1回/, count: 1 },
    { name: /チケット10回/, count: 10 },
  ] as const) {
    test(`${category} ${String(draw.name)} uses the shared transition for ${draw.count} result(s)`, async ({ page }) => {
      await openTransitionFixture(page);
      await page.locator(`[data-gacha-category="${category}"]`).click();
      await page.getByRole("button", { name: draw.name }).click();
      await expect(page.locator("[data-gacha-short-effect]")).toBeVisible();
      await completeCommonOpening(page);
      await expect(page.locator(".gacha-result-card")).toHaveCount(draw.count);
    });
  }
}

for (const count of [1, 10] as const) {
  test(`CHARACTER ${count}-pull uses one common opening before per-character reveal`, async ({ page }) => {
    await openTransitionFixture(page);
    await page.locator('[data-gacha-category="CHARACTER"]').click();
    await page.getByRole("button", { name: count === 1 ? "1回 1,000キャッシュ" : "10回 10,000キャッシュ" }).click();
    await expect(page.locator("[data-gacha-common-opening]")).toBeVisible();
    await page.getByRole("button", { name: "ガチャ結果を開く", exact: true }).click();
    await expect(page.locator(".cg-reveal")).toBeVisible();
    if (count === 10) {
      await page.getByRole("button", { name: "SKIP", exact: true }).click();
      await expect(page.locator(".cg-mini")).toHaveCount(10);
    }
  });
}

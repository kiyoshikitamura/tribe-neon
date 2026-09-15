import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test(`Gacha six-surface mobile presentation ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/qa/presentation?scenario=gacha-production");
    const fixture = page.locator("[data-gacha-production-fixture]");
    await expect(fixture).toBeVisible();
    await expect(page.getByLabel("無料ガチャあり")).toBeVisible();
    await expect(page.getByLabel("無料ガチャあり")).toHaveText("FREE");
    await expect(page.locator(".gacha-product-banner img")).toHaveAttribute("src", /gacha_normal_character/);
    await expect(page.getByRole("button", { name: "本日10連無料" })).toBeVisible();
    await expect(page.locator(".gacha-category-tabs .free-badge-dot")).toHaveCount(3);
    const freeCta = page.getByRole("button", { name: "本日10連無料" });
    const offer = page.locator(".gacha-normal-offer");
    const freeGeometry = await Promise.all([freeCta.boundingBox(), offer.boundingBox()]);
    expect(freeGeometry[0]!.width).toBeGreaterThan(freeGeometry[1]!.width - 28);

    await page.getByRole("button", { name: "スペシャル" }).click();
    await expect(page.locator(".gacha-product-banner img")).toHaveAttribute("src", /gacha_sp_character/);
    await expect(page.getByText("COMING SOON")).toBeVisible();
    await expect(page.getByRole("button", { name: /回/ })).toHaveCount(0);
    await page.getByRole("button", { name: "ノーマル" }).click();

    for (const category of ["CHARACTER", "SKILL", "EQUIPMENT"] as const) {
      await page.locator(`[data-gacha-category="${category}"]`).click();
      for (const surface of ["ノーマル", "スペシャル"] as const) {
        await page.getByRole("button", { name: surface, exact: true }).click();
        const bannerImage = page.locator(".gacha-product-banner img");
        await expect.poll(() => bannerImage.evaluate((image) => {
          const banner = image as HTMLImageElement;
          return banner.complete && banner.naturalWidth > 0;
        })).toBe(true);
        const bannerGeometry = await page.locator(".gacha-product-banner").evaluate((node) => {
          const image = node.querySelector<HTMLImageElement>("img")!;
          const rect = image.getBoundingClientRect();
          const containerRect = node.getBoundingClientRect();
          const containerStyle = getComputedStyle(node);
          return {
            naturalRatio: image.naturalWidth / image.naturalHeight,
            renderedRatio: rect.width / rect.height,
            objectFit: getComputedStyle(image).objectFit,
            width: rect.width,
            containerWidth: containerRect.width,
            topInset: rect.top - containerRect.top,
            bottomInset: containerRect.bottom - rect.bottom,
            borderTop: Number.parseFloat(containerStyle.borderTopWidth),
            borderBottom: Number.parseFloat(containerStyle.borderBottomWidth),
          };
        });
        expect(bannerGeometry.naturalRatio).toBe(2);
        expect(bannerGeometry.renderedRatio).toBeCloseTo(bannerGeometry.naturalRatio, 2);
        expect(bannerGeometry.objectFit).toBe("contain");
        expect(bannerGeometry.width).toBeLessThanOrEqual(bannerGeometry.containerWidth);
        expect(bannerGeometry.topInset).toBeGreaterThanOrEqual(bannerGeometry.borderTop - 0.1);
        expect(bannerGeometry.bottomInset).toBeGreaterThanOrEqual(bannerGeometry.borderBottom - 0.1);
      }
    }
    await page.getByRole("button", { name: "ノーマル", exact: true }).click();

    const geometry = await fixture.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  });
}

test("Daily free entitlement badges are category-isolated and CASH does not consume them", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/presentation?scenario=gacha-production");

  await page.getByRole("button", { name: "本日10連無料" }).click();
  await expect(page.getByRole("button", { name: "本日10連無料" })).toHaveCount(0);
  await expect(page.getByText("本日の無料10連は使用済みです")).toHaveCount(0);
  await expect(page.locator(".gacha-category-tabs .free-badge-dot")).toHaveCount(2);
  await expect(page.getByLabel("無料ガチャあり")).toBeVisible();

  await page.getByRole("button", { name: /スキル/ }).first().click();
  await page.getByRole("button", { name: "1回 1,000キャッシュ" }).click();
  await expect(page.getByRole("button", { name: "本日10連無料" })).toBeVisible();
  await expect(page.locator(".gacha-category-tabs .free-badge-dot")).toHaveCount(2);

  await page.getByRole("button", { name: "本日10連無料" }).click();
  await page.getByRole("button", { name: /装備/ }).first().click();
  await page.getByRole("button", { name: "本日10連無料" }).click();
  await expect(page.locator(".gacha-category-tabs .free-badge-dot")).toHaveCount(0);
  await expect(page.getByLabel("無料ガチャあり")).toHaveCount(0);
});

test("Character, Skill and Equipment tabs remain interactive and drive the selected banner", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/presentation?scenario=gacha-production");

  for (const [category, banner] of [["CHARACTER", "gacha_normal_character"], ["SKILL", "gacha_normal_skill"], ["EQUIPMENT", "gacha_normal_equipment"]] as const) {
    const tab = page.locator(`[data-gacha-category="${category}"]`);
    await expect(tab).toBeEnabled();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".gacha-product-banner img")).toHaveAttribute("src", new RegExp(banner));
    await expect(page.getByRole("button", { name: "本日10連無料" })).toBeVisible();
  }
});

test("Daily authority loading never renders inferred free badges or a false consumed state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/presentation?scenario=gacha-authority-loading");
  await expect(page.getByText("無料10連の利用状況を確認中…")).toBeVisible();
  await expect(page.locator(".gacha-category-tabs .free-badge-dot")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "本日10連無料" })).toHaveCount(0);
  await expect(page.getByText("本日の無料10連は使用済みです")).toHaveCount(0);
});

test("No-entitlement and insufficient-resource states preserve the correct independent actions", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/qa/presentation?scenario=gacha-entitlement-empty");
  await expect(page.getByRole("button", { name: "本日10連無料" })).toHaveCount(0);
  await expect(page.getByText("本日の無料10連は使用済みです")).toHaveCount(0);
  await expect(page.getByLabel("キャッシュで引く")).toBeVisible();
  await expect(page.locator(".gacha-category-tabs .free-badge-dot")).toHaveCount(0);

  await page.goto("/qa/presentation?scenario=gacha-resource-empty");
  await expect(page.getByRole("button", { name: "本日10連無料" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "1回 1,000キャッシュ" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "10回 10,000キャッシュ" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /チケット1回/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /チケット10回/ })).toBeDisabled();
});

test("Canonical server rates are presented without client hardcoded ordering", async ({ page }) => {
  await page.goto("/qa/presentation?scenario=gacha-production");
  await page.getByRole("button", { name: "提供割合" }).click();
  const dialog = page.getByRole("dialog", { name: "提供割合" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("SSR");
  await expect(dialog).toContainText("2.00%");
});

for (const resultType of ["skill", "equipment"] as const) {
  test(`${resultType} ten-pull uses the compact result grammar`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/qa/presentation?scenario=gacha-${resultType}-result`);
    const result = page.locator(`[data-gacha-result-type="${resultType.toUpperCase()}"]`);
    await expect(result.locator(".gacha-result-card")).toHaveCount(10);
    await expect(result.locator(".gacha-result-name")).toHaveCount(10);
    await expect(result.locator(".gacha-result-rarity-frame")).toHaveCount(10);
    await expect(result.locator(`.gacha-result-rarity-frame[src*="${resultType}-frame-n.png"]`)).toHaveCount(2);
    await expect(result.locator(`.gacha-result-rarity-frame[src*="${resultType}-frame-r.png"]`)).toHaveCount(3);
    await expect(result.locator(`.gacha-result-rarity-frame[src*="${resultType}-frame-sr.png"]`)).toHaveCount(3);
    await expect(result.locator(`.gacha-result-rarity-frame[src*="${resultType}-frame-ssr.png"]`)).toHaveCount(2);
    await expect(result.locator('.gacha-result-asset-badge.is-new[src*="badge-new.png"]')).toHaveCount(3);
    await expect(result.locator('.gacha-result-asset-badge.is-progression[aria-label="限界突破 +3"]')).toBeVisible();
    await expect(result.locator('.gacha-result-asset-badge.is-progression[aria-label="限界突破 +3"]')).toHaveText('+3');
    await expect(result.locator('.gacha-result-asset-badge.is-progression img')).toHaveCount(0);
    await expect(result.locator('.gacha-result-card[data-ssr-glint="enabled"]')).toHaveCount(0);
    const geometry = await result.locator(".gacha-result-panel").evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      columns: getComputedStyle(node.querySelector(".gacha-result-grid")!).gridTemplateColumns.split(" ").length,
      frameAnimation: getComputedStyle(node.querySelector(".gacha-result-rarity-frame")!).animationName,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.columns).toBe(5);
    expect(geometry.frameAnimation).toBe("none");
  });

  test(`${resultType} one-pull keeps canonical frame and badge parity`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/qa/presentation?scenario=gacha-${resultType}-result-one`);
    const result = page.locator(`[data-gacha-result-type="${resultType.toUpperCase()}"]`);
    await expect(result.locator(".gacha-result-card")).toHaveCount(1);
    await expect(result.locator(`.gacha-result-rarity-frame[src*="${resultType}-frame-n.png"]`)).toBeVisible();
    await expect(result.locator('.gacha-result-asset-badge.is-new[src*="badge-new.png"]')).toBeVisible();
    await expect(result.locator(".gacha-result-name")).toHaveCount(1);
  });
}

import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
] as const;

type HomeScenario = "first-home-fresh" | "first-home-identity-loading" | "first-home-raid" | "first-home-guild-out" | "first-home-guild-in" | "first-home-guild-pending" | "first-home-favorite-missing" | "first-home-favorite-invalid" | "first-home-activity-self" | "first-home-character-tall" | "first-home-character-hair" | "first-home-campaign";

async function openHomeScenario(page: Page, scenario: HomeScenario) {
  await page.goto(`/qa/presentation?scenario=${scenario}`);
  await expect(page.locator(`[data-home-scenario="${scenario}"]`)).toBeVisible();
}

test("Home leader tap uses the approved line for the active character ID", async ({ page }) => {
  await openHomeScenario(page, "first-home-fresh");

  await page.getByRole("button", { name: "アゲハに話しかける" }).click();
  await expect(page.locator(".mypage-leader-line")).toHaveText("退屈してる暇ある？　夜はこれからでしょ。");
});

test("Home does not present a shared placeholder line when the character has no approved dialogue", async ({ page }) => {
  await openHomeScenario(page, "first-home-character-hair");

  await expect(page.getByRole("button", { name: /に話しかける$/ })).toHaveCount(0);
  await expect(page.locator(".mypage-leader-line")).toHaveCount(0);
});

async function installPrimaryCtaObserver(page: Page) {
  await page.addInitScript(() => {
    const observed: string[] = [];
    (window as Window & { __HOME_CTA_OBSERVED__?: string[] }).__HOME_CTA_OBSERVED__ = observed;
    const capture = () => {
      const text = document.querySelector<HTMLElement>(".mypage-primary-cta")?.textContent?.trim();
      if (text) observed.push(text);
    };
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(capture).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      capture();
    });
  });
}

const resumeSnapshot = {
  userId: "00000000-0000-4000-8000-000000000405",
  backgroundUrl: "/bg/bg_street_shibuya.jpg",
  leaderImageUrl: "/characters/reiji_transparent_asset.png",
  leaderName: "reiji",
};

test("reload uses the stable Home resume shell instead of branded boot loading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((snapshot) => {
    window.localStorage.setItem("tribe_demo_uuid", snapshot.userId);
    window.sessionStorage.setItem("tribe-neon.home-resume-visual.v1", JSON.stringify(snapshot));
  }, resumeSnapshot);
  await page.route("**/branding/title-key-visual.png", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-home-resume-shell="true"]')).toBeVisible();
  await expect(page.locator(".branded-loading")).toHaveCount(0);
  const stableGeometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>("[data-home-resume-shell]")!;
    const visual = document.querySelector<HTMLElement>(".home-resume-visual")!;
    const footer = document.querySelector<HTMLElement>(".home-resume-footer")!;
    return {
      shellHeight: shell.getBoundingClientRect().height,
      visualHeight: visual.getBoundingClientRect().height,
      footerBottom: footer.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    };
  });
  expect(stableGeometry.shellHeight).toBe(stableGeometry.viewportHeight);
  expect(stableGeometry.visualHeight).toBeGreaterThanOrEqual(300);
  expect(stableGeometry.footerBottom).toBeLessThanOrEqual(stableGeometry.viewportHeight);
  await page.screenshot({ path: "test-results/first-home-r5-resume-shell-390x844.png", fullPage: false });
  const resumeStages = await page.evaluate(() => window.__TRIBE_HOME_RELOAD_METRICS__?.stages);
  expect(resumeStages?.reload).toBe(0);
  expect(resumeStages?.homeShellReady).toBeGreaterThanOrEqual(0);
});

test("Home re-entry never presents a different cached Leader while the canonical Leader is decoded", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((snapshot) => {
    window.sessionStorage.setItem("tribe-neon.home-resume-visual.v1", JSON.stringify(snapshot));
  }, resumeSnapshot);
  await page.route("**/characters/ageha_transparent_asset.png*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await route.continue();
  });

  await page.goto("/qa/presentation?scenario=first-home-fresh", { waitUntil: "domcontentloaded" });
  const visual = page.locator(".mypage-visual-area");
  await expect(visual).toHaveAttribute("data-visual-readiness", "preparing");
  await expect(visual).not.toHaveClass(/has-resume-snapshot/);
  expect(await visual.evaluate((node) => getComputedStyle(node).backgroundImage)).toBe("none");
  await expect(page.locator(".mypage-visual-loading-leader")).toHaveCount(0);
  await page.screenshot({ path: "test-results/first-home-r5-reentry-placeholder-390x844.png", fullPage: false });

  await expect(visual).toHaveAttribute("data-visual-readiness", "ready");
  expect(await visual.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("bg_street_shinjuku.jpg");
  await expect(page.locator(".mypage-leader-layer.is-ssr")).toBeVisible();
});

test("Home reveals the Town and decoded Leader as one visual on a cold load and reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let delayedLeaderRequests = 0;
  let releaseLeader: () => void = () => undefined;
  const leaderGate = new Promise<void>((resolve) => { releaseLeader = resolve; });
  await page.route("**/characters/ageha_transparent_asset.png*", async (route) => {
    delayedLeaderRequests += 1;
    await leaderGate;
    await route.continue();
  });

  await page.goto("/qa/presentation?scenario=first-home-fresh", { waitUntil: "domcontentloaded" });
  const visual = page.locator(".mypage-visual-area");
  const home = page.locator('[data-home-interaction]');
  await expect(visual).toHaveAttribute("data-visual-readiness", "preparing");
  await expect(home).toHaveAttribute("data-home-interaction", "blocked");
  await expect(home).toHaveAttribute("inert", "");
  await expect(page.locator(".mypage-visual-loading")).toBeVisible();
  await expect(page.locator(".mypage-leader-layer")).toHaveCount(0);
  expect(await visual.evaluate((node) => getComputedStyle(node).backgroundImage)).toBe("none");

  releaseLeader();
  await expect(visual).toHaveAttribute("data-visual-readiness", "ready");
  await expect(home).toHaveAttribute("data-home-interaction", "ready");
  await expect(home).not.toHaveAttribute("inert", "");
  await expect(page.locator(".mypage-visual-loading")).toHaveCount(0);
  await expect(page.locator(".mypage-leader-layer.is-ssr")).toBeVisible();
  expect(await visual.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("bg_street_shinjuku.jpg");
  expect(delayedLeaderRequests).toBe(1);
  const readinessStages = await page.evaluate(() => window.__TRIBE_HOME_RELOAD_METRICS__?.stages);
  expect(readinessStages?.homeShellReady).toBeLessThanOrEqual(readinessStages?.townImageDecoded || 0);
  expect(readinessStages?.homeShellReady).toBeLessThanOrEqual(readinessStages?.leaderImageDecoded || 0);
  expect(readinessStages?.homeVisualReady).toBeGreaterThanOrEqual(readinessStages?.leaderImageDecoded || 0);

  await page.reload();
  await expect(page.locator(".mypage-visual-area")).toHaveAttribute("data-visual-readiness", "ready");
  await expect(page.locator(".mypage-leader-layer.is-ssr")).toBeVisible();
});

for (const viewport of viewports) {
  test(`production First Home follows the character-first FA hierarchy at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openHomeScenario(page, "first-home-fresh");

    const activity = page.locator(".mypage-live-ticker--visual");
    await expect(activity).toContainText("ACTIVITY");
    await expect(activity).toHaveAttribute("aria-label", "アクティビティ履歴を開く");
    await expect(activity.locator(".user-identity-row")).toContainText("NEON-R");
    await expect(activity).toContainText("「NEON CREW」を設立しました");
    await expect(activity).not.toContainText("SSRを獲得");
    await expect(page.locator(".mypage-leader-layer.is-ssr")).toBeVisible();
    await expect(page.locator(".mypage-visual-area")).not.toHaveClass(/mypage-event-raid/);
    await expect(page.locator(".header-mobile")).not.toContainText("自然回復停止");
    await expect(page.locator(".header-mobile")).toContainText("⚡");
    await expect(page.locator(".header-mobile-power")).toContainText("総合力");
    await expect(page.locator(".mypage-current-location")).toContainText("新宿");
    await expect(page.locator(".mypage-sub-icons-left .sub-icon-label")).toHaveText(["ボーナス", "ミッション", "ランキング", "レイド"]);
    await expect(page.locator(".mypage-sub-icons-right")).toHaveCount(0);
    await expect(page.locator(".footer-mobile .footer-item")).toHaveCount(5);
    await expect(page.locator(".footer-mobile .footer-label")).toHaveText(["マイページ", "コミュニティ", "キャラ", "ガチャ", "ショップ"]);

    const actionOrder = await page.locator(".mypage-circle-menu-area > button").evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label") || button.querySelector("img")?.getAttribute("alt")),
    );
    expect(actionOrder).toEqual(["ギルド", "バトル", "クエスト", "ギルドバトルは準備中です"]);
    await expect(page.locator(".circle-menu-label small")).toHaveCount(0);
    await expect(page.locator(".mypage-circle-menu-area")).toHaveAttribute("data-home-action-assets", "production-delivered");
    await expect(page.locator('[data-action-slot="guild"] img')).toHaveAttribute("src", "/menu/home_nav_guild.png");
    await expect(page.locator('[data-action-slot="fight"] img')).toHaveAttribute("src", "/menu/home_nav_pvp.png");
    await expect(page.locator('[data-action-slot="conquest"] img')).toHaveAttribute("src", "/menu/home_nav_quest.png");
    await expect(page.locator('[data-action-slot="war"] img')).toHaveAttribute("src", "/menu/home_nav_gvg.png");
    const normalizedAssetAlpha = async (selector: string) => page.locator(selector).evaluate((node) => {
      const image = node as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return {
        alpha: context.getImageData(100, 100, 1, 1).data[3],
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    });
    expect(await normalizedAssetAlpha('img[src="/menu/home_nav_raid.png"]')).toEqual({ alpha: 0, width: 1024, height: 1024 });
    expect(await normalizedAssetAlpha('[data-action-slot="war"] img')).toEqual({ alpha: 0, width: 1024, height: 1024 });
    await expect(page.getByRole("button", { name: "ギルドバトルは準備中です" })).toBeDisabled();
    const deckStyle = await page.locator(".mypage-circle-menu-area").evaluate((node) => ({
      backgroundImage: getComputedStyle(node).backgroundImage,
      borderWidths: [getComputedStyle(node).borderTopWidth, getComputedStyle(node).borderRightWidth, getComputedStyle(node).borderBottomWidth, getComputedStyle(node).borderLeftWidth],
    }));
    expect(deckStyle.backgroundImage).toContain("home_main_nav_night_reflection_bg.webp");
    expect(deckStyle.borderWidths).toEqual(["0px", "0px", "0px", "0px"]);
    const comingSoon = page.locator(".circle-menu-state-overlay");
    await expect(comingSoon).toHaveCSS("border-radius", "2px");

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      const visual = box(".mypage-visual-area");
      const leader = box(".mypage-leader-layer");
      const ticker = box(".mypage-live-ticker--visual");
      const view = document.querySelector<HTMLElement>(".mypage-view")!;
      const cta = box(".mypage-primary-cta");
      const banner = box(".mypage-event-banner-area");
      const mainContents = box(".mypage-circle-menu-area");
      const stageTransition = box(".mypage-stage-transition");
      const lowerContent = document.querySelector<HTMLElement>(".mypage-lower-content")!;
      const mainActionRects = [...document.querySelectorAll<HTMLElement>(".mypage-circle-menu-area > button")].map((node) => node.getBoundingClientRect());
      const footer = box(".footer-mobile");
      const shortcutWidth = Math.max(...[...document.querySelectorAll<HTMLElement>(".sub-icon-unit")].map((node) => node.getBoundingClientRect().width));
      const leaderNode = document.querySelector<HTMLElement>(".mypage-leader-layer.is-ssr")!;
      const leaderBefore = getComputedStyle(leaderNode, "::before");
      const leaderAfter = getComputedStyle(leaderNode, "::after");
      return {
        leaderRatio: leader.height / visual.height,
        activityClearsCharacterVisual: ticker.bottom <= visual.top + 1,
        activityToVisualGap: visual.top - ticker.bottom,
        viewPaddingTop: parseFloat(getComputedStyle(view).paddingTop),
        viewJustify: getComputedStyle(view).justifyContent,
        ctaHeight: cta.height,
        bannerStartsAboveFooter: banner.top < footer.top,
        mainContentsPrecedesBanner: mainContents.bottom <= banner.top + 1,
        mainContentsHeight: mainContents.height,
        stageToMainGap: mainContents.top - visual.bottom,
        visualBottom: visual.bottom,
        lowerContentTop: lowerContent.getBoundingClientRect().top,
        lowerPaddingTop: getComputedStyle(lowerContent).paddingTop,
        lowerMarginTop: getComputedStyle(lowerContent).marginTop,
        mainMarginTop: getComputedStyle(document.querySelector<HTMLElement>(".mypage-circle-menu-area")!).marginTop,
        stageTransitionHeight: stageTransition.height,
        stageTransitionBottom: visual.bottom - stageTransition.bottom,
        stageTransitionBackground: getComputedStyle(document.querySelector<HTMLElement>(".mypage-stage-transition")!).backgroundImage,
        stageTransitionPointerEvents: getComputedStyle(document.querySelector<HTMLElement>(".mypage-stage-transition")!).pointerEvents,
        leaderMask: getComputedStyle(leaderNode).maskImage || getComputedStyle(leaderNode).webkitMaskImage,
        mainActionsWithinContainer: mainActionRects.every((rect) => rect.left >= mainContents.left - 1 && rect.right <= mainContents.right + 1),
        mainContentBounds: { left: mainContents.left, right: mainContents.right },
        mainActionBounds: mainActionRects.map((rect) => ({ left: rect.left, right: rect.right })),
        mainActionWidths: mainActionRects.map((rect) => rect.width),
        mainActionTransforms: [...document.querySelectorAll<HTMLElement>(".mypage-circle-menu-area > button")].map((node) => getComputedStyle(node).transform),
        mainActionBackgrounds: [...document.querySelectorAll<HTMLElement>(".mypage-circle-menu-area > button")].map((node) => getComputedStyle(node).backgroundColor),
        mainActionOuterBorders: [...document.querySelectorAll<HTMLElement>(".mypage-circle-menu-area > button")].map((node) => {
          const style = getComputedStyle(node);
          return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
        }),
        shortcutWidth,
        shortcutArtworkSizes: [...document.querySelectorAll<HTMLElement>(".sub-png-icon")].map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
        bannerHeight: box(".banner-card").height,
        bannerObjectFit: getComputedStyle(document.querySelector(".banner-bg-img")!).objectFit,
        footerLabelSizes: [...document.querySelectorAll<HTMLElement>(".footer-label")].map((node) => parseFloat(getComputedStyle(node).fontSize)),
        locationHeight: box(".mypage-current-location").height,
        missionBadgePosition: getComputedStyle(document.querySelector(".small-badge-alert")!).position,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ctaDetailDisplay: (() => {
          const detail = document.querySelector(".mypage-primary-cta > span:not(.mypage-primary-cta-eyebrow)");
          return detail ? getComputedStyle(detail).display : "none";
        })(),
        ctaWrap: getComputedStyle(document.querySelector<HTMLElement>(".mypage-primary-cta")!).flexWrap,
        bannerFilter: getComputedStyle(document.querySelector(".banner-bg-img")!).filter,
        townBackgroundPosition: getComputedStyle(document.querySelector(".mypage-visual-area")!).backgroundPosition,
        ssrAuraAnimation: leaderBefore.animationName,
        ssrSweepAnimation: leaderAfter.animationName,
        leaderAnimation: getComputedStyle(leaderNode).animationName,
      };
    });
    expect(geometry.leaderRatio).toBeGreaterThanOrEqual(0.84);
    expect(geometry.activityClearsCharacterVisual).toBe(true);
    expect(geometry.activityToVisualGap).toBeLessThanOrEqual(3);
    expect(geometry.activityToVisualGap).toBeGreaterThanOrEqual(0);
    expect(geometry.viewPaddingTop).toBe(0);
    expect(geometry.viewJustify).toBe("flex-start");
    expect(geometry.shortcutWidth).toBeGreaterThanOrEqual(44);
    expect(geometry.shortcutWidth).toBeLessThanOrEqual(64);
    expect(geometry.ctaHeight).toBeLessThanOrEqual(54);
    expect(geometry.ctaDetailDisplay).toBe("none");
    expect(geometry.ctaWrap).toBe("nowrap");
    expect(geometry.bannerStartsAboveFooter).toBe(true);
    expect(geometry.mainContentsPrecedesBanner).toBe(true);
    expect(geometry.mainContentsHeight).toBeLessThanOrEqual(70);
    expect(geometry.stageToMainGap).toBeGreaterThanOrEqual(0);
    expect(geometry.stageToMainGap, JSON.stringify(geometry)).toBeLessThanOrEqual(1);
    expect(geometry.lowerContentTop).toBe(geometry.visualBottom);
    expect(geometry.lowerPaddingTop).toBe("0px");
    expect(geometry.lowerMarginTop).toBe("0px");
    expect(geometry.mainMarginTop).toBe("0px");
    expect(geometry.stageTransitionHeight).toBeGreaterThanOrEqual(40);
    expect(geometry.stageTransitionHeight).toBeLessThanOrEqual(60);
    expect(Math.abs(geometry.stageTransitionBottom)).toBeLessThanOrEqual(1);
    expect(geometry.stageTransitionBackground).toContain("linear-gradient");
    expect(geometry.stageTransitionPointerEvents).toBe("none");
    expect(geometry.leaderMask).toContain("linear-gradient");
    expect(geometry.mainActionsWithinContainer, JSON.stringify({ container: geometry.mainContentBounds, actions: geometry.mainActionBounds })).toBe(true);
    expect(Math.max(...geometry.mainActionWidths) - Math.min(...geometry.mainActionWidths), JSON.stringify({ widths: geometry.mainActionWidths, transforms: geometry.mainActionTransforms })).toBeLessThanOrEqual(1);
    expect(geometry.mainActionBackgrounds.every((background) => background === "rgba(0, 0, 0, 0)"), JSON.stringify(geometry.mainActionBackgrounds)).toBe(true);
    expect(geometry.mainActionOuterBorders.every((widths) => widths.every((width) => width === "0px"))).toBe(true);
    expect(new Set(geometry.shortcutArtworkSizes.map((size) => `${size.width}x${size.height}`)).size).toBe(1);
    expect(geometry.shortcutArtworkSizes.every((size) => size.width <= 24 && size.height <= 24)).toBe(true);
    expect(geometry.locationHeight).toBeLessThanOrEqual(28);
    expect(geometry.missionBadgePosition).toBe("absolute");
    expect(geometry.bannerHeight).toBeLessThanOrEqual(58);
    expect(geometry.bannerObjectFit).toBe("cover");
    expect(geometry.footerLabelSizes.every((size) => size <= 9)).toBe(true);
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(geometry.bannerFilter).toBe("none");
    expect(geometry.townBackgroundPosition).toContain("52%");
    expect(geometry.ssrAuraAnimation).toContain("mypage-ssr-leader-glow");
    expect(geometry.ssrSweepAnimation).toContain("mypage-ssr-leader-sweep");
    expect(geometry.leaderAnimation).toBe("none");

    await page.screenshot({ path: `test-results/first-home-r3-${viewport.width}x${viewport.height}.png`, fullPage: false });
  });
}

test("SSR aura and sweep visibly change over a short loop without moving the Leader", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomeScenario(page, "first-home-fresh");
  const sample = () => page.locator(".mypage-leader-layer.is-ssr").evaluate((leader) => {
    const aura = getComputedStyle(leader, "::before");
    const sweep = getComputedStyle(leader, "::after");
    return {
      auraOpacity: Number(aura.opacity),
      sweepOpacity: Number(sweep.opacity),
      sweepPosition: sweep.backgroundPosition,
      leaderTransform: getComputedStyle(leader).transform,
    };
  });
  const first = await sample();
  await page.waitForTimeout(850);
  const second = await sample();
  expect(Math.abs(first.auraOpacity - second.auraOpacity)).toBeGreaterThan(0.05);
  expect(second.sweepPosition).not.toBe(first.sweepPosition);
  expect(second.leaderTransform).toBe(first.leaderTransform);
});

test("raid discovery stays out of the Home stage while the authoritative raid banner remains available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomeScenario(page, "first-home-fresh");
  await expect(page.locator(".mypage-event-chip.raid")).toHaveCount(0);
  await expect(page.locator(".banner-dots .dot")).toHaveCount(4);

  await openHomeScenario(page, "first-home-raid");
  await expect(page.locator(".mypage-event-chip.raid")).toHaveCount(0);
  await expect(page.locator(".banner-dots .dot")).toHaveCount(4);
  await expect(page.locator(".mypage-live-ticker--visual")).toContainText("NEON-R");
  await expect(page.locator(".mypage-live-ticker--visual")).toContainText("「NEON CREW」を設立しました");
  await expect(page.locator(".mypage-power-panel")).toHaveCount(0);
  await page.locator(".mypage-current-location").click();
  await expect(page.getByRole("dialog", { name: "拠点移動" }).getByText("強敵襲来", { exact: true })).toBeVisible();
});

test("pre-open Home rotates exactly the two campaign banners and keeps ranking actions visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomeScenario(page, "first-home-campaign");
  await expect(page.locator(".banner-dots .dot")).toHaveCount(2);
  await expect(page.locator('.banner-card[data-banner-id="gvg-prep"]')).toBeVisible();
  await page.locator(".banner-arrow.right").click();
  const rankingBanner = page.locator('.banner-card[data-banner-id="guild-power-ranking"]');
  await expect(rankingBanner).toBeVisible();
  await rankingBanner.click();

  const dialog = page.getByRole("dialog", { name: "プレオープン限定ギルド総合力ランキングのご案内" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "閉じる", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "ランキングを見る", exact: true })).toBeVisible();
  const imageHeight = await dialog.locator(".campaign-keyvisual-dialog img").evaluate((node) => node.getBoundingClientRect().height);
  expect(imageHeight).toBeLessThanOrEqual(0.44 * 844 + 1);
});

for (const viewport of viewports) {
test(`Header MENU owns utilities at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await openHomeScenario(page, "first-home-fresh");
  const headerGeometry = await page.evaluate(async () => {
    const row = document.querySelector<HTMLElement>(".header-mobile-row1")!;
    const user = document.querySelector<HTMLElement>(".header-mobile-user")!;
    const progression = document.querySelector<HTMLElement>(".header-mobile-progression")!;
    const level = document.querySelector<HTMLElement>(".header-mobile-level-badge")!;
    const power = document.querySelector<HTMLElement>(".header-mobile-power strong")!;
    const menuButton = document.querySelector<HTMLElement>(".header-mobile-menu-button")!;
    const menuBadge = document.querySelector<HTMLElement>(".header-mobile-menu-badge")!;
    const header = document.querySelector<HTMLElement>(".header-mobile")!;
    const userName = user.querySelector<HTMLElement>("strong")!;
    const initialHeight = row.getBoundingClientRect().height;
    userName.textContent = "とても長いプレイヤー表示名テスト";
    level.textContent = "Lv.99 · EXP 99,999/999,999";
    power.textContent = "9,999,999";
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const userRect = user.getBoundingClientRect();
    const progressionRect = progression.getBoundingClientRect();
    const menuRect = menuButton.getBoundingClientRect();
    const badgeRect = menuBadge.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    return {
      initialHeight,
      finalHeight: row.getBoundingClientRect().height,
      userClearsProgression: userRect.right <= progressionRect.left + 1,
      progressionClearsMenu: progressionRect.right <= menuRect.left + 1,
      menuWithinViewport: menuRect.right <= document.documentElement.clientWidth,
      menuSafeTop: menuRect.top - rowRect.top,
      menuSafeRight: rowRect.right - menuRect.right,
      badgeHeaderSafeTop: badgeRect.top - headerRect.top,
      badgeHeaderSafeRight: headerRect.right - badgeRect.right,
      menuWidth: menuRect.width,
      menuHeight: menuRect.height,
      badgeInsideRow: badgeRect.top >= rowRect.top && badgeRect.right <= rowRect.right,
      badgeWithinHeader: badgeRect.top >= headerRect.top && badgeRect.right <= headerRect.right,
      badgeOutsideButtonBy: { top: menuRect.top - badgeRect.top, right: badgeRect.right - menuRect.right },
      levelWrap: getComputedStyle(level).whiteSpace,
      powerWrap: getComputedStyle(power.parentElement!).whiteSpace,
      numericVariant: getComputedStyle(level).fontVariantNumeric,
      usernameOverflow: getComputedStyle(userName).textOverflow,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(headerGeometry.finalHeight).toBe(headerGeometry.initialHeight);
  expect(headerGeometry.userClearsProgression).toBe(true);
  expect(headerGeometry.progressionClearsMenu).toBe(true);
  expect(headerGeometry.menuWithinViewport).toBe(true);
  expect(headerGeometry.menuSafeTop).toBeGreaterThanOrEqual(1);
  expect(headerGeometry.menuSafeRight).toBeGreaterThanOrEqual(2);
  expect(headerGeometry.badgeHeaderSafeTop).toBeGreaterThanOrEqual(8);
  expect(headerGeometry.badgeHeaderSafeRight).toBeGreaterThanOrEqual(8);
  expect(headerGeometry.menuWidth).toBeLessThanOrEqual(56);
  expect(headerGeometry.menuHeight).toBeLessThanOrEqual(32);
  expect(headerGeometry.badgeInsideRow).toBe(true);
  expect(headerGeometry.badgeWithinHeader).toBe(true);
  expect(headerGeometry.badgeOutsideButtonBy.top).toBeLessThanOrEqual(1);
  expect(headerGeometry.badgeOutsideButtonBy.right).toBeLessThanOrEqual(1);
  expect(headerGeometry.levelWrap).toBe("nowrap");
  expect(headerGeometry.powerWrap).toBe("nowrap");
  expect(headerGeometry.numericVariant).toContain("tabular-nums");
  expect(headerGeometry.usernameOverflow).toBe("ellipsis");
  expect(headerGeometry.horizontalOverflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "MENU" }).click();
  const menu = page.getByRole("dialog", { name: "ホームメニュー" });
  for (const label of ["設定", "お知らせ", "プレゼント", "バッグ"]) await expect(menu.getByRole("button", { name: label })).toBeVisible();
  const menuGeometry = await menu.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const cells = [...node.querySelectorAll<HTMLElement>("nav button")].map((cell) => cell.getBoundingClientRect());
    const icons = [...node.querySelectorAll<HTMLElement>("nav img")].map((icon) => icon.getBoundingClientRect());
    return {
      width: rect.width,
      cellHeights: cells.map((cell) => cell.height),
      iconSizes: icons.map((icon) => ({ width: icon.width, height: icon.height })),
    };
  });
  expect(menuGeometry.width).toBeLessThanOrEqual(232);
  expect(menuGeometry.cellHeights.every((height) => height <= 60)).toBe(true);
  expect(menuGeometry.iconSizes.every((size) => size.width <= 22 && size.height <= 22)).toBe(true);
  await expect(page.locator(".footer-mobile .footer-item")).toHaveCount(5);
  await expect(page.locator(".footer-mobile .footer-label")).toHaveText(["マイページ", "コミュニティ", "キャラ", "ガチャ", "ショップ"]);
});
}

test("SSR leader effect keeps a static aura when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomeScenario(page, "first-home-fresh");
  const effect = await page.locator(".mypage-leader-layer.is-ssr").evaluate((leader) => {
    const aura = getComputedStyle(leader, "::before");
    const sweep = getComputedStyle(leader, "::after");
    return {
      auraAnimation: aura.animationName,
      auraOpacity: Number(aura.opacity),
      sweepAnimation: sweep.animationName,
    };
  });
  expect(effect.auraAnimation).toBe("none");
  expect(effect.auraOpacity).toBeGreaterThan(0);
  expect(effect.sweepAnimation).toBe("none");
});

test("Home uses favorite_character_id instead of the formation leader and keeps cowboy-shot geometry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomeScenario(page, "first-home-fresh");
  const leader = page.locator(".mypage-leader-layer");
  await expect(leader).toHaveAttribute("data-character-authority", "char_ageha_01");
  const geometry = await leader.evaluate((node) => {
    const figure = node.querySelector<HTMLElement>(".character-presentation-home-hero")!;
    const image = node.querySelector<HTMLImageElement>(".character-presentation-character")!;
    const visual = document.querySelector<HTMLElement>(".mypage-visual-area")!;
    return {
      figureHeight: figure.getBoundingClientRect().height,
      visualHeight: visual.getBoundingClientRect().height,
      objectFit: getComputedStyle(image).objectFit,
      transform: getComputedStyle(image).transform,
      scale: getComputedStyle(figure).getPropertyValue("--character-home-scale").trim(),
      verticalOffset: getComputedStyle(figure).getPropertyValue("--character-home-offset-y").trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(geometry.figureHeight).toBe(geometry.visualHeight);
  expect(geometry.objectFit).toBe("contain");
  expect(geometry.transform).not.toBe("none");
  expect(geometry.scale).toBe("1.34");
  expect(geometry.verticalOffset).toBe("6px");
  expect(geometry.overflow).toBeLessThanOrEqual(1);
});

for (const scenario of ["first-home-fresh", "first-home-character-tall", "first-home-character-hair"] as const) {
  test(`Cowboy Shot keeps the frozen scale and lower vertical position for ${scenario}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHomeScenario(page, scenario);
    const geometry = await page.locator(".character-presentation-home-hero").evaluate((figure) => {
      const image = figure.querySelector<HTMLImageElement>(".character-presentation-character")!;
      const style = getComputedStyle(figure);
      return {
        scale: style.getPropertyValue("--character-home-scale").trim(),
        verticalOffset: style.getPropertyValue("--character-home-offset-y").trim(),
        imageTransform: getComputedStyle(image).transform,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.scale).toBe("1.34");
    expect(geometry.verticalOffset).toBe("6px");
    expect(geometry.imageTransform).not.toBe("none");
    expect(geometry.overflow).toBeLessThanOrEqual(1);
  });
}

for (const scenario of ["first-home-favorite-missing", "first-home-favorite-invalid"] as const) {
  test(`Home renders the canonical placeholder without formation fallback for ${scenario}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHomeScenario(page, scenario);
    const visual = page.locator(".mypage-visual-area");
    await expect(visual).toHaveAttribute("data-visual-readiness", "ready");
    await expect(page.locator('.mypage-leader-layer[data-character-authority="placeholder"]')).toBeVisible();
    await expect(page.locator(".mypage-leader-layer .character-presentation-missing")).toBeVisible();
    await expect(page.locator(".mypage-leader-layer .character-presentation-character")).toHaveCount(0);
  });
}

for (const viewport of viewports) {
  test(`Leader authority stays loading, then replaces skeleton with canonical art ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/qa/presentation?scenario=first-home-identity-loading", { waitUntil: "domcontentloaded" });
    const fixture = page.locator('[data-home-scenario="first-home-identity-loading"]');
    await expect(fixture).toHaveAttribute("data-identity-authority-ready", "false");
    await expect(page.locator(".user-identity-leader-loading")).toBeVisible();
    await expect(page.locator(".header-mobile .character-presentation-missing")).toHaveCount(0);
    await expect(page.locator(".mypage-leader-layer .character-presentation-missing")).toHaveCount(0);

    await expect(fixture).toHaveAttribute("data-identity-authority-ready", "true", { timeout: 3000 });
    await expect(page.locator(".header-mobile .character-presentation-character")).toBeVisible();
    await expect(page.locator(".mypage-leader-layer .character-presentation-character")).toBeVisible();
    await expect(page.locator(".mypage-visual-area")).toHaveAttribute("data-visual-readiness", "ready");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("Leader authority lifecycle remains stable across hard reload and My Page return", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomeScenario(page, "first-home-identity-loading");
  await expect(page.locator(".mypage-leader-layer .character-presentation-character")).toBeVisible({ timeout: 3000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".user-identity-leader-loading")).toBeVisible();
  await expect(page.locator(".mypage-leader-layer .character-presentation-character")).toBeVisible({ timeout: 3000 });
  await page.goto("/qa/presentation?scenario=gacha-production");
  await page.goto("/qa/presentation?scenario=first-home-identity-loading", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".mypage-leader-layer .character-presentation-character")).toBeVisible({ timeout: 3000 });
});

test("A transient canonical leader asset failure is retried instead of leaving a placeholder", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let failedOnce = false;
  await page.route("**/characters/ageha_transparent_asset.png*", async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await openHomeScenario(page, "first-home-fresh");
  await expect(page.locator(".header-mobile .character-presentation-character")).toBeVisible();
  await expect(page.locator(".mypage-leader-layer .character-presentation-character")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".header-mobile .character-presentation-missing")).toHaveCount(0);
  expect(failedOnce).toBe(true);
});

test("Activity uses shared identity and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomeScenario(page, "first-home-fresh");
  const ticker = page.locator(".mypage-live-ticker--visual");
  await expect(ticker.locator(".user-identity-row")).toContainText("NEON-R");
  const underlyingActivityIcon = ticker.locator(".user-identity-row img");
  await ticker.click();
  const dialog = page.getByRole("dialog", { name: "アクティビティ履歴" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".mypage-activity-log-row")).toHaveCount(7);
  await expect(dialog.locator("time")).toHaveCount(7);
  await expect(dialog.locator(".mypage-activity-log-row").first()).toHaveAttribute("data-activity-id", "qa-activity-y");
  await expect(dialog.locator('[data-activity-id="qa-activity-z"]')).toHaveCount(0);
  await expect(dialog.locator('[data-activity-id="qa-activity-raid"]')).toContainText("RAID OWNER");
  await expect(dialog.locator('[data-activity-id="qa-activity-raid"]')).toContainText("雷神連合総長が撃破されました");
  await expect(dialog.locator('[data-activity-id="qa-activity-expired"]')).toHaveCount(0);
  const dialogGeometry = await dialog.evaluate((node) => {
    const header = node.querySelector<HTMLElement>(".canonical-dialog-header")!;
    const body = node.querySelector<HTMLElement>(".canonical-dialog-body")!;
    const scroller = node.querySelector<HTMLElement>(".mypage-activity-log")!;
    const firstRow = node.querySelector<HTMLElement>(".mypage-activity-log-row")!;
    const footer = node.querySelector<HTMLElement>(".canonical-dialog-actions")!;
    const headerRect = header.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const firstRect = firstRow.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const overlay = node.parentElement!;
    const activityIcon = document.querySelector<HTMLElement>(".mypage-live-ticker--visual .user-identity-row img")!;
    const activityIconRect = activityIcon.getBoundingClientRect();
    const overlayStyle = getComputedStyle(overlay);
    const dialogStyle = getComputedStyle(node);
    const headerStyle = getComputedStyle(header);
    const logStyle = getComputedStyle(scroller);
    const animationHasOpacity = (target: Element) => target.getAnimations().some((animation) => {
      const keyframes = animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [];
      return keyframes.some((keyframe) => typeof keyframe.opacity !== "undefined");
    });
    const isOpaque = (color: string) => !/rgba\([^)]*,\s*(?:0(?:\.\d+)?|\.\d+)\s*\)$/.test(color);
    return {
      bodyClips: getComputedStyle(body).overflow === "hidden",
      scrollerScrolls: scroller.scrollHeight > scroller.clientHeight,
      headerOverlap: Math.max(0, headerRect.bottom - firstRect.top),
      bodyStartsBelowHeader: bodyRect.top >= headerRect.bottom - 0.5,
      bodyEndsAboveFooter: bodyRect.bottom <= footerRect.top + 0.5,
      underlyingActivityIntersectsHeader: activityIconRect.left < headerRect.right
        && activityIconRect.right > headerRect.left
        && activityIconRect.top < headerRect.bottom
        && activityIconRect.bottom > headerRect.top,
      overlayAnimation: overlayStyle.animationName,
      dialogAnimation: dialogStyle.animationName,
      overlayAnimationHasOpacity: animationHasOpacity(overlay),
      dialogAnimationHasOpacity: animationHasOpacity(node),
      dialogSurfaceOpaque: isOpaque(dialogStyle.backgroundColor),
      headerSurfaceOpaque: isOpaque(headerStyle.backgroundColor),
      bodySurfaceOpaque: isOpaque(logStyle.backgroundColor),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(dialogGeometry.bodyClips).toBe(true);
  expect(dialogGeometry.scrollerScrolls).toBe(false);
  expect(dialogGeometry.headerOverlap).toBe(0);
  expect(dialogGeometry.bodyStartsBelowHeader).toBe(true);
  expect(dialogGeometry.bodyEndsAboveFooter).toBe(true);
  expect(dialogGeometry.underlyingActivityIntersectsHeader).toBe(true);
  expect(dialogGeometry.overlayAnimation).toBe("none");
  expect(dialogGeometry.dialogAnimation).toBe("mypage-activity-dialog-in");
  expect(dialogGeometry.overlayAnimationHasOpacity).toBe(false);
  expect(dialogGeometry.dialogAnimationHasOpacity).toBe(false);
  expect(dialogGeometry.dialogSurfaceOpaque).toBe(true);
  expect(dialogGeometry.headerSurfaceOpaque).toBe(true);
  expect(dialogGeometry.bodySurfaceOpaque).toBe(true);
  expect(dialogGeometry.horizontalOverflow).toBeLessThanOrEqual(1);
  const clippedScrollGeometry = await dialog.evaluate((node) => {
    const header = node.querySelector<HTMLElement>(".canonical-dialog-header")!;
    const scroller = node.querySelector<HTMLElement>(".mypage-activity-log")!;
    const footer = node.querySelector<HTMLElement>(".canonical-dialog-actions")!;
    const rows = Array.from(node.querySelectorAll<HTMLElement>(".mypage-activity-log-row"));
    scroller.scrollTop = scroller.scrollHeight;
    const lastRect = rows.at(-1)!.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const elementInsideHeader = document.elementFromPoint(
      headerRect.left + 24,
      headerRect.top + headerRect.height / 2,
    );
    return {
      activityInsideHeader: Boolean(elementInsideHeader?.closest(".mypage-activity-log-row")),
      footerOverlap: Math.max(0, lastRect.bottom - footerRect.top),
    };
  });
  expect(clippedScrollGeometry.activityInsideHeader).toBe(false);
  expect(clippedScrollGeometry.footerOverlap).toBe(0);
  await dialog.getByRole("button", { name: "NEON-Rのプロフィールを開く", exact: true }).click();
  await expect(page.locator('[data-opened-profile-id="qa-self"]')).toBeAttached();
  await expect(dialog.locator(".character-presentation-missing").first()).toBeVisible();
  expect(await ticker.evaluate((node) => getComputedStyle(node).animationName)).toContain("mypage-activity-enter");
  await page.screenshot({ path: "test-results/first-home-activity-log-390x844.png", fullPage: false });

  await dialog.getByRole("button", { name: "閉じる", exact: true }).first().click();
  await expect(dialog).toBeHidden();
  await expect(underlyingActivityIcon).toBeVisible();
  await ticker.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("background-color", "rgb(21, 29, 42)");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(ticker).toBeVisible();
  expect(await ticker.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
});

test("Activity self identity opens the current user profile authority", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openHomeScenario(page, "first-home-activity-self");
  await page.locator(".mypage-live-ticker--visual").click();
  const dialog = page.getByRole("dialog", { name: "アクティビティ履歴" });
  await expect(dialog).toHaveCSS("background-color", "rgb(21, 29, 42)");
  await expect(dialog.locator(".canonical-dialog-header")).toHaveCSS("background-color", "rgb(21, 29, 42)");
  const clipGeometry = await dialog.evaluate((node) => {
    const header = node.querySelector<HTMLElement>(".canonical-dialog-header")!;
    const scroller = node.querySelector<HTMLElement>(".mypage-activity-log")!;
    const footer = node.querySelector<HTMLElement>(".canonical-dialog-actions")!;
    const rows = Array.from(node.querySelectorAll<HTMLElement>(".mypage-activity-log-row"));
    const initialFirstTop = rows[0].getBoundingClientRect().top;
    const headerBottom = header.getBoundingClientRect().bottom;
    scroller.scrollTop = scroller.scrollHeight;
    const lastBottom = rows.at(-1)!.getBoundingClientRect().bottom;
    const footerTop = footer.getBoundingClientRect().top;
    return {
      firstRowClearsHeader: initialFirstTop >= headerBottom,
      lastRowClearsFooter: lastBottom <= footerTop,
      overlayAnimation: getComputedStyle(node.parentElement!).animationName,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(clipGeometry.firstRowClearsHeader).toBe(true);
  expect(clipGeometry.lastRowClearsFooter).toBe(true);
  expect(clipGeometry.overlayAnimation).toBe("none");
  expect(clipGeometry.horizontalOverflow).toBeLessThanOrEqual(1);
  const identity = dialog.getByRole("button", { name: "KAIのプロフィールを開く", exact: true });
  await expect(identity).toBeVisible();
  await identity.click();
  await expect(page.locator('[data-opened-profile-id="other-user"]')).toBeAttached();
});

test("normal Home never forces Guild membership after the canonical guide", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomeScenario(page, "first-home-guild-out");
  await expect(page.locator(".mypage-primary-cta")).toHaveCount(0);
  await openHomeScenario(page, "first-home-guild-in");
  await expect(page.locator(".mypage-primary-cta")).toHaveCount(0);
});

test("joined Home never renders a Guild discovery CTA before or after authority readiness", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPrimaryCtaObserver(page);
  await openHomeScenario(page, "first-home-guild-in");
  await expect(page.locator('[data-home-scenario="first-home-guild-in"]')).toHaveAttribute("data-cta-authority-ready", "false");
  await expect(page.locator(".mypage-primary-cta")).toHaveCount(0);
  await expect(page.locator('[data-home-scenario="first-home-guild-in"]')).toHaveAttribute("data-cta-authority-ready", "true", { timeout: 3000 });
  await expect(page.locator(".mypage-primary-cta")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __HOME_CTA_OBSERVED__?: string[] }).__HOME_CTA_OBSERVED__ ?? [])).not.toContain("ギルドに加入しよう");

  await page.reload();
  await expect(page.locator('[data-home-scenario="first-home-guild-in"]')).toBeVisible();
  await expect(page.locator('[data-home-scenario="first-home-guild-in"]')).toHaveAttribute("data-cta-authority-ready", "true", { timeout: 3000 });
  expect(await page.evaluate(() => (window as Window & { __HOME_CTA_OBSERVED__?: string[] }).__HOME_CTA_OBSERVED__ ?? [])).not.toContain("ギルドに加入しよう");
});

test("unaffiliated and pending Guild projections do not become forced CTAs", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openHomeScenario(page, "first-home-guild-out");
  await expect(page.locator('[data-home-scenario="first-home-guild-out"]')).toHaveAttribute("data-cta-authority-ready", "false");
  await expect(page.locator(".mypage-primary-cta")).toHaveCount(0);
  await expect(page.locator('[data-home-scenario="first-home-guild-out"]')).toHaveAttribute("data-cta-authority-ready", "true", { timeout: 3000 });
  await expect(page.locator(".mypage-primary-cta")).toHaveCount(0);

  await openHomeScenario(page, "first-home-guild-pending");
  await expect(page.locator('[data-home-scenario="first-home-guild-pending"]')).toHaveAttribute("data-cta-authority-ready", "false");
  await expect(page.locator(".mypage-primary-cta")).toHaveCount(0);
  await expect(page.locator('[data-home-scenario="first-home-guild-pending"]')).toHaveAttribute("data-cta-authority-ready", "true", { timeout: 3000 });
  await expect(page.locator(".mypage-primary-cta")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /ギルドに加入しよう/ })).toHaveCount(0);
});

test("existing-account login uses the shared tutorial surface and CTA geometry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await page.getByRole("button", { name: "データをお持ちの方" }).click();
  const card = page.locator(".auth-card");
  await expect(card).toBeVisible();
  await expect(page.getByRole("button", { name: "Googleでログイン" })).toHaveClass(/semantic-cta--primary/);
  await expect(page.locator(".auth-input")).toHaveCount(2);
  const geometry = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".auth-card")!;
    const primary = document.querySelector<HTMLElement>(".auth-btn-google")!;
    const input = document.querySelector<HTMLElement>(".auth-input")!;
    return {
      cardWidth: card.getBoundingClientRect().width,
      cardRadius: getComputedStyle(card).borderRadius,
      primaryHeight: primary.getBoundingClientRect().height,
      primaryBackground: getComputedStyle(primary).backgroundColor,
      inputHeight: input.getBoundingClientRect().height,
      overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
  expect(geometry.cardWidth).toBeLessThanOrEqual(390);
  expect(parseFloat(geometry.cardRadius)).toBeGreaterThanOrEqual(8);
  expect(geometry.primaryHeight).toBeGreaterThanOrEqual(52);
  expect(geometry.primaryBackground).not.toBe("rgb(255, 255, 255)");
  expect(geometry.inputHeight).toBeGreaterThanOrEqual(54);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/existing-account-login-r2-390x844.png", fullPage: false });
});

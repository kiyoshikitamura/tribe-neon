import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(60_000);

async function resumeEntryState(page: import("@playwright/test").Page, state: "AGEHA_INTRO" | "NAME_INPUT") {
  const titleCta = page.getByRole("button", { name: "TAP TO START" });
  const tutorialContinue = page.getByRole("button", { name: "チュートリアルを続ける" });
  await expect(titleCta).toBeVisible();
  await titleCta.click();
  await expect(tutorialContinue).toBeVisible();
  await tutorialContinue.click();
  await expect(page.locator(`[data-entry-state="${state}"]`)).toBeVisible({ timeout: 15_000 });
}

async function advanceEntryToName(page: import("@playwright/test").Page) {
  await expect(page.locator('[data-entry-state="WORLD_INFORMATION"]')).toBeVisible();
  await expect(page.locator('[data-world-stage="4"] .setup-world-tap')).toBeVisible({ timeout: 30_000 });
  await page.locator(".setup-world-tap").click();
  await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toBeVisible({ timeout: 5_000 });
  await page.locator(".setup-ageha-presentation .setup-primary-action").click();
  await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
}

test("tutorial ten-pull guarantees slot 10 SSR and visible Growth precedes formation", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000009901";
  await page.addInitScript(({ userId }) => {
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "ANONYMOUS");
    localStorage.setItem("mock_db_users", JSON.stringify([{ id:userId,username:"M9X QA",level:1,cash:10000,neon_diamonds:0,vitality:100,current_base_id:"shinjuku" }]));
    localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id:userId,step_id:"FREE_GACHA" }]));
    localStorage.setItem("mock_db_gacha_masters", JSON.stringify([{ id:"CHAR_NORMAL",gacha_type:"CHARACTER",cost_cash:1000,cost_diamond:100,is_active:true }]));
    localStorage.setItem("mock_db_gacha_items_master", JSON.stringify([
      { gacha_id:"CHAR_NORMAL",item_id:"char_gou_01",rarity:"N" },
      { gacha_id:"CHAR_NORMAL",item_id:"char_chang_01",rarity:"R" },
      { gacha_id:"CHAR_NORMAL",item_id:"char_tetsu_01",rarity:"SR" },
      { gacha_id:"CHAR_SPECIAL",item_id:"char_reiji_01",rarity:"SSR" },
    ]));
    localStorage.setItem("mock_db_user_characters", "[]");
    localStorage.setItem("mock_db_user_skills", "[]");
    localStorage.setItem("mock_db_user_main_formations", "[]");
    localStorage.setItem("mock_db_gacha_execution_history", "[]");
  }, { userId });

  await page.goto("/");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_user_characters") || "[]"))).toEqual([]);
  const freeCta = page.locator(".gacha-free-btn");
  const titleCta = page.getByRole("button", { name:"TAP TO START" });
  await expect(freeCta.or(titleCta)).toBeVisible();
  if (await titleCta.isVisible()) await titleCta.click();
  const newGameCta = page.locator(".title-entry-primary");
  if (await newGameCta.isVisible()) await newGameCta.click();
  await expect(freeCta).toBeEnabled();
  await freeCta.click();
  const pullGate = page.locator(".cg-opening");
  await expect(pullGate).toBeVisible({ timeout:15_000 });
  await page.screenshot({ path: test.info().outputPath("gacha-start.png") });
  await pullGate.click();
  const reveal = page.locator(".cg-reveal");
  for (let index = 0; index < 9; index += 1) {
    await expect(page.locator(".cg-top>span")).toHaveText(`${index + 1} / 10`);
    await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "SETTLED");
    await expect(reveal.locator(".character-presentation-character")).toBeVisible();
    await expect(reveal.locator(".cg-reveal-copy>blockquote")).not.toBeEmpty();
    await reveal.click();
  }
  await expect(reveal).toHaveAttribute("data-presentation-state", "SSR_QUOTE");
  await expect(reveal).not.toHaveAttribute("data-character-id", /.+/);
  await expect(reveal.locator(".cg-quote-intro blockquote")).toHaveAttribute("aria-label", "俺の前に立つなら、覚悟くらい決めてこい。");
  await page.screenshot({ path: test.info().outputPath("gacha-ssr-quote.png") });
  await expect(page.locator(".cg-shell")).toHaveAttribute("data-stage", "SETTLED");
  await expect(reveal).toHaveAttribute("data-character-id", "char_reiji_01");
  await page.screenshot({ path: test.info().outputPath("gacha-ssr-reveal.png") });
  await reveal.click();
  await expect(page.locator(".cg-mini")).toHaveCount(10);
  await expect(page.locator(".cg-mini .character-presentation-gacha-result-compact")).toHaveCount(10);
  await expect(page.locator(".cg-mini .cg-rarity-badge")).toHaveCount(10);
  await expect(page.locator(".cg-mini>small")).toHaveCount(10);
  await expect(page.locator(".cg-mini.cg-ssr")).toHaveCount(1);
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.locator(".cg-grid").evaluate((grid) => ({ scrollWidth: grid.scrollWidth, clientWidth: grid.clientWidth }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    await page.screenshot({ path: test.info().outputPath(`gacha-ten-pull-result-${width}.png`) });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 430, height: 844, deviceScaleFactor: 2, mobile: false });
  await page.screenshot({ path: test.info().outputPath("gacha-ten-pull-result-desktop-dpr2.png") });
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await page.setViewportSize({ width: 390, height: 844 });
  const payload = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_gacha_execution_history") || "[]")[0]?.result_payload);
  expect(payload.results).toHaveLength(10);
  expect(payload.results[9].rarity).toBe("SSR");
  expect(payload.guaranteed_ssr_slot).toBe(10);

  await page.locator(".cg-continue").click();
  await expect(page.locator('[data-acceptance-state="TUTORIAL_SKILL_STEP"]')).toContainText("ストリートパンチ");
  await page.getByRole("button", { name: "育成へ進む" }).click();
  await expect(page.locator('[data-acceptance-state="TUTORIAL_GROWTH_STEP"]')).toContainText("Lv.1 → Lv.7");
  await page.getByRole("button", { name: "Lv.7まで強化" }).click();
  await expect(page.getByRole("heading", { name: "レベルアップ結果" })).toBeVisible();
  await expect(page.locator('[data-growth-result="level-up"]')).toContainText("総合力");
  await page.getByRole("button", { name: "編成へ進む" }).click();
  const formation = page.locator(".char-party-auto-btn");
  await expect(formation).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("formation-owned-roster.png"), fullPage: true });
  await formation.click();
  const formationCompletion = page.locator('[data-acceptance-state="AUTO_FORMATION_COMPLETE"]');
  await expect(formationCompletion).toContainText("編成しました");
  await expect(page.locator('[data-acceptance-state="Q1"]')).toHaveCount(0);
  await formationCompletion.getByRole("button", { name: "OK" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mock_db_tutorial_progress") || "[]")[0]?.step_id)).toBe("DISPATCH");
  await expect(page.locator(".tutorial-character-step")).toHaveCount(0);
  await expect(page.locator(".patrol-container")).toBeVisible();
});

test("M9-X entry and Mission Hub remain mobile-safe", async ({ page }) => {
  const navigationStartedAt = Date.now();
  await page.goto("/");
  await expect(page.locator(".title-view-overlay")).toBeVisible();
  const coldStartMs = Date.now() - navigationStartedAt;
  const bootMetrics = await page.evaluate(() => window.__TRIBE_ASSET_METRICS__);
  expect(bootMetrics?.tiers.BOOT_CRITICAL?.failed).toEqual([]);
  expect(bootMetrics?.tiers.BOOT_CRITICAL?.loaded).toBe(4);
  expect(bootMetrics?.titleReadyAt).toBeGreaterThanOrEqual(bootMetrics?.tiers.BOOT_CRITICAL?.settledAt || 0);
  const visibleImagesReady = await page.locator("img:visible").evaluateAll((images) => images.every((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth > 0;
  }));
  expect(visibleImagesReady).toBe(true);
  test.info().annotations.push({ type: "cold-title-ready-ms", description: String(coldStartMs) });
  console.log("M9X_COLD_START", JSON.stringify({ coldStartMs, boot: bootMetrics?.tiers.BOOT_CRITICAL }));

  await expect.poll(() => page.evaluate(() => window.__TRIBE_ASSET_METRICS__?.tiers.TUTORIAL_CRITICAL?.failed ?? [])).toEqual([]);
  for (const width of [375,390,430]) {
    await page.setViewportSize({ width,height:844 });
    const title = page.locator(".title-view-overlay");
    await expect(title).toBeVisible();
    const metrics = await title.evaluate(node=>({ scrollWidth:node.scrollWidth,clientWidth:node.clientWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth+1);
  }
});

test("world information precedes Ageha and entry sub-state survives reload", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await page.getByRole("button", { name: "はじめから" }).click();
  await expect(page.locator('[data-entry-state="WORLD_INFORMATION"]')).toBeVisible();
  await expect(page.getByText("はじめまして。アゲハだよ。", { exact: false })).toHaveCount(0);
  await expect(page.locator('[data-world-stage="4"] .setup-world-tap')).toBeVisible({ timeout: 30_000 });
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.locator('[data-entry-state="WORLD_INFORMATION"]').evaluate((root) => ({ scrollWidth: root.scrollWidth, clientWidth: root.clientWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    await page.screenshot({ path: test.info().outputPath(`m9x-world-information-${width}.png`) });
  }

  await page.locator(".setup-world-tap").click();
  await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toBeVisible();
  await expect(page.getByText("はじめまして。アゲハだよ。", { exact: false })).toBeVisible();
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: test.info().outputPath(`m9x-ageha-intro-${width}.png`) });
  }
  await page.reload();
  await resumeEntryState(page, "AGEHA_INTRO");
  await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toBeVisible();

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator('[data-entry-state="NAME_INPUT"]')).toBeVisible();
  await page.reload();
  await resumeEntryState(page, "NAME_INPUT");
  await expect(page.getByPlaceholder("プレイヤー名を入力")).toBeVisible();
});

test("tutorial SSR assets have clean alpha edges and mobile-safe focal crops", async ({ page }) => {
  await page.goto("/");
  const characters = ["reiji", "rui", "chang", "ageha", "alice", "kaito", "koharu", "leon", "sakura", "yuki"];
  const audit = await page.evaluate(async (names) => {
    const results: Array<{ name: string; greenEdgePixels: number; width: number; height: number }> = [];
    for (const name of names) {
      const image = new Image();
      image.src = `/characters/${name}_transparent_asset.png`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let greenEdgePixels = 0;
      for (let index = 0; index < pixels.length; index += 16) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3];
        if (alpha > 0 && alpha < 255 && green > 70 && green > red * 1.25 && green > blue * 1.15) greenEdgePixels += 1;
      }
      results.push({ name, greenEdgePixels, width: image.naturalWidth, height: image.naturalHeight });
    }
    return results;
  }, characters);
  console.log("M9X_ALPHA_AUDIT", JSON.stringify(audit));
  // Canvas decode may round one anti-aliased sample differently from the PNG
  // source. More than one dominant-green edge sample is treated as residue.
  expect(audit.every((result) => result.width > 0 && result.height > 0 && result.greenEdgePixels <= 1)).toBe(true);

  const focal: Record<string, { x: number; scale: number }> = {
    reiji:{x:52,scale:1.34},rui:{x:50,scale:1.3},chang:{x:51,scale:1.34},ageha:{x:48,scale:1.26},alice:{x:47,scale:1.28},
    kaito:{x:51,scale:1.34},koharu:{x:49,scale:1.27},leon:{x:54,scale:1.2},sakura:{x:52,scale:1.32},yuki:{x:49,scale:1.34},
  };
  await page.evaluate(({ names, focal }) => {
    document.body.innerHTML = `<main id="alpha-qa">${names.map((name) => `<figure><div><img src="/characters/${name}_transparent_asset.png" alt="${name}" style="--x:${focal[name].x}%;--scale:${focal[name].scale}"></div><figcaption>${name}</figcaption></figure>`).join("")}</main>`;
    const style = document.createElement("style");
    style.textContent = `body{margin:0;padding:16px;background:#05070c;color:#fff;font:12px sans-serif}#alpha-qa{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;max-width:398px;margin:auto}figure{margin:0;border:1px solid #00f0ff;background:var(--qa-bg,#070b12);overflow:hidden}figure>div{height:112px;overflow:hidden}img{width:100%;height:100%;object-fit:cover;object-position:var(--x) 0;display:block;image-rendering:auto}figcaption{text-align:center;padding:4px}`;
    document.head.appendChild(style);
  }, { names: characters, focal });
  for (const [label, background] of [["black", "#05070c"], ["white", "#fff"], ["neon", "linear-gradient(135deg,#071a2a,#7c095c)"]] as const) {
    await page.locator("figure").evaluateAll((figures, value) => figures.forEach((figure) => (figure as HTMLElement).style.setProperty("--qa-bg", value)), background);
    await page.screenshot({ path: test.info().outputPath(`tutorial-ssr-alpha-${label}-390.png`), fullPage: true });
  }
});

test("Ageha full-body source remains opaque on mobile and desktop DPR", async ({ browser }) => {
  const cases = [
    { label:"mobile", viewport:{ width:390, height:844 }, deviceScaleFactor:1 },
    { label:"desktop-dpr1", viewport:{ width:1280, height:900 }, deviceScaleFactor:1 },
    { label:"desktop-dpr2", viewport:{ width:1280, height:900 }, deviceScaleFactor:2 },
  ];
  for (const entry of cases) {
    const context = await browser.newContext({ viewport:entry.viewport, deviceScaleFactor:entry.deviceScaleFactor });
    const page = await context.newPage();
    await page.goto("/");
    const origin = new URL(page.url()).origin;
    await page.setContent(`<base href="${origin}/"><style>html,body{margin:0;min-height:100%;background:#02050b}.ageha-fullbody-audit{display:grid;min-height:100vh;place-items:center;background:linear-gradient(180deg,rgba(1,4,10,.12),rgba(1,4,10,.72)),url('/bg/bg_street_shinjuku.jpg') center/cover}.ageha-fullbody-audit figure{width:min(100%,430px);height:min(100vh,900px);margin:0;overflow:hidden;border-inline:1px solid rgba(0,240,255,.18);background:rgba(0,0,0,.12)}.ageha-fullbody-audit img{display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom;image-rendering:auto}</style><main class="ageha-fullbody-audit"><figure><img src="/characters/ageha_transparent_asset.png" alt="アゲハ"></figure></main>`);
    const image = page.locator(".ageha-fullbody-audit img");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => [element.complete,element.naturalWidth,element.naturalHeight])).toEqual([true,768,1376]);
    await page.screenshot({ path:test.info().outputPath(`ageha-full-body-${entry.label}.png`) });
    await context.close();
  }
});

test("desktop character source remains sharp at DPR 1 and DPR 2", async ({ browser }) => {
  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor,
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "TAP TO START" }).click();
    await page.getByRole("button", { name: "はじめから" }).click();
    await expect(page.locator('[data-world-stage="4"] .setup-world-tap')).toBeVisible({ timeout: 30_000 });
    await page.locator(".setup-world-tap").click();
    await expect(page.locator('[data-entry-state="AGEHA_INTRO"]')).toBeVisible();
    await page.waitForTimeout(650);
    const character = page.locator('[data-entry-state="AGEHA_INTRO"] .character-presentation-dialogue-bust img');
    await expect(character).toHaveCount(1);
    await expect.poll(() => character.evaluateAll((images) => images.map((image) => {
      const element = image as HTMLImageElement;
      return [element.complete, element.naturalWidth, element.naturalHeight];
    }))).toEqual([[true, 768, 1376]]);
    const metrics = await character.evaluateAll((images) => images.map((image) => {
      const element = image as HTMLImageElement;
      return {
        complete: element.complete,
        naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight,
        renderedWidth: element.getBoundingClientRect().width,
      };
    }));
    expect(metrics.every((metric) => metric.complete && metric.naturalWidth === 768 && metric.naturalHeight === 1376)).toBe(true);
    expect(metrics.every((metric) => metric.naturalWidth >= metric.renderedWidth * deviceScaleFactor)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`desktop-character-dpr-${deviceScaleFactor}.png`) });
    await context.close();
  }
});

test("iPhone Safari visual viewport keeps name entry usable when browser chrome and keyboard reduce height", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await page.getByRole("button", { name: "はじめから" }).click();
  await advanceEntryToName(page);
  const input = page.getByPlaceholder("プレイヤー名を入力");
  await expect(input).toBeVisible();
  await input.focus();
  await page.setViewportSize({ width: 390, height: 664 });
  await input.scrollIntoViewIfNeeded();
  const metrics = await page.locator('[data-entry-state="NAME_INPUT"]').evaluate((root) => {
    const field = root.querySelector("input") as HTMLInputElement;
    const action = root.querySelector("button") as HTMLButtonElement;
    const rootRect = root.getBoundingClientRect();
    return {
      rootLeft: rootRect.left,
      rootRight: rootRect.right,
      viewportWidth: window.visualViewport?.width ?? innerWidth,
      viewportHeight: window.visualViewport?.height ?? innerHeight,
      inputFontSize: Number.parseFloat(getComputedStyle(field).fontSize),
      actionHeight: action.getBoundingClientRect().height,
      horizontalOverflow: root.scrollWidth - root.clientWidth,
    };
  });
  expect(metrics.rootLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.rootRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.inputFontSize).toBeGreaterThanOrEqual(16);
  expect(metrics.actionHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("dialog", { name: /名前/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("iphone-safari-name-entry-keyboard-390.png") });
  await context.close();
});

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SSR_CHARACTERS = ["ageha", "gou", "kaede", "karen", "kengo", "koharu", "leo", "mio", "miyabi", "reiji"];

const metadata: Record<string, { x: number; thumbnail: number; compact: number; reveal: number }> = {
  ageha: { x: 48, thumbnail: 2, compact: 1.48, reveal: .92 },
  gou: { x: 50, thumbnail: 2.05, compact: 1.5, reveal: .96 },
  kaede: { x: 49, thumbnail: 2.05, compact: 1.58, reveal: .96 },
  karen: { x: 50, thumbnail: 2.05, compact: 1.58, reveal: .96 },
  kengo: { x: 51, thumbnail: 2.05, compact: 1.58, reveal: .96 },
  koharu: { x: 49, thumbnail: 2.05, compact: 1.58, reveal: .96 },
  leo: { x: 54, thumbnail: 2.05, compact: 1.58, reveal: .96 },
  mio: { x: 50, thumbnail: 2.05, compact: 1.58, reveal: .96 },
  miyabi: { x: 50, thumbnail: 2.05, compact: 1.58, reveal: .96 },
  reiji: { x: 52, thumbnail: 2.15, compact: 1.58, reveal: .96 },
};

test("SSR ten-character presentation stays inside the canonical rarity frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const card = (name: string, variant: string, frame: "character" | "reveal") => {
    const item = metadata[name];
    return `<figure class="character-presentation character-presentation-${variant} character-presentation-rarity-ssr has-rarity-frame is-frame-${frame}" style="--character-focal-x:${item.x}%;--character-thumbnail-scale:${item.thumbnail};--character-compact-scale:${item.compact};--character-reveal-scale:${item.reveal}"><div class="character-presentation-art"><img class="character-presentation-background" src="/bg/bg_street_shinjuku.jpg" alt=""><img class="character-presentation-character" src="/characters/${name}_transparent_asset.png" alt="${name}"><span class="character-presentation-light"></span></div><img class="character-presentation-frame is-${frame}" src="/ui/rarity/${frame === "character" ? "character-card-ssr" : "ssr"}.png" alt=""><figcaption>${name}</figcaption></figure>`;
  };
  const html = `<main class="presentation-audit"><h1>SSR / thumbnail</h1><section data-variant="thumbnail" class="gallery thumbnail">${SSR_CHARACTERS.map((name) => card(name, "thumbnail", "character")).join("")}</section><h1>SSR / compact</h1><section data-variant="compact" class="gallery compact">${SSR_CHARACTERS.map((name) => card(name, "gacha-result-compact", "character")).join("")}</section><h1>SSR / card</h1><section data-variant="card" class="gallery card">${SSR_CHARACTERS.map((name) => card(name, "card", "character")).join("")}</section><h1>SSR / reveal</h1><section data-variant="reveal" class="gallery reveal">${SSR_CHARACTERS.map((name) => card(name, "reveal", "reveal")).join("")}</section></main>`;
  await page.setContent(`<base href="http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || "3100"}">${html}`);
  await page.addStyleTag({ content: `${readFileSync(resolve(process.cwd(), "src/app/components/character/CharacterPresentation.css"), "utf8")}\n.presentation-audit{width:390px;box-sizing:border-box;padding:10px;background:#02050b;color:#fff}.presentation-audit h1{font:700 12px sans-serif;color:#00f0ff}.gallery{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:14px}.gallery figure{width:100%;margin:0}.gallery.thumbnail figure{aspect-ratio:1}.gallery.compact figure{aspect-ratio:4/5}.gallery.card{grid-template-columns:repeat(2,1fr)}.gallery.card figure{aspect-ratio:3/4}.gallery.reveal{grid-template-columns:repeat(2,1fr)}.gallery.reveal figure{height:300px}.gallery figcaption{position:absolute;z-index:7;right:5px;bottom:4px;left:5px;color:white;text-align:center;font:700 9px sans-serif;text-shadow:0 1px 3px #000}` });
  await expect(page.locator(".character-presentation-character")).toHaveCount(40);
  await expect.poll(() => page.locator(".character-presentation-character").evaluateAll((images) => images.every((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth === 768 && element.naturalHeight === 1376;
  }))).toBe(true);
  await page.screenshot({ path: test.info().outputPath("ssr-10-presentation-390.png"), fullPage: true });
  for (const variant of ["thumbnail", "compact", "card", "reveal"]) {
    await page.locator(`[data-variant="${variant}"]`).screenshot({ path: test.info().outputPath(`ssr-10-${variant}-390.png`) });
  }
});

test("N R SR SSR samples share the same production artwork viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const samples = [
    { name: "mei", rarity: "n" },
    { name: "yuuji", rarity: "r" },
    { name: "maya", rarity: "sr" },
    { name: "ageha", rarity: "ssr" },
  ];
  const html = `<main class="rarity-audit">${samples.map(({ name, rarity }) => `<figure class="character-presentation character-presentation-card character-presentation-rarity-${rarity} has-rarity-frame is-frame-character"><div class="character-presentation-art"><img class="character-presentation-background" src="/bg/bg_street_shinjuku.jpg" alt=""><img class="character-presentation-character" src="/characters/${name}_transparent_asset.png" alt="${name}"></div><img class="character-presentation-frame is-character" src="/ui/rarity/character-card-${rarity}.png" alt=""><figcaption>${rarity.toUpperCase()} / ${name}</figcaption></figure>`).join("")}</main>`;
  await page.setContent(`<base href="http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || "3100"}">${html}`);
  await page.addStyleTag({ content: `${readFileSync(resolve(process.cwd(), "src/app/components/character/CharacterPresentation.css"), "utf8")}\n.rarity-audit{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;width:390px;box-sizing:border-box;padding:10px;background:#02050b}.rarity-audit figure{margin:0}.rarity-audit figcaption{position:absolute;z-index:7;right:8px;bottom:7px;left:8px;color:#fff;text-align:center;font:700 11px sans-serif;text-shadow:0 1px 3px #000}` });
  await expect(page.locator(".character-presentation-character")).toHaveCount(4);
  await page.screenshot({ path: test.info().outputPath("rarity-samples-card-390.png"), fullPage: true });
});

test("battle action framing contains production SSR and body-shape samples", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const samples = [...SSR_CHARACTERS, "takeshi", "chang", "ren_male", "maya", "sakura"];
  const html = `<main class="battle-framing-audit">${samples.map((name) => `<section class="battle-action-stage"><div class="battle-action-units"><article class="battle-unit battle-unit-action battle-unit-player is-actor"><div class="battle-unit-art"><figure class="character-presentation character-presentation-battle character-presentation-battle-action"><div class="character-presentation-art"><img class="character-presentation-character" src="/characters/${name}_transparent_asset.png" alt="${name}"></div></figure><span class="battle-unit-role is-actor-label">ACTOR</span></div><div class="battle-unit-meta is-action-identity"><strong>${name}</strong></div><div class="battle-unit-hp"><i style="width:72%"></i></div><div class="battle-unit-hp-copy"><span>HP</span><b>72%</b></div></article><div class="battle-action-impact"><strong>VS</strong></div><article class="battle-unit battle-unit-action battle-unit-enemy is-target"><div class="battle-unit-art"></div><div class="battle-unit-meta is-action-identity"><strong>TARGET</strong></div><div class="battle-unit-hp"><i style="width:60%"></i></div><div class="battle-unit-hp-copy"><span>HP</span><b>60%</b></div></article></div></section>`).join("")}</main>`;
  await page.setContent(`<base href="http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || "3100"}">${html}`);
  await page.addStyleTag({ content: [
    readFileSync(resolve(process.cwd(), "src/app/components/character/CharacterPresentation.css"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/app/components/battle/BattleUnitPortrait.css"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/app/components/battle/QuestBattleViewer.css"), "utf8"),
    `.battle-framing-audit{--ui-accent:#00f0ff;--ui-combat:#ff4265;--ui-text-primary:#fff;--ui-bg-root:#02050b;--ui-border:#253745;display:grid;gap:8px;width:390px;box-sizing:border-box;padding:8px;background:#02050b}.battle-framing-audit .battle-action-stage{height:260px}.battle-framing-audit .battle-action-units{inset:40px 4px 4px;grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr)}.battle-framing-audit .battle-unit-action{height:100%;overflow:hidden}.battle-framing-audit .battle-unit-action .battle-unit-art{height:calc(100% - 42px);overflow:hidden}`,
  ].join("\n") });
  await expect.poll(() => page.locator(".character-presentation-character").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.locator(".battle-unit-action.is-actor")).toHaveCount(samples.length);
  const collisions = await page.locator(".battle-action-stage").evaluateAll((stages) => stages.map((stage) => {
    const stageRect = stage.getBoundingClientRect();
    const unit = stage.querySelector(".battle-unit-action.is-actor")?.getBoundingClientRect();
    const art = stage.querySelector(".battle-unit-action.is-actor .battle-unit-art")?.getBoundingClientRect();
    const frame = stage.querySelector<HTMLElement>(".battle-unit-action.is-actor .character-presentation");
    const hp = stage.querySelector(".battle-unit-action.is-actor .battle-unit-hp")?.getBoundingClientRect();
    return Boolean(!unit || !art || !frame || !hp || unit.left < stageRect.left - 1 || unit.right > stageRect.right + 1 || unit.top < stageRect.top - 1 || unit.bottom > stageRect.bottom + 1 || art.bottom > hp.top + 1 || getComputedStyle(frame).overflow !== "hidden" || getComputedStyle(frame.querySelector<HTMLElement>(".character-presentation-art")!).overflow !== "hidden");
  }));
  expect(collisions).not.toContain(true);
  await page.screenshot({ path: test.info().outputPath("battle-action-production-samples-390.png"), fullPage: true });
});

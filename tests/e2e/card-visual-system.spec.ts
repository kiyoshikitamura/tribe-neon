import { getCharacterTotalStats } from "../../src/utils/stats_calculator";
import characterSource from "../../src/domain/gameplay/canonical/data/characters_20260821.json";
import { resolveHomeCharacter } from "../../src/app/components/character/characterHomeSelection";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);
if (process.env.CHARACTER_HOME_BROWSER === "webkit") test.use({ browserName: "webkit", isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const userId = "00000000-0000-4000-8000-000000000829";
    const now = new Date().toISOString();
    const cycleDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    localStorage.setItem("tribe_demo_uuid", userId);
    localStorage.setItem("mock_auth_mode", "EMAIL");
    localStorage.setItem("mock_db_user_login_bonuses", JSON.stringify([{ user_id: userId, current_day: 1, total_logins: 1, last_claimed_date: cycleDate }]));
    if (!localStorage.getItem("mock_db_users")) {
      localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "Presentation QA", current_base_id: "shinjuku", favorite_character_id: "char_reiji_01", level: 10, cash: 50000, vitality: 100 }]));
    }
    localStorage.setItem("mock_db_user_characters", JSON.stringify([
      { id: "character-owned-1", user_id: userId, character_id: "char_reiji_01", level: 12, awakening_level: 3, created_at: now },
      { id: "character-owned-2", user_id: userId, character_id: "char_rui_01", level: 10, awakening_level: 1, created_at: now },
      { id: "character-owned-3", user_id: userId, character_id: "char_chang_01", level: 9, awakening_level: 0, created_at: now },
    ]));
    localStorage.setItem("mock_db_user_main_formations", JSON.stringify([
      { user_id: userId, slot: 1, user_character_id: "character-owned-1" },
      { user_id: userId, slot: 2, user_character_id: "character-owned-2" },
      { user_id: userId, slot: 3, user_character_id: "character-owned-3" },
    ]));
    localStorage.setItem("mock_db_user_skills", JSON.stringify([
      { id: "skill-owned-1", user_id: userId, skill_card_id: "SKILL_001", level: 4, plus_val: 3, equipped_character_id: "character-owned-1", slot_index: 0 },
      { id: "skill-owned-2", user_id: userId, skill_card_id: "SKILL_005", level: 2, plus_val: 1, equipped_character_id: null, slot_index: null },
    ]));
    localStorage.setItem("mock_db_skill_battle_master", JSON.stringify([
      { skill_id: "SKILL_001", display_name: "ストリートパンチ", enabled: true, kind: "ATTACK", target: "ENEMY_SINGLE", cooldown: 2 },
      { skill_id: "SKILL_005", display_name: "毒針", enabled: true, kind: "ATTACK", target: "ENEMY_SINGLE", cooldown: 2 },
    ]));
    localStorage.setItem("mock_db_user_equipments", JSON.stringify([
      { id: "equipment-owned-1", user_id: userId, equipment_id: "WEAPON_001", level: 8, plus_val: 2, equipped_character_id: "character-owned-1", slot_index: 0, created_at: now },
      { id: "equipment-owned-2", user_id: userId, equipment_id: "BODY_001", level: 4, plus_val: 0, equipped_character_id: null, slot_index: null, created_at: now },
    ]));
    localStorage.setItem("mock_db_user_items", JSON.stringify([
      { id: "item-char-s", user_id: userId, item_id: "CHAR_EXP_S", quantity: 10 },
      { id: "item-char-m", user_id: userId, item_id: "CHAR_EXP_M", quantity: 5 },
      { id: "item-char-l", user_id: userId, item_id: "CHAR_EXP_L", quantity: 2 },
      { id: "item-awaken", user_id: userId, item_id: "AWAKENING_BOOK", quantity: 1 },
      { id: "item-equip-s", user_id: userId, item_id: "EQUIP_EXP_S", quantity: 5 },
      { id: "item-equip-m", user_id: userId, item_id: "EQUIP_EXP_M", quantity: 4 },
      { id: "item-equip-l", user_id: userId, item_id: "EQUIP_EXP_L", quantity: 2 },
      { id: "item-skill-manual", user_id: userId, item_id: "SKILL_MANUAL", quantity: 1 },
    ]));
    localStorage.setItem("mock_db_quests", JSON.stringify([
      { id: "QUEST_SHINJUKU_EASY", name: "歌舞伎町一番街", town_id: "shinjuku", level_type: "EASY", duration_seconds: 300, cost_vitality: 3, cash_reward: 0, exp_reward: 100 },
      { id: "QUEST_SHINJUKU_NORMAL", name: "職安通り", town_id: "shinjuku", level_type: "NORMAL", duration_seconds: 3600, cost_vitality: 10, cash_reward: 0, exp_reward: 400 },
    ]));
    localStorage.setItem("mock_db_user_quest_first_clears", JSON.stringify([{ user_id: userId, quest_id: "QUEST_SHINJUKU_EASY", cleared_at: now }]));
    localStorage.setItem("mock_db_patrol_npcs", JSON.stringify([
      { id: "npc_shinjuku_easy", quest_id: "QUEST_SHINJUKU_EASY", npc_name: "Canonical EASY Party", npc_level: 5, members: [{ characterId: "char_tomoya_01", level: 5 }, { characterId: "char_kenji_01", level: 5 }, { characterId: "char_shin_01", level: 5 }] },
      { id: "npc_shinjuku_normal", quest_id: "QUEST_SHINJUKU_NORMAL", npc_name: "Canonical NORMAL Party", npc_level: 12, members: [{ characterId: "char_tomoya_01", level: 12 }, { characterId: "char_kenji_01", level: 12 }, { characterId: "char_shin_01", level: 12 }, { characterId: "char_takuro_01", level: 12 }, { characterId: "char_leon_01", level: 12 }] },
    ]));
  });
});

async function enterGame(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "TAP TO START" }).click();
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.locator(".header-mobile")).toBeVisible();
  const loginBonus = page.getByRole("dialog", { name: "ログインボーナス" });
  await loginBonus.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await loginBonus.isVisible()) {
    await loginBonus.getByRole("button", { name: "閉じる", exact: true }).click();
  }
}

async function expectMobileGeometry(page: import("@playwright/test").Page, selector: string) {
  const geometry = await page.locator(selector).evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right,
    viewport: window.innerWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
}

async function capture(page: import('@playwright/test').Page, name: string) {
 await page.screenshot({path:test.info().outputPath(name+'.png'),fullPage:true});
}

for (const viewport of [{width:390,height:844},{width:412,height:915}]) {
 test('Card Visual real Character routes '+viewport.width, async ({page}) => {
  await page.setViewportSize(viewport);await enterGame(page);
  await capture(page,'header-home');
  await page.locator('.footer-item[aria-label="キャラ"]').click();
  await expect(page.locator('.character-home')).toBeVisible();await capture(page,'character-home');
  await page.getByRole('button',{name:'キャラ一覧',exact:true}).click();
  await expect(page.locator('.character-presentation-frame.is-character').first()).toBeVisible();
  const frames=await page.locator('.character-presentation-frame.is-character').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();const s=getComputedStyle(node);return {ratio:b.width/b.height,width:b.width,fit:s.objectFit,transform:s.transform};}));
  for(const frame of frames){expect(frame.width).toBeGreaterThan(30);expect(frame.ratio).toBeCloseTo(5/7,2);expect(frame.fit).toBe('contain');expect(frame.transform).toBe('none');}
  await expectMobileGeometry(page,'.character-v2-shell');await capture(page,'character-list');
  await page.locator('.character-v2-card').first().click();await page.getByRole('button',{name:'育成する',exact:true}).click();
  await capture(page,'character-growth');await page.getByRole('navigation',{name:'育成内容'}).getByRole('button',{name:'覚醒',exact:true}).click();await capture(page,'character-awakening');
  await page.getByRole('navigation',{name:'育成内容'}).getByRole('button',{name:'スキル',exact:true}).click();await capture(page,'skill-set');
  await page.getByRole('button',{name:'スキル枠1',exact:true}).click();await capture(page,'skill-detail');await page.getByRole('dialog',{name:'スキル詳細'}).getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('navigation',{name:'キャラクター管理'}).getByRole('button',{name:'スキル',exact:true}).click();await capture(page,'skill-list');
  await page.getByRole('navigation',{name:'キャラクター管理'}).getByRole('button',{name:'装備',exact:true}).click();await capture(page,'equipment-list');
  await page.getByRole('navigation',{name:'キャラクター管理'}).getByRole('button',{name:'キャラクター',exact:true}).click();await page.locator('.character-v2-card').first().click();
  await page.locator('.character-home').getByRole('button',{name:/装備/}).click();await expectMobileGeometry(page,'.character-equipment-stage');await capture(page,'equipment');
  await page.getByRole('button',{name:'武器1',exact:true}).click();await capture(page,'equipment-detail');await page.getByRole('dialog',{name:'装備詳細'}).getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('button',{name:'戻る',exact:true}).click();await page.locator('.character-home').getByRole('button',{name:/パーティ/}).click();await capture(page,'party');
  await page.getByRole('button',{name:'メンバー変更',exact:true}).click();await expectMobileGeometry(page,'.character-party-draft-slots');await capture(page,'party-selection');
 });

 test('Card Visual native geometry and item levels '+viewport.width, async ({page}) => {
  await page.setViewportSize(viewport);await page.goto('/qa/presentation?scenario=card-visual-geometry');
  await expect(page.locator('.character-presentation-frame.is-character')).toHaveCount(4);
  await expect(page.locator('.is-visual-loading')).toHaveCount(0);
  const geometry=await page.locator('.character-presentation-frame-layout').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect(),art=node.querySelector('.character-presentation-art')!.getBoundingClientRect();return {width:b.width,height:b.height,openingWidth:art.width,openingHeight:art.height};}));
  expect(geometry).toHaveLength(4);for(const item of geometry){expect(item.width/item.height).toBeCloseTo(5/7,2);expect(item).toEqual(geometry[0]);}await capture(page,'rarity-geometry');
  for(const kind of ['skill','equipment']){
   await page.goto('/qa/presentation?scenario=card-visual-'+kind+'-levels');
   const badges=page.locator('.gacha-result-asset-badge.is-progression');await expect(badges).toHaveCount(10);
   await expect(badges).toHaveText(Array.from({length:10},(_,i)=>'+'+(i+1)));
   await expect(page.locator('img[src*="badge-awakening"]')).toHaveCount(0);
   const styles=await badges.evaluateAll(nodes=>nodes.map(node=>{const s=getComputedStyle(node);return [s.fontSize,s.fontWeight,s.lineHeight,s.color,s.textShadow,s.filter];}));
   for(const style of styles)expect(style).toEqual(styles[0]);
   for(const badge of await badges.all()){const b=await badge.boundingBox();expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(viewport.width);}
   await expect(page.locator('.is-asset-results .gacha-result-card').first()).toHaveCSS('box-shadow','none');await capture(page,kind+'-levels');
   for(const count of ['', '-one']) {await page.goto('/qa/presentation?scenario=gacha-'+kind+'-result'+count);await expect(page.locator('.gacha-result-card')).toHaveCount(count?1:10);await capture(page,kind+'-result'+(count?'1':'10'));}
  }
  await page.goto('/qa/presentation?scenario=public-user-profile');await expect(page.getByText('NEON-RIVAL',{exact:true})).toBeVisible();await capture(page,'profile');
 });
}

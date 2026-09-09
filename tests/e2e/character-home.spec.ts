import characterSource from "../../src/domain/gameplay/canonical/data/characters_20260821.json";
import { resolveHomeCharacter } from "../../src/app/components/character/characterHomeSelection";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);
if (process.env.CHARACTER_HOME_BROWSER === "webkit") test.use({ browserName: "webkit", isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mock_rpc_fixture:empty_raid_recoveries", "true"));
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


for (const width of [375,390,430]) {
 test('Character HOME navigation and geometry '+width, async ({page}) => {
  await page.setViewportSize({width,height:844});
  await enterGame(page);
  await page.locator('.footer-item[aria-label="キャラ"]').click();
  await expect(page.locator('.character-v2-card')).toHaveCount(3);
  await expect(page.locator('.character-v2-card-power').first()).toContainText('総合力');
  await page.locator('.character-v2-card').first().click();
  const home=page.getByRole('region',{name:'キャラクターホーム'});
  await expect(home).toBeVisible();
  await expect(home.locator('.semantic-cta--primary')).toHaveText('育成する');
  await expect(home.locator('.character-home-identity')).toContainText('覚醒 +3');
  await expect(home.getByRole('button',{name:/PARTY/})).toContainText('編成中');
  await expect(home.getByRole('button',{name:/Equipment/})).toContainText('1 / 7');
  await expectMobileGeometry(page,'.character-home');
  const bottom=await home.locator('.character-home-destinations').boundingBox();
  const footer=await page.locator('.page-shell-footer').boundingBox();
  expect(bottom!.y+bottom!.height).toBeLessThanOrEqual(footer!.y+1);
  const image=home.locator('.character-presentation-character');
  await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  expect(await image.evaluate(img=>getComputedStyle(img).objectFit)).toBe('contain');
  await page.screenshot({path:test.info().outputPath('character-home-'+width+'.png')});
  await home.getByRole('button',{name:'次のキャラクター'}).click();
  await expect(home).toHaveAttribute('data-character-id','char_rui_01');
  await expect(home.locator('.character-home-switch')).toContainText('2 / 3');
  const art=await home.locator('.character-home-art').boundingBox();
  await page.mouse.move(art!.x+art!.width*.8,art!.y+100); await page.mouse.down();
  await page.mouse.move(art!.x+art!.width*.2,art!.y+103); await page.mouse.up();
  await expect(home).toHaveAttribute('data-character-id','char_chang_01');
  await home.getByRole('button',{name:'育成する'}).click();
  await expect(page.locator('.character-v2-growth')).toBeVisible();
  await page.locator('.character-v2-growth').getByRole('button',{name:'戻る',exact:true}).click();
  await home.getByRole('button',{name:/Equipment/}).click();
  await expect(page.locator('.character-v2-equipment-slots button')).toHaveCount(7);
  await page.getByRole('button',{name:'戻る',exact:true}).click();
  await home.getByRole('button',{name:/PARTY/}).click();
  await expect(page.locator('.character-v2-party-slots > *')).toHaveCount(5);
  await page.getByRole('button',{name:'キャラホームへ戻る'}).click();
  await home.getByRole('button',{name:'キャラクター一覧へ戻る'}).click();
  await expect(home).toHaveCount(0);
 });
}

test('Saved empty formation is not the display fallback; one Character and low height',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('mock_db_user_main_formations','[]');
  const chars=JSON.parse(localStorage.getItem('mock_db_user_characters')||'[]');
  localStorage.setItem('mock_db_user_characters',JSON.stringify(chars.slice(0,1)));
 });
 await page.setViewportSize({width:390,height:667}); await enterGame(page);
 await page.locator('.footer-item[aria-label="キャラ"]').click();
 await page.locator('.character-v2-card').first().click();
 const home=page.getByRole('region',{name:'キャラクターホーム'});
 await expect(home.getByRole('button',{name:/PARTY/})).toContainText('未編成');
 await expect(home.getByRole('button',{name:'次のキャラクター'})).toBeDisabled();
 await expect(home.getByRole('button',{name:'前のキャラクター'})).toBeDisabled();
 await expectMobileGeometry(page,'.character-home');
 await home.locator('h1').evaluate(el=>el.textContent='長いキャラクター名の表示確認用テキスト');
 await home.locator('.character-home-power strong').evaluate(el=>el.textContent='1,234,567');
 await expectMobileGeometry(page,'.character-home');
 await home.getByRole('button',{name:/Equipment/}).scrollIntoViewIfNeeded();
 await expect(home.getByRole('button',{name:/Equipment/})).toBeInViewport();
 await page.screenshot({path:test.info().outputPath('character-home-low-height-long-name.png')});
});

test('Empty roster and filters remain navigable',async({page})=>{
 await enterGame(page); await page.locator('.footer-item[aria-label="キャラ"]').click();
 await page.locator('.character-v2-filters.is-rarity').getByRole('button',{name:'N',exact:true}).click();
 await expect(page.getByText('条件に一致するキャラクターがいません。')).toBeVisible();
 await page.locator('.character-v2-filters.is-rarity').getByRole('button',{name:'レアリティ',exact:true}).click();
 await expect(page.locator('.character-v2-card')).toHaveCount(3);
});

test('Zero owned Characters exits loading',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('mock_db_user_characters','[]'));
 await enterGame(page); await page.locator('.footer-item[aria-label="キャラ"]').click();
 await expect(page.getByText('所持キャラクターがいません。')).toBeVisible();
});

test('Selection follows identity through refetch order, removal and empty filters',()=>{
 const a={character_id:'char_reiji_01'},b={character_id:'char_rui_01'};
 expect(resolveHomeCharacter([a,b],b.character_id)).toBe(b);
 expect(resolveHomeCharacter([b,a],b.character_id)).toBe(b);
 expect(resolveHomeCharacter([a],b.character_id)).toBe(a);
 expect(resolveHomeCharacter([a],'missing')).toBe(a);
 expect(resolveHomeCharacter([],a.character_id)).toBeUndefined();
});
test('Many owned Characters switch within the current filtered roster',async({page})=>{
 await page.addInitScript((characters)=>{
 const uid='00000000-0000-4000-8000-000000000829';
 localStorage.setItem('mock_db_user_characters',JSON.stringify(characters.map((entry,index)=>({id:'owned-many-'+index,user_id:uid,character_id:entry.character_id,level:1,awakening_level:0}))));
 },characterSource.characters);
 await enterGame(page); await page.locator('.footer-item[aria-label="キャラ"]').click();
 await expect(page.locator('.character-v2-card')).toHaveCount(characterSource.characters.length);
 await page.locator('.character-v2-card').last().click();
 await page.getByRole('button',{name:'次のキャラクター'}).click();
 await expect(page.locator('.character-home')).toHaveAttribute('data-character-id',characterSource.characters[0].character_id);
 await page.getByRole('button',{name:'キャラクター一覧へ戻る'}).click();
 await page.locator('.character-v2-filters.is-rarity').getByRole('button',{name:'SSR',exact:true}).click();
 const count=await page.locator('.character-v2-card').count();
 await page.locator('.character-v2-card').first().click();
 await expect(page.locator('.character-home-switch')).toContainText('1 / '+count);
});

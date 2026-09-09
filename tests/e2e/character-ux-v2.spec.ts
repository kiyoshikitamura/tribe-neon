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


test('V2 leader entry and secondary sorted list',async({page})=>{
 await enterGame(page);await page.locator('.footer-item[aria-label="キャラ"]').click();
 await expect(page.locator('.character-home')).toHaveAttribute('data-character-id','char_reiji_01');
 await page.getByRole('button',{name:'キャラ一覧',exact:true}).click();
 await expect(page.locator('.character-v2-card').first()).toContainText('レイジ');
 const powers=await page.locator('.character-v2-card-power').allTextContents();
 const values=powers.slice(1).map(x=>Number(x.replace(/.*総合力 /,'').replaceAll(',','')));
 expect(values).toEqual([...values].sort((a,b)=>b-a));
 await page.locator('.character-v2-card').last().click();await expect(page.locator('.character-home')).toBeVisible();
});
test('V2 Growth tabs and progress-only Awakening',async({page})=>{
 await enterGame(page);await page.locator('.footer-item[aria-label="キャラ"]').click();
 await page.getByRole('button',{name:'育成する',exact:true}).click();
 const growth=page.locator('.character-v2-growth');
 await expect(growth).toContainText('現在');await expect(growth).toContainText('強化後');
 await growth.getByRole('button',{name:'覚醒',exact:true}).click();
 await expect(growth).toContainText('進捗 0 / 3');await expect(growth).toContainText('進捗 1 / 3');
 await expect(growth.locator('.character-v2-current-after strong')).toHaveText(['覚醒 +3','覚醒 +3']);
 await growth.getByRole('button',{name:'スキル',exact:true}).click();
 await expect(growth.getByRole('button',{name:/スキル枠/})).toHaveCount(6);
 await expect(growth.getByRole('button',{name:'スキル枠6',exact:true})).toBeDisabled();
 await growth.getByRole('button',{name:'スキル枠1',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'スキル詳細'})).toBeVisible();
});
for(const width of [375,390,430]) test('V2 Equipment canonical breakdown '+width,async({page})=>{
 await page.setViewportSize({width,height:844});await enterGame(page);await page.locator('.footer-item[aria-label="キャラ"]').click();
 await page.locator('.character-home').getByRole('button',{name:/装備/}).click();
 await expect(page.locator('.character-equipment-slot')).toHaveCount(7);
 await expectMobileGeometry(page,'.character-equipment-stage');
 const beforeSkills=await page.evaluate(()=>localStorage.getItem('mock_db_user_skills'));
 await page.getByRole('button',{name:'おまかせ装備',exact:true}).click();
 await expect(page.locator('.character-equipment-feedback')).toContainText('装備による変化');
 expect(await page.evaluate(()=>localStorage.getItem('mock_db_user_skills'))).toBe(beforeSkills);
 const rows=await page.evaluate(()=>({char:JSON.parse(localStorage.getItem('mock_db_user_characters')||'[]')[0],equips:JSON.parse(localStorage.getItem('mock_db_user_equipments')||'[]')}));
 const base=getCharacterTotalStats(rows.char,[]),total=getCharacterTotalStats(rows.char,rows.equips);
 for(const key of ['hp','atk','def','spd','luk'] as const){await expect(page.locator('[data-stat="'+key+'"] dd strong')).toHaveText(base[key].toLocaleString());await expect(page.locator('[data-stat="'+key+'"] dd span')).toHaveText('+'+(total[key]-base[key]).toLocaleString());}
});

test('V2 Party draft cancel, confirm and leader authority',async({page})=>{
 await enterGame(page);await page.locator('.footer-item[aria-label="キャラ"]').click();await page.locator('.character-home').getByRole('button',{name:/パーティ/}).click();
 const party=page.locator('.character-v2-party');await expect(party.getByRole('button',{name:'メンバー変更',exact:true})).toBeVisible();
 await expect(party.locator('.character-party-candidates')).toHaveCount(0);await expect(party.getByRole('button',{name:'おまかせ装備',exact:true})).toHaveCount(0);
 const before=await page.evaluate(()=>localStorage.getItem('mock_db_user_main_formations'));
 await party.getByRole('button',{name:'メンバー変更',exact:true}).click();
 await party.locator('.character-party-draft-slots button').first().click();
 await party.locator('.character-party-candidates').getByRole('button',{name:'ルイ',exact:true}).click();
 await expect(party.getByRole('button',{name:'変更を確定',exact:true})).toBeInViewport();
 expect(await page.evaluate(()=>localStorage.getItem('mock_db_user_main_formations'))).toBe(before);
 await party.getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('mock_db_user_main_formations'))).toBe(before);
 await party.getByRole('button',{name:'メンバー変更',exact:true}).click();await party.locator('.character-party-draft-slots button').first().click();await party.locator('.character-party-candidates').getByRole('button',{name:'ルイ',exact:true}).click();
 await party.getByRole('button',{name:'変更を確定',exact:true}).click();await expect(party.locator('.character-party-leader')).toContainText('ルイ');
 expect(await page.evaluate(()=>localStorage.getItem('mock_db_user_main_formations'))).not.toBe(before);
 await party.getByRole('button',{name:'リーダー変更',exact:true}).click();await expect(party.locator('.character-party-leader-candidates button')).toHaveCount(3);await party.locator('.character-party-leader-candidates').getByRole('button',{name:'レイジ',exact:true}).click();await expect(party.locator('.character-party-leader')).toContainText('レイジ');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mock_db_users')||'[]')[0].favorite_character_id)).toBe('char_reiji_01');
});
test('V2 low-height equipment and party remain scrollable',async({page})=>{
 await page.setViewportSize({width:390,height:667});await enterGame(page);await page.locator('.footer-item[aria-label="キャラ"]').click();
 await expectMobileGeometry(page,'.character-home');await page.locator('.character-home').getByRole('button',{name:/装備/}).click();
 await expectMobileGeometry(page,'.character-equipment-stage');await page.getByRole('button',{name:'おまかせ装備',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'おまかせ装備',exact:true})).toBeInViewport();
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.locator('.character-home').getByRole('button',{name:/パーティ/}).click();
 await expectMobileGeometry(page,'.character-v2-party');await page.getByRole('button',{name:'メンバー変更',exact:true}).click();await expectMobileGeometry(page,'.character-party-draft-slots');
});

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
type HitFrame = {
    t: number;
    phase: string | null;
    tier: string | null;
    number: string | null | undefined;
    effects: {
        loaded: boolean;
        opacity: string;
        rect: DOMRect;
        display: string;
    }[];
    cast: boolean;
    hp: (string | null)[];
};
type TraceWindow = Window & {
    hitTrace: HitFrame[];
};
test('tutorial basic and skill impacts remain synchronized through result and continuation', async ({ page }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(40000);
    await page.setViewportSize({ width: 390, height: 844 });
    page.on("pageerror", e => console.log("PAGEERROR", e.message));
    const userId = "00000000-0000-4000-8000-000000000910";
    await page.addInitScript(({ userId }) => {
        // The application may refresh mock master projections while this journey
        // reloads between Q3 and Q5. Keep the canonical quest row available on
        // every document so the final reward claim uses the same quest authority.
        const quests = JSON.parse(localStorage.getItem("mock_db_quests") || "[]");
        if (!quests.some((quest: {
            id?: string;
        }) => quest.id === "q_shinjuku_1")) {
            quests.push({ id: "q_shinjuku_1", name: "新宿・初級", town_id: "shinjuku", difficulty: "EASY", duration_seconds: 60, cost_vitality: 5, reward_xp: 120, reward_items: [], is_unlocked: true });
            localStorage.setItem("mock_db_quests", JSON.stringify(quests));
        }
        if (sessionStorage.getItem("m9_0e_seeded") === "true")
            return;
        sessionStorage.setItem("m9_0e_seeded", "true");
        localStorage.setItem("tribe_demo_uuid", userId);
        localStorage.setItem("mock_auth_mode", "ANONYMOUS");
        localStorage.setItem("mock_db_users", JSON.stringify([{ id: userId, username: "初戦確認", cash: 10000, vitality: 100, level: 1, xp: 0, current_base_id: "shinjuku" }]));
        // This focused contract intentionally uses a one-member deck. Give that
        // isolated member enough level to represent the five-member tutorial
        // formation used by the real journey, so reward assertions cannot land on
        // a fixture-only defeat.
        localStorage.setItem("mock_db_user_characters", JSON.stringify([{ id: `starter_${userId}`, user_id: userId, character_id: "char_reiji_01", level: 100, awakening_level: 0 }]));
        localStorage.setItem("mock_db_user_skills", JSON.stringify([
            { id: `skill_sr_${userId}`, user_id: userId, skill_card_id: "SKILL_021", equipped_character_id: `starter_${userId}`, slot_index: 0, plus_val: 0 },
            { id: `skill_ssr_${userId}`, user_id: userId, skill_card_id: "SKILL_036", equipped_character_id: `starter_${userId}`, slot_index: 1, plus_val: 0 },
        ]));
        localStorage.setItem("mock_db_skill_battle_master", JSON.stringify([
            { skill_id: "SKILL_021", display_name: "SR TEST BREAK", kind: "ATTACK", target: "ENEMY_SINGLE", power_percent: 160, cooldown: 2, initial_cooldown: 0, enabled: true },
            { skill_id: "SKILL_036", display_name: "SSR TEST BREAK", kind: "ATTACK", target: "ENEMY_SINGLE", power_percent: 240, cooldown: 3, initial_cooldown: 0, enabled: true },
        ]));
        localStorage.setItem("mock_db_pvp_defense_decks", JSON.stringify([{ id: `deck_${userId}`, user_id: userId, character_1_id: `starter_${userId}` }]));
        localStorage.setItem("mock_db_tutorial_progress", JSON.stringify([{ user_id: userId, step_id: "DISPATCH" }]));
        localStorage.setItem("mock_db_user_patrols", "[]");
        localStorage.setItem("mock_db_battle_replay_sessions", "[]");
        localStorage.setItem("mock_db_presents", "[]");
    }, { userId });
    await page.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    page.on('console', m => { if (m.type() === 'error')
        console.log(m.text().slice(0, 200)); });
    const localBase = new URL(test.info().project.use.baseURL!);
    localBase.hostname = 'localhost';
    await page.goto(localBase.href);
    await page.getByRole('button', { name: 'TAP TO START', exact: true }).click();
    await page.getByRole('button', { name: /続きから|チュートリアルを続ける/ }).click();
    await page.getByRole('button', { name: '新宿へ派遣する' }).click();
    await page.getByRole('button', { name: /すぐに時短する/ }).click();
    await page.getByRole('button', { name: '次へ', exact: true }).click();
    await page.getByRole('button', { name: 'バトルへ', exact: true }).click();
    await page.getByRole('button', { name: 'バトルスタート', exact: true }).waitFor({ timeout: 30000 });
    await page.evaluate(() => { (window as unknown as TraceWindow).hitTrace = []; setInterval(() => { const root = document.querySelector('.sb-root'); if (!root)
        return; const eff = [...root.querySelectorAll<HTMLImageElement>('.sb-effect')].map((e) => ({ loaded: e.complete && e.naturalWidth > 0, opacity: getComputedStyle(e).opacity, rect: e.getBoundingClientRect().toJSON(), display: getComputedStyle(e).display })); (window as unknown as TraceWindow).hitTrace.push({ t: performance.now(), phase: root.getAttribute('data-action-phase'), tier: root.getAttribute('data-acceptance-state'), number: root.querySelector('.sb-numbers')?.textContent, effects: eff, cast: !!root.querySelector('.sb-announcement'), hp: [...root.querySelectorAll('[data-hp]')].map(e => e.getAttribute('data-hp')) }); }, 25); });
    await page.getByRole('button', { name: 'バトルスタート', exact: true }).click();
    await page.locator('.sb-root').waitFor({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'SKIP', exact: true })).toHaveCount(0);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
        const kind = await page.evaluate(() => { const e = document.querySelector('.sb-effect'); return e && Number(getComputedStyle(e).opacity) > .3 ? document.querySelector('.sb-root')?.getAttribute('data-acceptance-state') : null; });
        if (kind && !seen.has(kind)) {
            seen.add(kind);
            for (let f = 0; f < 3; f++) {
                await page.screenshot({ path: 'docs/development/evidence/character-release-tutorial-hit/' + kind + '-hit-' + f + '.png' });
                await page.waitForTimeout(75);
            }
        }
        if (await page.locator('.battle-result-summary').isVisible())
            break;
        await page.waitForTimeout(40);
    }
    const trace = await page.evaluate(() => (window as unknown as TraceWindow).hitTrace);
    fs.writeFileSync('docs/development/evidence/character-release-tutorial-hit/fixed-trace.json', JSON.stringify(trace));
    expect([...seen].sort()).toEqual(['B3', 'B4']);
    expect(trace.filter((x: HitFrame) => x.effects.length && x.cast)).toHaveLength(0);
    expect(trace.filter((x: HitFrame) => x.effects.some((e) => !e.loaded))).toHaveLength(0);
    const hpChanges = trace.filter((frame, index) => index > 0 && JSON.stringify(frame.hp) !== JSON.stringify(trace[index - 1].hp));
    expect(hpChanges.length).toBeGreaterThan(0);
    for (const frame of hpChanges) {
        expect(frame.number).toMatch(/−[\d,]+/);
        expect(frame.effects).toHaveLength(1);
    }
    await expect(page.getByRole('button', { name: 'SKIP', exact: true })).toHaveCount(0);
    await expect(page.locator('.battle-result-summary')).toBeVisible();
    await page.screenshot({ path: 'docs/development/evidence/character-release-tutorial-hit/result.png' });
    await page.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(page.locator('[data-acceptance-state="COMPLETION_DIALOGUE"]')).toBeVisible();
    await page.screenshot({ path: 'docs/development/evidence/character-release-tutorial-hit/continue.png' });
});

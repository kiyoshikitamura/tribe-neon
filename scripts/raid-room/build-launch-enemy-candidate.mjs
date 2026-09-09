import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline launch proposal only. This script never connects to a database.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = name => JSON.parse(fs.readFileSync(path.join(root, 'src/domain/gameplay/canonical/data', name), 'utf8'));
const variants = load('raid_production_20260830.json').variants;
const characters = load('characters_20260821.json').characters;
const skills = load('skills_20260821.json').skills;
const equipment = load('equipment_20260821.json').equipments;
const cities = ['新宿', '渋谷', '池袋', '六本木', '秋葉原', '川崎', '横浜'];
const difficulties = ['beginner', 'intermediate', 'advanced', 'expert'];
const rarity = { N: 0, R: 1, SR: 2, SSR: 3 };
const id = n => `SKILL_${String(n).padStart(3, '0')}`;
// Distinct regional themes: command / speed / defense / precision / disruption / force / counterplay.
const regionalSkills = [[9, 17, 26], [4, 20, 33], [6, 14, 28], [8, 21, 35], [10, 15, 30], [11, 19, 27], [6, 15, 32]];
const profiles = [];
for (const [areaIndex, variant] of variants.entries()) {
  const locals = characters.filter(c => c.hometown === cities[areaIndex]).sort((a, b) => rarity[a.rarity] - rarity[b.rarity] || a.character_id.localeCompare(b.character_id));
  for (const [tier, difficultyId] of difficulties.entries()) {
    const roster = Array.from({ length: 5 }, (_, slot) => locals[(tier * 3 + slot) % locals.length]);
    const members = roster.map((character, slot) => {
      const skillIds = [id([1, 8, 11, 19, 12][slot])];
      if (slot === 0 || tier > 0) skillIds.push(id(regionalSkills[areaIndex][Math.min(tier, 2)]));
      if (tier >= 2) skillIds.push(id([21, 28, 27, 32, 34][(areaIndex + slot) % 5]));
      // MaxHP shields/heals are intentionally absent: shared raid HP would amplify them disproportionately.
      const own = skills.find(s => s.exclusive_character_id === character.character_id && !s.effects.some(e => /SHIELD|HEAL|REGEN/.test(e)));
      if (tier >= 2 && own) skillIds.unshift(own.skill_id);
      const uniqueSkills = [...new Set(skillIds)].slice(0, tier >= 2 ? 4 : 2);
      const categories = ['WEAPON', 'BODY', 'HEAD', 'ACCESSORY'].slice(0, tier + 1);
      const equipmentIds = categories.map(category => {
        const pool = equipment.filter(e => e.category === category && ['N', 'R'].includes(e.rarity) && !e.exclusive_character_id && e.fixed_effects.every(effect => !effect || effect === '—'));
        return pool[(areaIndex * 3 + slot + tier * 5) % pool.length].equipment_id;
      });
      const atk = Math.round([100, 1400, 2300, 3200][tier] * (areaIndex === 5 ? 1.1 : 1) * [1.05, 1, .95, .9, 1][slot]);
      return {
        slot: slot + 1, characterId: character.character_id, characterName: character.name,
        level: [5, 25, 35, 45][tier], awakeningLevel: tier >= 2 ? 1 : 0,
        baseStats: { hp: Math.ceil(variant.maxHp / 5), atk, def: Math.round([1000, 3500, 5000, 6500][tier] * (areaIndex === 2 ? 1.15 : 1)), spd: [35, 85, 110, 135][tier] + (areaIndex === 1 ? 10 : 0), luk: 0 },
        equipment: equipmentIds.map(equipmentId => ({ equipmentId, level: [1, 10, 15, 20][tier], plus: [0, 0, 1, 2][tier] })),
        skills: uniqueSkills.map(skillId => ({ skillId, plus: [0, 0, 1, 2][tier] })),
      };
    });
    profiles.push({ areaId: variant.areaId, raidVariantId: variant.raidVariantId, difficultyId, raidName: variant.raidName, maxHp: variant.maxHp, minimumPower: [null, 160000, 200000, 240000][tier], members });
  }
}
for (const p of profiles) for (const m of p.members) {
  if (!characters.some(c => c.character_id === m.characterId)) throw new Error('Unknown character');
  for (const ref of m.skills) {
    const skill = skills.find(s => s.skill_id === ref.skillId);
    if (!skill || (skill.exclusive_character_id && skill.exclusive_character_id !== m.characterId)) throw new Error('Invalid skill');
  }
  for (const ref of m.equipment) {
    const e = equipment.find(e => e.equipment_id === ref.equipmentId);
    if (!e || (e.exclusive_character_id && e.exclusive_character_id !== m.characterId)) throw new Error('Invalid equipment');
  }
}
const result = { version: '2026-09-10-launch-1', status: 'offline-candidate-hp-pending-measurement', masterVersion: '2026-08-21', notes: ['Names unchanged; region-local roster rotated per difficulty.', 'baseStats are raid-only values before canonical equipment additions; Character growth stats do not drive enemies.', 'Equipment plus <=2 has no unlocked limit-break option effects.', 'HP is provisional existing variant HP until current-engine measurements.', 'No common master, reward rule, power rule or Replay computation is modified.'], profiles };
const output = path.join(root, 'config/raid-room/launch-balance.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, profiles: profiles.length, uniqueCharacters: new Set(profiles.flatMap(p => p.members.map(m => m.characterId))).size, uniqueSkills: new Set(profiles.flatMap(p => p.members.flatMap(m => m.skills.map(s => s.skillId)))).size, uniqueEquipment: new Set(profiles.flatMap(p => p.members.flatMap(m => m.equipment.map(e => e.equipmentId)))).size }));

import fs from "node:fs";

const load = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const skillMaster = load("src/domain/gameplay/canonical/data/skills_20260821.json");
const quest = load("src/domain/gameplay/canonical/data/quest_encounters_20260917.json");
const raid = load("src/domain/gameplay/canonical/data/raid_skill_battle_profiles_20260917.json");
const allowed = new Set(Array.from({ length: 50 }, (_, i) => `SKILL_${String(i + 1).padStart(3, "0")}`));
const refs = [...quest.encounters.flatMap((e) => e.members.flatMap((m) => m.skillLoadout)), ...raid.profiles.flatMap((p) => p.skillLoadout)].flatMap((v) => v);
const invalid = refs.filter((id) => !allowed.has(id) || !skillMaster.skills.some((s) => s.skill_id === id));
if (quest.encounters.length !== 21) throw new Error(`Quest count ${quest.encounters.length}`);
if (quest.encounters.some((e) => e.members.length !== 5)) throw new Error("Quest party size mismatch");
if (raid.profiles.length !== 28) throw new Error(`Raid profile count ${raid.profiles.length}`);
if (invalid.length) throw new Error(`Invalid skill refs: ${invalid.join(",")}`);
const required = ["q_shinjuku_1", "q_shinjuku_3", "q_ikebukuro_2", "q_akihabara_3", "q_kawasaki_3", "q_yokohama_3"];
if (required.some((id) => !quest.encounters.some((e) => e.questId === id))) throw new Error("Required stage missing");
console.log(JSON.stringify({ status: "PASS", questStages: quest.encounters.length, raidProfiles: raid.profiles.length, skillAuthority: "SKILL_001-SKILL_050", invalidSkillRefs: invalid.length }));

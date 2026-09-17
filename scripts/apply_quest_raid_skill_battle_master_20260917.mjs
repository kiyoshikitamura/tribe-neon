import fs from "node:fs";

const root = new URL("../", import.meta.url).pathname.replace(/^\//, "").replace(/^([A-Za-z]):/, "$1:");
const read = (relative) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), "utf8"));
const write = (relative, value) => fs.writeFileSync(new URL(relative, import.meta.url), `${JSON.stringify(value, null, 2)}\n`);

const skillMaster = read("../src/domain/gameplay/canonical/data/skills_20260821.json");
const quest = read("../src/domain/gameplay/canonical/data/quest_encounters_20260822.json");
const skillIds = new Set(skillMaster.skills.map((skill) => skill.skill_id));
const allowed = new Set(Array.from({ length: 50 }, (_, index) => `SKILL_${String(index + 1).padStart(3, "0")}`));

const questLoadouts = {
  q_shinjuku_1: ["001", "008", "011", "012", "019"], q_shinjuku_2: ["009+001", "008", "017+011", "019", "012"], q_shinjuku_3: ["026+011", "035+019", "021", "037", "041+036"],
  q_shibuya_1: ["004+001", "008", "001", "019", "012"], q_shibuya_2: ["020+019", "033+008", "030", "011", "034"], q_shibuya_3: ["033+042", "020+037", "030", "049", "021"],
  q_ikebukuro_1: ["006", "002", "001", "008", "003"], q_ikebukuro_2: ["024", "016", "023", "028", "006+019"], q_ikebukuro_3: ["047", "024", "039", "038", "028+050"],
  q_roppongi_1: ["009", "007", "001", "003", "011"], q_roppongi_2: ["026", "025", "015", "023", "019"], q_roppongi_3: ["041", "025", "015+042", "039", "037"],
  q_akihabara_1: ["005", "010", "001", "018", "008"], q_akihabara_2: ["032", "034", "030", "018", "029"], q_akihabara_3: ["040", "049", "030", "046", "018+042"],
  q_kawasaki_1: ["009", "011", "019", "001", "012"], q_kawasaki_2: ["026", "035+021", "027", "022", "019"], q_kawasaki_3: ["041", "036", "044", "043", "042"],
  q_yokohama_1: ["006", "003", "001", "008", "013"], q_yokohama_2: ["024", "023", "029", "028", "016"], q_yokohama_3: ["047", "039", "048", "025", "050"],
};
const raidLoadouts = {
  shinjuku: [["001","008","011","019","012"],["009+011","017+019","011","012","035"],["026+021","035+019","027","037","041+036"],["041+036","026+044","035+042","043","025+050"]],
  shibuya: [["004","008","001","019","012"],["020+019","033+008","030","011","034"],["033+042","020+037","030","049","021"],["033+042","020+036","030+034","049+037","025+021"]],
  ikebukuro: [["006","002","001","008","003"],["024","016","023","028","006+019"],["047","024","039","038","028+050"],["047+039","024+038","023","015+050","025+028"]],
  roppongi: [["009","007","001","003","011"],["026","025","015","023","019"],["041","025","015+042","039","037"],["041+042","025+043","015+050","039","047+037"]],
  akihabara: [["005","010","001","018","008"],["032","034","030","018","029"],["040","049","030","046","018+042"],["040+046","049","030+042","018+032","025+039"]],
  kawasaki: [["009","011","019","001","012"],["026","035+021","027","022","019"],["041","036","044","043","042"],["041+036","035+044","042+021","043","025+037"]],
  yokohama: [["006","003","001","008","013"],["024","023","029","028","016"],["047","039","048","025","050"],["047+039","024+048","025","015+050","041+037"]],
};
const expand = (value) => value.split("+").map((id) => `SKILL_${id.padStart(3, "0")}`);
const assertLoadout = (loadout, label) => loadout.flatMap(expand).forEach((id) => {
  if (!skillIds.has(id) || !allowed.has(id)) throw new Error(`${label}: non-authorized skill ${id}`);
});
Object.entries(questLoadouts).forEach(([questId, loadout]) => assertLoadout(loadout, questId));
Object.entries(raidLoadouts).forEach(([town, profiles]) => profiles.forEach((loadout, index) => assertLoadout(loadout, `raid:${town}:${index + 1}`)));

const questById = new Map(quest.encounters.map((encounter) => [encounter.questId, encounter]));
for (const [questId, loadout] of Object.entries(questLoadouts)) {
  const encounter = questById.get(questId);
  if (!encounter) throw new Error(`Quest encounter missing: ${questId}`);
  const members = encounter.members;
  while (members.length < 5) members.push({ ...members[members.length % Math.max(1, members.length)], slot: members.length + 1, skillLoadout: [] });
  members.forEach((member, index) => { member.slot = index + 1; member.skillLoadout = expand(loadout[index]); });
  encounter.enemyTactic = encounter.townId === "roppongi" || encounter.townId === "akihabara" ? "SKILL_PRIORITY" : encounter.townId === "kawasaki" ? "ATTACK_PRIORITY" : "BALANCED";
}
quest.version = "2026-09-17-skill-battle";
quest.authority = "GAME03_Quest_Raid_Skill_Battle_Master_20260917.md";
quest.skillAuthority = "src/domain/gameplay/canonical/data/skills_20260821.json (SKILL_001-SKILL_050)";
write("../src/domain/gameplay/canonical/data/quest_encounters_20260917.json", quest);

const profiles = Object.entries(raidLoadouts).flatMap(([townId, difficultyLoadouts]) => difficultyLoadouts.map((loadout, index) => ({
  profileId: `raid_${townId}_${["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"][index].toLowerCase()}`,
  townId, difficulty: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"][index], skillLoadout: loadout.map(expand),
  encounterTier: index === 0 ? "BEGINNER" : index === 1 ? "INTERMEDIATE" : index === 2 ? "ADVANCED" : "EXPERT",
})));
write("../src/domain/gameplay/canonical/data/raid_skill_battle_profiles_20260917.json", { version: "2026-09-17", authority: "GAME03_Quest_Raid_Skill_Battle_Master_20260917.md", profiles });
console.log(JSON.stringify({ questStages: Object.keys(questLoadouts).length, raidProfiles: profiles.length, enabledSkills: skillMaster.skills.filter((skill) => allowed.has(skill.skill_id) && skill.enabled !== false).length }));

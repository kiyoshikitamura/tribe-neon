import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function load(file) {
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    if (name === "react" || name === "react/jsx-runtime" || name.endsWith(".css") || name.includes("CharacterPresentation") || name.includes("ExclusiveBattlePresentation")) return {};
    const resolved = name.startsWith("@/") ? path.resolve("src", name.slice(2)) : path.resolve(path.dirname(file), name);
    return load(/\.(json|tsx?)$/.test(resolved) ? resolved : `${resolved}.ts`);
  }});
  return exports;
}
const api = load(path.resolve('src/domain/presentation/exclusiveContent.ts'));
const entries = Array.from(api.EXCLUSIVE_CONTENT);
assert.equal(entries.length, 30);
assert.equal(entries.filter(e => e.kind === 'SKILL' && e.rarity === 'SR').length, 10);
assert.equal(entries.filter(e => e.kind === 'SKILL' && e.rarity === 'SSR').length, 10);
assert.equal(entries.filter(e => e.kind === 'EQUIPMENT' && e.rarity === 'SSR').length, 10);
assert.equal(new Set(entries.map(e => e.id)).size, 30);
for (const entry of entries) {
  assert.ok(entry.characterName, `${entry.id}: missing canonical owner`);
  assert.ok(fs.existsSync(`public${entry.imageSrc}`), `${entry.id}: missing icon ${entry.imageSrc}`);
}
const sourceIds = Object.freeze(['WEAPON_047', 'WEAPON_048', 'WEAPON_001', 'SKILL_051', 'WEAPON_047']);
assert.deepEqual(Array.from(api.exclusiveEquipmentForBattleMember('char_go_01', sourceIds), e => e.id), ['WEAPON_047']);
assert.equal(sourceIds.length, 5, 'must not mutate battle equipment snapshot');
assert.equal(api.exclusiveSkillForBattleMember('char_go_01', 'SKILL_051').id, 'SKILL_051');
assert.equal(api.exclusiveSkillForBattleMember('char_reiji_01', 'SKILL_051'), null);
assert.equal(api.exclusiveSkillForBattleMember('char_tetsu_01', 'SKILL_061').id, 'SKILL_061');
assert.equal(api.resolveExclusiveContent('SKILL_001'), null);
assert.equal(api.resolveExclusiveContent('unknown'), null);
assert.equal(api.resolveExclusiveContent(null), null);
console.log('PASS: 30 canonical exclusives, SR/SSR counts, owner bindings, icon availability, snapshot filtering, no mutation');

const dialogue = load(path.resolve('src/domain/presentation/exclusiveSkillDialogue.ts'));
assert.equal(Object.keys(dialogue.EXCLUSIVE_SKILL_DIALOGUE).length, 20);
for (const entry of entries.filter(e => e.kind === 'SKILL')) assert.ok(dialogue.EXCLUSIVE_SKILL_DIALOGUE[entry.id], entry.id);
const adapter = load(path.resolve('src/hooks/battle/patrolReplayAdapter.ts'));
const snapshot = Object.freeze([{id:'saved-instance', characterId:'char_go_01', name:'ゴウ', stats:{hp:100}, equipment:[{equipmentId:'WEAPON_047'},{equipmentId:'WEAPON_048'}], skills:[]}]);
const member = adapter.patrolSnapshotToParticipants(snapshot, false)[0];
assert.equal(member.id, 'saved-instance');
assert.deepEqual(Array.from(api.exclusiveEquipmentForBattleMember(member.characterId,member.equipmentMasterIds), e => e.id), ['WEAPON_047']);
assert.equal(adapter.patrolSnapshotToParticipants([{...snapshot[0],equipment:undefined}], false)[0].equipmentMasterIds.length,0,'old replay must not borrow current loadout');
const replaySource = fs.readFileSync('src/hooks/useBattle.ts','utf8');
assert.ok(replaySource.includes('outcomeUnit && exclusiveSkill ? EXCLUSIVE_SKILL_PREFIX_MS : 0'),'delay the authoritative outcome, not only CSS');
const streetSource = fs.readFileSync('src/app/components/battle/StreetBattleViewer.tsx','utf8');
assert.ok(streetSource.includes('key={action?.unit.replayStartCursor}'),'every activation restarts full dialogue');
assert.ok(streetSource.includes('!dialogue && master && resolveCharacterGachaQuote'),'exclusive does not use Gacha quote');
const sequenceSource = fs.readFileSync('src/app/components/battle/ExclusiveBattlePresentation.tsx','utf8');
assert.ok(sequenceSource.includes('phase === "CUTIN" ? <div className="exclusive-skill-cutin">{children}</div>'),'cut-in children mount only after the dialogue phase');
assert.ok(sequenceSource.includes('EXCLUSIVE_SKILL_PREFIX_MS - 180'));
const cutInSource = fs.readFileSync('src/app/components/battle/BattleEffectPresentation.tsx','utf8');
assert.ok(cutInSource.includes('if (!visible || paused) return;'));
assert.ok(cutInSource.includes('clock.remainingMs - (performance.now() - startedAt)'));
assert.ok(fs.readFileSync('src/app/components/battle/ExclusiveBattlePresentation.tsx','utf8').includes('index * 120'));
console.log('PASS: approved dialogue, snapshot owner guard, authoritative outcome wait, repeated activation, phase-mounted cut-in, pause, 120ms bands');

const resolver = load(path.resolve('src/app/components/battle/BattleEffectPresentation.tsx')).resolveBattleSkillPresentation;
const cue = { charName: 'アゲハ', skillName: 'ネオン・アクセル' };
for (const key of ['id', 'skill_card_id', 'skill_id']) {
  const participant = { characterId: 'char_ageha_01', rarity: 'SSR', skills: [{ [key]: 'SKILL_055', name: cue.skillName }] };
  const result = resolver(cue, participant);
  assert.equal(result.skillId, 'SKILL_055');
  assert.ok(result.dialogue, 'server snapshot fallback must resolve exclusive dialogue');
  assert.equal(resolver(cue, { ...participant, characterId: 'char_go_01' }).dialogue, undefined);
}
assert.equal(resolver(cue, { characterId: 'char_ageha_01', skills: [] }).dialogue, undefined);
assert.equal(resolver(null), null);
assert.ok(streetSource.includes('resolveBattleSkillPresentation(props.skillCutIn, actor)'));
assert.ok(streetSource.includes(': fallback?.dialogue'));
console.log('PASS: fallback SKILL_055 aliases, owner guard, missing skill, null cue, Street resolver wiring');

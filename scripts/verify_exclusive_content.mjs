import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function load(file) {
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    const resolved = path.resolve(path.dirname(file), name);
    return load(resolved.endsWith('.json') ? resolved : `${resolved}.ts`);
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

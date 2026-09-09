// 公開初期値を決めるローカル実測。外部接続なし。旧監査の結果は読み込まない。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const outputDirectory = 'docs/development/raid-launch-balance';
const sourceDirectory = 'src/domain/gameplay/canonical/data/';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export const masters = Object.fromEntries(['characters','skills','equipment','equipment_progression'].map(name => [name, read(`${sourceDirectory}${name}_20260821.json`)]));
masters.raids = read(`${sourceDirectory}raid_production_20260830.json`);
masters.enemyPool = read(`${sourceDirectory}quest_enemy_pools_20260830.json`);
const characterMap = new Map(masters.characters.characters.map(row => [row.character_id,row]));
const skillMap = new Map(masters.skills.skills.map(row => [row.skill_id,row]));
const equipmentMap = new Map(masters.equipment.equipments.map(row => [row.equipment_id,row]));
const exactEquipmentFile=`${outputDirectory}/validation-exact-equipment.json`;
const exactEquipment=fs.existsSync(exactEquipmentFile)?read(exactEquipmentFile).values:null;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const effectsUrl = url(stripTypeScriptTypes(fs.readFileSync('src/domain/battle/canonical_effects.ts','utf8')));
const runtimeUrl = url(stripTypeScriptTypes(fs.readFileSync('src/domain/battle/canonical_runtime.ts','utf8')).replace('./canonical_effects.ts',effectsUrl));
const engineUrl = url(stripTypeScriptTypes(fs.readFileSync('supabase/functions/resolve-battle/engine.ts','utf8')).replace('../../../src/domain/battle/canonical_runtime.ts',runtimeUrl));
export const { resolveBattle } = await import(engineUrl);
const calculationUrl = url(stripTypeScriptTypes(fs.readFileSync('src/domain/gameplay/canonical/calculations.ts','utf8')).replace('./data/equipment_progression_20260821.json',pathToFileURL(path.resolve(sourceDirectory,'equipment_progression_20260821.json')).href));
const { canonicalCharacterStats, canonicalEquipmentFlatStat, canonicalEquipmentLevelAllowed } = await import(calculationUrl);
export const difficulties = ['beginner','intermediate','advanced','expert'];
const labels = ['初級','中級','上級','超級'];
export const seeds = [104729,130363,155921];
const statKeys = ['hp','atk','def','spd','luk'];
export function skillSnapshot(ref) {
  const skill = skillMap.get(ref.skillId);
  if (!skill) throw new Error(`スキル参照切れ ${ref.skillId}`);
  return {id:skill.skill_id,name:skill.name,activationType:skill.activation_type,target:skill.target,effects:skill.effects,cooldown:skill.cooldown,availableFromRound:skill.available_from_round,exclusiveCharacterId:skill.exclusive_character_id,skillPlusVal:ref.plus??0};
}
export function equipmentStats(refs) {
  const sum = Object.fromEntries(statKeys.map(k=>[k,0]));
  for (const ref of refs) {
    const equipment = equipmentMap.get(ref.equipmentId);
    if (!equipment || !canonicalEquipmentLevelAllowed(ref.level,ref.plus)) throw new Error(`装備参照または育成が無効 ${JSON.stringify(ref)}`);
    if (ref.plus>=3) throw new Error('追加オプションのない +0〜2 のみ今回の比較対象');
    const exact=exactEquipment?.[`${ref.equipmentId}/${ref.level}/${ref.plus}`];
    if(exactEquipment&&!exact)throw new Error(`SQL装備実測値が不足 ${JSON.stringify(ref)}`);
    for (const key of statKeys) sum[key]+=exact?exact[key]:canonicalEquipmentFlatStat(equipment.base_stats[key]??0,ref.level,ref.plus);
  }
  return sum;
}
export function memberSnapshot(member,index,team='ENEMY') {
  const character=characterMap.get(member.characterId);
  if (!character) throw new Error(`キャラクター参照切れ ${member.characterId}`);
  const equipment=equipmentStats(member.equipment);
  const stats=Object.fromEntries(statKeys.map(k=>[k,member.baseStats[k]+equipment[k]]));
  return {id:`${team.toLowerCase()}_${index+1}`,characterId:member.characterId,name:character.name,alignment:character.attribute,team,level:member.level,awakeningLevel:member.awakeningLevel,rarity:character.rarity,stats,skills:member.skills.map(skillSnapshot)};
}
export function makeParty(tier,targetOverride) {
  const ids=tier===0?['char_kenji_01','char_sawat_01','char_shun_01','char_masato_01','char_tomoya_01']:['char_lucas_01','char_kaito_01','char_shin_01','char_aoi_01','char_momoko_01'];
  const skillNumbers=tier===0?[[1],[8],[2],[3],[9]]:tier===1?[[11,8,19],[12,18,5],[16,6,1],[13,3,8],[17,15,1]]:[[21,11,19,8],[22,12,18,5],[31,16,6,1],[23,13,3,8],[26,17,15,1]];
  const eqLevel=[1,10,15,20][tier],eqPlus=[0,0,1,2][tier],awakening=[0,0,1,1][tier];
  const eqIds=tier===0?['WEAPON_001']:['WEAPON_012','HEAD_006','BODY_007','LEGS_007','ACCESSORY_013'];
  const members=ids.map((id,index)=>({slot:index+1,characterId:id,characterName:characterMap.get(id).name,level:1,awakeningLevel:awakening,equipment:eqIds.map(equipmentId=>({equipmentId,level:eqLevel,plus:eqPlus})),skills:skillNumbers[index].map(n=>({skillId:`SKILL_${String(n).padStart(3,'0')}`,plus:tier}))}));
  function refresh(member) {
    const c=characterMap.get(member.characterId);
    member.baseStats=canonicalCharacterStats(Object.fromEntries(statKeys.map(k=>[k,c[`lv1_${k}`]])),Object.fromEntries(statKeys.map(k=>[k,c[`lv100_${k}`]])),member.level,member.awakeningLevel);
    member.equipmentStats=equipmentStats(member.equipment);
    member.finalStats=Object.fromEntries(statKeys.map(k=>[k,member.baseStats[k]+member.equipmentStats[k]]));
    member.power=member.finalStats.hp+member.finalStats.atk+member.finalStats.def;
  }
  members.forEach(refresh);
  const power=()=>members.reduce((sum,m)=>sum+m.power,0);
  const target=targetOverride??[0,200000,240000,280000][tier];
  while(target>0) {
    let choice=null,best=Math.abs(power()-target);
    for(const member of members) {
      if(member.level>=100||member.level>Math.min(...members.map(m=>m.level))+2)continue;
      member.level++;refresh(member);const gap=Math.abs(power()-target);member.level--;refresh(member);
      if(gap<best){choice=member;best=gap;}
    }
    if(!choice)break;choice.level++;refresh(choice);
  }
  return {difficultyId:difficulties[tier],label:labels[tier],targetPower:target,power:power(),tactic:'BALANCED',assumption:tier===0?'開始後に N 5 人を所持した比較編成。初回配布の保証ではない。':'SR 1 人・R 4 人、攻撃・範囲・防御・回復・支援の混成。',members};
}
export function beforeProfiles() {
  return masters.raids.variants.flatMap(variant=>difficulties.map(difficultyId=>({areaId:variant.areaId,difficultyId,raidVariantId:variant.raidVariantId,raidName:variant.raidName,maxHp:variant.maxHp,members:variant.memberCharacterIds.map((id,index)=>{
    const entries=masters.enemyPool.entries.filter(e=>e.difficulty==='HARD'&&e.characterId===id).sort((a,b)=>b.localAffinity.localeCompare(a.localAffinity)||b.weight-a.weight);
    const exclusive=masters.skills.skills.filter(s=>s.exclusive_character_id===id).sort((a,b)=>a.skill_id.localeCompare(b.skill_id));
    const general=masters.skills.skills.filter(s=>!s.exclusive_character_id).sort((a,b)=>a.skill_id.localeCompare(b.skill_id));
    const refs=entries[0]?.skillLoadout??(exclusive.length?exclusive:general).slice(0,2).map(s=>s.skill_id);
    return {slot:index+1,characterId:id,characterName:characterMap.get(id).name,level:30,awakeningLevel:0,baseStats:{hp:Math.ceil(variant.maxHp/5),atk:variant.atk,def:variant.def,spd:variant.spd,luk:0},equipment:[],skills:refs.map(skillId=>({skillId,plus:0}))};
  })})));
}
export function measure(profile,party,seedList=seeds) {
  const players=party.members.map((m,i)=>memberSnapshot(m,i,'PLAYER'));
  const enemies=profile.members.map((m,i)=>memberSnapshot(m,i));
  const samples=seedList.map(seed=>{
    const result=resolveBattle(seed,'BALANCED',30,players,enemies);
    const actionIds=new Set(result.events.filter(e=>e.type==='ACTION'&&e.payload.action!=='STUN_SKIP'&&e.payload.action!=='BATTLE_START').map(e=>e.payload.actorId));
    return {seed,damage:result.playerRawDamage,rounds:result.rounds,survivors:result.player.filter(p=>p.hp>0).length,playersActed:players.filter(p=>actionIds.has(p.id)).length,enemySurvivors:result.enemy.filter(p=>p.hp>0).length,damageByCharacter:result.player.map(p=>({characterId:p.characterId,damage:p.rawDamage})),replaySha256:createHash('sha256').update(JSON.stringify(result.events)).digest('hex')};
  });
  const damage=samples.map(s=>s.damage), rounds=samples.map(s=>s.rounds);
  const average=damage.reduce((a,b)=>a+b,0)/damage.length;
  const tier=difficulties.indexOf(profile.difficultyId),people=[[2,3],[3,5],[5,10],[10,20]][tier],battles=[tier+2,tier+3];
  const supply=people.map((p,i)=>p*battles[i]);
  return {areaId:profile.areaId,difficultyId:profile.difficultyId,raidName:profile.raidName,maxHp:profile.maxHp,partyPower:party.power,seedCount:samples.length,damage:{min:Math.min(...damage),average,max:Math.max(...damage)},rounds:{min:Math.min(...rounds),max:Math.max(...rounds)},survivors:{min:Math.min(...samples.map(s=>s.survivors)),max:Math.max(...samples.map(s=>s.survivors))},minimumPlayersActed:Math.min(...samples.map(s=>s.playersActed)),participants:people,standardParticipants:[3,4,7.5,15][tier],battlesPerPerson24h:battles,totalBattles24h:supply,neededBattles:{best:Math.ceil(profile.maxHp/Math.max(...damage)),average:Math.ceil(profile.maxHp/average),worst:Math.ceil(profile.maxHp/Math.min(...damage))},uniformSupplyHours:24*profile.maxHp/(average*[3,4,7.5,15][tier]*((battles[0]+battles[1])/2)),samples};
}
export function save(file,value){fs.mkdirSync(outputDirectory,{recursive:true});fs.writeFileSync(`${outputDirectory}/${file}`,JSON.stringify(value,null,2)+'\n');}
export const parties=difficulties.map((_,i)=>makeParty(i));
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(!exactEquipment)throw new Error('先にローカルSQL検証で validation-exact-equipment.json を生成してください');
  const mode=process.argv[2]??'initial';
  const config=read('config/raid-room/launch-balance.json');
  const profiles=mode==='before'?beforeProfiles():config.profiles;
  save('parties.json',{powerFormula:'5人の装備込み HP+ATK+DEF。SPD/LUK・Skill点は加算しない。',parties});
  save('current-master-snapshot.json',{sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files:Object.fromEntries(['characters_20260821.json','skills_20260821.json','equipment_20260821.json','equipment_progression_20260821.json','raid_production_20260830.json','quest_enemy_pools_20260830.json'].map(n=>[sourceDirectory+n,hash(sourceDirectory+n)])),engineFiles:Object.fromEntries(['src/domain/battle/canonical_runtime.ts','src/domain/battle/canonical_effects.ts','supabase/functions/resolve-battle/engine.ts'].map(f=>[f,hash(f)])),masters,bonusAuthority:'現候補Room開始snapshotとfinalizeに本人×2/Guild×2は存在しない。注入・後処理乗算なし。既存canonical target属性1.2のみ。'});
  const rows=profiles.map(p=>measure(p,parties[difficulties.indexOf(p.difficultyId)]));
  save(`simulation-${mode}.json`,{mode,seeds,engine:'現repo Edge resolveBattle → 未改変 canonical runtime',profiles,rows});
  console.log(JSON.stringify(rows.map(({areaId,difficultyId,damage,rounds,survivors,minimumPlayersActed,uniformSupplyHours})=>({areaId,difficultyId,damage,rounds,survivors,minimumPlayersActed,uniformSupplyHours})),null,2));
}

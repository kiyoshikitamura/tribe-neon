// 初回実測に対する必要修正1巡。外部接続・Replay式変更は行わない。
import fs from 'node:fs';
import { difficulties, parties, measure, save, seeds } from './raid-launch-balance-simulate.mjs';
const configPath='config/raid-room/launch-balance.json';
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const baseline=JSON.parse(fs.readFileSync('docs/development/raid-launch-balance/simulation-initial.json','utf8'));
// 実測結果を保存した初回設定から再現し、同じファイルへの再実行で重ねて減算しない。
config.profiles=structuredClone(baseline.profiles);
for(const profile of config.profiles){
  const tier=difficulties.indexOf(profile.difficultyId);
  for(const member of profile.members){
    member.baseStats.atk=Math.round(member.baseStats.atk*[1,1,.65,.50][tier]);
    if(tier>=2)member.awakeningLevel=1;
  }
}
const correctedRows=config.profiles.map(profile=>measure(profile,parties[difficulties.indexOf(profile.difficultyId)]));
save('simulation-pressure-correction.json',{purpose:'上級/超級の早期全滅・Damage逆転に対する必要修正1案。HPは初回値のまま。',seeds,profiles:structuredClone(config.profiles),rows:correctedRows});
for(const profile of config.profiles){
  const tier=difficulties.indexOf(profile.difficultyId);
  const row=correctedRows.find(r=>r.areaId===profile.areaId&&r.difficultyId===profile.difficultyId);
  const desired=row.damage.average*[3,4,7.5,15][tier]*[2.5,3.5,4.5,5.5][tier]*.625;
  const rounding=desired<1000000?10000:100000;
  profile.maxHp=Math.max(rounding,Math.round(desired/rounding)*rounding);
  for(const member of profile.members)member.baseStats.hp=Math.ceil(profile.maxHp/5);
}
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
const finalRows=config.profiles.map(profile=>measure(profile,parties[difficulties.indexOf(profile.difficultyId)]));
save('simulation-final.json',{purpose:'必要修正1案と共有HP調整後の現行エンジン再実測',seeds,profiles:config.profiles,rows:finalRows});
const abnormal=finalRows.filter(row=>{
  const tier=difficulties.indexOf(row.difficultyId);
  const lower=finalRows.find(r=>r.areaId===row.areaId&&r.difficultyId===difficulties[tier-1]);
  return row.minimumPlayersActed<5||row.damage.min===0||row.damage.max>row.damage.min*1.5||row.uniformSupplyHours<12||row.uniformSupplyHours>18||row.rounds.min<8||row.rounds.max-row.rounds.min>=8||(lower&&row.damage.average<lower.damage.average*.85);
});
const additional=abnormal.map(row=>{const profile=config.profiles.find(p=>p.areaId===row.areaId&&p.difficultyId===row.difficultyId);return measure(profile,parties[difficulties.indexOf(profile.difficultyId)],[196613,216091,262147]);});
save('simulation-additional.json',{purpose:'偏り・異常条件に該当した組だけ追加3seed。設定再変更なし。',criteria:'全員行動未達、Damage0、Max/Min>1.5、供給換算時間12〜18h外、8round未満、round幅8以上、1段階下の平均Damageの85%未満',rows:additional});
const combined=finalRows.map(row=>{
  const extra=additional.find(r=>r.areaId===row.areaId&&r.difficultyId===row.difficultyId);
  const samples=row.samples.concat(extra?.samples??[]),damages=samples.map(s=>s.damage),average=damages.reduce((a,b)=>a+b,0)/damages.length;
  return {...row,seedCount:samples.length,samples,damage:{min:Math.min(...damages),average,max:Math.max(...damages)},rounds:{min:Math.min(...samples.map(s=>s.rounds)),max:Math.max(...samples.map(s=>s.rounds))},survivors:{min:Math.min(...samples.map(s=>s.survivors)),max:Math.max(...samples.map(s=>s.survivors))},minimumPlayersActed:Math.min(...samples.map(s=>s.playersActed)),neededBattles:{best:Math.ceil(row.maxHp/Math.max(...damages)),average:Math.ceil(row.maxHp/average),worst:Math.ceil(row.maxHp/Math.min(...damages))},uniformSupplyHours:row.uniformSupplyHours*row.damage.average/average};
});
save('simulation-summary.json',{purpose:'最終設定での3seed＋偏り4組の追加3seedを統合。時間は均等供給換算であり実時計測ではない。',battleCount:combined.reduce((n,r)=>n+r.seedCount,0),rows:combined});
console.table(finalRows.map(r=>({area:r.areaId,tier:r.difficultyId,hp:r.maxHp,min:r.damage.min,avg:Math.round(r.damage.average),max:r.damage.max,rounds:`${r.rounds.min}-${r.rounds.max}`,survivors:`${r.survivors.min}-${r.survivors.max}`,battles:r.neededBattles.average,hours:r.uniformSupplyHours.toFixed(1)})));

// SQL numeric 丸めの1HP差を比較用snapshotへ反映。HP案・共通式を変更しない。
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { outputDirectory, parties, measure, save } from './raid-launch-balance-simulate.mjs';
const read=file=>JSON.parse(fs.readFileSync(`${outputDirectory}/${file}`,'utf8'));
for(const mode of ['before','initial','pressure-correction','final']){
  const file=`simulation-${mode}.json`,data=read(file);
  data.rows=data.rows.map(row=>row.difficultyId==='advanced'?measure(data.profiles.find(p=>p.areaId===row.areaId&&p.difficultyId===row.difficultyId),parties[2],row.samples.map(s=>s.seed)):row);
  data.exactSnapshotCorrection='上級5人の装備HPを現在SQL実計算値へ各1減算。影響する上級7組だけ同じseedで再実測。共有HP変更なし。';
  save(file,data);
}
const final=read('simulation-final.json');
const additional=read('simulation-additional.json');
additional.rows=additional.rows.map(row=>row.difficultyId==='advanced'?measure(final.profiles.find(p=>p.areaId===row.areaId&&p.difficultyId===row.difficultyId),parties[2],row.samples.map(s=>s.seed)):row);
additional.exactSnapshotCorrection='上級追加3組だけ同じseedで再実測。共有HP変更なし。';save('simulation-additional.json',additional);
const combined=final.rows.map(row=>{
  const extra=additional.rows.find(r=>r.areaId===row.areaId&&r.difficultyId===row.difficultyId);
  const samples=row.samples.concat(extra?.samples??[]),damages=samples.map(s=>s.damage),average=damages.reduce((a,b)=>a+b,0)/damages.length;
  return {...row,seedCount:samples.length,samples,damage:{min:Math.min(...damages),average,max:Math.max(...damages)},rounds:{min:Math.min(...samples.map(s=>s.rounds)),max:Math.max(...samples.map(s=>s.rounds))},survivors:{min:Math.min(...samples.map(s=>s.survivors)),max:Math.max(...samples.map(s=>s.survivors))},minimumPlayersActed:Math.min(...samples.map(s=>s.playersActed)),neededBattles:{best:Math.ceil(row.maxHp/Math.max(...damages)),average:Math.ceil(row.maxHp/average),worst:Math.ceil(row.maxHp/Math.min(...damages))},uniformSupplyHours:row.uniformSupplyHours*row.damage.average/average};
});
save('simulation-summary.json',{purpose:'最終設定での3seed＋偏り4組の追加3seedを統合。時間は均等供給換算であり実時計測ではない。装備statは現行SQLをローカルPGliteで実行した整数値。',battleCount:combined.reduce((n,r)=>n+r.seedCount,0),rows:combined});
save('parties.json',{powerFormula:'5人の装備込み HP+ATK+DEF。SPD/LUK・Skill点は加算しない。',equipmentAuthority:'validation-exact-equipment.jsonのローカルSQL実計算値',parties});
const master=read('current-master-snapshot.json');
master.equipmentSnapshotAuthority={file:'validation-exact-equipment.json',sha256:createHash('sha256').update(fs.readFileSync(`${outputDirectory}/validation-exact-equipment.json`)).digest('hex'),reason:'SQL numericとJS rationalの丸め差を排除。共通式の変更なし。'};
save('current-master-snapshot.json',master);
console.log('上級31組のsnapshot整数補正再実測。HP/config変更なし。');

"""未承認の21Pool候補と素材別比較を生成。DB接続・適用なし。"""
import json
from pathlib import Path
areas=['SHINJUKU','SHIBUYA','IKEBUKURO','ROPPONGI','AKIHABARA','KAWASAKI','YOKOHAMA']
# C / E / 指南書 / 改造パーツ / Normal RANDOM / Normal SKILL の期待個数×10000
values={
'EASY':[[12000,0,0,0,0,0],[8000,2000,0,0,0,100],[8000,4000,0,0,0,0],[8000,2000,200,0,0,0],[8000,2000,0,0,100,0],[8000,2000,0,200,0,0],[10000,3000,0,0,0,0]],
'NORMAL':[[12000,8000,500,0,0,0],[10000,8000,500,0,0,300],[8000,12000,500,0,0,0],[10000,8000,1000,0,0,0],[10000,8000,200,0,300,0],[10000,8000,200,300,0,0],[10000,10000,500,0,0,0]],
'HARD':[[12000,8400,1200,1200,300,0],[10000,10000,1200,600,100,400],[8000,11600,1200,1200,300,0],[10000,10000,2000,600,100,0],[10000,10000,900,900,900,0],[10000,10000,600,2000,100,0],[10000,10000,1200,1200,300,0]]}
base={'EASY':[10000,2000,0,0,0,0],'NORMAL':[10000,10000,500,0,0,0],'HARD':[10000,10000,1200,1200,300,0]}
items=json.loads(Path('src/domain/gameplay/canonical/data/items_20260822.json').read_text())['items'];ids={i['id'] for i in items}
# RANDOMはInventory IDではなく既存Questの具体Ticketへ解決する報酬トークン。
quest_source=Path('src/domain/gameplay/canonical/data/quests_20260830.json').read_text()
assert '"NORMAL_GACHA_TICKET_RANDOM"' in quest_source
ids.add('NORMAL_GACHA_TICKET_RANDOM')
rows=[]
text=['# Quest地域別報酬：21Pool確定用候補','','**未承認・未適用。** 初級から7地域の報酬を区別する案。抽選の期待個数を示す。','渋谷は既存Normalスキルチケット、六本木は指南書で区別する。初級へのチケット/指南書/パーツ追加は新規供給となる。','素材間の円換算は未確定のため総期待価値同等とは判断しない。割引商品は価値基準に使用しない。','','|地域|難度|キャラ素材|装備素材|指南書|パーツ|Normal RANDOM|Normal SKILL|','|---|---|---:|---:|---:|---:|---:|---:|']
for tier,suffix in [('EASY','S'),('NORMAL','M'),('HARD','L')]:
 keys=[f'CHAR_EXP_{suffix}',f'EQUIP_EXP_{suffix}','SKILL_MANUAL','EQUIP_LB_PART','NORMAL_GACHA_TICKET_RANDOM','NORMAL_GACHA_TICKET_SKILL'];assert all(i in ids for i in keys)
 for area,v in zip(areas,values[tier]):
  rolls=[]
  for item,n in zip(keys,v):
   if n>=10000:rolls.append({'itemId':item,'quantity':n//10000,'probabilityBp':10000})
   if n%10000:rolls.append({'itemId':item,'quantity':1,'probabilityBp':n%10000})
  rows.append({'area':area,'difficulty':tier,'poolId':f'QUEST_{area}_{tier}_20260914','rolls':rolls})
  text.append('|'+ '|'.join([area,tier]+[f'{n/10000:g}' for n in v])+'|')
text+=['','## 素材別供給量の比較','','各地域を均等に選んだ仮定の平均と、1地域へ集中した最大値。地域均等選択を保証しない。','地元一致は各0より大きく100%未満の抽選へ+200bp。初級1%チケットは地元一致で3%となる。','','|難度|素材|従来|候補平均|最大地域|最大期待値|地元一致の最大|','|---|---|---:|---:|---|---:|---:|']
for tier in values:
 for i,item in enumerate(['キャラ素材','装備素材','指南書','パーツ','Normal RANDOM','Normal SKILL']):
  col=[r[i] for r in values[tier]];m=max(col);h=m+(min(200,10000-m%10000) if m%10000 else 0)
  text.append(f'|{tier}|{item}|{base[tier][i]/10000:g}|{sum(col)/70000:.4f}|{areas[col.index(m)]}|{m/10000:g}|{h/10000:g}|')
text+=['','## 確定依頼','','この21Poolを採用するか。初級の新規供給、地元一致で1%→3%となるTicket供給、素材間の価値差を含めた判断が必要。','確定後は独立Poolの抽選行だけを更新。Energy・時間・EXP・CASH・地元Snapshot・ガチャ内部確率は変更しない。']
Path('docs/development/quest_identity_review_candidate_20260914.json').write_text(json.dumps({'status':'PENDING_USER_FIX','version':'2026-09-14-review-v2','rows':rows},ensure_ascii=False,indent=2)+'\n')
Path('docs/development/quest_identity_review_candidate_20260914.md').write_text('\n'.join(text)+'\n')
print('21 candidate pools, existing item IDs, supply comparison generated; DB unchanged')

"use client";
import { useEffect, useMemo, useState } from "react";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { getAttributeBadgeAsset, getAttributeLabel } from "@/utils/attributeAssets";
import { getRarityBadgeAsset } from "@/utils/rarityAssets";
import { analyzeBattleResult, type BattleResultReplayEvent } from "@/domain/presentation/battleResultScoring";
import { resolveCharacterGachaQuote } from "@/domain/presentation/characterGachaQuotes";
import "./flow.css";

const find=(name:string)=>CHARACTERS_MASTER.find(c=>c.jpName===name)!;
const allies=["レイジ","アゲハ","ゴウ","カエデ","コハル"].map(find);
const enemies=["ケンゴ","レオ","ミオ","ミヤビ","カレン"].map(find);
const art=(c:typeof allies[number])=>getCharacterTransparentImg(c.name);
const tactics=["攻撃優先","回復優先","スキル優先","バランス","弱点集中"];
type Screen="setup"|"vs"|"result";
type Outcome="win"|"loss"|"pending";

// Synthetic replay fixture, not a real match or reward grant. Uses existing MVP scoring unchanged.
function fixture(loss:boolean):BattleResultReplayEvent[]{
  const events:BattleResultReplayEvent[]=[];
  const add=(type:string,payload:Record<string,unknown>)=>events.push({index:events.length,round:3,type,payload});
  add("DAMAGE",{actorId:allies[0].id,targetId:enemies[0].id,hpDamage:4200});
  add("DAMAGE",{actorId:allies[1].id,targetId:enemies[1].id,hpDamage:1800});
  add("HEAL",{actorId:allies[3].id,targetId:allies[0].id,effectiveAmount:2400});
  add("EFFECT",{actorId:allies[3].id,kind:"SHIELD",amount:1200});
  add("DAMAGE",{actorId:allies[3].id,targetId:enemies[2].id,hpDamage:1200});
  if(loss){
    allies.forEach(c=>{add("DAMAGE",{actorId:enemies[0].id,targetId:c.id,hpDamage:3000});add("DEFEAT",{targetId:c.id});});
  }else{
    enemies.forEach((c,i)=>{add("DAMAGE",{actorId:allies[0].id,targetId:c.id,hpDamage:1000+i*100});add("DEFEAT",{targetId:c.id});});
  }
  add("RESULT",{winner:loss?"ENEMY":"PLAYER"});return events;
}

export default function BattleFlowMock(){
  const [screen,setScreen]=useState<Screen>("setup");
  const [outcome,setOutcome]=useState<Outcome>("win");
  const [tutorial,setTutorial]=useState(true);
  const [tactic,setTactic]=useState("攻撃優先");
  const [details,setDetails]=useState(false);
  const [vsReady,setVsReady]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState(false);
  const [loadKey,setLoadKey]=useState(0);
  const [notice,setNotice]=useState("");
  const analysis=useMemo(()=>analyzeBattleResult(fixture(outcome==="loss"),[...allies.map(c=>({id:c.id,characterId:c.id,name:c.jpName,isEnemy:false})),...enemies.map(c=>({id:c.id,characterId:c.id,name:c.jpName,isEnemy:true}))]),[outcome]);
  const mvp=analysis.mvp!;
  const hero=find(mvp.participant.name);
  useEffect(()=>{
    let cancelled=false;
    const sources=[...allies,...enemies].flatMap(c=>[art(c),getRarityBadgeAsset(c.rarity),getAttributeBadgeAsset(c.alignment)!]);
    sources.push("/bg/bg_street_shinjuku.jpg","/ui/icon_cash.png");
    const timer=setTimeout(()=>{if(!cancelled)setError(true);},15000);
    Promise.all([...new Set(sources)].map(src=>new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>{img.decode().then(()=>resolve(),reject);};img.onerror=reject;img.src=src;}))).then(()=>document.fonts.load("20px TNFlow","出撃準備勝利敗北")).then(()=>{clearTimeout(timer);if(!cancelled){setReady(true);setError(false);}}).catch(()=>{clearTimeout(timer);if(!cancelled)setError(true);});
    return()=>{cancelled=true;clearTimeout(timer);};
  },[loadKey]);
  useEffect(()=>{setVsReady(false);if(screen!=="vs")return;const timer=setTimeout(()=>setVsReady(true),1600);return()=>clearTimeout(timer);},[screen]);
  function change(next:Screen){setScreen(next);setDetails(false);setNotice("");}
  function portrait(c:typeof allies[number]){return <div className="bf-face" data-character={c.name}><img src={art(c)} alt={c.jpName}/></div>;}
  function team(members:typeof allies,label:string){return <section className="bf-team" aria-label={label}><header><h2>{label}</h2><span>5 / 5</span></header><div className="bf-members">{members.map(c=><div key={c.id}>{portrait(c)}<strong>{c.jpName}</strong><div className="bf-badges"><img src={getRarityBadgeAsset(c.rarity)} alt={c.rarity}/><img src={getAttributeBadgeAsset(c.alignment)!} alt={`属性：${getAttributeLabel(c.alignment)}`}/></div></div>)}</div></section>;}
  if(!ready)return <main className="bf-loading"><p>{error?"素材を読み込めませんでした":"画面素材を準備中…"}</p>{error&&<button onClick={()=>{setError(false);setLoadKey(k=>k+1);}}>再読み込み</button>}</main>;
  return <main className={`bf-root bf-${screen}`}>
    <nav className="bf-qa" aria-label="画面比較"><small>前後画面モック / 固定データ</small><div>{([['setup','出撃準備'],['vs','VS演出'],['result','Result']] as const).map(([key,label])=><button key={key} aria-pressed={screen===key} onClick={()=>change(key)}>{label}</button>)}</div></nav>
    <div className="bf-screen" key={screen}>
      {screen==="setup"&&<>
        <header className="bf-heading"><small>QUEST / SHINJUKU</small><h1>出撃準備</h1><p>新宿・初級</p></header>
        <section className="bf-ready-hero" aria-label="対戦リーダー"><img className="bf-ready-player" src={art(allies[0])} alt="レイジ"/><img className="bf-ready-enemy" src={art(enemies[0])} alt="ケンゴ"/><div className="bf-versus">VS</div><div className="bf-power"><div><small>YOUR TEAM</small><b>レイジ</b><span>総合力 112,800</span></div><div><small>ENEMY</small><b>ケンゴ</b><span>総合力 98,400</span></div></div></section>
        {team(allies,"出撃メンバー")}
        <details className="bf-details"><summary>対戦相手の編成を見る</summary>{team(enemies,"敵メンバー")}<p>総合力は比較用の固定値です。勝利を保証する表示ではありません。</p></details>
        <section className="bf-strategy"><div><small>作戦</small><strong>{tactic}</strong></div>{tutorial?<span>チュートリアルでは変更しません</span>:<select aria-label="作戦" value={tactic} onChange={e=>setTactic(e.target.value)}>{tactics.map(t=><option key={t}>{t}</option>)}</select>}</section>
        <footer className="bf-actions"><button className="bf-primary" onClick={()=>change("vs")}>バトルスタート</button><small>オートで進行します</small></footer>
        <label className="bf-toggle"><input type="checkbox" checked={tutorial} onChange={e=>{setTutorial(e.target.checked);setTactic("攻撃優先");}}/>チュートリアル表示（通常戦の作戦変更も比較可能）</label>
      </>}
      {screen==="vs"&&<>
        <header className="bf-heading"><small>新宿・初級</small><h1>対戦開始</h1></header>
        <section className="bf-matchup" aria-label="レイジ対ケンゴ"><div className="bf-vs-person player"><img src={art(allies[0])} alt="レイジ"/><b>レイジ</b></div><strong className="bf-vs-mark">VS</strong><div className="bf-vs-person enemy"><img src={art(enemies[0])} alt="ケンゴ"/><b>ケンゴ</b></div><span className="bf-start">BATTLE START</span></section>
        <div className="bf-bridge"><p>{vsReady?"本実装では、ここからバトルへ移ります":"対戦相手を表示中…"}</p><a href="/qa/battle-presentation-v3" target="_blank" rel="noreferrer">FIX済みバトル演出を別タブで確認</a><button disabled={!vsReady} className="bf-primary" onClick={()=>change("result")}>Resultモックへ</button><small>このモックでは戦闘・報酬付与を実行しません</small></div>
      </>}
      {screen==="result"&&<>
        <div className="bf-outcomes" aria-label="結果比較">{([['win','勝利'],['loss','敗北'],['pending','報酬確定待ち']] as const).map(([key,label])=><button key={key} aria-pressed={outcome===key} onClick={()=>{setOutcome(key);setDetails(false);setNotice("");}}>{label}</button>)}</div>
        <header className={`bf-heading bf-outcome ${outcome==="loss"?"loss":""}`}><small>新宿・初級 / QUEST RESULT</small><h1>{outcome==="loss"?"DEFEAT":"VICTORY"}</h1><p>{outcome==="loss"?"クエスト失敗":"クエストクリア"}</p></header>
        <section className="bf-mvp" aria-label="MVP"><img src={art(hero)} alt={hero.jpName}/><div className="bf-mvp-copy"><small>{outcome==="loss"?"味方で最も貢献":"MVP"}</small><h2>{hero.jpName}</h2><strong>{mvp.score.total}<span> PT</span></strong><p>{resolveCharacterGachaQuote(hero.id)}</p><small>既存セリフの仮配置</small></div></section>
        <div className="bf-highlights"><div><small>与ダメージ</small><b>{mvp.raw.damage.toLocaleString()}</b></div><div><small>撃破</small><b>{mvp.raw.kills}<span> 体</span></b></div><div><small>回復</small><b>{mvp.raw.heal.toLocaleString()}</b></div></div>
        <section className="bf-rewards" aria-label="報酬"><h2>{outcome==="loss"?"次の挑戦に向けて":"獲得報酬"}</h2>{outcome==="pending"?<p role="status">報酬データを準備中…</p>:outcome==="loss"?<p>編成・装備スキル・作戦を確認しましょう。</p>:<div><img src="/ui/icon_cash.png" alt="CASH"/><b>1,200</b><span>PLAYER XP</span><b>240</b></div>}<small>表示比較用。実際の報酬は付与されません。</small></section>
        <button className="bf-secondary" aria-expanded={details} onClick={()=>setDetails(v=>!v)}>戦果・MVP内訳{details?"を閉じる":"を見る"}</button>
        {details&&<section className="bf-breakdown"><h2>MVPスコア内訳</h2><dl>{([['damage','与ダメージ',40],['kills','撃破',20],['heal','回復',20],['shield','シールド',15],['survival','生存',5]] as const).map(([key,label,max])=><div key={key}><dt>{label}</dt><dd>{mvp.score[key]} / {max}</dd></div>)}</dl><h2>敵味方の戦果</h2><p>総ダメージ：味方 {analysis.player.damage.toLocaleString()} / 敵 {analysis.enemy.damage.toLocaleString()}</p><p>生存：味方 {analysis.player.survivors} / 敵 {analysis.enemy.survivors}</p><small>固定リプレイを既存のMVP計算に入力しています。評価式の変更はありません。</small></section>}
        <footer className="bf-actions"><button className="bf-primary" disabled={outcome==="pending"} onClick={()=>setNotice(outcome==="loss"?"本実装では編成・育成への導線に接続します。":"本実装では既存の完了処理・次の導線に接続します。")}>{outcome==="pending"?"報酬確定中…":outcome==="loss"?"編成を確認する":"次へ"}</button>{outcome==="pending"&&<button className="bf-secondary" onClick={()=>setOutcome("win")}>報酬確定を模擬する</button>}<p role="status">{notice}</p></footer>
      </>}
    </div>
  </main>;
}

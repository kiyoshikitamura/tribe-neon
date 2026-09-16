'use client';
import { useEffect,useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useGame } from '../../context/GameContext';
import OutlawButton from '../ui/OutlawButton';
import RewardIcon from '../quest/QuestRewardIcon';
import { canonicalItemName } from '@/domain/gameplay/canonical/items';
type Bonus={roomId:string;rewardMultiplier?:number;items:{itemId:string;quantity:number}[];issued:boolean;cash?:number;userXp?:number;legacyIssued?:boolean;delivery?:'DIRECT'|'PRESENT'};
export default function QuestRaidBonus({roomId}:{roomId:string}){
 const {session}=useGame();const owner=session?.user?.id;
 const [bonus,setBonus]=useState<Bonus|null>(null);const [failed,setFailed]=useState(false);const [revision,setRevision]=useState(0);
 useEffect(()=>{let current=true;setBonus(null);setFailed(false);
  void Promise.resolve(supabase.rpc('get_quest_raid_bonus_v1',{p_room_id:roomId})).then(response=>{
   if(!current)return;
   if(response.error){if(response.error.code!=='PGRST202')setFailed(true);return;}
   if(response.data?.roomId===roomId&&Array.isArray(response.data.items))setBonus(response.data as Bonus);
  }).catch(()=>{if(current)setFailed(true);});return()=>{current=false;};
 },[roomId,owner,revision]);
 if(failed)return <OutlawButton onClick={()=>setRevision(v=>v+1)}>報酬を再確認</OutlawButton>;
 if(!bonus || typeof bonus.cash !== 'number' || typeof bonus.userXp !== 'number')return null;
 return <details className="raid-reward-items"><summary>クエスト発見・撃破ボーナス</summary><p>{bonus.legacyIssued ? '以前の条件で受取済みです' : bonus.issued ? '獲得しました' : '撃破・貢献条件達成で獲得'}</p>{!bonus.legacyIssued && <div className="quest-reward-grid"><RewardIcon itemId="CASH" label="CASH" quantity={bonus.cash}/><RewardIcon itemId="PLAYER_XP" label="プレイヤー経験値" quantity={bonus.userXp}/>{bonus.items.map((item,index)=><RewardIcon key={`${item.itemId}-${index}`} itemId={item.itemId} label={canonicalItemName(item.itemId)} quantity={item.quantity}/>)}</div>}</details>;
}

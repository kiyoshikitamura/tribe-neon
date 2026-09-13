'use client';
import { useEffect,useState } from 'react';
import { supabase } from '@/utils/supabase';
import { ITEMS_MASTER_DATA } from '@/utils/items_master_data';
import { useGame } from '../../context/GameContext';
import OutlawButton from '../ui/OutlawButton';
type Bonus={roomId:string;rewardMultiplier?:number;items:{itemId:string;quantity:number}[];issued:boolean};
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
 if(bonus?.rewardMultiplier===2)return <p className="quest-encounter-bonus">報酬2倍</p>;
 if(!bonus?.items.length)return null;
 return <details className="raid-reward-items"><summary>報酬ボーナス</summary><p>{bonus.issued?'プレゼントBOXへ送付済み':'討伐・貢献条件達成で獲得'}</p><ul>{bonus.items.map(item=><li key={item.itemId}>{ITEMS_MASTER_DATA.find(i=>i.id===item.itemId)?.name||'報酬'} × {item.quantity}</li>)}</ul></details>;
}

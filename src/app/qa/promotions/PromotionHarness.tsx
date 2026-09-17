'use client';
import { useEffect, useRef, useState } from 'react';
import { GameContext } from '@/app/context/GameContext';
import { supabase } from '@/utils/supabase';
import ShinjukuPromotionDialog from '@/app/components/promotion/ShinjukuPromotionDialog';
import CanonicalDialog from '@/app/components/ui/CanonicalDialog';
export default function PromotionHarness() {
 const [ready,setReady]=useState(false);
 const [tab,setTab]=useState('home');
 const [blocked,setBlocked]=useState(false);
 const [events,setEvents]=useState<string[]>([]);
 const seen=useRef(new Set<string>());
 useEffect(()=>{
  const original=supabase.rpc;
  supabase.rpc=((name:string,args:Record<string,string>)=>{
   if(name!=='promotion_dialog') return Promise.reject(Error('QA blocks unrelated RPC'));
   const op=args.p_operation;
   if(op==='claim') {
    const promo=!seen.current.has('beginner_pack')?'beginner_pack':!seen.current.has('tribe_join')?'tribe_join':null;
    return Promise.resolve({data:promo?{id:promo,promotion_id:promo,period_key:'qa'}:null,error:null});
   }
   if(op==='view') seen.current.add(args.p_presentation_id);
   setEvents(current=>[...current,`${args.p_presentation_id}:${op}`]);
   return Promise.resolve({data:{ok:true},error:null});
  }) as unknown as typeof original;
  setReady(true);
  return ()=>{supabase.rpc=original;};
 },[]);
 const game={session:{user:{id:'qa-promotions'}},activeTab:tab,onboardingState:{gameplay_authorized:true},loginBonusCheckComplete:true,prepMissionDialogCheckComplete:true,rankingRewardNotificationCheckComplete:true,navigateTab:setTab,playCyberSe:()=>undefined};
 return <GameContext.Provider value={game as any}><div className="app-container"><h1>Promotion QA</h1>
 <p data-testid="current-tab">{tab}</p><button onClick={()=>setTab('home')}>マイページ</button><button onClick={()=>setTab('patrol')}>クエスト</button>
 <button onClick={()=>setBlocked(true)}>通知を表示</button>
 {blocked&&<CanonicalDialog title="報酬通知" actions={[{label:'閉じる',onClick:()=>setBlocked(false)}]}>表示競合の検証</CanonicalDialog>}
 {ready&&<ShinjukuPromotionDialog/>}<pre data-testid="events">{events.join('\n')}</pre>
 </div></GameContext.Provider>;
}

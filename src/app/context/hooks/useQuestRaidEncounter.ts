import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { parseQuestRaidEncounter, type QuestRaidEncounter } from '@/domain/quest/raidEncounter';

export function useQuestRaidEncounter(owner: string | undefined, completedPatrolId: string | undefined) {
  const [entries,setEntries]=useState<QuestRaidEncounter[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [resolving,setResolving]=useState(false);
  const [loadedOwner,setLoadedOwner]=useState<string|undefined>(undefined);
  const ownerRef=useRef(owner);
  useEffect(()=>{ownerRef.current=owner;},[owner]);
  const inflight=useRef<Promise<void>|null>(null);
  const unsupported=useRef(false);
  const refresh=useCallback(async()=>{
    if(!owner||unsupported.current)return;
    if(inflight.current)return inflight.current;
    const run=async()=>{
      setResolving(true);
      try {
        const response=await supabase.rpc('get_quest_raid_encounters_v1',{});
        if(ownerRef.current!==owner)return;
        if(response.error){
          if(response.error.code==='PGRST202'){unsupported.current=true;setEntries([]);return;}
          throw response.error;
        }
        if(!Array.isArray(response.data))throw new Error('invalid encounter response');
        const list=response.data.map(parseQuestRaidEncounter);
        // Resolve one pending completion per refresh. Do not create a cascade of rooms.
        const pending=list.find(e=>e.status==='PENDING'||e.status==='DRAWN');
        if(pending){
          const resolved=await supabase.rpc('resolve_quest_raid_encounter_v1',{p_patrol_id:pending.patrolId});
          if(ownerRef.current!==owner)return;
          if(resolved.error)throw resolved.error;
          const result=parseQuestRaidEncounter(resolved.data);
          list.splice(list.indexOf(pending),1,result);
        }
        setEntries(list.filter(e=>e.status==='CREATED'));setError(null);
      }catch{if(ownerRef.current===owner)setError('強敵の情報を取得できませんでした。');}
      finally{if(ownerRef.current===owner){setResolving(false);setLoadedOwner(owner);}}
    };
    const task=run();inflight.current=task;
    try{await task;}finally{if(inflight.current===task)inflight.current=null;}
  },[owner]);
  useEffect(()=>{setEntries([]);setError(null);unsupported.current=false;inflight.current=null;void refresh();},[owner,refresh]);
  useEffect(()=>{if(completedPatrolId)void refresh().then(()=>refresh());},[completedPatrolId,refresh]);
  const acknowledge=useCallback(async(entry:QuestRaidEncounter)=>{
    if(!owner)return false;
    const response=await supabase.rpc('acknowledge_quest_raid_encounter_v1',{p_patrol_id:entry.patrolId});
    if(ownerRef.current!==owner)return false;
    if(response.error||response.data!==true)throw new Error('発見の確認を保存できませんでした。');
    setEntries(current=>current.map(e=>e.patrolId===entry.patrolId?{...e,acknowledged:true}:e));return true;
  },[owner]);
  return {entries:loadedOwner===owner?entries:[],error:loadedOwner===owner?error:null,resolving:Boolean(owner&&loadedOwner!==owner)||resolving,refresh,acknowledge};
}

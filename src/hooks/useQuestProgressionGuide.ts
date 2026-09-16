import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase';
import type { QuestGuideAction, QuestProgressionGuide } from '@/domain/quest/progressionGuide';

export function useQuestProgressionGuide(owner: string | undefined, enabled: boolean, revision: unknown) {
  const [state, setState] = useState<{ owner: string; value: QuestProgressionGuide } | null>(null);
  const [readyOwner, setReadyOwner] = useState<string | null>(null);
  const current = useRef(owner);
  const request = useRef(0);
  useLayoutEffect(() => { current.current = owner; }, [owner]);
  const refreshQuestGuide = useCallback(async () => {
    const serial = ++request.current;
    if (!owner || !enabled) { setState(null); setReadyOwner(null); return; }
    const { data, error } = await supabase.rpc('get_quest_progression_guide');
    if (current.current !== owner || request.current !== serial) return;
    if (!error) setState(data?.step ? { owner, value: data } : null);
    setReadyOwner(owner);
  }, [owner, enabled]);
  const advanceQuestGuide = useCallback(async (action: QuestGuideAction) => {
    if (!owner || !enabled) return false;
    const { data, error } = await supabase.rpc('advance_quest_progression_guide', { p_action: action });
    if (current.current !== owner) return false;
    if (error) throw error;
    ++request.current;
    if (data?.step) setState({ owner, value: data });
    return true;
  }, [owner, enabled]);
  const markQuestStorySeen = useCallback(async (town: string) => {
    if (!owner || !enabled) return false;
    const { data, error } = await supabase.rpc('mark_quest_story_seen', { p_town: town });
    if (current.current !== owner) return false;
    if (error) throw error;
    ++request.current;
    if (data?.step) setState({ owner, value: data });
    return true;
  }, [owner, enabled]);
  useEffect(() => { void refreshQuestGuide(); }, [refreshQuestGuide, revision]);
  useEffect(() => {
    const resume = () => { if (document.visibilityState === 'visible') void refreshQuestGuide(); };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [refreshQuestGuide]);
  return { questGuideReady: !enabled || Boolean(owner && readyOwner === owner), questGuide: enabled && state && state.owner === owner ? state.value : null, refreshQuestGuide, advanceQuestGuide, markQuestStorySeen };
}

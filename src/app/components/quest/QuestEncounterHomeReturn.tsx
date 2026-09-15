'use client';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { revisitableQuestEncounters } from '@/domain/quest/raidEncounter';
import OutlawButton from '../ui/OutlawButton';
import './QuestRaidEncounter.css';

/** Lives next to Home's main actions, never above the page header. */
export default function QuestEncounterHomeReturn() {
  const { questRaidEncounter, openQuestEncounterRaid, setGlobalInteractionBlocking } = useGame();
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const refresh = questRaidEncounter.refresh;
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const entry = revisitableQuestEncounters(questRaidEncounter.entries, now)[0];
  if (!entry) return null;
  const open = async () => {
    if (inFlight.current || !entry.roomId) return;
    inFlight.current = true; setBusy(true); setError(null); setGlobalInteractionBlocking(true);
    try { await openQuestEncounterRaid(entry.roomId); }
    catch { setError('強敵を開けませんでした。もう一度お試しください。'); }
    finally { inFlight.current = false; setBusy(false); setGlobalInteractionBlocking(false); }
  };
  return <section className="quest-encounter-home-return" aria-label="発見した強敵">
    <OutlawButton fullWidth disabled={busy} onClick={open}>発見した強敵に挑む</OutlawButton>
    {error && <p role="alert">{error}</p>}
  </section>;
}

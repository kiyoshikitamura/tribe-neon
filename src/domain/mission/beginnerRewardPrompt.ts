import type { BeginnerJourney } from './beginnerJourney';

/** Mission報酬がCLEARでも、Tutorial由来ならPost-Tutorial体験完了とはしない。 */
export function canPromptBeginnerReward(journey: BeginnerJourney | null, tab: string): boolean {
  if (!journey?.facts.free_skill || !journey.facts.free_equipment) return false;
  switch (tab) {
    case 'gacha': return true;
    case 'character': return journey.facts.character;
    case 'patrol': case 'quest': return journey.facts.quest;
    case 'pvp': return journey.facts.pvp;
    case 'raid': return journey.facts.raid;
    case 'guild': return journey.missions.some(m => m.id === 'MIS_N_P010' && (m.status === 'CLEAR' || m.status === 'CLAIMED'));
    default: return false;
  }
}

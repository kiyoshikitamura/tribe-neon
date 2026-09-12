export type BeginnerFacts = Record<'free_skill' | 'free_equipment' | 'character' | 'quest' | 'pvp' | 'raid' | 'guild', boolean>;
export type BeginnerMission = { id: string; category: string; status: string; expires_at?: string | null };
export type BeginnerJourney = { facts: BeginnerFacts; reflow_completed?: boolean; missions: BeginnerMission[] };
export const BEGINNER_MISSION_IDS: Record<string, string[]> = {
  gacha: ['MIS_D_001'], character: ['MIS_N_P002', 'MIS_N_P003'],
  patrol: ['MIS_N_P004', 'MIS_D_002'], pvp: ['MIS_N_P006', 'MIS_D_004'],
  raid: ['MIS_N_P008', 'MIS_D_005'], guild: ['MIS_N_P010', 'MIS_D_006'],
};
export function beginnerRewardIds(journey: BeginnerJourney | null, tab?: string, now = Date.now()): string[] {
  const allowed = tab ? BEGINNER_MISSION_IDS[tab === 'quest' ? 'patrol' : tab] || [] : Object.values(BEGINNER_MISSION_IDS).flat();
  return (journey?.missions || []).filter(m => allowed.includes(m.id) && m.status === 'CLEAR'
    && (!m.expires_at || Date.parse(m.expires_at) > now)).map(m => m.id);
}
export type BeginnerRecommendation = { key: string; title: string; tab?: string; action?: 'mission_handoff'; disabled?: boolean };
/** 経験と受取を分離。日次報酬の再出現・未受取で過去の機能に戻さない。 */
export function nextBeginnerAction(journey: BeginnerJourney | null, raid: 'active' | 'inactive' | 'unknown'): BeginnerRecommendation | null {
  if (!journey) return null;
  const f = journey.facts;
  if (!f.free_skill || !f.free_equipment) return { key: 'free_assets', title: '無料ガチャを引こう', tab: 'gacha' };
  if (!f.character) return { key: 'character', title: '装備しよう', tab: 'character' };
  if (!f.quest) return { key: 'quest', title: 'クエストでCASHを集めよう', tab: 'patrol' };
  if (!f.pvp) return { key: 'pvp', title: 'バトルに挑戦しよう', tab: 'pvp' };
  if (!f.raid && raid !== 'inactive') return { key: 'raid', title: raid === 'active' ? '開催中のレイドに参加しよう' : 'レイドを確認', tab: 'raid' };
  if (!f.guild) return { key: 'guild', title: !f.raid ? 'レイド開催待ち・TRIBEに参加しよう' : 'TRIBEに参加しよう', tab: 'guild' };
  return journey.reflow_completed ? null : { key: 'reflow', title: !f.raid ? 'レイド開催待ち・ミッションへ' : 'ミッションを確認しよう', action: 'mission_handoff' };
}

/** 最新の経験に対応する未受取だけを優先。古い報酬は副導線に残す。 */
export function priorityBeginnerRewardIds(journey: BeginnerJourney | null, now = Date.now()): string[] {
  if (!journey) return [];
  const f = journey.facts;
  // Tutorial内の装備・Quest報酬より、残った無料獲得の学習を優先する。
  if (!f.free_skill || !f.free_equipment) return [];
  const latest = f.guild ? 'guild' : f.raid ? 'raid' : f.pvp ? 'pvp' : f.quest ? 'patrol'
    : f.character ? 'character' : f.free_skill || f.free_equipment ? 'gacha' : undefined;
  return latest ? beginnerRewardIds(journey, latest, now) : [];
}

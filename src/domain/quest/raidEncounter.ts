export type EncounterDifficulty = 'beginner' | 'intermediate' | 'advanced';
export interface QuestRaidEncounter {
  patrolId: string;
  status: 'PENDING' | 'DRAWN' | 'NO_ENCOUNTER' | 'DEFERRED' | 'CREATED';
  roomId: string | null;
  areaId: string;
  difficulty: EncounterDifficulty | null;
  bossName: string | null;
  leaderId: string | null;
  bonusItems: { itemId: string; quantity: number }[];
  acknowledged: boolean;
  expiresAt: string | null;
  ended: boolean;
}
export function parseQuestRaidEncounter(value: unknown): QuestRaidEncounter {
  if (!value || typeof value !== 'object') throw new Error('発見情報を確認できませんでした。');
  const v = value as Record<string, unknown>;
  if (typeof v.patrolId !== 'string' || !['PENDING','DRAWN','NO_ENCOUNTER','DEFERRED','CREATED'].includes(String(v.status))) throw new Error('発見情報を確認できませんでした。');
  if (v.status === 'CREATED' && (typeof v.roomId !== 'string' || typeof v.areaId !== 'string' || typeof v.bossName !== 'string' || !['beginner','intermediate','advanced'].includes(String(v.difficulty)))) throw new Error('強敵の情報を確認できませんでした。');
  return {
    patrolId:v.patrolId, status:v.status as QuestRaidEncounter['status'], roomId:typeof v.roomId==='string'?v.roomId:null,
    areaId:typeof v.areaId==='string'?v.areaId:'', difficulty:['beginner','intermediate','advanced'].includes(String(v.difficulty))?v.difficulty as EncounterDifficulty:null,
    bossName:typeof v.bossName==='string'?v.bossName:null,leaderId:typeof v.leaderId==='string'?v.leaderId:null,
    bonusItems:Array.isArray(v.bonusItems)?v.bonusItems.map((item: {itemId: unknown;quantity: unknown})=>{
      if(typeof item.itemId!=='string'||!Number.isSafeInteger(item.quantity)||Number(item.quantity)<=0)throw new Error('報酬情報を確認できませんでした。');
      return {itemId:item.itemId,quantity:Number(item.quantity)};
    }):[],acknowledged:v.acknowledged===true,expiresAt:typeof v.expiresAt==='string'?v.expiresAt:null,ended:v.ended===true,
  };
}
export function isEncounterPresentationSafe(state: {battle: unknown;gacha: unknown;dialog: unknown;mission: boolean;patrolReward: boolean;blocked: boolean}) {
  return !state.battle&&!state.gacha&&!state.dialog&&!state.mission&&!state.patrolReward&&!state.blocked;
}

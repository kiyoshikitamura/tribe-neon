"use client";

export interface UseBattleOptions {
  session: any;
  userCharactersDbList: any[];
  skillLimitBreakMaster: any[];
  userEquipmentsList: any[];
  userSkillsList: any[];
  selectedMembers: string[];
  selectedLeader: string;
  userGuild: any;
  userGuildMember: any;
  gvgBaseControls: any[];
  currentBaseId: string;
  username: string;
  playCyberSe: (type: "click" | "attack" | "hit" | "gacha") => void;
  syncBootstrapData: (userId: string) => Promise<void>;
  pvpPoints: number;
  setPvpPoints: React.Dispatch<React.SetStateAction<number>>;
  userLevel: number;
  setUserLevel: React.Dispatch<React.SetStateAction<number>>;
  userXp: number;
  setUserXp: React.Dispatch<React.SetStateAction<number>>;
  vitality: number;
  setVitality: React.Dispatch<React.SetStateAction<number>>;
  raidPoints?: number;
  setRaidPoints?: React.Dispatch<React.SetStateAction<number>>;
  setRaidFirstEntryFree?: React.Dispatch<React.SetStateAction<boolean>>;
  requestRaidTopRefresh?: () => void;
  cash?: number;
  setCash?: React.Dispatch<React.SetStateAction<number>>;
  diamonds?: number;
  setDiamonds?: React.Dispatch<React.SetStateAction<number>>;
  pvpRate: number;
  setPvpRate?: React.Dispatch<React.SetStateAction<number>>;
  pvpRankings: any[];
  raidBossHp: number;
  setRaidBossHp: React.Dispatch<React.SetStateAction<number>>;
  raidBossMaxHp: number;
  setRaidBossMaxHp: React.Dispatch<React.SetStateAction<number>>;
  raidTotalDamage: number;
  setRaidTotalDamage: React.Dispatch<React.SetStateAction<number>>;
  setErrorMessage: (msg: string | null) => void;
  addGuildXpAndContributionByAction: (actionType: string) => Promise<void>;
  setGlobalInteractionBlocking?: (blocking: boolean) => void;
  setConfirmDialogConfig?: React.Dispatch<React.SetStateAction<import("@/app/components/ui/ConfirmDialog").ConfirmDialogConfig | null>>;
  patrolNpcs?: any[];
  patrol?: any;
  tutorialStep?: string | null;
  setTutorialStep?: (step: string) => void;
  selectedBattleHelper?: string | null;
  navigateTab?: (tab: string, subTab?: string) => void;
}

/** 確定仕様の5作戦。LegacyTactic は保存済みの旧デッキを読むためだけに残す。 */
export type BattleTacticId =
  | "ATTACK_PRIORITY"
  | "HEAL_PRIORITY"
  | "SKILL_PRIORITY"
  | "BALANCED"
  | "WEAKNESS_FOCUS";
export type LegacyBattleTacticId = "OFFENSIVE" | "DEFENSIVE" | "HEALING" | "AP_CONSERVING" | "TACTICAL";
export type CompatibleBattleTacticId = BattleTacticId | LegacyBattleTacticId;

export interface ParticipantState {
  id: string; // "char_xxx" or "ENEMY_xxx" or "ENEMY"
  name: string;
  characterId: string; // Master Character ID
  alignment?: string; // 繧｢繝ｩ繧､繝｡繝ｳ繝・(JUSTICE, EVIL, ORDER, CHAOS)
  level: number;
  awakeningLevel?: number;
  rarity?: string;
  hp: number;
  maxHp: number;
  shield: number;
  isDead: boolean;
  isEnemy: boolean;
  tauntTurns: number;
  stunTurns: number; // 繧ｹ繧ｿ繝ｳ謇狗分繧ｹ繧ｭ繝・・逕ｨ繧ｿ繝ｼ繝ｳ謨ｰ
  activeEffects?: Array<{
    id: string;
    kind: string;
    remainingDuration: number | null;
    stat?: string;
    magnitudeBp?: number;
    amount?: number;
  }>;
  stats: {
    hp: number;
    atk: number;
    def: number;
    spd: number;
    luk: number;
  };
  skills: any[]; // List of master skills equipped
}

export interface CardState {
  id: string; // Unique instance ID in hand
  skillId: string; // Skill Master ID
  name: string;
  description: string;
  targetType: "ENEMY_SINGLE" | "ENEMY_ALL" | "ALLY_SINGLE" | "ALLY_ALL" | "SELF";
  rarity: "N" | "R" | "SR" | "SSR";
  effectType: "ATTACK" | "HEAL" | "BUFF" | "DEBUFF" | "SHIELD" | "SPECIAL";
  ownerId?: string; // 繧ｭ繝｣繝ｩ繧ｯ繧ｿ繝ｼ蠕玲э繧ｹ繧ｭ繝ｫID
}

export interface SkillLogItem {
  actorName: string;
  skillName: string;
  targetName: string;
  value: number;
  isCritical: boolean;
  type: "DAMAGE" | "HEAL" | "SHIELD" | "BUFF" | "DEBUFF" | "SPECIAL";
}

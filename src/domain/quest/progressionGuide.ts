export type QuestGuideStep = 'QUEST_ENTRY' | 'PLAY' | 'GACHA' | 'LOADOUT' | 'RETRY' | 'DONE';
export type QuestProgressionGuide = { step: QuestGuideStep; seen_story_towns: string[] };
export type QuestGuideAction = 'ENTER_QUEST' | 'OPEN_LOADOUT' | 'APPLY_LOADOUT' | 'RETURN_QUEST';
export type QuestTownStoryData = { townId: string; speaker: string; image: string; lines: string[]; provisional: boolean };
// Preview用差替データ。既存SSRの所属や口調を新設しない。
export const QUEST_TOWN_STORIES: QuestTownStoryData[] = ['shinjuku','shibuya','ikebukuro','roppongi','akihabara','kawasaki','yokohama'].map(townId => ({
  townId, speaker: 'アゲハ', image: '/characters/ageha_transparent_asset.png',
  lines: ['この街の探索を始めましょう。'], provisional: true,
}));

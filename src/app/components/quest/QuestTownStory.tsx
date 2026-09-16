'use client';
import { useState } from 'react';
import { useGame } from '@/app/context/GameContext';
import { QUEST_TOWN_STORIES, type QuestProgressionGuide } from '@/domain/quest/progressionGuide';
import CharacterPresentation from '../character/CharacterPresentation';
import CanonicalDialog from '../ui/CanonicalDialog';
import './QuestProgressionGuide.css';

export default function QuestTownStory({ townId }: { townId: string | null }) {
  const game = useGame() as any;
  const guide = game.questGuide as QuestProgressionGuide | null;
  const [position, setPosition] = useState({ town: '', line: 0 });
  const story = QUEST_TOWN_STORIES.find(entry => entry.townId === townId);
  // 仮会話はPreviewのみ。正式台詞が未登録でも進行を妨げない。
  if (!story || !guide || guide.seen_story_towns.includes(story.townId) || game.battleState
    || (story.provisional && process.env.NEXT_PUBLIC_QUEST_PREVIEW_CONTENT !== 'true')) return null;
  const line = position.town === townId ? position.line : 0;
  const finish = async () => {
    try { await game.markQuestStorySeen(story.townId); }
    catch { game.setErrorMessage('会話の状態を保存できませんでした。もう一度お試しください。'); }
  };
  return <CanonicalDialog title={story.speaker} onClose={finish} actions={[
    { label: line + 1 < story.lines.length ? '次へ' : '探索へ', semantic: 'primary', onClick: () => line + 1 < story.lines.length ? setPosition({ town: story.townId, line: line + 1 }) : finish() },
    { label: 'スキップ', semantic: 'secondary', onClick: finish },
  ]}><div className="quest-town-story"><CharacterPresentation src={story.image} alt={story.speaker} variant="dialogue-bust" className="quest-town-story-portrait" /><p>{story.lines[line]}</p></div></CanonicalDialog>;
}

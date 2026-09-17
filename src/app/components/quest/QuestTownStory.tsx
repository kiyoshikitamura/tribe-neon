'use client';
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/app/context/GameContext';
import { QUEST_TOWN_STORIES, type QuestProgressionGuide, type QuestStoryPhase } from '@/domain/quest/progressionGuide';
import CharacterPresentation from '../character/CharacterPresentation';
import TypewriterText from '../tutorial/TypewriterText';
import '../TutorialWorldIntro.css';

export default function QuestTownStory({ townId, phase = 'START' }: { townId: string | null; phase?: QuestStoryPhase }) {
  const game = useGame() as any;
  const guide = game.questGuide as QuestProgressionGuide | null;
  const owner = game.session?.user?.id || 'guest';
  const eventKey = townId ? `${townId}:${phase}` : '';
  const [line, setLine] = useState(0);
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    if (!townId || typeof window === 'undefined') return;
    try { setSeen(JSON.parse(window.localStorage.getItem(`tribe-quest-story:${owner}`) || '[]')); } catch { setSeen([]); }
  }, [owner, townId]);
  const story = useMemo(() => QUEST_TOWN_STORIES.find(entry => entry.townId === townId && entry.phase === phase), [townId, phase]);
  if (!story || !guide || !eventKey || seen.includes(eventKey) || game.battleState || !game.onboardingState?.gameplay_authorized) return null;
  const hasNext = line + 1 < story.lines.length;
  const finish = async () => {
    const nextSeen = [...new Set([...seen, eventKey])];
    setSeen(nextSeen);
    window.localStorage.setItem(`tribe-quest-story:${owner}`, JSON.stringify(nextSeen));
    try { await game.markQuestStorySeen(story.townId); } catch { /* local event receipt remains available */ }
  };
  return <div className="tutorial-world" role="dialog" aria-modal="true" aria-label={`${story.speaker}の会話`}>
    <div className="tutorial-world-content" style={{ backgroundImage: `url('/bg/bg_street_${story.townId}.jpg')` }}>
      <div className="tutorial-world-shade" />
      <div className="tutorial-world-ageha" aria-hidden="true"><CharacterPresentation src={story.image} alt="" variant="dialogue-bust" /></div>
      <div className="tutorial-world-dialogue"><strong>{story.speaker}</strong><TypewriterText key={`${eventKey}:${line}`} text={story.lines[line]} speedMs={34} /></div>
      <button className="semantic-cta semantic-cta--primary tutorial-world-next-cta" onClick={() => hasNext ? setLine(value => value + 1) : void finish()}>{hasNext ? '次へ' : phase === 'START' ? '探索へ' : '次へ'}</button>
    </div>
  </div>;
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { CHARACTERS_MASTER, GEAR_SLOTS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import type { CharacterRuntimeRecord, EquipmentRuntimeRecord } from "@/utils/stats_calculator";
import CharacterPresentation from "./CharacterPresentation";
import OutlawButton from "../ui/OutlawButton";
import "./CharacterHome.css";

// Selection uses a Master ID; equipment ownership uses the instance UUID.
export type HomeCharacter = CharacterRuntimeRecord & { id: string };
type Props = {
  character: HomeCharacter;
  master: (typeof CHARACTERS_MASTER)[number];
  power: number;
  equipment: EquipmentRuntimeRecord[];
  userId: string;
  position: number;
  total: number;
  onSwitch: (direction: -1 | 1) => void;
  onBack: () => void;
  onGrowth: () => void;
  onEquipment: () => void;
  onParty: () => void;
};

export default function CharacterHome({ character, master, power, equipment, userId, position, total, onSwitch, onBack, onGrowth, onEquipment, onParty }: Props) {
  const [formation, setFormation] = useState<{ owner: string; ids: string[] } | null>(null);
  const [formationError, setFormationError] = useState(false);
  const [retry, setRetry] = useState(0);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFormationError(false);
    // Read the persisted formation, never the Context's display fallback.
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_current_main_formation");
        if (error || !Array.isArray(data?.characters)) throw error || new Error("Invalid formation response");
        if (!cancelled) setFormation({ owner: userId, ids: data.characters.map((entry: { character_id: string }) => entry.character_id) });
      } catch {
        if (!cancelled) setFormationError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, retry]);
  const savedIds = formation?.owner === userId ? formation.ids : null;
  const partyLabel = formationError ? "確認できません" : !savedIds ? "確認中" : savedIds.length === 0 ? "未編成" : savedIds.includes(character.character_id) ? "編成中" : "編成外";
  const equippedCount = equipment.filter((entry) => entry.equipped_character_id === character.id).length;

  return <section className="character-home" aria-label="キャラクターホーム" data-character-id={character.character_id}>
    <header className="character-home-header">
      <button type="button" onClick={onBack} aria-label="キャラクター一覧へ戻る">‹ <span>キャラクター</span></button>
      <div className="character-home-switch" aria-label="表示中の一覧内でキャラクターを切替">
        <button type="button" disabled={total < 2} onClick={() => onSwitch(-1)} aria-label="前のキャラクター">‹</button>
        <span aria-live="polite">{position} <i>/</i> {total}</span>
        <button type="button" disabled={total < 2} onClick={() => onSwitch(1)} aria-label="次のキャラクター">›</button>
      </div>
    </header>
    <div className="character-home-art" onPointerDown={(event) => {
      if (!event.isPrimary) return;
      gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerUp={(event) => {
      const start = gesture.current;
      gesture.current = null;
      if (!start || start.id !== event.pointerId || total < 2) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwitch(dx < 0 ? 1 : -1);
    }} onPointerCancel={() => { gesture.current = null; }}>
      <img className="character-home-background" src={getCharacterLocationBackground(master.homeTown)} alt="" aria-hidden="true" />
      <CharacterPresentation key={character.id} src={getCharacterTransparentImg(master.name)} alt={master.jpName} variant="full-body" rarity={master.rarity} frameKind={false} metadata={false} />
    </div>
    <div className="character-home-information">
      <div className="character-home-identity"><span className="character-home-rarity">{master.rarity}</span><h1>{master.jpName}</h1><p><span>Lv.{character.level || 1}</span><span>覚醒 +{character.awakening_level || 0}</span></p></div>
      <div className="character-home-power"><span>総合力</span><strong>{power.toLocaleString()}</strong></div>
      <OutlawButton variant="primary" fullWidth onClick={onGrowth}>育成する</OutlawButton>
      <div className="character-home-destinations">
        <OutlawButton variant="secondary" onClick={onEquipment}><span>Equipment<small>{equippedCount} / {GEAR_SLOTS_MASTER.length}</small></span></OutlawButton>
        <OutlawButton variant="secondary" onClick={onParty}><span>PARTY<small>{partyLabel}</small></span></OutlawButton>
      </div>
      {formationError && <button className="character-home-retry" type="button" onClick={() => setRetry((value) => value + 1)}>編成状態を再確認</button>}
    </div>
  </section>;
}

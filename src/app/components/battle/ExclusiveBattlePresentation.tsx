"use client";

import type { CSSProperties } from "react";
import { exclusiveEquipmentForBattleMember } from "@/domain/presentation/exclusiveContent";
import { EXCLUSIVE_EQUIPMENT_INTRO_MS } from "@/domain/presentation/exclusiveSkillDialogue";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import type { BattleParticipantView } from "./BattleUnitPortrait";
import "./ExclusiveBattlePresentation.css";

/** Display only the server snapshot loadout. Never infer from today's inventory. */
export function ExclusiveEquipmentIntro({ members, paused }: { members: BattleParticipantView[]; paused: boolean }) {
  const bands = members.flatMap(member => exclusiveEquipmentForBattleMember(member.characterId ?? "", member.equipmentMasterIds ?? []).map(equipment => ({ member, equipment }))).slice(0, 5);
  if (!bands.length) return null;
  return <div className="exclusive-equipment-intro" data-paused={paused} aria-label="専用装備" style={{ "--intro-ms": `${EXCLUSIVE_EQUIPMENT_INTRO_MS}ms`, animationPlayState: paused ? "paused" : "running" } as CSSProperties}>
    {bands.map(({ member, equipment }, index) => {
      const master = CHARACTERS_MASTER.find(entry => entry.id === member.characterId);
      return <div key={`${member.id}:${equipment.id}`} className={`exclusive-equipment-band ${index % 2 ? "from-right" : "from-left"}`} style={{ animationDelay: `${80 + index * 120}ms`, animationPlayState: paused ? "paused" : "running" }}>
        {master && <div className="exclusive-equipment-eyes"><img src={getCharacterTransparentImg(master.name)} alt="" /></div>}
        <img className="exclusive-equipment-item" src={equipment.imageSrc} alt="" />
        <div><small>{member.name}</small><strong>{equipment.name}</strong></div>
      </div>;
    })}
  </div>;
}

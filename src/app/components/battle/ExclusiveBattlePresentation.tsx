"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EXCLUSIVE_EYE_CUTINS } from "@/domain/presentation/approvedAssets20260914";
import { exclusiveEquipmentForBattleMember } from "@/domain/presentation/exclusiveContent";
import { EXCLUSIVE_SKILL_PREFIX_MS, EXCLUSIVE_EQUIPMENT_INTRO_MS } from "@/domain/presentation/exclusiveSkillDialogue";
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
      const eyeCutin = EXCLUSIVE_EYE_CUTINS[member.characterId ?? ""];
      return <div key={`${member.id}:${equipment.id}`} className={`exclusive-equipment-band ${index % 2 ? "from-right" : "from-left"}`} style={{ animationDelay: `${80 + index * 120}ms`, animationPlayState: paused ? "paused" : "running" }}>
        {(eyeCutin || master) && <div className={`exclusive-equipment-eyes${eyeCutin ? " is-approved-cutin" : ""}`}><img src={eyeCutin || getCharacterTransparentImg(master!.name)} alt="" /></div>}
        <img className="exclusive-equipment-item" src={equipment.imageSrc} alt="" />
        <div><small>{member.name}</small><strong>{equipment.name}</strong></div>
      </div>;
    })}
  </div>;
}

/** Phase boundaries use the same duration as replay; cut-in children mount only after dialogue. */
export function ExclusiveSkillSequence({ dialogue, paused, children }: { dialogue?: string | null; paused: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<"DARK" | "DIALOGUE" | "CUTIN">("DARK");
  const clockRef = useRef({ remainingMs: 180 });
  useEffect(() => {
    if (!dialogue || paused || phase === "CUTIN") return;
    const clock = clockRef.current;
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      if (phase === "DARK") {
        clockRef.current = { remainingMs: EXCLUSIVE_SKILL_PREFIX_MS - 180 };
        setPhase("DIALOGUE");
      } else setPhase("CUTIN");
    }, clock.remainingMs);
    return () => {
      clearTimeout(timer);
      clock.remainingMs = Math.max(0, clock.remainingMs - (performance.now() - startedAt));
    };
  }, [dialogue, paused, phase]);
  if (!dialogue) return <div className={paused ? "is-paused" : ""}>{children}</div>;
  return <div className={`exclusive-skill-sequence ${paused ? "is-paused" : ""}`} data-exclusive-phase={phase.toLowerCase()}>
    {phase === "CUTIN" ? <div className="exclusive-skill-cutin">{children}</div> : <div className="exclusive-skill-dialogue">{phase === "DIALOGUE" && <span>{dialogue}</span>}</div>}
  </div>;
}

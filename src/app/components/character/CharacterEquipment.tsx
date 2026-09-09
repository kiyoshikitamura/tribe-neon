"use client";
import React, { useEffect, useRef, useState } from "react";
import { GEAR_SLOTS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { getCharacterTotalStats } from "@/utils/stats_calculator";
import { CANONICAL_EQUIPMENT_VIEW } from "@/utils/equipments_master_data";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import CharacterPresentation from "./CharacterPresentation";
import OutlawButton from "../ui/OutlawButton";
import CharacterStatusBadges from "./CharacterStatusBadges";
import "./CharacterEquipment.css";
const statKeys = ["hp", "atk", "def", "spd", "luk"] as const;
type Stats = ReturnType<typeof getCharacterTotalStats>;
export default function CharacterEquipment({ character, master, equipment, busy, onSlot, onAuto, renderArt }: {
  character: any; master: any; equipment: any[]; busy: boolean;
  onSlot: (index: number, record?: any, master?: any) => void;
  onAuto: () => void; renderArt: (master: any) => React.ReactNode;
}) {
  const base = getCharacterTotalStats(character, []);
  const total = getCharacterTotalStats(character, equipment);
  const previous = useRef<{id: string; stats: Stats}>({id:character.id,stats:total});
  const [change, setChange] = useState<{before: Stats; after: Stats} | null>(null);
  useEffect(() => {
    const prior = previous.current;
    if (prior.id === character.id && statKeys.some(key => prior.stats[key] !== total[key])) setChange({before:prior.stats,after:total});
    else if (prior.id !== character.id) setChange(null);
    previous.current = {id:character.id,stats:total};
  }, [character.id, total.hp, total.atk, total.def, total.spd, total.luk]);
  const power = (stats: Stats) => stats.hp + stats.atk + stats.def;
  return <>
    <div className="character-equipment-identity"><h2>{master.jpName}</h2><div><CharacterStatusBadges rarity={master.rarity} awakeningLevel={character.awakening_level || 0} /></div><span>Lv.{character.level || 1}</span><strong>総合力 {power(total).toLocaleString()}</strong></div>
    <div className="character-equipment-stage">
      <img className="character-equipment-background" src={getCharacterLocationBackground(master.homeTown)} alt="" />
      <CharacterPresentation src={getCharacterTransparentImg(master.name)} alt={master.jpName} variant="full-body" rarity={master.rarity} frameKind={false} metadata={false} />
      <div className="character-equipment-slots">{GEAR_SLOTS_MASTER.map(slot => {
        const record = equipment.find(entry => entry.equipped_character_id === character.id && Number(entry.slot_index) === slot.index);
        const gear = record && CANONICAL_EQUIPMENT_VIEW.find(entry => entry.id === record.equipment_id);
        return <button type="button" disabled={busy} key={slot.index} className={"character-equipment-slot gear-slot-" + slot.index} aria-label={slot.label} onClick={() => onSlot(slot.index,record,gear)}>
          {gear ? <>{renderArt(gear)}<small>Lv.{record.level || 1} / +{record.plus_val || 0}</small></> : <span className="character-equipment-plus">＋</span>}<b>{slot.label}</b>
        </button>;
      })}</div>
    </div>
    <section className="character-equipment-stats" aria-label="素体値と装備加算"><header>能力値 <small>素体値 ＋ 装備加算</small></header><dl>{statKeys.map(key => <div key={key} data-stat={key}><dt>{key.toUpperCase()}</dt><dd><strong>{base[key].toLocaleString()}</strong><span>+{(total[key] - base[key]).toLocaleString()}</span></dd></div>)}</dl></section>
    {change && <section className="character-equipment-feedback" role="status"><strong>装備による変化</strong>{statKeys.filter(key => change.before[key] !== change.after[key]).map(key => <p key={key}>{key.toUpperCase()} {change.before[key].toLocaleString()} → {change.after[key].toLocaleString()} <b>{change.after[key] > change.before[key] ? "+" : ""}{(change.after[key] - change.before[key]).toLocaleString()}</b></p>)}{power(change.before) !== power(change.after) && <p>総合力 {power(change.before).toLocaleString()} → {power(change.after).toLocaleString()} <b>{power(change.after) > power(change.before) ? "+" : ""}{(power(change.after)-power(change.before)).toLocaleString()}</b></p>}</section>}
    <OutlawButton variant="secondary" fullWidth disabled={busy} isLoading={busy} onClick={onAuto}>おまかせ装備</OutlawButton>
  </>;
}

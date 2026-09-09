"use client";

import React, { useEffect, useState } from "react";
import { useGame } from "@/app/context/GameContext";
import { CHARACTERS_MASTER, GEAR_SLOTS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { CANONICAL_EQUIPMENT_VIEW } from "@/utils/equipments_master_data";
import { getCharacterTotalStats } from "@/utils/stats_calculator";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import { getRarityFrameAsset } from "@/utils/rarityAssets";
import { getCanonicalSkillIcon } from "@/utils/skillVisualAssets";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { canonicalEquipmentFlatStat, canonicalSkillSlotCount } from "@/domain/gameplay/canonical/calculations";
import { getEquipmentLevelCap } from "@/utils/equipment_progression";
import CharacterPresentation from "./CharacterPresentation";
import CanonicalDialog from "../ui/CanonicalDialog";
import CanonicalItemIcon from "../ui/CanonicalItemIcon";
import OutlawButton from "../ui/OutlawButton";
import { applyCharacterAwakeningCopyEquivalent, canonicalCharacterAwakeningRequired, CHARACTER_AWAKENING_MAX_LEVEL } from "@/domain/gameplay/canonical/awakening";
import CharacterEquipment from "./CharacterEquipment";
import CharacterParty from "./CharacterParty";
import CharacterHome from "./CharacterHome";
import { resolveHomeCharacter } from "./characterHomeSelection";
import CharacterStatusBadges, { RarityBadge, AwakeningBadge } from "./CharacterStatusBadges";
import "./CharacterSystemV2.css";

type MainView = "CHARACTERS" | "PARTY" | "SKILLS" | "EQUIPMENT";
type CharacterView = "LIST" | "HOME" | "GROWTH" | "LOADOUT";
type AssetDetail = { kind: "skill" | "equipment"; record: any; master: any } | null;

const TARGET_LABEL: Record<string, string> = {
  ENEMY_SINGLE: "敵単体", ENEMY_ALL: "敵全体", ALLY_SINGLE: "味方単体", ALLY_ALL: "味方全体", SELF: "自身",
};

function rarityClass(rarity?: string) {
  return `canonical-rarity-visual is-${String(rarity || "N").toLowerCase()}`;
}

function EquipmentArt({ master }: { master: any }) {
  return <span className={rarityClass(master?.rarity)}>
    <img className="character-v2-rarity-frame" src={getRarityFrameAsset("equipment", master?.rarity || "N")} alt="" aria-hidden="true" />
    <img className="character-v2-asset-art" src={master?.assetPath} alt="" aria-hidden="true" />
  </span>;
}

function SkillArt({ master }: { master: any }) {
  return <span className={rarityClass(master?.rarity)}>
    <img className="character-v2-rarity-frame" src={getRarityFrameAsset("skill", master?.rarity || "N")} alt="" aria-hidden="true" />
    <img className="character-v2-asset-art" src={getCanonicalSkillIcon(master?.id) || ""} alt="" aria-hidden="true" />
  </span>;
}

export default function CharacterSystemV2({ initialCharacterMasterId }: { initialCharacterMasterId?: string }) {
  const game = useGame() as any;
  const { characterEntryView, setCharacterEntryView } = game;
  const [mainView, setMainView] = useState<MainView>(characterEntryView === "party" ? "PARTY" : "CHARACTERS");
  const [characterView, setCharacterView] = useState<CharacterView>("HOME");
  const [entryMasterId, setEntryMasterId] = useState(initialCharacterMasterId);
  const [hasChosenCharacter, setHasChosenCharacter] = useState(Boolean(initialCharacterMasterId));
  const [assetDetail, setAssetDetail] = useState<AssetDetail>(null);
  const [assetGrowth, setAssetGrowth] = useState<AssetDetail>(null);
  const [rarityFilter, setRarityFilter] = useState("ALL");
  const [attributeFilter, setAttributeFilter] = useState("ALL");
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [selectedSkillSlot, setSelectedSkillSlot] = useState<number | null>(null);
  const [selectedGearSlot, setSelectedGearSlot] = useState<number | null>(null);
  const [growthTab, setGrowthTab] = useState<"LEVEL" | "AWAKENING" | "SKILL">("LEVEL");
  const [growthCounts, setGrowthCounts] = useState<Record<string, number>>({ CHAR_EXP_S: 0, CHAR_EXP_M: 0, CHAR_EXP_L: 0 });
  const [equipmentGrowthCounts, setEquipmentGrowthCounts] = useState<Record<string, number>>({ EQUIP_EXP_S: 0, EQUIP_EXP_M: 0, EQUIP_EXP_L: 0 });

  useEffect(() => {
    if (characterEntryView === "party") setCharacterEntryView(null);
  }, [characterEntryView, setCharacterEntryView]);

  const ownedCharacters = game.userCharactersDbList || [];
  const leaderMasterId = game.identityLeaderCharacterId;
  const sortedCharacters = [...ownedCharacters].sort((a: any, b: any) => {
    const leaderOrder = Number(b.character_id === leaderMasterId) - Number(a.character_id === leaderMasterId);
    const aStats = getCharacterTotalStats(a, game.userEquipmentsList || []);
    const bStats = getCharacterTotalStats(b, game.userEquipmentsList || []);
    return leaderOrder || (bStats.hp + bStats.atk + bStats.def) - (aStats.hp + aStats.atk + aStats.def) || String(a.character_id).localeCompare(String(b.character_id)) || String(a.id).localeCompare(String(b.id));
  });
  const filteredCharacters = sortedCharacters.filter((record: any) => {
    const master = CHARACTERS_MASTER.find((entry: any) => entry.id === record.character_id);
    return master && (rarityFilter === "ALL" || master.rarity === rarityFilter) && (attributeFilter === "ALL" || master.alignment === attributeFilter);
  });
  const selectedCharacter = resolveHomeCharacter(characterView === "HOME" ? filteredCharacters : ownedCharacters, entryMasterId ?? (hasChosenCharacter ? game.upgradeSelectedCharId : leaderMasterId)) || ownedCharacters[0];
  const selectedMaster = CHARACTERS_MASTER.find((entry: any) => entry.id === selectedCharacter?.character_id);
  useEffect(() => {
    if (characterView === "HOME" && selectedCharacter && selectedCharacter.character_id !== game.upgradeSelectedCharId) game.setUpgradeSelectedCharId(selectedCharacter.character_id);
  }, [characterView, selectedCharacter, game.upgradeSelectedCharId, game.setUpgradeSelectedCharId]);
  useEffect(() => {
    document.querySelector(".main-content")?.scrollTo({ top: 0 });
  }, [mainView, characterView]);
  const stats = getCharacterTotalStats(selectedCharacter, game.userEquipmentsList || []);
  const power = stats.hp + stats.atk + stats.def;
  const awakeningLevel = Number(selectedCharacter?.awakening_level || 0);
  const awakeningProgress = Number(selectedCharacter?.awakening_progress || 0);
  const awakeningRequired = canonicalCharacterAwakeningRequired(awakeningLevel);
  const awakeningAfter = applyCharacterAwakeningCopyEquivalent(awakeningLevel, awakeningProgress, 1);
  const skillSlots = canonicalSkillSlotCount(Math.max(0, Math.min(5, Number(selectedCharacter?.awakening_level || 0))));
  const equippedSkills = (game.userSkillsList || []).filter((entry: any) => entry.equipped_character_id === selectedCharacter?.id);
  const characterMaterialCount = Object.values(growthCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  const characterLevelCap = Math.min(100, 50 + Math.min(5, Number(selectedCharacter?.awakening_level || 0)) * 10);
  const characterAfterLevel = Math.min(characterLevelCap, Number(selectedCharacter?.level || 1) + characterMaterialCount);
  const characterAfterStats = getCharacterTotalStats({ ...selectedCharacter, level: characterAfterLevel }, game.userEquipmentsList || []);
  const growthRecord = assetGrowth?.kind === "skill" ? (game.selectedSkill || assetGrowth.record) : assetGrowth?.kind === "equipment" ? (game.selectedEquipment || assetGrowth.record) : null;
  const equipmentMaterialCount = Object.values(equipmentGrowthCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  const equipmentCurrentLevel = Number(growthRecord?.level || 1);
  const equipmentAfterLevel = assetGrowth?.kind === "equipment" ? Math.min(getEquipmentLevelCap(Number(growthRecord?.plus_val || 0)), equipmentCurrentLevel + equipmentMaterialCount) : equipmentCurrentLevel;

  const filteredSkills = (game.userSkillsList || []).filter((record: any) => {
    const master = CANONICAL_SKILL_VIEW.find((entry: any) => entry.id === (record.skill_card_id || record.skill_id));
    return master && (assetFilter === "ALL" || master.rarity === assetFilter || (assetFilter === "EQUIPPED" && Boolean(record.equipped_character_id)));
  });
  const filteredEquipment = (game.userEquipmentsList || []).filter((record: any) => {
    const master = CANONICAL_EQUIPMENT_VIEW.find((entry: any) => entry.id === record.equipment_id);
    return master && (assetFilter === "ALL" || master.rarity === assetFilter || (assetFilter === "EQUIPPED" && Boolean(record.equipped_character_id)));
  });

  const selectCharacter = (record: any, detail = true) => {
    setEntryMasterId(undefined);
    setHasChosenCharacter(true);
    game.setUpgradeSelectedCharId(record.character_id);
    setCharacterView(detail ? "HOME" : "LIST");
    setMainView("CHARACTERS");
    game.playCyberSe("click");
  };

  const updateCount = (setter: React.Dispatch<React.SetStateAction<Record<string, number>>>, itemId: string, delta: number, owned: number) => {
    setter((current) => ({ ...current, [itemId]: Math.max(0, Math.min(owned, Number(current[itemId] || 0) + delta)) }));
  };

  const runCharacterGrowth = async () => {
    const snapshot = ["CHAR_EXP_S", "CHAR_EXP_M", "CHAR_EXP_L"].map((itemId) => ({ itemId, count: Number(growthCounts[itemId] || 0) }));
    const result = await game.handleCharacterGrowthBatch(snapshot);
    setGrowthCounts((current) => Object.fromEntries(Object.entries(current).map(([itemId, count]) => [itemId, result.completedItemIds.includes(itemId) ? 0 : count])));
  };

  const runEquipmentGrowth = async () => {
    const snapshot = ["EQUIP_EXP_S", "EQUIP_EXP_M", "EQUIP_EXP_L"].map((itemId) => ({ itemId, count: Number(equipmentGrowthCounts[itemId] || 0) }));
    const result = await game.handleEquipmentGrowthBatch(snapshot);
    setEquipmentGrowthCounts((current) => Object.fromEntries(Object.entries(current).map(([itemId, count]) => [itemId, result.completedItemIds.includes(itemId) ? 0 : count])));
  };

  const equipAsset = async (detail: NonNullable<AssetDetail>) => {
    if (!selectedCharacter) return;
    if (detail.kind === "skill") {
      if (detail.record.equipped_character_id === selectedCharacter.id) {
        await game.handleUnequipSkill(detail.record.id);
      } else {
        const used = new Set(equippedSkills.map((entry: any) => Number(entry.slot_index)));
        const slot = selectedSkillSlot ?? Array.from({ length: skillSlots }).findIndex((_, index) => !used.has(index));
        if (slot < 0 || slot >= skillSlots) return;
        await game.handleEquipSkill(detail.record.id, slot);
      }
    } else {
      if (detail.record.equipped_character_id === selectedCharacter.id) {
        await game.handleUnequipGear(detail.record.id);
      } else {
        const slot = selectedGearSlot ?? GEAR_SLOTS_MASTER.findIndex((entry: any) => entry.type === detail.master.slot_type);
        if (slot < 0) return;
        game.setActiveGearSlot(slot);
        await game.handleEquipGear(detail.record.id, slot);
      }
    }
    setAssetDetail(null);
  };

  const renderCharacterCard = (record: any, compact = false) => {
    const master = CHARACTERS_MASTER.find((entry: any) => entry.id === record.character_id);
    if (!master) return null;
    const partyIndex = (game.selectedMembers || []).indexOf(record.character_id);
    const cardStats = getCharacterTotalStats(record, game.userEquipmentsList || []);
    return <button type="button" key={record.id || record.character_id} className="character-v2-card active-scale-effect" onClick={() => selectCharacter(record)}>
      <span className={rarityClass(master.rarity)}><CharacterPresentation src={getCharacterTransparentImg(master.name)} alt={master.jpName} variant="thumbnail" rarity={master.rarity} backgroundSrc={getCharacterLocationBackground(master.homeTown)} frameKind="character" metadata={false} /></span>
      <span className="character-v2-card-badges">{record.is_new && <b>新着</b>}{partyIndex === 0 && <b>リーダー</b>}{partyIndex > 0 && <b>編成中</b>}</span>
      <CharacterStatusBadges rarity={master.rarity} awakeningLevel={Number(record.awakening_level || 0)} /><span className="character-v2-card-level">Lv.{Number(record.level || 1)}</span>
      {!compact && <><strong>{master.jpName}</strong><span className="character-v2-card-power">総合力 {(cardStats.hp + cardStats.atk + cardStats.def).toLocaleString()}</span></>}
    </button>;
  };

  const renderAssetGrid = (kind: "skill" | "equipment") => {
    const records = kind === "skill" ? filteredSkills : filteredEquipment;
    return <div className="character-v2-asset-grid" aria-label={kind === "skill" ? "所持スキル" : "所持装備"}>
      {records.map((record: any) => {
        const master = kind === "skill"
          ? CANONICAL_SKILL_VIEW.find((entry: any) => entry.id === (record.skill_card_id || record.skill_id))
          : CANONICAL_EQUIPMENT_VIEW.find((entry: any) => entry.id === record.equipment_id);
        if (!master) return null;
        return <button type="button" key={record.id} className="character-v2-asset-card active-scale-effect" onClick={() => setAssetDetail({ kind, record, master })}>
          {kind === "skill" ? <SkillArt master={master} /> : <EquipmentArt master={master} />}
          <span className="character-v2-card-badges">{record.is_new && <b>新着</b>}{record.equipped_character_id && <b>装備中</b>}</span>
          <span className="character-v2-card-level">Lv.{Number(record.level || 1)} / +{Number(record.plus_val || 0)}</span>
          <strong>{master.name}</strong>
        </button>;
      })}
    </div>;
  };

  const inventoryReady = Boolean(game.session?.user?.id)
    && game.inventoryProjectionOwnerUserId === game.session.user.id;
  if (!inventoryReady) return <div className="character-v2-empty" role="status"><span className="spinner" /></div>;

  if (!selectedCharacter || !selectedMaster) return <section className="character-v2-view"><h1>キャラクター</h1><p>所持キャラクターがいません。</p></section>;
  const goHome = () => { setMainView("CHARACTERS"); setCharacterView("HOME"); };
  const switchCharacter = (direction: -1 | 1) => {
    if (filteredCharacters.length < 2) return;
    const index = filteredCharacters.findIndex((entry: any) => entry.character_id === selectedCharacter.character_id);
    selectCharacter(filteredCharacters[(Math.max(0, index) + direction + filteredCharacters.length) % filteredCharacters.length]);
  };
  return <div className="character-v2-shell">
    {!(mainView === "CHARACTERS" && (characterView === "HOME" || characterView === "LIST")) && <nav className="character-v2-main-nav" aria-label="キャラクター管理">
      {(["CHARACTERS", "PARTY", "SKILLS", "EQUIPMENT"] as MainView[]).map((view) => <button key={view} className={mainView === view ? "active" : ""} onClick={() => { setMainView(view); setCharacterView("LIST"); setAssetFilter("ALL"); }}>{({ CHARACTERS: "キャラクター", PARTY: "パーティ", SKILLS: "スキル", EQUIPMENT: "装備" } as Record<MainView, string>)[view]}</button>)}
    </nav>}

    {mainView === "CHARACTERS" && characterView === "LIST" && <section className="character-v2-view">
      <header className="character-v2-title"><button onClick={goHome}>キャラホームへ戻る</button><strong>キャラ一覧</strong></header>
      <div className="character-v2-filters">
        {["ALL", "JUSTICE", "EVIL", "ORDER", "CHAOS"].map((value) => <button key={value} className={attributeFilter === value ? "active" : ""} onClick={() => setAttributeFilter(value)}>{({ ALL: "すべて", JUSTICE: "正義", EVIL: "悪", ORDER: "秩序", CHAOS: "混沌" } as any)[value]}</button>)}
      </div>
      <div className="character-v2-filters is-rarity">
        {["ALL", "N", "R", "SR", "SSR"].map((value) => <button key={value} className={rarityFilter === value ? "active" : ""} onClick={() => setRarityFilter(value)}>{value === "ALL" ? "レアリティ" : <RarityBadge rarity={value} />}</button>)}
      </div>
      {filteredCharacters.length === 0 && <p>条件に一致するキャラクターがいません。</p>}
      <div className="character-v2-character-grid">{filteredCharacters.map((record: any) => renderCharacterCard(record))}</div>
    </section>}

    {mainView === "CHARACTERS" && characterView === "HOME" && (filteredCharacters.length > 0 ? <CharacterHome
      character={selectedCharacter} master={selectedMaster} power={power} equipment={game.userEquipmentsList || []} userId={game.session.user.id}
      position={filteredCharacters.findIndex((entry: any) => entry.character_id === selectedCharacter.character_id) + 1} total={filteredCharacters.length}
      onSwitch={switchCharacter} onBack={() => setCharacterView("LIST")}
      onGrowth={() => { setGrowthTab("LEVEL"); setCharacterView("GROWTH"); }}
      onEquipment={() => { setSelectedSkillSlot(null); setSelectedGearSlot(null); setCharacterView("LOADOUT"); }}
      onParty={() => { setMainView("PARTY"); }}
    /> : <section className="character-v2-view"><p>条件に一致するキャラクターがいません。</p><OutlawButton onClick={() => setCharacterView("LIST")}>一覧へ戻る</OutlawButton></section>)}

    {mainView === "CHARACTERS" && characterView === "GROWTH" && <fieldset className="character-v2-view character-v2-growth character-v2-pending-surface" disabled={game.upgradeLoading} aria-busy={game.upgradeLoading}>
      <header className="character-v2-title"><button onClick={() => setCharacterView("HOME")}>戻る</button><strong>育成</strong><span>{selectedMaster.jpName}</span></header>
      <div className="character-v2-growth-target">{renderCharacterCard(selectedCharacter, true)}<div><small>強化対象</small><strong>{selectedMaster.jpName}</strong><CharacterStatusBadges rarity={selectedMaster.rarity} awakeningLevel={Number(selectedCharacter.awakening_level || 0)} /><span>Lv.{Number(selectedCharacter.level || 1)}</span><b>総合力 {power.toLocaleString()}</b></div></div>
      <nav className="character-v2-growth-tabs" aria-label="育成内容">{(["LEVEL", "AWAKENING", "SKILL"] as const).map(tab => <button key={tab} aria-pressed={growthTab === tab} onClick={() => setGrowthTab(tab)}>{({LEVEL:"レベル",AWAKENING:"覚醒",SKILL:"スキル"})[tab]}</button>)}</nav>
      {growthTab === "LEVEL" && <section className="character-v2-operation-card"><h3>レベル</h3><div className="character-v2-current-after"><span><small>現在</small><strong>Lv.{Number(selectedCharacter.level || 1)}</strong></span><i>→</i><span className={characterMaterialCount > 0 ? "has-preview" : ""}><small>強化後</small><strong>Lv.{characterAfterLevel}</strong></span></div>
        {characterMaterialCount > 0 && <dl className="character-v2-preview-stats">{(["hp", "atk", "def", "spd", "luk"] as const).map((key) => <div key={key}><dt>{key.toUpperCase()}</dt><dd>{Number(stats[key]).toLocaleString()} → <b>{Number(characterAfterStats[key]).toLocaleString()}</b></dd></div>)}</dl>}
        {(["CHAR_EXP_S", "CHAR_EXP_M", "CHAR_EXP_L"] as const).map((itemId) => { const owned = Number(game[itemId === "CHAR_EXP_S" ? "charExpS" : itemId === "CHAR_EXP_M" ? "charExpM" : "charExpL"] || 0); return <div className="character-v2-material" key={itemId}><CanonicalItemIcon itemId={itemId} alt="" /><div><strong>{canonicalItemName(itemId)}</strong><span>所持 {owned} / 使用 {growthCounts[itemId]}</span></div><div className="character-v2-counter"><button onClick={() => updateCount(setGrowthCounts, itemId, -1, owned)}>−</button><b>{growthCounts[itemId]}</b><button onClick={() => updateCount(setGrowthCounts, itemId, 1, owned)}>＋</button></div></div>; })}
        <div className="character-v2-consumption"><span>選択素材 {characterMaterialCount}</span><span>予測CASH {characterMaterialCount * 100}</span></div><OutlawButton variant="primary" fullWidth isLoading={game.upgradeLoading} loadingLabel="強化中…" disabled={characterMaterialCount === 0 || characterAfterLevel === Number(selectedCharacter.level || 1)} onClick={() => void runCharacterGrowth()}>強化する</OutlawButton>
      </section>}
      {growthTab === "AWAKENING" && <section className="character-v2-operation-card"><h3>覚醒</h3><div className="character-v2-current-after"><span><small>現在</small><AwakeningBadge level={awakeningLevel} showUnawakened /><small>{awakeningRequired ? "進捗 " + awakeningProgress + " / " + awakeningRequired : "最大覚醒"}</small></span><i>→</i><span><small>1回使用後</small><AwakeningBadge level={awakeningAfter.awakeningLevel} showUnawakened /><small>{awakeningAfter.nextRequired ? "進捗 " + awakeningAfter.awakeningProgress + " / " + awakeningAfter.nextRequired : "最大覚醒"}</small></span></div>
        {awakeningAfter.levelsAdvanced > 0 && <p>次段階に到達します。スキル枠 {skillSlots} → {canonicalSkillSlotCount(awakeningAfter.awakeningLevel)}</p>}
        <div className="character-v2-material"><CanonicalItemIcon itemId="AWAKENING_BOOK" alt="" /><div><strong>{canonicalItemName("AWAKENING_BOOK")}</strong><span>所持 {Number(game.awakeningBooks || 0)} / 必要 1</span></div></div><OutlawButton variant="primary" fullWidth isLoading={game.upgradeLoading} disabled={Number(game.awakeningBooks || 0) < 1 || awakeningLevel >= CHARACTER_AWAKENING_MAX_LEVEL} onClick={() => void game.handleCharacterAwaken(selectedCharacter.id)}>覚醒の書を使う</OutlawButton></section>}
      {growthTab === "SKILL" && <section className="character-v2-loadout-summary"><header><strong>装備中スキル</strong><span>{skillSlots}枠</span></header><div className="character-v2-summary-grid">{Array.from({ length: canonicalSkillSlotCount(CHARACTER_AWAKENING_MAX_LEVEL) }).map((_, index) => { const unlocked = index < skillSlots; const record = equippedSkills.find((entry: any) => Number(entry.slot_index) === index); const master = record && CANONICAL_SKILL_VIEW.find((entry: any) => entry.id === (record.skill_card_id || record.skill_id)); return <button key={index} disabled={!unlocked} aria-label={"スキル枠" + (index + 1)} className={selectedSkillSlot === index ? "active" : ""} onClick={() => { setSelectedSkillSlot(index); if (master) setAssetDetail({kind:"skill",record,master}); }}>{!unlocked ? <span>未解放</span> : master ? <><SkillArt master={master} /><small>{master.name}</small><small>Lv.{record.level || 1}</small></> : <span>＋ スキルを装備</span>}</button>; })}</div>{selectedSkillSlot !== null && <><h3>付け替えるスキル</h3>{renderAssetGrid("skill")}</>}</section>}
    </fieldset>}

    {mainView === "CHARACTERS" && characterView === "LOADOUT" && <section className="character-v2-view">
      <header className="character-v2-title"><button onClick={() => setCharacterView("HOME")}>戻る</button><strong>装備</strong><span>{selectedMaster.jpName}</span></header>
      <CharacterEquipment character={selectedCharacter} master={selectedMaster} equipment={game.userEquipmentsList || []} busy={game.upgradeLoading} renderArt={master => <EquipmentArt master={master} />} onSlot={(index,record,master) => { setSelectedGearSlot(index); if (master) setAssetDetail({kind:"equipment",record,master}); }} onAuto={() => void game.handleEquipGearBulkRecommended(selectedCharacter.id, selectedMaster.id)} />
      {selectedGearSlot !== null && <section className="character-equipment-candidates"><h3>{GEAR_SLOTS_MASTER[selectedGearSlot]?.label}を選ぶ</h3><div className="character-v2-asset-grid">{filteredEquipment.filter((record: any) => CANONICAL_EQUIPMENT_VIEW.find((entry: any) => entry.id === record.equipment_id)?.slot_type === GEAR_SLOTS_MASTER[selectedGearSlot]?.type).map((record: any) => { const master = CANONICAL_EQUIPMENT_VIEW.find((entry: any) => entry.id === record.equipment_id); return <button key={record.id} className="character-v2-asset-card" onClick={() => setAssetDetail({ kind: "equipment", record, master })}><EquipmentArt master={master} /><span className="character-v2-card-level">Lv.{Number(record.level || 1)} / +{Number(record.plus_val || 0)}</span><strong>{master?.name}</strong></button>; })}</div>{filteredEquipment.length === 0 && <p>所持装備がありません。</p>}</section>}

    </section>}

    {mainView === "PARTY" && <CharacterParty game={game} characters={sortedCharacters} onBack={goHome} />}

    {(mainView === "SKILLS" || mainView === "EQUIPMENT") && assetGrowth && <fieldset className="character-v2-view character-v2-asset-growth character-v2-pending-surface" disabled={game.upgradeLoading} aria-busy={game.upgradeLoading}><header className="character-v2-title"><button onClick={() => { setMainView("CHARACTERS"); setCharacterView(assetGrowth.kind === "skill" ? "GROWTH" : "LOADOUT"); setAssetGrowth(null); }}>戻る</button><strong>{assetGrowth.kind === "skill" ? "スキル強化" : "装備強化"}</strong><span>{selectedMaster.jpName}</span></header><div className="character-v2-growth-asset">{assetGrowth.kind === "skill" ? <SkillArt master={assetGrowth.master} /> : <EquipmentArt master={assetGrowth.master} />}<div><strong>{assetGrowth.master.name}</strong><RarityBadge rarity={assetGrowth.master.rarity} /></div></div>
      {assetGrowth.kind === "skill" ? <section className="character-v2-operation-card"><h3>限界突破</h3><div className="character-v2-current-after"><span><small>現在</small><strong>+{Number(growthRecord?.plus_val || 0)}</strong></span><i>→</i><span className="has-preview"><small>強化後</small><strong>+{Math.min(10, Number(growthRecord?.plus_val || 0) + 1)}</strong></span></div><div className="character-v2-material"><CanonicalItemIcon itemId="SKILL_MANUAL" alt="" /><div><strong>{canonicalItemName("SKILL_MANUAL")}</strong><span>所持 {Number(game.skillManuals || 0)} / 必要 1</span></div></div><div className="character-v2-consumption"><span>必要CASH {(Number(growthRecord?.plus_val || 0) + 1) * 1000}</span><span>同名カード または 代用素材</span></div><div className="character-v2-two-actions"><OutlawButton disabled={game.upgradeLoading} onClick={() => void game.handleSkillUpgrade(false)}>同名カード</OutlawButton><OutlawButton variant="primary" disabled={game.upgradeLoading || Number(game.skillManuals || 0) < 1} onClick={() => void game.handleSkillUpgrade(true)}>限界突破する</OutlawButton></div></section>
      : <section className="character-v2-operation-card"><h3>Lv強化</h3><div className="character-v2-current-after"><span><small>現在</small><strong>Lv.{equipmentCurrentLevel}</strong></span><i>→</i><span className={equipmentMaterialCount > 0 ? "has-preview" : ""}><small>強化後</small><strong>Lv.{equipmentAfterLevel}</strong></span></div>{(["EQUIP_EXP_S", "EQUIP_EXP_M", "EQUIP_EXP_L"] as const).map((itemId) => { const owned = Number(game[itemId === "EQUIP_EXP_S" ? "equipExpS" : itemId === "EQUIP_EXP_M" ? "equipExpM" : "equipExpL"] || 0); return <div className="character-v2-material" key={itemId}><CanonicalItemIcon itemId={itemId} alt="" /><div><strong>{canonicalItemName(itemId)}</strong><span>所持 {owned} / 使用 {equipmentGrowthCounts[itemId]}</span></div><div className="character-v2-counter"><button onClick={() => updateCount(setEquipmentGrowthCounts, itemId, -1, owned)}>−</button><b>{equipmentGrowthCounts[itemId]}</b><button onClick={() => updateCount(setEquipmentGrowthCounts, itemId, 1, owned)}>＋</button></div></div>; })}<div className="character-v2-consumption"><span>選択素材 {equipmentMaterialCount}</span><span>予測CASH {equipmentMaterialCount * 50}</span></div><OutlawButton variant="primary" fullWidth isLoading={game.upgradeLoading} disabled={equipmentMaterialCount === 0 || equipmentAfterLevel === equipmentCurrentLevel} onClick={() => void runEquipmentGrowth()}>強化する</OutlawButton><h3>限界突破</h3><div className="character-v2-current-after"><span><small>現在</small><strong>+{Number(growthRecord?.plus_val || 0)}</strong></span><i>→</i><span className="has-preview"><small>強化後</small><strong>+{Math.min(10, Number(growthRecord?.plus_val || 0) + 1)}</strong></span></div><div className="character-v2-material"><CanonicalItemIcon itemId="EQUIP_LB_PART" alt="" /><div><strong>{canonicalItemName("EQUIP_LB_PART")}</strong><span>所持 {Number(game.equipLbParts || 0)} / 必要 1</span></div></div><div className="character-v2-consumption"><span>必要CASH {(Number(growthRecord?.plus_val || 0) + 1) * 1000}</span><span>同名アイテム または 代用素材</span></div><div className="character-v2-two-actions"><OutlawButton onClick={() => void game.handleEquipmentLimitBreak(false)}>同名アイテム</OutlawButton><OutlawButton variant="primary" disabled={Number(game.equipLbParts || 0) < 1} onClick={() => void game.handleEquipmentLimitBreak(true)}>限界突破する</OutlawButton></div></section>}
    </fieldset>}

    {(mainView === "SKILLS" || mainView === "EQUIPMENT") && !assetGrowth && <fieldset className="character-v2-view character-v2-asset-list character-v2-pending-surface" disabled={game.upgradeLoading} aria-busy={game.upgradeLoading}>
      <header className="character-v2-title"><div><span>スキル・装備</span><strong>{mainView === "SKILLS" ? "スキル" : "装備"}</strong></div><button onClick={() => { setMainView(mainView === "SKILLS" ? "EQUIPMENT" : "SKILLS"); setAssetFilter("ALL"); }}>{mainView === "SKILLS" ? "装備" : "スキル"}へ</button></header>
      <div className="character-v2-filters is-rarity">{["ALL", "N", "R", "SR", "SSR", "EQUIPPED"].map((value) => <button key={value} className={assetFilter === value ? "active" : ""} onClick={() => setAssetFilter(value)}>{value === "ALL" ? "すべて" : value === "EQUIPPED" ? "装備中" : <RarityBadge rarity={value} />}</button>)}</div>
      {renderAssetGrid(mainView === "SKILLS" ? "skill" : "equipment")}
      {mainView === "SKILLS" && game.selectedSkill && <section className="character-v2-operation-card"><h3>限界突破</h3><div className="character-v2-current-after"><strong>+{Number(game.selectedSkill.plus_val || 0)}</strong><i>→</i><strong>+{Math.min(10, Number(game.selectedSkill.plus_val || 0) + 1)}</strong></div><div className="character-v2-material"><CanonicalItemIcon itemId="SKILL_MANUAL" alt="" /><div><strong>{canonicalItemName("SKILL_MANUAL")}</strong><span>所持 {Number(game.skillManuals || 0)} / 必要 1</span></div></div><div className="character-v2-two-actions"><OutlawButton disabled={game.upgradeLoading} onClick={() => void game.handleSkillUpgrade(false)}>同名カード</OutlawButton><OutlawButton variant="primary" disabled={game.upgradeLoading || Number(game.skillManuals || 0) < 1} onClick={() => void game.handleSkillUpgrade(true)}>限界突破する</OutlawButton></div></section>}
      {mainView === "EQUIPMENT" && game.selectedEquipment && <section className="character-v2-operation-card"><h3>装備強化</h3><div className="character-v2-current-after"><strong>Lv.{Number(game.selectedEquipment.level || 1)}</strong><i>→</i><strong>実行後に反映</strong></div>{(["EQUIP_EXP_S", "EQUIP_EXP_M", "EQUIP_EXP_L"] as const).map((itemId) => { const owned = Number(game[itemId === "EQUIP_EXP_S" ? "equipExpS" : itemId === "EQUIP_EXP_M" ? "equipExpM" : "equipExpL"] || 0); return <div className="character-v2-material" key={itemId}><CanonicalItemIcon itemId={itemId} alt="" /><div><strong>{canonicalItemName(itemId)}</strong><span>所持 {owned}</span></div><div className="character-v2-counter"><button onClick={() => updateCount(setEquipmentGrowthCounts, itemId, -1, owned)}>−</button><b>{equipmentGrowthCounts[itemId]}</b><button onClick={() => updateCount(setEquipmentGrowthCounts, itemId, 1, owned)}>＋</button></div></div>; })}<OutlawButton variant="primary" fullWidth disabled={game.upgradeLoading || Object.values(equipmentGrowthCounts).every((count) => count === 0)} onClick={() => void runEquipmentGrowth()}>強化する</OutlawButton><h3>限界突破</h3><div className="character-v2-current-after"><strong>+{Number(game.selectedEquipment.plus_val || 0)}</strong><i>→</i><strong>+{Math.min(10, Number(game.selectedEquipment.plus_val || 0) + 1)}</strong></div><div className="character-v2-material"><CanonicalItemIcon itemId="EQUIP_LB_PART" alt="" /><div><strong>{canonicalItemName("EQUIP_LB_PART")}</strong><span>所持 {Number(game.equipLbParts || 0)} / 必要 1</span></div></div><div className="character-v2-two-actions"><OutlawButton onClick={() => void game.handleEquipmentLimitBreak(false)}>同名装備</OutlawButton><OutlawButton variant="primary" disabled={Number(game.equipLbParts || 0) < 1} onClick={() => void game.handleEquipmentLimitBreak(true)}>限界突破する</OutlawButton></div></section>}
    </fieldset>}

    {assetDetail && <CanonicalDialog title={assetDetail.kind === "skill" ? "スキル詳細" : "装備詳細"} actions={[{ label: "閉じる", semantic: "secondary", onClick: () => setAssetDetail(null) }]}>
      <div className="character-v2-mini-detail"><div className="character-v2-mini-hero">{assetDetail.kind === "skill" ? <SkillArt master={assetDetail.master} /> : <EquipmentArt master={assetDetail.master} />}<div><strong>{assetDetail.master.name}</strong><RarityBadge rarity={assetDetail.master.rarity} /><span>Lv.{Number(assetDetail.record.level || 1)} / 限界突破 +{Number(assetDetail.record.plus_val || 0)}</span></div></div>
        {assetDetail.kind === "skill" ? <dl><div><dt>対象</dt><dd>{TARGET_LABEL[assetDetail.master.target] || "特殊"}</dd></div><div><dt>効果</dt><dd>{assetDetail.master.description || "効果情報なし"}</dd></div></dl> : <dl><div><dt>枠</dt><dd>{GEAR_SLOTS_MASTER.find((entry: any) => entry.type === assetDetail.master.slot_type)?.label || "装備"}</dd></div>{(["hp", "atk", "def", "spd", "luk"] as const).map((key) => <div key={key}><dt>{key.toUpperCase()}</dt><dd>{canonicalEquipmentFlatStat(Number(assetDetail.master[key] || 0), Number(assetDetail.record.level || 1), Number(assetDetail.record.plus_val || 0)).toLocaleString()}</dd></div>)}</dl>}
        {assetDetail.kind === "equipment" && <p>固定効果：{assetDetail.master.effect_description || "なし"}</p>}
        {assetDetail.record.equipped_character_id === selectedCharacter.id && <OutlawButton fullWidth onClick={() => { setAssetDetail(null); }}>付け替える</OutlawButton>}
        <div className="character-v2-two-actions"><OutlawButton onClick={() => { if (assetDetail.kind === "skill") { game.setSelectedSkill(assetDetail.record); setMainView("SKILLS"); } else { game.selectUpgradeEquipment(assetDetail.record); setMainView("EQUIPMENT"); } setAssetGrowth(assetDetail); setAssetDetail(null); }}>強化する</OutlawButton><OutlawButton variant="primary" disabled={game.upgradeLoading} onClick={() => void equipAsset(assetDetail)}>{assetDetail.record.equipped_character_id === selectedCharacter.id ? "解除" : "装備する"}</OutlawButton></div>
      </div>
    </CanonicalDialog>}
  </div>;
}

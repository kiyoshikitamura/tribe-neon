"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../context/GameContext";
import { supabase } from "@/utils/supabase";
import {
  CHARACTERS_MASTER,
  GEAR_SLOTS_MASTER,
  getCharacterTransparentImg,
  getAlignmentShortJp
} from "@/utils/game_constants";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { CANONICAL_EQUIPMENT_VIEW } from "@/utils/equipments_master_data";
import { getCharacterTotalStats } from "@/utils/stats_calculator";
import { applyCharacterAwakeningCopyEquivalent } from "@/domain/gameplay/canonical/awakening";
import { canonicalSkillSlotCount } from "@/domain/gameplay/canonical/calculations";
import { useImagePreloader } from "../hooks/useImagePreloader";
import { CHARACTER_LOADOUT_RARITY_ASSETS } from "../lib/screenManifests";
import TutorialNavigator from "./TutorialNavigator";
import CharacterPresentation from "./character/CharacterPresentation";
import { getRarityFrameAsset } from "@/utils/rarityAssets";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import { getAttributeLabel } from "@/utils/attributeAssets";
import CanonicalItemIcon from "./ui/CanonicalItemIcon";
import { ChoiceGroup } from "./ui/EditableSettingSection";
import CanonicalDialog from "./ui/CanonicalDialog";
import { SkillDetailDialog, SkillIcon } from "./skill/SkillPresentation";
import CharacterSystemV2 from "./character/CharacterSystemV2";
import "./CharacterTab.css";

function equipmentParameter(master: any) {
  return [["HP", master?.hp], ["ATK", master?.atk], ["DEF", master?.def], ["SPD", master?.spd], ["LUK", master?.luk]]
    .filter(([, value]) => Number(value) !== 0)
    .map(([label, value]) => `${label} ${Number(value) > 0 ? "+" : ""}${value}`)
    .join(" / ") || "パラメータ補正なし";
}

export default function CharacterTab() {
  // アセット事前自動メモリプリロード
  useImagePreloader(CHARACTER_LOADOUT_RARITY_ASSETS);

  const {
    upgradeSelectedCharId,
    setUpgradeSelectedCharId,
    selectedMembers,
    userCharactersDbList,
    userEquipmentsList,
    userSkillsList,
    selectedLeader,
    setSelectedLeader,
    handleCharacterLevelUp,
    handleCharacterAwaken,
    charExpS,
    awakeningBooks,
    equipExpS,
    equipLbParts,
    skillManuals,
    upgradeLoading,
    setActiveGearSlot,
    handleEquipGear,
    handleUnequipGear,
    handleEquipGearBulkRecommended,
    handleUnequipGearBulk,
    handleEquipSkill,
    handleUnequipSkill,
    handleEquipSkillBulkRecommended,
    handleUnequipSkillBulk,
    selectedEquipment,
    selectUpgradeEquipment,
    handleEquipmentLevelUp,
    handleEquipmentLimitBreak,
    selectedSkill,
    setSelectedSkill,
    handleSkillUpgrade,
    handleAutoFormation,
    handleTogglePartyMember,
    playCyberSe,
    session,
    onboardingState,
    scoutAnimationState,
    syncBootstrapData,
    totalPower,
    setErrorMessage
  } = useGame();

  // ボトムシートモーダル状態: null (閉じ) | "STATUS" | "SKILL" | "GEAR"
  const [bottomModalTab, setBottomModalTab] = useState<"STATUS" | "SKILL" | "GEAR" | "STYLE" | null>(null);
  const [characterCosmetics, setCharacterCosmetics] = useState<Array<{ cosmetic_id: string; cosmetic_master: { slot: string; display_name: string; rarity: string } | null }>>([]);
  const [equippedCharacterCosmetics, setEquippedCharacterCosmetics] = useState<Record<string, string>>({});
  const [characterCosmeticLoading, setCharacterCosmeticLoading] = useState(false);

  // モーダル内部でのインライン選択中スロット枠 index (0~6: 装備, 0~5: スキル)
  const [selectedEquipSlotIdx, setSelectedEquipSlotIdx] = useState<number | null>(null);
  const [selectedSkillSlotIdx, setSelectedSkillSlotIdx] = useState<number | null>(null);
  const [skillDetail, setSkillDetail] = useState<any>(null);
  const [equipmentDetail, setEquipmentDetail] = useState<{ master: any; record: any } | null>(null);
  const [formationEditMode, setFormationEditMode] = useState(false);
  const [formationSubmitting, setFormationSubmitting] = useState(false);
  const [tutorialFormationPreviewReady, setTutorialFormationPreviewReady] = useState(false);
  const [tutorialLearningPhase, setTutorialLearningPhase] = useState<"SKILL" | "FORMATION" | null>(null);
  const [tutorialSkillPending, setTutorialSkillPending] = useState(false);
  const [skillDisplayById, setSkillDisplayById] = useState<Record<string, any>>({});
  const [characterSetupDialogOpen, setCharacterSetupDialogOpen] = useState(false);
  const [characterSetupPending, setCharacterSetupPending] = useState(false);
  const [characterSetupResult, setCharacterSetupResult] = useState<any>(null);
  const formationSubmittingRef = useRef(false);
  const tutorialFormationPreparedRef = useRef(false);
  const isTutorialStep = onboardingState?.tutorial_step === "AUTO_FORMATION";
  const isTutorialFormation = isTutorialStep && formationEditMode;
  const tutorialSkillMasters = useMemo(
    () => ["SKILL_001", "SKILL_003", "SKILL_022"].map((skillId) => CANONICAL_SKILL_VIEW.find((skill) => skill.id === skillId)).filter(Boolean),
    []
  );

  const ownedSkillMasterIds = useMemo(() => Array.from(new Set((userSkillsList || []).map((skill: any) => skill.skill_card_id || skill.skill_id).filter(Boolean))).sort(), [userSkillsList]);

  useEffect(() => {
    if (!session?.user?.id || ownedSkillMasterIds.length === 0) {
      setSkillDisplayById({});
      return;
    }
    let cancelled = false;
    void supabase.rpc("get_current_skill_display", { p_skill_ids: ownedSkillMasterIds }).then(({ data, error }) => {
      if (cancelled || error || !Array.isArray(data)) return;
      setSkillDisplayById(Object.fromEntries(data.map((entry: any) => [entry.skill_master_id, entry])));
    });
    return () => { cancelled = true; };
  }, [session?.user?.id, ownedSkillMasterIds.join("|")]);

  useEffect(() => {
    if (!session?.user?.id || !onboardingState?.gameplay_authorized || isTutorialStep) {
      setCharacterSetupDialogOpen(false);
      return;
    }
    let active = true;
    void supabase.rpc("get_character_setup_dialog_state").then(({ data, error }) => {
      if (!active || error) return;
      setCharacterSetupDialogOpen(data?.eligible === true && data?.consumed !== true);
    });
    return () => { active = false; };
  }, [isTutorialStep, onboardingState?.gameplay_authorized, session?.user?.id]);

  const completeCharacterSetupDialog = async (action: "AUTO_SETUP" | "LATER") => {
    if (characterSetupPending || !session?.user?.id) return;
    setCharacterSetupPending(true);
    try {
      const { data, error } = await supabase.rpc("complete_character_setup_dialog", { p_action: action });
      if (error) throw error;
      setCharacterSetupDialogOpen(false);
      if (action === "AUTO_SETUP" && data?.status === "success") {
        await syncBootstrapData(session.user.id);
        setCharacterSetupResult(data);
      }
      playCyberSe("click");
    } catch (error: any) {
      console.warn("Character setup dialog failed:", error);
      setErrorMessage(error?.message || "おすすめ設定を完了できませんでした。");
    } finally {
      setCharacterSetupPending(false);
    }
  };

  useEffect(() => {
    if (onboardingState?.tutorial_step !== "AUTO_FORMATION") {
      tutorialFormationPreparedRef.current = false;
      setTutorialLearningPhase(null);
      return;
    }
    // The draw presentation keeps the foreground until its summary is closed.
    // Then the visible formation step begins; Growth is intentionally omitted.
    if (scoutAnimationState !== null) return;
    if (!session?.user?.id || tutorialFormationPreparedRef.current) return;
    tutorialFormationPreparedRef.current = true;
    setTutorialLearningPhase("FORMATION");
    setFormationEditMode(true);
  }, [onboardingState?.tutorial_step, scoutAnimationState, session?.user?.id]);

  // 選択中キャラクター情報の取得
  const ownedCharIds = useMemo(() => {
    const ids = (userCharactersDbList || []).map((uc: any) => uc.character_id);
    return ids;
  }, [userCharactersDbList]);

  const activeCharRecord = useMemo(() => {
    return (userCharactersDbList || []).find((c: any) => c.character_id === upgradeSelectedCharId) || userCharactersDbList?.[0];
  }, [userCharactersDbList, upgradeSelectedCharId]);

  const activeCharMaster = useMemo(() => {
    const charId = activeCharRecord?.character_id || upgradeSelectedCharId;
    return charId ? CHARACTERS_MASTER.find((c: any) => c.id === charId) || null : null;
  }, [activeCharRecord, upgradeSelectedCharId]);

  // キャラクター総ステータス算出 (stats_calculator.ts 準拠)
  const charStats = useMemo(() => {
    if (!activeCharRecord) return { hp: 0, atk: 0, def: 0, spd: 0, luk: 0 };
    return getCharacterTotalStats(activeCharRecord, userEquipmentsList);
  }, [activeCharRecord, userEquipmentsList]);
  const characterPower = charStats.hp + charStats.atk + charStats.def;

  const alignInfo = getAlignmentShortJp(activeCharMaster?.alignment || "");
  const attributeLabel = getAttributeLabel(activeCharMaster?.alignment);
  const awakeningLevel = activeCharRecord?.awakening_level || 0;
  const awakeningProgress = Number(activeCharRecord?.awakening_progress || 0);
  const awakeningAfter = applyCharacterAwakeningCopyEquivalent(awakeningLevel, awakeningProgress, 1);
  const isCurrentLeader = selectedLeader === activeCharMaster?.id;
  const maxSkillSlots = canonicalSkillSlotCount(Math.max(0, Math.min(5, awakeningLevel)));
  const activeCharacterDbId = activeCharRecord?.id;

  const equippedGearBySlot = useMemo(() => {
    const equipped = new Map<number, any>();
    if (!activeCharacterDbId) return equipped;
    (userEquipmentsList || []).forEach((item: any) => {
      if (item.equipped_character_id === activeCharacterDbId && typeof item.slot_index === "number") {
        equipped.set(item.slot_index, item);
      }
    });
    return equipped;
  }, [activeCharacterDbId, userEquipmentsList]);

  const equippedSkillsBySlot = useMemo(() => {
    const equipped = new Map<number, any>();
    if (!activeCharacterDbId) return equipped;
    (userSkillsList || []).forEach((item: any) => {
      if (item.equipped_character_id === activeCharacterDbId && typeof item.slot_index === "number") {
        equipped.set(item.slot_index, item);
      }
    });
    return equipped;
  }, [activeCharacterDbId, userSkillsList]);

  const partyMembers = useMemo(() => selectedMembers.slice(0, 5).map((characterId: string) => {
    const record = (userCharactersDbList || []).find((item: any) => item.character_id === characterId);
    const master = CHARACTERS_MASTER.find((item: any) => item.id === characterId);
    return { characterId, record, master };
  }).filter((member: { record: any; master: any }) => member.record && member.master), [selectedMembers, userCharactersDbList]);
  const tutorialPartyHasSsr = partyMembers.some((member: { master?: { rarity?: string } }) => member.master?.rarity === "SSR");
  // The tutorial RPC creates slot 10 last. Production rows carry created_at;
  // the mock mirrors it, so reloads still identify the exact guaranteed pull
  // before the authoritative formation transaction is committed.
  const tutorialGuaranteedSsr = useMemo(() => (userCharactersDbList || [])
    .filter((record: any) => CHARACTERS_MASTER.find((master: any) => master.id === record.character_id)?.rarity === "SSR")
    .slice()
    .sort((left: any, right: any) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())[0] || null,
  [userCharactersDbList]);

  useEffect(() => {
    const characterId = activeCharRecord?.id;
    if (!session?.user?.id || !characterId) {
      return;
    }
    const loadCharacterCosmetics = async () => {
      const slotPrefix = `CHARACTER:${characterId}:`;
      const [{ data: owned, error: ownedError }, { data: equipped, error: equippedError }] = await Promise.all([
        supabase.from("character_cosmetics").select("cosmetic_id, cosmetic_master(slot, display_name, rarity)").eq("user_character_id", characterId),
        supabase.from("equipped_cosmetics").select("slot, cosmetic_id").eq("user_id", session.user.id).like("slot", `${slotPrefix}%`)
      ]);
      if (ownedError || equippedError) {
        console.warn("Character cosmetics are unavailable:", ownedError?.message || equippedError?.message);
        return;
      }
      setCharacterCosmetics((owned || []).map((item) => ({
        cosmetic_id: item.cosmetic_id,
        cosmetic_master: Array.isArray(item.cosmetic_master) ? (item.cosmetic_master[0] || null) : item.cosmetic_master
      })) as Array<{ cosmetic_id: string; cosmetic_master: { slot: string; display_name: string; rarity: string } | null }>);
      setEquippedCharacterCosmetics(Object.fromEntries((equipped || []).map((item) => [item.slot.replace(slotPrefix, ""), item.cosmetic_id])));
    };
    void loadCharacterCosmetics();
  }, [activeCharRecord?.id, session?.user?.id]);

  const getCharacterCosmeticsForSlot = (slot: string) => characterCosmetics.filter((item) => item.cosmetic_master?.slot === slot);
  const getEquippedCharacterCosmetic = (slot: string, fallback: string) => equippedCharacterCosmetics[slot] || fallback;
  const equipCharacterCosmetic = async (slot: string, cosmeticId: string) => {
    if (!activeCharRecord?.id) return;
    setCharacterCosmeticLoading(true);
    try {
      const { error } = await supabase.rpc("equip_character_cosmetic", {
        p_user_character_id: activeCharRecord.id,
        p_slot: slot,
        p_cosmetic_id: cosmeticId
      });
      if (error) throw error;
      setEquippedCharacterCosmetics((current) => ({ ...current, [slot]: cosmeticId }));
      playCyberSe("click");
    } catch (error) {
      console.warn("Character cosmetic equip failed:", error);
    } finally {
      setCharacterCosmeticLoading(false);
    }
  };

  // 上部カルーセル スライド操作
  const activeCharIndex = ownedCharIds.indexOf(upgradeSelectedCharId);

  const handlePrevChar = () => {
    if (ownedCharIds.length <= 1) return;
    const prevIndex = (activeCharIndex - 1 + ownedCharIds.length) % ownedCharIds.length;
    setUpgradeSelectedCharId(ownedCharIds[prevIndex]);
    playCyberSe("click");
  };

  const handleNextChar = () => {
    if (ownedCharIds.length <= 1) return;
    const nextIndex = (activeCharIndex + 1) % ownedCharIds.length;
    setUpgradeSelectedCharId(ownedCharIds[nextIndex]);
    playCyberSe("click");
  };

  // Character identity follows the canonical hometown/location authority.
  const bgImgUrl = getCharacterLocationBackground(activeCharMaster?.homeTown);

  // --------------------------------------------------------------------------
  // 装備スロット レンダリング補助 (左右 7スロット)
  // --------------------------------------------------------------------------
  const renderEquipSlot = (slotDef: any) => {
    // 比較には DBレコードの UUID (activeCharRecord.id) を使用
    const previewGear = equippedGearBySlot.get(slotDef.index) || null;
    const gearMaster = previewGear ? CANONICAL_EQUIPMENT_VIEW.find((m: any) => m.id === previewGear.equipment_id) : null;
    const rarity = (gearMaster?.rarity || "N").toUpperCase();

    return (
      <button
        type="button"
        key={slotDef.index}
        className={`char-equip-slot ${previewGear ? "is-equipped" : "slot-empty"} active-scale-effect`}
        aria-label={previewGear ? `${slotDef.label}: ${gearMaster?.name || "装備"}` : `${slotDef.label}: 未装備`}
        onClick={() => {
          setSelectedEquipSlotIdx(slotDef.index);
          setBottomModalTab("GEAR");
          playCyberSe("click");
        }}
      >
        {previewGear && <img className="production-rarity-item-frame" src={getRarityFrameAsset("equipment", rarity)} alt="" aria-hidden="true" />}
        {gearMaster && <img className="production-equipment-art" src={gearMaster.assetPath} alt="" aria-hidden="true" />}
        {previewGear ? <>{previewGear.plus_val > 0 && <span className="slot-plus-badge">+{previewGear.plus_val}</span>}</> : <div className="slot-empty-icon">＋</div>}
        <span className="slot-label">{slotDef.label}</span>
      </button>
    );
  };

  const leftSlots = GEAR_SLOTS_MASTER.slice(0, 3);
  const rightSlots = GEAR_SLOTS_MASTER.slice(3, 7);
  if (!isTutorialStep) return <>
    <CharacterSystemV2 />
    {characterSetupDialogOpen && <CanonicalDialog
      title="おすすめパーティと装備を設定しますか？"
      ariaLabel="キャラクターページ初回おすすめ設定"
      actions={[
        { label: characterSetupPending ? "設定中..." : "おすすめ設定する", semantic: "primary", disabled: characterSetupPending, onClick: () => void completeCharacterSetupDialog("AUTO_SETUP") },
        { label: "あとで", semantic: "secondary", disabled: characterSetupPending, onClick: () => void completeCharacterSetupDialog("LATER") },
      ]}
    >
      今のキャラクターから、おすすめの編成と装備を自動で設定します。
      {Number(totalPower || 0) > 0 && <small className="character-setup-current-power">現在の総合力 {Number(totalPower).toLocaleString()}</small>}
    </CanonicalDialog>}
    {characterSetupResult && <CanonicalDialog
      title="おすすめ設定が完了しました"
      actions={[{ label: "確認する", semantic: "primary", onClick: () => setCharacterSetupResult(null) }]}
    >
      <div className="character-setup-result" data-acceptance-state="CHARACTER_SETUP_COMPLETE">
        <p>パーティと装備をCharacter Pageへ反映しました。</p>
        <strong>総合力 {Number(characterSetupResult.powerBefore || 0).toLocaleString()} → {Number(characterSetupResult.powerAfter || 0).toLocaleString()}</strong>
        <small>Party {Number(characterSetupResult.partyCount || 0)}人 / Equipment {Number(characterSetupResult.equipmentCount || 0)}件</small>
      </div>
    </CanonicalDialog>}
  </>;
  if (!activeCharRecord || !activeCharMaster) {
    return <div className="char-tab-container char-data-unavailable" role="status">キャラクターデータを確認しています。</div>;
  }

  return (
    <div className="char-tab-container">
      {isTutorialStep && tutorialLearningPhase === null && scoutAnimationState === null && (
        <div className="tutorial-character-page-continue">
          <button className="semantic-cta semantic-cta--primary tutorial-primary-target" onClick={() => { setTutorialLearningPhase("FORMATION"); setFormationEditMode(true); }}>おまかせ編成へ</button>
        </div>
      )}
      {isTutorialStep && tutorialLearningPhase === "SKILL" && (
        <div className="char-party-modal-backdrop">
          <section className="char-party-modal tutorial-character-step tutorial-learning-step" aria-label="おすすめスキル設定">
            <div data-acceptance-state="TUTORIAL_SKILL_STEP">
              <TutorialNavigator message={<>おすすめのスキルを選んでおいたから、装備させるね。</>} />
              <div className="tutorial-skill-row" aria-label="おすすめスキル3種">
                {tutorialSkillMasters.map((skill: any) => (
                  <article key={skill.id} data-skill-id={skill.id}>
                    <SkillIcon skill={skill} size="regular" />
                    <small>{skill.id}</small>
                    <strong>{skill.name}</strong>
                  </article>
                ))}
              </div>
              <button
                className="semantic-cta semantic-cta--primary tutorial-primary-target"
                disabled={tutorialSkillPending}
                aria-busy={tutorialSkillPending}
                onClick={() => void (async () => {
                  if (tutorialSkillPending) return;
                  setTutorialSkillPending(true);
                  try {
                    const completed = await handleAutoFormation();
                    if (completed) playCyberSe("FORMATION_CONFIRM");
                  } finally {
                    setTutorialSkillPending(false);
                  }
                })()}
              >{tutorialSkillPending ? "装備中..." : "装備する"}</button>
            </div>
          </section>
        </div>
      )}
      {/* 1. 上部: 所持キャラクター丸型スライダー */}
      <div className="char-slider-header">
        <button className="char-slider-arrow" onClick={handlePrevChar}>◀</button>
        <div className="char-slider-track">
          {(userCharactersDbList || []).map((uc: any) => {
            const master = CHARACTERS_MASTER.find(m => m.id === uc.character_id);
            if (!master) return null;
            const isSelected = uc.character_id === activeCharMaster.id;
            const deckIndex = selectedMembers.indexOf(uc.character_id);
            const isInDeck = deckIndex !== -1;
            const isLeader = deckIndex === 0;

            return (
              <div
                key={uc.id || uc.character_id}
                className={`char-slider-item ${isInDeck ? "in-deck" : ""} ${isSelected ? "active" : ""}`}
                onClick={() => {
                  setUpgradeSelectedCharId(uc.character_id);
                  playCyberSe("click");
                }}
              >
                <CharacterPresentation
                  src={getCharacterTransparentImg(master.name)}
                  alt={master.jpName}
                  variant="thumbnail"
                  className="char-slider-avatar"
                />
                {isLeader && <span className="char-slider-badge-leader">リーダー</span>}
                {isInDeck && !isLeader && <span className="char-slider-badge-deck">出撃</span>}
              </div>
            );
          })}
        </div>
        <button className="char-slider-arrow" onClick={handleNextChar}>▶</button>
        <button className="char-party-entry active-scale-effect" onClick={() => { setFormationEditMode(true); playCyberSe("click"); }}>
          <span>編成</span><strong>{partyMembers.length}/5</strong><i>›</i>
        </button>
      </div>

      <div className={`char-character-info-bar char-plate-style-${getEquippedCharacterCosmetic("CHARACTER_NAMEPLATE", "char_plate_none")}`}>
        <div className="char-hud-left-group">
          <span className={`char-hud-align-badge char-hud-align-${alignInfo.colorClass}`}>{attributeLabel}</span>
          <span className="char-hud-name">{activeCharMaster.jpName}</span>
          {awakeningLevel > 0 && <span className="char-hud-awaken">+{awakeningLevel}</span>}
          <span className="char-hud-level">Lv.{activeCharRecord?.level || 1}</span>
        </div>
        <button
          className={`char-leader-set-btn-small ${isCurrentLeader ? "is-active" : ""} active-scale-effect`}
          onClick={() => { setSelectedLeader(activeCharMaster.id); playCyberSe("click"); }}
        >
          {isCurrentLeader ? "★ リーダー" : "☆ リーダーにする"}
        </button>
      </div>

      {/* 2. 中央: 大画面5層レイヤーキャンバス (高さ360px絶対固定) */}
      <div key={activeCharRecord?.id || activeCharMaster.id} className="char-main-stage">
        {/* Z-10: 背景 */}
        <div className="char-layer-bg" style={{ backgroundImage: `url(${bgImgUrl})` }}>
          <div className="char-layer-bg-overlay" />
        </div>

        {/* Z-30: メインキャラクター透過立ち絵 (サイズ固定) */}
        <div className="char-layer-character">
          <CharacterPresentation
            src={getCharacterTransparentImg(activeCharMaster.name)}
            alt={activeCharMaster.jpName}
            variant="portrait"
            rarity={activeCharMaster.rarity || "N"}
            className="char-character-img"
          />
        </div>

        {/* 左側 装備スロット 3枠 */}
        <div className="char-equip-column char-equip-column-left">
          {leftSlots.map(slot => renderEquipSlot(slot))}
        </div>

        {/* 右側 装備スロット 4枠 */}
        <div className="char-equip-column char-equip-column-right">
          {rightSlots.map(slot => renderEquipSlot(slot))}
        </div>

        <div className="char-firstview-skills" aria-label="装着スキル">
          {Array.from({ length: 6 }).map((_, slotIdx) => {
            const skillRecord = equippedSkillsBySlot.get(slotIdx);
            const skillMaster = skillRecord ? CANONICAL_SKILL_VIEW.find((item: any) => item.id === (skillRecord.skill_card_id || skillRecord.skill_id)) : null;
            const unlocked = slotIdx < maxSkillSlots;
            return (
              <button
                key={slotIdx}
                className={`char-firstview-skill ${skillMaster ? `is-${(skillMaster.rarity || "N").toLowerCase()}` : ""} ${!unlocked ? "is-locked" : ""} active-scale-effect`}
                onClick={() => {
                  if (!unlocked) return;
                  if (skillMaster) {
                    setSkillDetail(skillMaster);
                    playCyberSe("click");
                    return;
                  }
                  setSelectedSkillSlotIdx(slotIdx);
                  setBottomModalTab("SKILL");
                  playCyberSe("click");
                }}
              >
                {skillMaster && <img className="production-rarity-item-frame" src={getRarityFrameAsset("skill", skillMaster.rarity)} alt="" aria-hidden="true" />}
                {skillMaster ? <SkillIcon skill={skillMaster} /> : <strong>{unlocked ? "＋" : "未開放"}</strong>}
                <span>枠{slotIdx + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="char-power-summary">
        <div><span>戦力</span><strong>{characterPower.toLocaleString()}</strong></div>
        <button className="active-scale-effect" onClick={() => { setBottomModalTab("STATUS"); playCyberSe("click"); }}>詳細 ›</button>
      </div>

      <div className="char-identity-summary" aria-label="キャラクター情報">
        <span><small>レアリティ</small><strong>{activeCharMaster.rarity || "N"}</strong></span>
        <span><small>出身</small><strong>{activeCharMaster.homeTown || "東京"}</strong></span>
        <span><small>属性</small><strong>{attributeLabel}</strong></span>
        <span><small>覚醒</small><strong>+{awakeningLevel} / +5</strong></span>
      </div>

      <div className="char-main-actions">
        <button
          className={`char-main-action-btn ${bottomModalTab === "STATUS" ? "active" : ""} active-scale-effect`}
          onClick={() => {
            setBottomModalTab("STATUS");
            playCyberSe("click");
          }}
        >
          強化
        </button>
        <button className="char-main-action-btn active-scale-effect" onClick={() => { setBottomModalTab("SKILL"); playCyberSe("click"); }}>スキル</button>
        <button className="char-main-action-btn active-scale-effect" onClick={() => { setBottomModalTab("GEAR"); playCyberSe("click"); }}>装備</button>
      </div>

      {formationEditMode && (
        <div className="char-party-modal-backdrop" onClick={() => { if (!isTutorialFormation) setFormationEditMode(false); }}>
          <section className={`char-party-modal ${isTutorialFormation ? "tutorial-character-step" : ""}`} onClick={(event) => event.stopPropagation()} aria-label="出撃パーティ編集">
            {isTutorialFormation && (
              <TutorialNavigator message={<>バトルに出るメンバーはここで決めるよ。<br />まずは今いるメンバーで編成してみて。</>} />
            )}
            <header className="char-party-modal-header">
              <div><span>編成</span><strong>出撃編成 {partyMembers.length}/5</strong></div>
              {!isTutorialFormation && <button onClick={() => setFormationEditMode(false)}>完了 ✕</button>}
            </header>
            <div className="char-party-modal-slots">
              {Array.from({ length: 5 }).map((_, index) => {
                const member = partyMembers[index];
                return member?.master ? (
                  <button key={`${member.characterId}-${index}`} data-character-id={member.characterId} data-user-character-id={member.record?.id} disabled={isTutorialFormation} onClick={() => void handleTogglePartyMember(member.characterId)}>
                    <span>{index + 1}</span>
                    <CharacterPresentation src={getCharacterTransparentImg(member.master.name)} alt={member.master.jpName} variant="card" rarity={member.master.rarity || "N"} attribute={member.master.alignment} backgroundSrc={getCharacterLocationBackground(member.master.homeTown)} frameKind="character" rarityBadge attributeBadge />
                    <b>{member.master.jpName}</b>
                  </button>
                ) : <div className="is-empty" key={`party-empty-${index}`}><span>{index + 1}</span><i>＋</i><b>未編成</b></div>;
              })}
            </div>
            {isTutorialFormation && (
              <div className={`tutorial-formation-status ${tutorialFormationPreviewReady ? "is-complete" : ""}`} aria-live="polite">
                <span className={partyMembers.length === 5 ? "is-ready" : ""}><b>{partyMembers.length}/5</b> メンバー</span>
                <span className={tutorialPartyHasSsr ? "is-ready" : ""}><b>SSR</b> 編成</span>
                <span><b>SKILL</b> 次に設定</span>
              </div>
            )}
            {!isTutorialFormation && <p className="char-party-modal-help">所持キャラクターをタップして、出撃メンバーに追加／解除します。</p>}
            {isTutorialFormation && <h3 className="tutorial-formation-owned-title">所持キャラクター</h3>}
            <div className="char-party-candidates">
              {(userCharactersDbList || []).map((character: any) => {
                const master = CHARACTERS_MASTER.find((item: any) => item.id === character.character_id);
                if (!master) return null;
                const partyIndex = selectedMembers.indexOf(character.character_id);
                return (
                  <button
                    key={character.id || character.character_id}
                    className={`${partyIndex >= 0 ? "is-selected" : ""} ${isTutorialFormation && character.id === tutorialGuaranteedSsr?.id ? "is-guaranteed-ssr" : ""} active-scale-effect`}
                    data-character-id={character.character_id}
                    data-user-character-id={character.id}
                    disabled={isTutorialFormation}
                    onClick={() => void handleTogglePartyMember(character.character_id)}
                  >
                    <CharacterPresentation
                      src={getCharacterTransparentImg(master.name)}
                      alt={master.jpName}
                      variant="card"
                      rarity={(master as any).rarity || "R"}
                      attribute={(master as any).alignment}
                      backgroundSrc={getCharacterLocationBackground((master as any).homeTown)}
                      frameKind="character"
                      rarityBadge
                      attributeBadge
                    />
                    <span>{master.jpName}</span>
                    {isTutorialFormation && character.id === tutorialGuaranteedSsr?.id && <em>おすすめ編成</em>}
                    {partyIndex >= 0 && <b>{partyIndex + 1}</b>}
                  </button>
                );
              })}
            </div>
            {!tutorialFormationPreviewReady && <button
              className="char-party-auto-btn semantic-cta semantic-cta--primary active-scale-effect"
              disabled={formationSubmitting}
              aria-busy={formationSubmitting}
              onClick={() => void (async () => {
                if (formationSubmittingRef.current) return;
                formationSubmittingRef.current = true;
                setFormationSubmitting(true);
                try {
                  if (isTutorialFormation) {
                    const { data, error } = await supabase.rpc("prepare_current_tutorial_formation");
                    if (error) throw error;
                    const serverParty = data?.formation?.character_ids;
                    if (!Array.isArray(serverParty) || serverParty.length < 3) throw new Error("おすすめ編成を確認できませんでした。");
                    if (data?.leader_character_id) setSelectedLeader(String(data.leader_character_id));
                    setUpgradeSelectedCharId(serverParty[0]);
                    if (session?.user?.id) await syncBootstrapData(session.user.id);
                    setTutorialFormationPreviewReady(true);
                    playCyberSe("FORMATION_CONFIRM");
                  } else {
                    const completed = await handleAutoFormation({ navigateAfter: false });
                    if (completed) playCyberSe("FORMATION_CONFIRM");
                  }
                } catch (error: any) {
                  console.warn("Tutorial formation preparation failed:", error);
                  setErrorMessage(error?.message || "おすすめ編成を準備できませんでした。");
                } finally {
                  formationSubmittingRef.current = false;
                  setFormationSubmitting(false);
                }
              })()}
            >
              {tutorialFormationPreviewReady ? "編成完了" : formationSubmitting ? "編成中..." : isTutorialFormation ? "おすすめ編成にする" : "戦力順でおまかせ編成"}
            </button>}
            {tutorialFormationPreviewReady && <div className="tutorial-formation-complete" role="dialog" aria-modal="true" aria-labelledby="tutorial-formation-complete-title" data-acceptance-state="AUTO_FORMATION_COMPLETE">
              <div className="tutorial-formation-complete-dialog">
              <span>FORMATION COMPLETE</span>
              <strong id="tutorial-formation-complete-title">編成しました</strong>
              <p>5人のメンバーを保存しました。次にスキルを設定します。</p>
              <button className="semantic-cta semantic-cta--primary tutorial-primary-target" onClick={() => {
                setTutorialFormationPreviewReady(false);
                setFormationEditMode(false);
                setTutorialLearningPhase("SKILL");
              }}>OK</button>
              </div>
            </div>}
          </section>
        </div>
      )}

      {/* 5. ボトムシートモーダル (画面見切れ100%防止 ＆ モーダル内インライン4列グリッド) */}
      {bottomModalTab !== null && (
        <div className="char-bottom-modal-backdrop" onClick={() => setBottomModalTab(null)}>
          <div className="char-bottom-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="char-modal-header">
              <div className="char-modal-title-tabs">
                <button
                  className={`char-modal-tab-btn ${bottomModalTab === "STATUS" ? "active" : ""}`}
                  onClick={() => { setBottomModalTab("STATUS"); playCyberSe("click"); }}
                >
                  強化
                </button>
                <button
                  className={`char-modal-tab-btn ${bottomModalTab === "SKILL" ? "active" : ""}`}
                  onClick={() => { setBottomModalTab("SKILL"); playCyberSe("click"); }}
                >
                  スキル
                </button>
                <button
                  className={`char-modal-tab-btn ${bottomModalTab === "GEAR" ? "active" : ""}`}
                  onClick={() => { setBottomModalTab("GEAR"); playCyberSe("click"); }}
                >
                  装備
                </button>
                <button
                  className={`char-modal-tab-btn ${bottomModalTab === "STYLE" ? "active" : ""}`}
                  onClick={() => { setBottomModalTab("STYLE"); playCyberSe("click"); }}
                >
                  演出
                </button>
              </div>

              <button
                className="char-modal-close-btn active-scale-effect"
                onClick={() => setBottomModalTab(null)}
              >
                閉じる ✕
              </button>
            </div>

            {/* モーダルコンテンツ: タブA 育成 */}
            {bottomModalTab === "STATUS" && (
              <div>
                <section className="char-growth-contract" aria-label="キャラクター強化">
                  <div className="char-growth-target">
                    <CharacterPresentation src={getCharacterTransparentImg(activeCharMaster.name)} alt={activeCharMaster.jpName} variant="thumbnail" />
                    <div><small>強化対象</small><strong>{activeCharMaster.jpName}</strong></div>
                  </div>
                  <div className="char-growth-comparison">
                    <div><small>現在のレベル</small><strong>Lv.{Number(activeCharRecord.level || 1)}</strong></div>
                    <i>→</i>
                    <div><small>強化後</small><strong>Lv.{Number(activeCharRecord.level || 1) + 1}</strong></div>
                    <div><small>現在の覚醒</small><strong>+{awakeningLevel}</strong></div>
                    <i>→</i>
                    <div><small>素材使用後</small><strong>+{awakeningAfter.awakeningLevel}<em>{awakeningAfter.awakeningProgress > 0 ? ` (${awakeningAfter.awakeningProgress}/${awakeningAfter.nextRequired})` : ""}</em></strong></div>
                  </div>
                </section>
                <div className="char-status-grid">
                  <div className="char-status-card">
                    <span className="char-status-label">HP</span>
                    <span className="char-status-val">{charStats.hp.toLocaleString()}</span>
                  </div>
                  <div className="char-status-card">
                    <span className="char-status-label">攻撃力 (ATK)</span>
                    <span className="char-status-val">{charStats.atk.toLocaleString()}</span>
                  </div>
                  <div className="char-status-card">
                    <span className="char-status-label">防御力 (DEF)</span>
                    <span className="char-status-val">{charStats.def.toLocaleString()}</span>
                  </div>
                  <div className="char-status-card">
                    <span className="char-status-label">素早さ (SPD)</span>
                    <span className="char-status-val">{charStats.spd.toLocaleString()}</span>
                  </div>
                  <div className="char-status-card">
                    <span className="char-status-label">運 (LUK)</span>
                    <span className="char-status-val">{charStats.luk.toLocaleString()}</span>
                  </div>
                </div>

                <div className="char-upgrade-actions">
                  <button
                    className="char-upgrade-btn semantic-cta semantic-cta--primary active-scale-effect"
                    disabled={upgradeLoading}
                    aria-busy={upgradeLoading}
                    onClick={() => {
                      if (activeCharRecord) void handleCharacterLevelUp("CHAR_EXP_S", 1);
                    }}
                  >
                    <span>{upgradeLoading ? "強化中…" : "レベルを強化"}</span>
                    <span className="char-upgrade-sub char-material-copy"><CanonicalItemIcon itemId="CHAR_EXP_S" alt="" className="char-material-art" />必要 強化ドリンク・小 ×1（所持 {Math.max(0, Number(charExpS) || 0)}）</span>
                  </button>
                  <button
                    className="char-upgrade-btn awaken active-scale-effect"
                    disabled={upgradeLoading || awakeningLevel >= 5 || Number(awakeningBooks || 0) < 1}
                    aria-busy={upgradeLoading}
                    onClick={() => {
                      if (activeCharRecord) void handleCharacterAwaken(activeCharRecord.id);
                      playCyberSe("click");
                    }}
                  >
                    <span>{upgradeLoading ? "覚醒中…" : "覚醒素材を使う"}</span>
                    <span className="char-upgrade-sub char-material-copy">
                      <CanonicalItemIcon itemId="AWAKENING_BOOK" alt="" className="char-material-art" />
                      {awakeningLevel >= 5
                        ? "覚醒 MAX"
                        : `必要 覚醒の書 ×1（所持 ${Number(awakeningBooks || 0)}）`}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {bottomModalTab === "STYLE" && (
              <div className="char-style-panel">
                <p className="char-style-help">このキャラだけに適用する見た目の装飾です。能力値・戦力には影響しません。</p>
                {[
                  ["CHARACTER_AURA", "オーラ", "char_aura_none"],
                  ["CHARACTER_FRAME", "ステージ枠", "char_frame_none"],
                  ["CHARACTER_NAMEPLATE", "ネームプレート", "char_plate_none"]
                ].map(([slot, label, fallback]) => {
                  const options = getCharacterCosmeticsForSlot(slot);
                  const value = getEquippedCharacterCosmetic(slot, fallback);
                  return (
                    <div className="char-style-field" key={slot}>
                      <ChoiceGroup
                        label={label}
                        value={value}
                        options={options.map((item) => ({
                          value: item.cosmetic_id,
                          label: item.cosmetic_master?.display_name || "未確認の装飾",
                        }))}
                        disabled={characterCosmeticLoading || options.length === 0}
                        onChange={(nextValue) => void equipCharacterCosmetic(slot, nextValue)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* モーダルコンテンツ: タブB スキルデッキ */}
            {bottomModalTab === "SKILL" && (
              <div>
                <p className="char-loadout-help">装備枠を選び、アイコンで詳細を確認してから「装備」で設定します。</p>
                <div className="char-skills-grid">
                  {Array.from({ length: 6 }).map((_, slotIdx) => {
                    const isUnlocked = slotIdx < maxSkillSlots;
                    const previewSkillRecord = equippedSkillsBySlot.get(slotIdx) || null;
                    const skillMaster = previewSkillRecord ? CANONICAL_SKILL_VIEW.find((m: any) => m.id === (previewSkillRecord.skill_card_id || previewSkillRecord.skill_id)) : null;
                    const skillRarity = (skillMaster?.rarity || "N").toLowerCase();
                    
                    const limitBreakPlus = previewSkillRecord?.plus_val || 0;

                    return (
                      <div
                        key={slotIdx}
                        className={`char-skill-card skill-rarity-${skillRarity} ${!isUnlocked ? "char-skill-locked" : ""} ${selectedSkillSlotIdx === slotIdx ? "is-selecting" : ""} active-scale-effect`}
                        onClick={() => {
                          if (isUnlocked) {
                            setSelectedSkillSlotIdx(slotIdx);
                            playCyberSe("click");
                          }
                        }}
                      >
                        {skillMaster && <img className="production-rarity-item-frame" src={getRarityFrameAsset("skill", skillMaster.rarity)} alt="" aria-hidden="true" />}
                        {isUnlocked ? (
                          previewSkillRecord && skillMaster ? (
                            <>
                              <SkillIcon skill={skillMaster} size="regular" onSelect={setSkillDetail} />
                              <div className="char-slot-summary"><span>枠 {slotIdx + 1}</span><b>+{limitBreakPlus}</b></div>
                            </>
                          ) : (
                            <div className="char-skill-empty-label">未装備<small>タップして選択</small></div>
                          )
                        ) : (
                          <div className="char-skill-lock-label">ロック</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* モーダル内部でインライン展開する 4列グリッドアイコンリスト */}
                {selectedSkillSlotIdx !== null && (
                  <div className="char-inline-selector">
                    <div className="char-inline-header">
                      <span className="char-inline-title">枠 {selectedSkillSlotIdx + 1} に装備するスキル</span>
                      <button
                        className="char-inline-close-btn active-scale-effect"
                        onClick={() => setSelectedSkillSlotIdx(null)}
                      >
                        閉じる
                      </button>
                    </div>
                    <p className="char-inline-help">アイコンで詳細を確認し、「装備」で選択中の枠へ設定します。</p>
                    <div className="char-inline-grid">
                      <div
                        className="char-tile-item active-scale-effect"
                        onClick={() => {
                          const activeDbUuid = activeCharRecord?.id;
                          const currSkill = activeDbUuid
                            ? (userSkillsList || []).find(
                                (s: any) => s.equipped_character_id === activeDbUuid && s.slot_index === selectedSkillSlotIdx
                              )
                            : null;
                          if (currSkill) handleUnequipSkill(currSkill.id);
                          setSelectedSkillSlotIdx(null);
                        }}
                      >
                        <span className="char-tile-remove-label">外す</span>
                      </div>
                      {(userSkillsList || [])
                        .filter((s: any) => !s.equipped_character_id || s.equipped_character_id === activeCharRecord?.id)
                        .map((sk: any) => {
                          const skillMasterId = sk.skill_card_id || sk.skill_id;
                          const mData = CANONICAL_SKILL_VIEW.find((m: any) => m.id === skillMasterId);
                          const display = skillDisplayById[skillMasterId];
                          return (
                            <div
                              key={sk.id}
                              className="char-tile-item active-scale-effect"
                            >
                              {mData && <img className="production-rarity-item-frame" src={getRarityFrameAsset("skill", display?.rarity || mData.rarity)} alt="" aria-hidden="true" />}
                              {mData ? <SkillIcon skill={mData} size="regular" onSelect={setSkillDetail} /> : <span className="char-tile-missing">未確認</span>}
                              <button type="button" className="char-tile-equip-action" disabled={upgradeLoading || !mData} onClick={() => { void handleEquipSkill(sk.id, selectedSkillSlotIdx); setSelectedSkillSlotIdx(null); }}>
                                {sk.equipped_character_id === activeCharRecord?.id && Number.isInteger(sk.slot_index) ? `枠${sk.slot_index + 1}に装備中` : "装備"}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                <div className="char-action-bar">
                  <button
                    className="char-action-btn recommend active-scale-effect"
                    disabled={upgradeLoading}
                    onClick={() => {
                      if (activeCharRecord) void handleEquipSkillBulkRecommended(activeCharRecord.id, activeCharMaster.id);
                      playCyberSe("click");
                    }}
                  >
                    {upgradeLoading ? "装備中..." : "推奨スキルを自動装備"}
                  </button>
                  <button
                    className="char-action-btn active-scale-effect"
                    disabled={upgradeLoading}
                    onClick={() => {
                      if (activeCharRecord) handleUnequipSkillBulk(activeCharRecord.id);
                      playCyberSe("click");
                    }}
                  >
                    一括解除
                  </button>
                </div>

                <section className="char-progression-panel" aria-label="スキル限界突破">
                  <div className="char-progression-heading">
                    <strong>スキル限界突破</strong>
                    <span>同名カード または 専用素材</span>
                  </div>
                  <div className="char-progression-candidates">
                    {(userSkillsList || []).map((skill: any) => {
                      const skillMasterId = skill.skill_card_id || skill.skill_id;
                      const master = CANONICAL_SKILL_VIEW.find((entry: any) => entry.id === skillMasterId);
                      return (
                        <button
                          key={skill.id}
                          className={selectedSkill?.id === skill.id ? "is-selected" : ""}
                          onClick={() => setSelectedSkill(skill)}
                          disabled={upgradeLoading}
                        >
                          {master && <img className="production-rarity-item-frame" src={getRarityFrameAsset("skill", master.rarity)} alt="" aria-hidden="true" />}
                          {master && <SkillIcon skill={master} />}
                          <span>{master?.name || "スキル情報を確認中"}</span>
                          <b>+{skill.plus_val || 0}</b>
                        </button>
                      );
                    })}
                  </div>
                  {selectedSkill && (() => {
                    const skillMasterId = selectedSkill.skill_card_id || selectedSkill.skill_id;
                    const master = CANONICAL_SKILL_VIEW.find((entry: any) => entry.id === skillMasterId);
                    const isExclusive = Boolean(master?.is_exclusive);
                    const wildcardCount = skillManuals;
                    const nextPlus = Math.min(10, (selectedSkill.plus_val || 0) + 1);
                    return (
                      <div className="char-progression-actions">
                        <span>次: +{nextPlus} / {(nextPlus * 1000).toLocaleString()} CASH</span>
                        <button onClick={() => void handleSkillUpgrade(false)} disabled={upgradeLoading || (selectedSkill.plus_val || 0) >= 10}>同名カード</button>
                        <button onClick={() => void handleSkillUpgrade(true)} disabled={upgradeLoading || wildcardCount < 1 || (selectedSkill.plus_val || 0) >= 10}>素材を使う ({wildcardCount})</button>
                      </div>
                    );
                  })()}
                </section>
              </div>
            )}

            {/* モーダルコンテンツ: タブC 装備詳細 */}
            {bottomModalTab === "GEAR" && (
              <div>
                {selectedEquipSlotIdx !== null ? (
                  <div className="char-inline-selector">
                    <div className="char-inline-header">
                      <span className="char-inline-title">
                        {GEAR_SLOTS_MASTER[selectedEquipSlotIdx]?.label || "装備"}選択
                      </span>
                      <button
                        className="char-inline-close-btn active-scale-effect"
                        onClick={() => setSelectedEquipSlotIdx(null)}
                      >
                        閉じる
                      </button>
                    </div>

                    <div className="char-inline-grid">
                      <div
                        className="char-tile-item active-scale-effect"
                        onClick={() => {
                          const activeDbUuid = activeCharRecord?.id;
                          const currGear = activeDbUuid
                            ? (userEquipmentsList || []).find(
                                (e: any) => e.equipped_character_id === activeDbUuid && e.slot_index === selectedEquipSlotIdx
                              )
                            : null;
                          if (currGear) handleUnequipGear(currGear.id);
                          setSelectedEquipSlotIdx(null);
                        }}
                      >
                        <span className="char-tile-remove-label">外す</span>
                      </div>
                      {(userEquipmentsList || [])
                        .filter((e: any) => !e.equipped_character_id || e.equipped_character_id === activeCharRecord?.id)
                        .filter((e: any) => {
                          const master = CANONICAL_EQUIPMENT_VIEW.find((item: any) => item.id === e.equipment_id);
                          return master?.slot_type === GEAR_SLOTS_MASTER[selectedEquipSlotIdx]?.type;
                        })
                        .map((eq: any) => {
                          const gearMaster = CANONICAL_EQUIPMENT_VIEW.find((m: any) => m.id === eq.equipment_id);
                          return (
                            <div
                              key={eq.id}
                              className="char-tile-item active-scale-effect"
                            >
                              {gearMaster && <img className="production-rarity-item-frame" src={getRarityFrameAsset("equipment", gearMaster.rarity)} alt="" aria-hidden="true" />}
                              <button type="button" className="char-tile-detail-action" disabled={!gearMaster} onClick={() => gearMaster && setEquipmentDetail({ master: gearMaster, record: eq })} aria-label={`${gearMaster?.name || "装備"}の詳細`}>
                                {gearMaster && <img className="production-equipment-art" src={gearMaster.assetPath} alt="" aria-hidden="true" />}
                              </button>
                              <button type="button" className="char-tile-equip-action" disabled={upgradeLoading || !gearMaster} onClick={() => { setActiveGearSlot(selectedEquipSlotIdx); handleEquipGear(eq.id, selectedEquipSlotIdx); setSelectedEquipSlotIdx(null); }}>
                                {eq.equipped_character_id ? "装備中" : "装備"}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="char-gear-placeholder-text">
                    左右の装備スロットをタップすると装備選択メニューが開きます。
                  </div>
                )}

                <div className="char-action-bar">
                  <button
                    className="char-action-btn recommend active-scale-effect"
                    onClick={() => {
                      if (activeCharRecord) handleEquipGearBulkRecommended(activeCharRecord.id);
                      playCyberSe("click");
                    }}
                  >
                    一括推奨装備
                  </button>
                  <button
                    className="char-action-btn active-scale-effect"
                    onClick={() => {
                      if (activeCharRecord) handleUnequipGearBulk(activeCharRecord.id);
                      playCyberSe("click");
                    }}
                  >
                    一括解除
                  </button>
                </div>

                <section className="char-progression-panel" aria-label="装備強化">
                  <div className="char-progression-heading">
                    <strong>装備強化・限界突破</strong>
                    <span>強化する装備を選択</span>
                  </div>
                  <div className="char-progression-candidates">
                    {(userEquipmentsList || []).map((equipment: any) => {
                      const master = CANONICAL_EQUIPMENT_VIEW.find((entry: any) => entry.id === equipment.equipment_id);
                      return (
                        <button
                          key={equipment.id}
                          className={selectedEquipment?.id === equipment.id ? "is-selected" : ""}
                          onClick={() => selectUpgradeEquipment(equipment)}
                          disabled={upgradeLoading}
                        >
                          {master && <img className="production-rarity-item-frame" src={getRarityFrameAsset("equipment", master.rarity)} alt="" aria-hidden="true" />}
                          {master && <img className="production-equipment-art" src={master.assetPath} alt="" aria-hidden="true" />}
                          <span>{master?.name || "未確認の装備"}</span>
                          <small>{master ? equipmentParameter(master) : "詳細未取得"}</small>
                          <b>Lv.{equipment.level || 1} / +{equipment.plus_val || 0}</b>
                        </button>
                      );
                    })}
                  </div>
                  {selectedEquipment && (
                    <div className="char-progression-actions">
                      <span className="char-material-copy"><CanonicalItemIcon itemId="EQUIP_EXP_S" alt="" className="char-material-art" />カスタムオイル・小 {equipExpS} / <CanonicalItemIcon itemId="EQUIP_LB_PART" alt="" className="char-material-art" />改造パーツ {equipLbParts}</span>
                      <button onClick={() => void handleEquipmentLevelUp("EQUIP_EXP_S", 1)} disabled={upgradeLoading || equipExpS < 1}>Lv +1</button>
                      <button onClick={() => void handleEquipmentLimitBreak(false)} disabled={upgradeLoading || (selectedEquipment.plus_val || 0) >= 10}>同名装備</button>
                      <button onClick={() => void handleEquipmentLimitBreak(true)} disabled={upgradeLoading || equipLbParts < 1 || (selectedEquipment.plus_val || 0) >= 10}>改造パーツ</button>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
      {skillDetail && <SkillDetailDialog skill={skillDetail} onClose={() => setSkillDetail(null)} />}
      {equipmentDetail && (
        <CanonicalDialog title="装備詳細" onClose={() => setEquipmentDetail(null)} actions={[{ label: "閉じる", semantic: "secondary", onClick: () => setEquipmentDetail(null) }]}>
          <div className="char-equipment-detail">
            <div className="char-equipment-detail-art">
              <img className="production-rarity-item-frame" src={getRarityFrameAsset("equipment", equipmentDetail.master.rarity)} alt="" aria-hidden="true" />
              <img className="production-equipment-art" src={equipmentDetail.master.assetPath} alt="" />
            </div>
            <div><strong>{equipmentDetail.master.name}</strong><small>Lv.{Number(equipmentDetail.record.level || 1)} / 限界突破 +{Number(equipmentDetail.record.plus_val || 0)}</small></div>
            <dl><div><dt>装備箇所</dt><dd>{GEAR_SLOTS_MASTER.find((slot: any) => slot.type === equipmentDetail.master.slot_type)?.label || "装備"}</dd></div><div><dt>パラメータ</dt><dd>{equipmentParameter(equipmentDetail.master)}</dd></div></dl>
          </div>
        </CanonicalDialog>
      )}
    </div>
  );
}

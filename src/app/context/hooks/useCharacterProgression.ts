"use client";

import { useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { CANONICAL_EQUIPMENT_VIEW } from "@/utils/equipments_master_data";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { useImmediateActionLock } from "@/hooks/useImmediateActionLock";
import { getCharacterTotalStats } from "@/utils/stats_calculator";
import { canonicalEquipmentFlatStat, canonicalSkillSlotCount } from "@/domain/gameplay/canonical/calculations";
import type { ConfirmDialogConfig } from "@/app/components/ui/ConfirmDialog";
import { beginActionPerformance } from "@/utils/actionPerformance";
import { CHARACTERS_MASTER } from "@/utils/game_constants";
import { runCompositeOperation } from "@/domain/async/runCompositeOperation";

const sumPower = (stats: { hp: number; atk: number; def: number; spd: number; luk: number }) =>
  stats.hp + stats.atk + stats.def;

type GrowthRequest = { itemId: string; count: number };
type AutoEquipTarget = { characterDbId: string; masterCharId: string };
type OwnedUpgradeOptions = { lockOwned?: boolean; refresh?: boolean };
type AutoEquipOptions = { mainFormation?: boolean };

export function useCharacterProgression(
  session: any,
  cash: number,
  setCash: React.Dispatch<React.SetStateAction<number>>,
  charExpS: number,
  charExpM: number,
  charExpL: number,
  equipExpS: number,
  equipExpM: number,
  equipExpL: number,
  equipLbParts: number,
  skillManuals: number,
  upgradeSelectedCharId: string,
  setErrorMessage: (msg: string | null) => void,
  playCyberSe: (type: string) => void,
  syncBootstrapData: (userId: string) => Promise<void>,
  setConfirmDialogConfig: React.Dispatch<React.SetStateAction<import("@/app/components/ui/ConfirmDialog").ConfirmDialogConfig | null>>
) {
  const [characterLevel, setCharacterLevel] = useState<number>(1);
  const [characterAwaken, setCharacterAwaken] = useState<number>(0);
  const [userCharactersDbList, setUserCharactersDbList] = useState<any[]>([]);

  const [userEquipmentsList, setUserEquipmentsList] = useState<any[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<any | null>(null);
  const [equipmentLevel, setEquipmentLevel] = useState<number>(1);
  const [equipmentLimitBreak, setEquipmentLimitBreak] = useState<number>(0);
  const [subOptions, setSubOptions] = useState<any[]>([
    { name: "クリティカル率", val: "+5%", unlocked: true },
    { name: "命中率", val: "+8%", unlocked: false },
    { name: "回避率", val: "+6%", unlocked: false },
    { name: "防御貫通力", val: "+12%", unlocked: false }
  ]);

  const [userSkillsList, setUserSkillsList] = useState<any[]>([]);
  const [activeGearSlot, setActiveGearSlot] = useState<number | null>(null);
  const [showGearModal, setShowGearModal] = useState<boolean>(false);
  const [activeSkillSlot, setActiveSkillSlot] = useState<number | null>(null);
  const [showSkillModal, setShowSkillModal] = useState<boolean>(false);

  const [skillLimitBreakMaster, setSkillLimitBreakMaster] = useState<any[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<any | null>(null);
  const [equipmentLevelUpMaster, setEquipmentLevelUpMaster] = useState<any[]>([]);
  const [equipmentLimitBreakMaster, setEquipmentLimitBreakMaster] = useState<any[]>([]);

  const [upgradeSubTab, setUpgradeSubTab] = useState<string>("character");
  const {
    isLocked: upgradeLoading,
    beginAction: beginUpgradeAction,
    endAction: endUpgradeAction,
    endActionAfterPaint: endUpgradeActionAfterPaint,
  } = useImmediateActionLock();
  const setUpgradeLoading = (loading: boolean) => {
    if (loading) beginUpgradeAction();
    else endUpgradeAction();
  };

  const growthRequestIds = useRef(new Map<string, string>());

  const executeExpGrowth = async (
    kind: "CHARACTER" | "EQUIPMENT",
    requested: GrowthRequest[],
    deferResult?: (config: ConfirmDialogConfig) => void
  ) => {
    const incomplete = { complete: false, completedItemIds: [] as string[] };
    const owned = kind === "CHARACTER"
      ? userCharactersDbList.find((entry) => entry.character_id === upgradeSelectedCharId)
      : selectedEquipment;
    if (!session?.user?.id || !owned) return incomplete;
    const materials: Record<string, number> = {};
    const allowed = kind === "CHARACTER"
      ? ["CHAR_EXP_S", "CHAR_EXP_M", "CHAR_EXP_L"]
      : ["EQUIP_EXP_S", "EQUIP_EXP_M", "EQUIP_EXP_L"];
    for (const entry of requested) {
      if (!allowed.includes(entry.itemId) || !Number.isSafeInteger(entry.count) || entry.count < 0) {
        setErrorMessage("強化素材の指定が正しくありません。");
        return incomplete;
      }
      if (entry.count > 0) materials[entry.itemId] = (materials[entry.itemId] || 0) + entry.count;
    }
    if (Object.values(materials).some((count) => !Number.isSafeInteger(count))) {
      setErrorMessage("強化素材の指定が正しくありません。");
      return incomplete;
    }
    // Keep the same request ID after an uncertain response, including reload.
    // Empty materials are valid: stored EXP can level up after a cap is raised.
    const orderedMaterials = Object.fromEntries(Object.entries(materials).sort(([a], [b]) => a.localeCompare(b)));
    const requestKey = "tn:exp-growth:" + JSON.stringify([session.user.id, kind, owned.id, orderedMaterials]);
    let requestId = growthRequestIds.current.get(requestKey);
    if (!requestId) {
      try {
        const stored = window.sessionStorage.getItem(requestKey);
        if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) requestId = stored;
      } catch { /* In-memory retry remains available if browser storage is disabled. */ }
    }
    if (!requestId) requestId = crypto.randomUUID();
    if (!beginUpgradeAction()) return incomplete;
    growthRequestIds.current.set(requestKey, requestId);
    try { window.sessionStorage.setItem(requestKey, requestId); } catch { /* optional persistence */ }
    const previousLevel = Number(owned.level || 1);
    const previousXp = Number(owned.xp || 0);
    const actionPerformance = beginActionPerformance("growth");
    playCyberSe("GROWTH_START");
    try {
      actionPerformance.mark("request_start");
      const res = await supabase.rpc(
        kind === "CHARACTER" ? "level_up_character_exp" : "level_up_equipment_exp",
        {
          ...(kind === "CHARACTER" ? { p_character_id: owned.id } : { p_equipment_id: owned.id }),
          p_materials: orderedMaterials,
          p_request_id: requestId,
        }
      );
      if (res.error || res.data?.error) {
        setErrorMessage(res.error?.message || res.data?.error || "強化に失敗しました。");
        return incomplete;
      }
      const receipt = res.data;
      if (!receipt || receipt.status !== "success" || !Number.isInteger(receipt.level) || receipt.level < 1 || receipt.level > 100 ||
          !Number.isSafeInteger(receipt.xp) || receipt.xp < 0 ||
          !Number.isSafeInteger(receipt.remaining_cash) || receipt.remaining_cash < 0 ||
          !Number.isSafeInteger(receipt.gained_exp) || receipt.gained_exp < 0 ||
          !Number.isSafeInteger(receipt.cash_spent) || receipt.cash_spent < 0) {
        // Do not invent a level or issue a new request after an ambiguous response.
        setErrorMessage("強化結果を確認できませんでした。同じ素材で再試行してください。");
        return incomplete;
      }
      actionPerformance.mark("response");
      growthRequestIds.current.delete(requestKey);
      try { window.sessionStorage.removeItem(requestKey); } catch { /* optional persistence */ }
      const newLevel = receipt.level;
      const newXp = receipt.xp;
      const beforeLevel = Number.isInteger(receipt.current_level) ? receipt.current_level : previousLevel;
      const beforeXp = Number.isSafeInteger(receipt.current_xp) ? receipt.current_xp : previousXp;
      const userId = session.user.id;
      setCash(receipt.remaining_cash);
      if (kind === "CHARACTER") {
        setUserCharactersDbList((current) => current.map((entry) => entry.id === owned.id ? { ...entry, level: newLevel, xp: newXp } : entry));
        setCharacterLevel(newLevel);
      } else {
        setUserEquipmentsList((current) => current.map((entry) => entry.id === owned.id ? { ...entry, level: newLevel, xp: newXp } : entry));
        setSelectedEquipment((current: any) => current?.id === owned.id ? { ...current, level: newLevel, xp: newXp } : current);
        setEquipmentLevel(newLevel);
      }
      actionPerformance.mark("state_update");
      actionPerformance.markVisualReady();
      // A refresh failure does not turn an already committed award into a failed action.
      try { await syncBootstrapData(userId); }
      catch (error) { console.warn("Growth projection refresh failed:", error); }
      const name = kind === "CHARACTER"
        ? CHARACTERS_MASTER.find((entry) => entry.id === owned.character_id)?.jpName || "キャラクター"
        : CANONICAL_EQUIPMENT_VIEW.find((entry) => entry.id === owned.equipment_id)?.name || "装備";
      const equipmentMaster = kind === "EQUIPMENT"
        ? CANONICAL_EQUIPMENT_VIEW.find((entry) => entry.id === owned.equipment_id) : undefined;
      const powerAt = (level: number) => kind === "CHARACTER"
        ? sumPower(getCharacterTotalStats({ ...owned, level }, userEquipmentsList))
        : equipmentMaster ? [equipmentMaster.hp, equipmentMaster.atk, equipmentMaster.def]
          .reduce((sum, flat) => sum + canonicalEquipmentFlatStat(Number(flat || 0), level, Number(owned.plus_val || 0)), 0) : 0;
      const powerBefore = powerAt(beforeLevel);
      const powerAfter = powerAt(newLevel);
      if (newLevel > beforeLevel) playCyberSe("LEVEL_UP");
      const config: ConfirmDialogConfig = {
        isOpen: true,
        title: "強化結果",
        message: `${name} Lv.${beforeLevel} → Lv.${newLevel}\nEXP ${beforeXp.toLocaleString()} → ${newXp.toLocaleString()}\n獲得EXP ${Number(receipt.gained_exp || 0).toLocaleString()} / 消費CASH ${Number(receipt.cash_spent || 0).toLocaleString()}\n総合力 ${powerBefore.toLocaleString()} → ${powerAfter.toLocaleString()}`,
        confirmText: "OK",
        cancelText: "",
        presentation: "canonical",
        onConfirm: () => setConfirmDialogConfig(null),
        onCancel: () => setConfirmDialogConfig(null),
      };
      if (deferResult) deferResult(config);
      else setConfirmDialogConfig(config);
      return { complete: true, completedItemIds: Object.keys(materials) };
    } catch (error) {
      console.warn("EXP growth request failed:", error);
      setErrorMessage("強化結果を確認できませんでした。同じ素材で再試行してください。");
      return incomplete;
    } finally {
      endUpgradeActionAfterPaint();
    }
  };

  const handleCharacterLevelUp = async (
    expItemId: string = "CHAR_EXP_S",
    count: number = 1,
    deferResult?: (config: ConfirmDialogConfig) => void
  ) => (await executeExpGrowth("CHARACTER", [{ itemId: expItemId, count }], deferResult)).complete;

  const handleCharacterGrowthBatch = (requested: GrowthRequest[]) =>
    executeExpGrowth("CHARACTER", requested);

  const handleCharacterAwaken = async () => {
    if (!session || characterAwaken >= 5) return;
    if (!beginUpgradeAction()) return;
    playCyberSe("click");
    try {
      const character = userCharactersDbList.find((entry) => entry.character_id === upgradeSelectedCharId);
      if (!character) {
        setErrorMessage("覚醒対象のキャラクターが見つかりません。");
        return;
      }
      const res = await supabase.rpc("awaken_character", { p_character_id: character.id });

      if (res.error) {
        setErrorMessage(res.error.message || "覚醒に失敗しました。");
        return;
      }
      if (res.data?.error) {
        setErrorMessage(res.data.error);
        return;
      }
      const level = Number(res.data?.awakening_level ?? character.awakening_level ?? 0);
      const progress = Number(res.data?.awakening_progress ?? character.awakening_progress ?? 0);
      const required = Number(res.data?.awakening_required ?? 0);
      setConfirmDialogConfig({
        isOpen: true,
        title: "覚醒進捗",
        message: res.data?.outcome === "awakening"
          ? `覚醒 +${level} になりました。次の進捗 ${progress}/${required}`
          : `覚醒進捗が ${progress}/${required} になりました。`,
        confirmText: "OK",
        cancelText: "",
        presentation: "canonical",
        onConfirm: () => setConfirmDialogConfig(null),
        onCancel: () => setConfirmDialogConfig(null),
      });
      await syncBootstrapData(session.user.id);
    } catch (err) {
      console.warn(err);
    } finally {
      endUpgradeAction();
    }
  };

  const handleEquipGear = async (gearId: string, slotOverride?: number) => {
    const slotIndex = slotOverride ?? activeGearSlot;
    if (!session || slotIndex === null) return;
    const activeChar = userCharactersDbList.find(c => c.character_id === upgradeSelectedCharId);
    if (!activeChar) {
      setErrorMessage("装着先のキャラクターが見つかりません。");
      return;
    }
    if (!beginUpgradeAction()) return;
    playCyberSe("click");

    try {
      const { error } = await supabase.rpc("set_character_equipment", {
        p_character_id: activeChar.id,
        p_equipment_id: gearId,
        p_slot_index: slotIndex,
      });
      if (error) {
        setErrorMessage(error.message || "装備の変更に失敗しました。");
        return;
      }

      setShowGearModal(false);
      setActiveGearSlot(null);
      await syncBootstrapData(session.user.id);
      const equipped = userEquipmentsList.find((item: any) => item.id === gearId);
      const equippedName = CANONICAL_EQUIPMENT_VIEW.find((item: any) => item.id === equipped?.equipment_id)?.name || "装備品";
      setConfirmDialogConfig({
        isOpen: true, title: "装備変更結果",
        message: `${equippedName}をスロット${slotIndex + 1}へ装備しました。編成戦力へ反映されます。`,
        confirmText: "OK", cancelText: "", presentation: "canonical",
        onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null)
      });
    } catch (err) {
      console.warn(err);
    } finally {
      endUpgradeAction();
    }
  };

  const handleUnequipGear = async (gearId: string) => {
    if (!session) return;
    if (!beginUpgradeAction()) return;
    playCyberSe("click");
    try {
      const { error } = await supabase.rpc("unequip_character_equipment", { p_equipment_id: gearId });
      if (error) {
        setErrorMessage(error.message || "装備を外せませんでした。");
        return;
      }
      await syncBootstrapData(session.user.id);
    } catch (err) {
      console.warn(err);
    } finally {
      endUpgradeAction();
    }
  };

  const handleEquipSkill = async (skillCardUuid: string, slotOverride?: number) => {
    const slotIndex = slotOverride ?? activeSkillSlot;
    if (!session || slotIndex === null) return;
    const activeChar = userCharactersDbList.find(c => c.character_id === upgradeSelectedCharId);
    if (!activeChar) {
      setErrorMessage("装備先のキャラクターが見つかりません。");
      return;
    }
    if (!beginUpgradeAction()) return;
    playCyberSe("click");

    try {
      const { error } = await supabase.rpc("set_character_skill", {
        p_character_id: activeChar.id,
        p_skill_id: skillCardUuid,
        p_slot_index: slotIndex
      });
      if (error) {
        setErrorMessage(error.message || "スキルの装備に失敗しました。");
        return;
      }

      setShowSkillModal(false);
      setActiveSkillSlot(null);
      await syncBootstrapData(session.user.id);
      const equipped = userSkillsList.find((item: any) => item.id === skillCardUuid);
      const equippedName = CANONICAL_SKILL_VIEW.find((item: any) => item.id === equipped?.skill_card_id)?.name || "スキル";
      setConfirmDialogConfig({
        isOpen: true, title: "スキル変更結果",
        message: `${equippedName}をスロット${slotIndex + 1}へ装備しました。次回バトルから効果が反映されます。`,
        confirmText: "OK", cancelText: "", presentation: "canonical",
        onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null)
      });
    } catch (err) {
      console.warn(err);
    } finally {
      endUpgradeAction();
    }
  };

  const handleUnequipSkill = async (skillCardUuid: string) => {
    if (!session) return;
    if (!beginUpgradeAction()) return;
    playCyberSe("click");
    try {
      const { error } = await supabase.rpc("unequip_character_skill", { p_skill_id: skillCardUuid });
      if (error) {
        setErrorMessage(error.message || "スキルの解除に失敗しました。");
        return;
      }
      setSelectedSkill((prev: any) => {
        if (prev && prev.id === skillCardUuid) {
          return { ...prev, equipped_character_id: null, slot_index: null };
        }
        return prev;
      });
      await syncBootstrapData(session.user.id);
    } catch (err) {
      console.warn(err);
    } finally {
      endUpgradeAction();
    }
  };

  const handleUnequipGearBulk = async (characterDbId: string) => {
    if (!session || !characterDbId) return;
    if (!beginUpgradeAction()) return;
    playCyberSe("click");
    try {
      const { error } = await supabase.rpc("unequip_character_equipment_bulk", {
        p_character_id: characterDbId,
      });
      if (error) setErrorMessage(error.message || "装備の一括解除に失敗しました。");
      await syncBootstrapData(session.user.id);
    } catch (err) {
      console.warn("Failed unequip_gear_bulk:", err);
    } finally {
      endUpgradeAction();
    }
  };

  const handleEquipGearBulkRecommended = async (characterDbId: string, masterCharId: string, options: OwnedUpgradeOptions = {}) => {
    if (!session || !characterDbId) return;
    const ownsLock = !options.lockOwned;
    if (ownsLock && !beginUpgradeAction()) return false;
    playCyberSe("click");
    try {
      const availableGears = userEquipmentsList.filter((e: any) => {
        if (e.equipped_character_id && e.equipped_character_id !== characterDbId) return false;
        const master = CANONICAL_EQUIPMENT_VIEW.find((m: any) => m.id === e.equipment_id);
        if (!master) return false;
        if (master.is_exclusive && master.exclusive_character_id && master.exclusive_character_id !== masterCharId) return false;
        return true;
      });

      const slotTypes: ("WEAPON" | "HEAD" | "BODY" | "LEGS" | "ACCESSORY")[] = ["WEAPON", "HEAD", "BODY", "LEGS", "ACCESSORY"];
      const slotIndexesMap: { [key: string]: number[] } = {
        WEAPON: [0, 1],
        HEAD: [2],
        BODY: [3],
        LEGS: [4],
        ACCESSORY: [5, 6]
      };

      const selectedGearUuids: string[] = [];
      const selectedSlotIndexes: number[] = [];

      for (const st of slotTypes) {
        const slots = slotIndexesMap[st];
        const candidates = availableGears.filter((e: any) => {
          const m = CANONICAL_EQUIPMENT_VIEW.find((m: any) => m.id === e.equipment_id);
          return m?.slot_type === st;
        }).sort((a: any, b: any) => {
          const mA = CANONICAL_EQUIPMENT_VIEW.find((m: any) => m.id === a.equipment_id);
          const mB = CANONICAL_EQUIPMENT_VIEW.find((m: any) => m.id === b.equipment_id);
          const exclusiveA = mA?.exclusive_character_id === masterCharId ? 1 : 0;
          const exclusiveB = mB?.exclusive_character_id === masterCharId ? 1 : 0;
          if (exclusiveB !== exclusiveA) return exclusiveB - exclusiveA;
          const statA = ["hp", "atk", "def"].reduce((sum, key) => sum + canonicalEquipmentFlatStat(Number((mA as any)?.[key] || 0), Number(a.level || 1), Number(a.plus_val || 0)), 0);
          const statB = ["hp", "atk", "def"].reduce((sum, key) => sum + canonicalEquipmentFlatStat(Number((mB as any)?.[key] || 0), Number(b.level || 1), Number(b.plus_val || 0)), 0);
          if (statB !== statA) return statB - statA;
          const levelDiff = Number(b.level || 1) - Number(a.level || 1);
          if (levelDiff !== 0) return levelDiff;
          const lbDiff = Number(b.plus_val || 0) - Number(a.plus_val || 0);
          if (lbDiff !== 0) return lbDiff;
          const rarityScore: any = { SSR: 4, SR: 3, R: 2, N: 1 };
          const rDiff = (rarityScore[mB?.rarity || "N"] || 0) - (rarityScore[mA?.rarity || "N"] || 0);
          if (rDiff !== 0) return rDiff;
          return String(mA?.id || "").localeCompare(String(mB?.id || "")) || String(a.id).localeCompare(String(b.id));
        });

        for (let i = 0; i < slots.length; i++) {
          const item = candidates[i];
          if (item) {
            selectedGearUuids.push(item.id);
            selectedSlotIndexes.push(slots[i]);
          }
        }
      }

      if (selectedGearUuids.length > 0) {
        const { error } = await supabase.rpc("set_character_equipment_bulk", {
          p_character_id: characterDbId,
          p_equipment_ids: selectedGearUuids,
          p_slot_indexes: selectedSlotIndexes,
        });
        if (error) {
          setErrorMessage(error.message || "おすすめ装備の適用に失敗しました。");
          return false;
        }
        if (options.refresh !== false) await syncBootstrapData(session.user.id);
        return true;
      }
      setErrorMessage("装備できる所持装備がありません。");
      return false;
    } catch (err) {
      console.warn("Failed equip_gear_bulk:", err);
      setErrorMessage("おすすめ装備の適用に失敗しました。");
      return false;
    } finally {
      if (ownsLock) endUpgradeAction();
    }
  };

  const handleUnequipSkillBulk = async (characterDbId: string) => {
    if (!session || !characterDbId) return;
    if (!beginUpgradeAction()) return;
    playCyberSe("click");
    try {
      const { error } = await supabase.rpc("set_character_skill_loadout", {
        p_character_id: characterDbId,
        p_skill_ids: [],
        p_slot_indexes: []
      });
      if (error) {
        setErrorMessage(error.message || "スキルの一括解除に失敗しました。");
        return;
      }
      await syncBootstrapData(session.user.id);
    } catch (err) {
      console.warn("Failed unequip_skill_bulk:", err);
    } finally {
      endUpgradeAction();
    }
  };

  const handleEquipSkillBulkRecommended = async (characterDbId: string, masterCharId?: string, options: OwnedUpgradeOptions = {}) => {
    if (!session || !characterDbId) return;
    const targetCharacter = userCharactersDbList.find((character: any) => character.id === characterDbId);
    const resolvedMasterCharId = masterCharId || targetCharacter?.character_id;
    if (!resolvedMasterCharId) {
      setErrorMessage("装備先のキャラクターが見つかりません。");
      return false;
    }
    const ownsLock = !options.lockOwned;
    if (ownsLock && !beginUpgradeAction()) return false;
    playCyberSe("click");
    try {
      const availableSkills = userSkillsList.filter((s: any) => {
        if (s.equipped_character_id && s.equipped_character_id !== characterDbId) return false;
        const master = CANONICAL_SKILL_VIEW.find((m: any) => m.id === s.skill_card_id);
        if (!master) return false;
        const skillNumber = Number(s.skill_card_id?.match(/\d+$/)?.[0]);
        if (!Number.isInteger(skillNumber) || skillNumber < 1 || skillNumber > 50) return false;
        if (master.is_exclusive && master.exclusive_character_id && master.exclusive_character_id !== resolvedMasterCharId) return false;
        return true;
      }).sort((a: any, b: any) => {
        const mA = CANONICAL_SKILL_VIEW.find((m: any) => m.id === a.skill_card_id);
        const mB = CANONICAL_SKILL_VIEW.find((m: any) => m.id === b.skill_card_id);
        const isSynergyA = mA?.exclusive_character_id === resolvedMasterCharId ? 1 : 0;
        const isSynergyB = mB?.exclusive_character_id === resolvedMasterCharId ? 1 : 0;
        if (isSynergyB !== isSynergyA) return isSynergyB - isSynergyA;
        const lbDiff = (b.plus_val || 0) - (a.plus_val || 0);
        if (lbDiff !== 0) return lbDiff;
        const rarityScore: any = { SSR: 4, SR: 3, R: 2, N: 1 };
        const rarityDiff = (rarityScore[mB?.rarity || "N"] || 0) - (rarityScore[mA?.rarity || "N"] || 0);
        if (rarityDiff !== 0) return rarityDiff;
        return String(mA?.id || "").localeCompare(String(mB?.id || "")) || String(a.id).localeCompare(String(b.id));
      });

      const selectedSkillUuids: string[] = [];
      const selectedSlotIndexes: number[] = [];

      const maxSlots = canonicalSkillSlotCount(Math.max(0, Math.min(5, targetCharacter?.awakening_level || 0)));
      for (let i = 0; i < Math.min(availableSkills.length, maxSlots); i++) {
        selectedSkillUuids.push(availableSkills[i].id);
        selectedSlotIndexes.push(i);
      }

      if (selectedSkillUuids.length > 0) {
        const { error } = await supabase.rpc("set_character_skill_loadout", {
          p_character_id: characterDbId,
          p_skill_ids: selectedSkillUuids,
          p_slot_indexes: selectedSlotIndexes
        });
        if (error) {
          setErrorMessage(error.message || "推奨スキルの一括装備に失敗しました。");
          return false;
        }
        if (options.refresh !== false) await syncBootstrapData(session.user.id);
        return true;
      } else {
        setErrorMessage("装備できるOpen Beta対応スキルがありません。");
        return false;
      }
    } catch (err) {
      console.warn("Failed equip_skill_bulk:", err);
      setErrorMessage("推奨スキルの一括装備に失敗しました。");
      return false;
    } finally {
      if (ownsLock) endUpgradeAction();
    }
  };

  const handleAutoEquipComposite = async (targets: AutoEquipTarget[], options: AutoEquipOptions = {}) => {
    if (!session || targets.length === 0 || !beginUpgradeAction()) return { complete: false, completedTargetIds: [] as string[] };
    const completedTargetIds: string[] = [];
    playCyberSe("click");
    try {
      if (options.mainFormation) {
        const { data, error } = await supabase.rpc("apply_recommended_main_loadout");
        if (error || data?.status !== "success") {
          setErrorMessage(error?.message || "メイン編成のおまかせ装備を完了できませんでした。");
          return { complete: false, completedTargetIds };
        }
        await syncBootstrapData(session.user.id);
        const characters = Array.isArray(data.characters) ? data.characters : [];
        completedTargetIds.push(...characters.map((entry: any) => String(entry.userCharacterId)).filter(Boolean));
        const resultLines = characters.map((entry: any) => `${entry.skillCount}スキル／${entry.equipmentCount}装備`);
        setConfirmDialogConfig({
          isOpen: true,
          title: "おまかせ装備",
          message: `メイン編成5人へスキル${Number(data.skillCount || 0)}件・装備${Number(data.equipmentCount || 0)}件を配分しました。${resultLines.length ? `\n各メンバー: ${resultLines.join("、")}` : ""}`,
          confirmText: "OK", cancelText: "", presentation: "canonical",
          onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null),
        });
        return { complete: true, completedTargetIds };
      }
      const operation = await runCompositeOperation(targets, async (target) => {
        const skillsApplied = await handleEquipSkillBulkRecommended(target.characterDbId, target.masterCharId, { lockOwned: true, refresh: false });
        if (!skillsApplied) return false;
        const gearApplied = await handleEquipGearBulkRecommended(target.characterDbId, target.masterCharId, { lockOwned: true, refresh: false });
        if (!gearApplied) return false;
        completedTargetIds.push(target.characterDbId);
        return true;
      });
      await syncBootstrapData(session.user.id);
      const complete = operation.complete;
      if (complete) {
        setConfirmDialogConfig({ isOpen: true, title: "おまかせ装備", message: "スキルと装備を適用しました。", confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      }
      return { complete, completedTargetIds };
    } catch (error) {
      console.warn("Failed composite auto equip:", error);
      setErrorMessage("おまかせ装備を完了できませんでした。");
      return { complete: false, completedTargetIds };
    } finally {
      endUpgradeActionAfterPaint();
    }
  };

  const handleSellGearBulk = async (equipmentUuids: string[]) => {
    if (!session || !equipmentUuids || equipmentUuids.length === 0) return;
    if (!beginUpgradeAction()) return;
    playCyberSe("gacha");
    try {
      const { error } = await supabase.rpc("sell_owned_equipment", {
        p_equipment_ids: equipmentUuids
      });
      if (error) {
        setErrorMessage(error.message);
      } else {
        await syncBootstrapData(session.user.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "売却処理に失敗しました。");
    } finally {
      endUpgradeAction();
    }
  };

  const handleEquipmentLevelUp = async (expItemId: string = "EQUIP_EXP_S", count: number = 1) =>
    (await executeExpGrowth("EQUIPMENT", [{ itemId: expItemId, count }])).complete;

  const handleEquipmentGrowthBatch = (requested: GrowthRequest[]) =>
    executeExpGrowth("EQUIPMENT", requested);

  const handleEquipmentLimitBreak = async (useWildcard: boolean = false) => {
    if (!session || !selectedEquipment) return;
    if (equipmentLimitBreak >= 10) return;

    const cost = (equipmentLimitBreak + 1) * 1000;
    if (cash < cost) {
      setErrorMessage("キャッシュ不足です。");
      return;
    }

    if (useWildcard) {
      if (equipLbParts < 1) {
        setErrorMessage("代用素材「万能カスタムツール [装備]」が不足しています。");
        return;
      }
    } else {
      const dupes = userEquipmentsList.filter(e => e.id !== selectedEquipment.id && e.equipment_id === selectedEquipment.equipment_id && e.equipped_character_id === null);
      if (dupes.length < 1) {
        setErrorMessage("同名の予備装備品が見つかりません。「万能カスタムツール [装備]」を代用してください。");
        return;
      }
    }

    if (!beginUpgradeAction()) return;
    playCyberSe("gacha");
    const nextLb = equipmentLimitBreak + 1;
    try {
      let targetDupeId = null;
      if (!useWildcard) {
        const dupes = userEquipmentsList.filter(e => e.id !== selectedEquipment.id && e.equipment_id === selectedEquipment.equipment_id && e.equipped_character_id === null);
        targetDupeId = dupes[0]?.id;
      }

      const res = await supabase.rpc("limit_break_equipment", {
        p_equipment_id: selectedEquipment.id,
        p_use_wildcard: useWildcard,
        p_dupe_id: targetDupeId
      });

      if (res.error) {
        setErrorMessage(res.error.message || "限界突破処理に失敗しました。");
        return;
      }
      if (res.data?.error) {
        setErrorMessage(res.data.error);
        return;
      }

      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "限界突破", message: `限界突破が+${nextLb}になりました。`, confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (err: any) {
      console.warn(err.message);
    } finally {
      endUpgradeAction();
    }
  };

  const handleSkillUpgrade = async (useWildcard: boolean = false) => {
    if (!session || !selectedSkill) return;
    if (selectedSkill.plus_val >= 10) {
      setErrorMessage("これ以上限界突破できません。");
      return;
    }

    const skillMaster = CANONICAL_SKILL_VIEW.find(s => s.id === selectedSkill.skill_card_id);
    if (!skillMaster) return;

    const isExclusive = !!skillMaster.is_exclusive;
    const required_cash = (selectedSkill.plus_val + 1) * 1000;

    if (cash < required_cash) {
      setErrorMessage("キャッシュ不足です。");
      return;
    }

    if (useWildcard) {
      const wildcardQty = skillManuals;
      if (wildcardQty < 1) {
        setErrorMessage(`代用素材「${isExclusive ? "限界突破の書 [専用スキル]" : "限界突破の書 [スキル]"}」が不足しています。`);
        return;
      }
    } else {
      const dupes = userSkillsList.filter(s => s.id !== selectedSkill.id && s.skill_card_id === selectedSkill.skill_card_id && s.equipped_character_id === null);
      if (dupes.length < 1) {
        setErrorMessage(`同名の予備スキルカードが見つかりません。「${isExclusive ? "限界突破の書 [専用スキル]" : "限界突破の書 [スキル]"}」を代用してください。`);
        return;
      }
    }

    if (!beginUpgradeAction()) return;
    playCyberSe("click");

    try {
      let targetDupeId = null;
      if (!useWildcard) {
        const dupes = userSkillsList.filter(s => s.id !== selectedSkill.id && s.skill_card_id === selectedSkill.skill_card_id && s.equipped_character_id === null);
        targetDupeId = dupes[0]?.id;
      }

      const res = await supabase.rpc("limit_break_skill", {
        p_skill_id: selectedSkill.id,
        p_use_wildcard: useWildcard,
        p_dupe_id: targetDupeId
      });

      if (res.error) {
        setErrorMessage(res.error.message || "限界突破処理に失敗しました。");
        return;
      }
      if (res.data?.error) {
        setErrorMessage(res.data.error);
        return;
      }

      const nextLb = selectedSkill.plus_val + 1;
      await syncBootstrapData(session.user.id);
      setSelectedSkill((prev: any) => prev ? { ...prev, plus_val: nextLb } : null);
      setConfirmDialogConfig({ isOpen: true, title: "限界突破", message: `スキルカードの限界突破が+${nextLb}になりました。`, confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (err: any) {
      console.warn(err.message);
    } finally {
      endUpgradeAction();
    }
  };

  return {
    characterLevel, setCharacterLevel,
    characterAwaken, setCharacterAwaken,
    userCharactersDbList, setUserCharactersDbList,
    userEquipmentsList, setUserEquipmentsList,
    selectedEquipment, setSelectedEquipment,
    equipmentLevel, setEquipmentLevel,
    equipmentLimitBreak, setEquipmentLimitBreak,
    subOptions, setSubOptions,
    userSkillsList, setUserSkillsList,
    activeGearSlot, setActiveGearSlot,
    showGearModal, setShowGearModal,
    activeSkillSlot, setActiveSkillSlot,
    showSkillModal, setShowSkillModal,
    skillLimitBreakMaster, setSkillLimitBreakMaster,
    selectedSkill, setSelectedSkill,
    equipmentLevelUpMaster, setEquipmentLevelUpMaster,
    equipmentLimitBreakMaster, setEquipmentLimitBreakMaster,
    upgradeSubTab, setUpgradeSubTab,
    upgradeLoading, setUpgradeLoading,
    handleCharacterLevelUp,
    handleCharacterGrowthBatch,
    handleCharacterAwaken,
    handleEquipGear,
    handleUnequipGear,
    handleEquipSkill,
    handleUnequipSkill,
    handleUnequipGearBulk,
    handleEquipGearBulkRecommended,
    handleUnequipSkillBulk,
    handleEquipSkillBulkRecommended,
    handleAutoEquipComposite,
    handleSellGearBulk,
    handleEquipmentLevelUp,
    handleEquipmentGrowthBatch,
    handleEquipmentLimitBreak,
    handleSkillUpgrade
  };
}

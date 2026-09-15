"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { VITALITY_OVERFLOW_MAX } from "@/utils/game_constants";
import { canUseEnergyDrink } from "@/domain/gameplay/canonical/action_resources";
import { useImmediateActionLock } from "@/hooks/useImmediateActionLock";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { canonicalMissionRewardName } from "@/domain/gameplay/canonical/missions";
import { canClaimMission, reconcileMissionClaim } from "@/domain/mission/availability";
import { beginActionPerformance } from "@/utils/actionPerformance";
import { buildInventoryQuantityProjection } from "@/domain/gameplay/inventoryProjection";

const aggregateMissionRewards = (rows: Array<{ item_id?: string; quantity?: number }>) => {
  const rewardByItem = new Map<string, number>();
  rows.forEach((reward) => {
    const itemId = String(reward.item_id || "");
    const quantity = Number(reward.quantity || 0);
    if (!itemId || quantity <= 0) return;
    rewardByItem.set(itemId, (rewardByItem.get(itemId) || 0) + quantity);
  });
  return Array.from(rewardByItem, ([id, quantity]) => ({
    id,
    name: canonicalMissionRewardName(id),
    quantity,
  }));
};

export function useInventory(
  session: any,
  cash: number,
  setCash: React.Dispatch<React.SetStateAction<number>>,
  diamonds: number,
  setDiamonds: React.Dispatch<React.SetStateAction<number>>,
  vitality: number,
  setVitality: React.Dispatch<React.SetStateAction<number>>,
  playCyberSe: (type: string) => void,
  syncBootstrapData: (userId: string) => Promise<void>,
  setConfirmDialogConfig: React.Dispatch<React.SetStateAction<import("@/app/components/ui/ConfirmDialog").ConfirmDialogConfig | null>>,
  onMissionPlayerProgress?: (level: number, xp: number) => void,
  onPresentEquipmentProjection?: (rows: any[], owner: string) => void
) {
  const [userItems, setUserItems] = useState<any[]>([]);
  const [inventoryProjectionOwnerUserId, setInventoryProjectionOwnerUserId] = useState("");
  const activeInventoryUserIdRef = useRef(session?.user?.id || "");
  const inventoryProjectionGenerationRef = useRef(0);
  const inventoryIdentityGenerationRef = useRef(0);
  const activeSessionUserId = session?.user?.id || "";

  // 消耗品ステート
  const [energyDrinks, setEnergyDrinks] = useState<number>(0);
  const [charExpS, setCharExpS] = useState<number>(0);
  const [charExpM, setCharExpM] = useState<number>(0);
  const [charExpL, setCharExpL] = useState<number>(0);
  const [equipExpS, setEquipExpS] = useState<number>(0);
  const [equipExpM, setEquipExpM] = useState<number>(0);
  const [equipExpL, setEquipExpL] = useState<number>(0);
  const [awakeningBooks, setAwakeningBooks] = useState<number>(0);
  const [skillManuals, setSkillManuals] = useState<number>(0);
  const [equipLbParts, setEquipLbParts] = useState<number>(0);

  // 互換エイリアス
  const healPotions = 0;
  const doctorSprays = 0;
  const pvpVipPasses = 0;
  const trainingManuals = charExpS + charExpM + charExpL;
  const polishingStones = equipExpS + equipExpM + equipExpL;

  const beginUserItemsProjectionRequest = (ownerUserId: string) => {
    if (!ownerUserId || activeInventoryUserIdRef.current !== ownerUserId) return null;
    inventoryProjectionGenerationRef.current += 1;
    return inventoryProjectionGenerationRef.current;
  };

  const projectUserItems = useCallback((rows: any[], ownerUserId: string, requestGeneration?: number | null) => {
    if (ownerUserId && activeInventoryUserIdRef.current !== ownerUserId) return false;
    if (requestGeneration != null && requestGeneration !== inventoryProjectionGenerationRef.current) return false;
    const items = Array.isArray(rows) ? rows : [];
    const quantities = buildInventoryQuantityProjection(items);

    // Keep the canonical row projection and the compatibility counters in one
    // synchronous React update boundary. Bag and Growth must never observe
    // different ownership values for the same user_items rows.
    setUserItems(items);
    setEnergyDrinks(quantities.ENERGY_DRINK);
    setCharExpS(quantities.CHAR_EXP_S);
    setCharExpM(quantities.CHAR_EXP_M);
    setCharExpL(quantities.CHAR_EXP_L);
    setEquipExpS(quantities.EQUIP_EXP_S);
    setEquipExpM(quantities.EQUIP_EXP_M);
    setEquipExpL(quantities.EQUIP_EXP_L);
    setAwakeningBooks(quantities.AWAKENING_BOOK);
    setSkillManuals(quantities.SKILL_MANUAL);
    setEquipLbParts(quantities.EQUIP_LB_PART);
    setInventoryProjectionOwnerUserId(ownerUserId);
    return true;
  }, []);

  const resetUserItemsProjection = useCallback((nextActiveUserId = "") => {
    activeInventoryUserIdRef.current = nextActiveUserId;
    inventoryIdentityGenerationRef.current += 1;
    inventoryProjectionGenerationRef.current += 1;
    projectUserItems([], "");
  }, [projectUserItems]);

  useLayoutEffect(() => {
    if (activeInventoryUserIdRef.current === activeSessionUserId) return;
    // Some local/demo auth paths replace session directly without a Supabase
    // auth observer event. They still need the same owner swap and full clear.
    resetUserItemsProjection(activeSessionUserId);
  }, [activeSessionUserId, resetUserItemsProjection]);

  const refreshUserItemsProjection = async (userId: string) => {
    const requestGeneration = beginUserItemsProjectionRequest(userId);
    if (requestGeneration == null) return [];
    const { data, error } = await supabase
      .from("user_items")
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    projectUserItems(data || [], userId, requestGeneration);
    return data || [];
  };

  // ミッション ＆ プレゼント
  const [missions, setMissions] = useState<any[]>([]);
  const [missionEventsError, setMissionEventsError] = useState(false);
  const [missionTab, setMissionTab] = useState<"DAILY" | "NORMAL" | "SPECIAL">("DAILY");
  const [presents, setPresents] = useState<any[]>([]);
  const [presentsPrefetched, setPresentsPrefetched] = useState<boolean>(false);
  const [presentsSyncing, setPresentsSyncing] = useState<boolean>(false);
  const {
    isLocked: presentClaimLoading,
    beginAction: beginPresentClaim,
    endAction: endPresentClaim
  } = useImmediateActionLock();
  const {
    isLocked: missionClaimLoading,
    beginAction: beginMissionClaim,
    endAction: endMissionClaim,
    endActionAfterPaint: endMissionClaimAfterPaint
  } = useImmediateActionLock();
  const {
    isLocked: itemUseLoading,
    beginAction: beginItemUse,
    endAction: endItemUse
  } = useImmediateActionLock();
  const presentLockOwnerRef = useRef(activeSessionUserId);
  useLayoutEffect(() => {
    if (presentLockOwnerRef.current === activeSessionUserId) return;
    presentLockOwnerRef.current = activeSessionUserId;
    endPresentClaim();
  }, [activeSessionUserId, endPresentClaim]);
  const setPresentClaimLoading = (loading: boolean) => {
    if (loading) beginPresentClaim();
    else endPresentClaim();
  };
  const setMissionClaimLoading = (loading: boolean) => {
    if (loading) beginMissionClaim();
    else endMissionClaim();
  };

  const showActionError = (title: string, error: unknown) => {
    const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error || "");
    if (/action resource is already at maximum|energy drink would exceed vitality hard cap/.test(detail)) {
      setConfirmDialogConfig({ isOpen: true, title: "アイテム使用", message: "最大値なので回復できません。", confirmText: "閉じる", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      return;
    }
    const message = /network|fetch|timeout/i.test(detail)
      ? "通信を確認して、もう一度お試しください。"
      : /already|claimed/i.test(detail)
        ? "すでに処理済みです。最新の状態へ更新します。"
        : "処理を完了できませんでした。時間をおいて再度お試しください。";
    setConfirmDialogConfig({ isOpen: true, title, message, confirmText: "閉じる", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
  };

  const handleUseItem = async (itemId: string) => {
    if (!session || !beginItemUse()) return;
    try {
    
    if (itemId === "ENERGY_DRINK") {
      if (!canUseEnergyDrink(vitality)) {
        setConfirmDialogConfig({ isOpen: true, title: "アイテム使用", message: "最大値なので回復できません。", confirmText: "閉じる", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
        return;
      }
      
      const prevQuantity = energyDrinks;
      const prevVitality = vitality;
      const nextVitality = Math.min(prevVitality + 50, VITALITY_OVERFLOW_MAX);
      
      setEnergyDrinks(prev => Math.max(0, prev - 1));
      setVitality(nextVitality);
      
      try {
        const res = await supabase.rpc("use_energy_drink");
        if (res.error) throw res.error;
        if (res.data?.error) throw new Error(res.data.error);

        await syncBootstrapData(session.user.id);
        setConfirmDialogConfig({ isOpen: true, title: "アイテム使用", message: `エナジードリンクを使用しました。スタミナが50回復しました。（${prevVitality} → ${nextVitality}）`, confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      } catch (err: any) {
        setEnergyDrinks(prevQuantity);
        setVitality(prevVitality);
        showActionError("アイテムを使用できませんでした", err);
      }
    } else if (itemId === "PVP_POINT_TICKET" || itemId === "RAID_POINT_TICKET") {
      const ownerUserId = session.user.id;
      const isCurrentOwner = () => activeInventoryUserIdRef.current === ownerUserId;
      try {
        const res = await supabase.rpc("use_action_resource_ticket", { p_item_id: itemId });
        if (!isCurrentOwner()) return;
        if (res.error) throw res.error;
        if (res.data?.error) throw new Error(res.data.error);
        if (res.data?.status !== "success") throw new Error("回復結果を確認できませんでした。");
        // A confirmed ticket use has already consumed the item. A later
        // projection failure must not invite another use as a retry.
        let projectionFailed = false;
        try { await syncBootstrapData(ownerUserId); }
        catch { projectionFailed = true; }
        if (!isCurrentOwner()) return;
        const resourceName = itemId === "PVP_POINT_TICKET" ? "BP" : "レイドポイント";
        setConfirmDialogConfig({ isOpen: true, title: "アイテム使用", message: `${resourceName}が1回復しました。${projectionFailed ? "画面の更新に失敗したため、再読み込みして所持数を確認してください。" : ""}`, confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      } catch (err: any) {
        if (isCurrentOwner()) showActionError("アイテムを使用できませんでした", err);
      }
    } else {
      setConfirmDialogConfig({ isOpen: true, title: "アイテム使用", message: "このアイテムは強化・限界突破画面で使用してください。", confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    }
    } finally {
      endItemUse();
    }
  };

  // Present claims only change the wallet, inventory and inbox. Do not put the
  // whole social / battle / mission bootstrap on this interaction's critical path.
  const refreshPresentClaimState = async (owner: string, isCurrent: () => boolean) => {
    const generation = beginUserItemsProjectionRequest(owner);
    const [wallet, items, inbox, equipment] = await Promise.all([
      supabase.from("users").select("cash,neon_diamonds").eq("id", owner).single(),
      supabase.from("user_items").select("*").eq("user_id", owner),
      supabase.from("presents").select("*").eq("user_id", owner).order("sent_at", { ascending: false }),
      supabase.from("user_equipments").select("*").eq("user_id", owner).order("created_at", { ascending: false }),
    ]);
    if (!isCurrent()) return [];
    if (wallet.error) throw wallet.error;
    if (items.error) throw items.error;
    if (inbox.error) throw inbox.error;
    if (equipment.error) throw equipment.error;
    if (!wallet.data) throw new Error("Present wallet projection unavailable");
    setCash(Number(wallet.data.cash));
    setDiamonds(Number(wallet.data.neon_diamonds));
    projectUserItems(items.data || [], owner, generation);
    onPresentEquipmentProjection?.(equipment.data || [], owner);
    const rows = inbox.data || [];
    setPresents(rows.map(p => {
      const hours = Math.ceil((new Date(p.expire_at).getTime() - Date.now()) / 3600000);
      return { ...p, id: String(p.id), itemId: p.item_id, qty: p.quantity,
        title: p.message?.split(":")[0] || "配布アイテム", loading: false,
        expireText: p.expire_at == null ? "期限なし" : hours <= 0 ? "期限切れ" : hours > 24 ? `期限: あと${Math.ceil(hours / 24)}日` : `期限: あと${hours}時間` };
    }));
    return rows;
  };

  const claimPresents = async (id?: string) => {
    if (!session) return;
    const targets = presents.filter(p => p.status === "UNCLAIMED" && (!id || p.id === id));
    if (!targets.length || !beginPresentClaim()) return;
    const owner = session.user.id;
    const identityGeneration = inventoryIdentityGenerationRef.current;
    const isCurrent = () => activeInventoryUserIdRef.current === owner && inventoryIdentityGenerationRef.current === identityGeneration;
    const timing = beginActionPerformance("present_claim");
    let committed = false;
    let receiptOwnsLock = false;
    const targetIds = new Set(targets.map(p => p.id));
    setPresents(prev => prev.map(p => targetIds.has(p.id) ? { ...p, loading: true } : p));
    playCyberSe(id ? "click" : "gacha");
    try {
      timing.mark("request_start");
      const res = id ? await supabase.rpc("claim_present", { p_present_id: id }) : await supabase.rpc("claim_all_presents");
      timing.mark("response");
      if (!isCurrent()) return;
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.status !== "success") throw new Error("Present receipt not confirmed");
      committed = true;
      // The server is the only grant authority. Read the rows back rather than
      // clearing every visible row (expired / newly arrived presents can differ).
      const rows = await refreshPresentClaimState(owner, isCurrent);
      if (!isCurrent()) return;
      timing.mark("state_update");
      timing.markVisualReady();
      const received = rows.filter(p => targetIds.has(String(p.id)) && p.status === "CLAIMED");
      const count = id ? 1 : Number(res.data.claimed_count || 0);
      const rewardByItem = new Map<string, number>();
      // Bulk RPC can claim a new arrival that was not in the visible list.
      // In that case show the confirmed count, never an invented reward list.
      if (received.length === count) received.forEach(p => {
        const itemId = String(p.item_id);
        rewardByItem.set(itemId, (rewardByItem.get(itemId) || 0) + Number(p.quantity));
      });
      const closeReceipt = () => {
        if (!isCurrent()) return;
        setConfirmDialogConfig(null);
        endPresentClaim();
      };
      receiptOwnsLock = true;
      setConfirmDialogConfig({ isOpen: true, title: count ? "報酬獲得" : "プレゼント",
        message: count ? (id ? "プレゼントを受け取りました。" : `プレゼントを${count}件受け取りました。`) : "受け取れるプレゼントはありませんでした。",
        kind: rewardByItem.size ? "reward" : undefined,
        rewards: Array.from(rewardByItem, ([itemId, quantity]) => ({ id: itemId, name: canonicalItemName(itemId), quantity })),
        confirmText: "閉じる", cancelText: "", presentation: "canonical", onConfirm: closeReceipt, onCancel: closeReceipt });
    } catch (err) {
      if (!isCurrent()) return;
      // A failed response may still have committed. Refresh without replaying
      // the mutation; if reads fail, keep rows pending for an explicit retry.
      try { await refreshPresentClaimState(owner, isCurrent); } catch { /* retain existing rows */ }
      if (!isCurrent()) return;
      setPresents(prev => prev.map(p => ({ ...p, loading: false })));
      if (committed) {
        setConfirmDialogConfig({ isOpen: true, title: "プレゼント受取済み",
          message: "受け取りは完了しました。所持数の表示を更新できなかったため、ページを再読み込みしてください。",
          confirmText: "閉じる", cancelText: "", presentation: "canonical",
          onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      } else showActionError("受取状況を確認してください", err);
    } finally {
      if (!receiptOwnsLock && isCurrent()) endPresentClaim();
    }
  };

  const handleClaimPresent = (id: string) => claimPresents(id);
  const handleClaimAllPresents = () => claimPresents();

  const refreshMissionClaimState = async (owner: string, isCurrent: () => boolean, committedProjection?: any) => {
    if (!isCurrent()) return;
    // 成功時は同じトランザクションの投影を使用。応答消失時だけ所有者の状態を再取得。
    let projection = committedProjection;
    if (!projection) {
      const { data, error } = await supabase.rpc("get_current_mission_reward_state");
      if (error) throw error;
      projection = data;
    }
    if (!isCurrent()) return;
    if (projection?.owner !== owner || !Array.isArray(projection?.missions) || !Array.isArray(projection?.items)) {
      throw new Error("報酬の最新状態を確認できませんでした。");
    }
    const rows = new Map<string, any>(projection.missions.map((row: any) => [row.mission_id, row]));
    setMissions(prev => prev.map(m => {
      const row = rows.get(m.id);
      return row ? { ...m, status: row.status === "PROGRESS" ? "IN_PROGRESS" : row.status,
        current_progress: row.current_progress, expires_at: row.expires_at, loading: false } : m;
    }));
    const generation = beginUserItemsProjectionRequest(owner);
    projectUserItems(projection.items, owner, generation);
    setCash(Number(projection.cash));
    setDiamonds(Number(projection.diamonds));
    onMissionPlayerProgress?.(Number(projection.level), Number(projection.xp));
    return rows;
  };

  const handleClaimMission = async (id: string, onReceiptConfirmed?: () => void) => {
    if (!session) return;
    if (!canClaimMission(missions.find(m => m.id === id) || {})) return;
    if (!beginMissionClaim()) return;
    const owner = session.user.id;
    const isCurrent = () => activeInventoryUserIdRef.current === owner;
    setMissions(prev => prev.map(m => m.id === id ? { ...m, loading: true } : m));
    playCyberSe("click");

    let refreshedRows: Map<string, any> | undefined;
    let claimProjection: any;
    const timing = beginActionPerformance("mission_claim");
    timing.mark("request_start");
    const closeReceipt = () => {
      if (!isCurrent()) return;
      setConfirmDialogConfig(null);
      onReceiptConfirmed?.();
    };
    try {
      const targetMission = missions.find(m => m.id === id);
      if (!targetMission) return;

      const res = await reconcileMissionClaim(async () => {
        const response = await supabase.rpc("claim_mission_reward", { p_mission_id: id });
        if (response.error) throw response.error;
        if (response.data?.error) throw new Error(response.data.error);
        claimProjection = response.data?.mission_state;
        timing.mark("response");
        return response;
      }, async () => { refreshedRows = await refreshMissionClaimState(owner, isCurrent, claimProjection); }, isCurrent);
      timing.mark("state_update");
      timing.markVisualReady();
      if (!isCurrent()) return;

      const rewards = aggregateMissionRewards(Array.isArray(res.data?.rewards) ? res.data.rewards : []);
      if (!rewards.length) {
        if (onReceiptConfirmed && refreshedRows?.get(id)?.status === "CLAIMED") {
          setConfirmDialogConfig({ isOpen: true, title: "ミッション", message: "報酬は受取済みです。", confirmText: "マイページへ", cancelText: "", presentation: "canonical", onConfirm: closeReceipt, onCancel: () => setConfirmDialogConfig(null) });
        }
        return;
      }
      playCyberSe("MISSION_REWARD");
      setConfirmDialogConfig({ isOpen: true, title: "報酬獲得", message: targetMission.isCompletion ? "ギルドバトル開幕の準備完了！\n正式オープンに備えよう！" : "報酬を獲得しました。", kind: "reward", delivery: "INVENTORY", rewards, confirmText: onReceiptConfirmed ? "マイページへ" : "OK", cancelText: "", presentation: "canonical", onConfirm: closeReceipt, onCancel: () => setConfirmDialogConfig(null) });
    } catch (err) {
      console.warn(err);
      if (!isCurrent()) return;
      setMissions(prev => prev.map(m => m.id === id ? { ...m, loading: false } : m));
      // 応答消失でも、再取得で受取済みを確認できた場合だけ帰還可能にする。
      if (onReceiptConfirmed && refreshedRows?.get(id)?.status === "CLAIMED") {
        setConfirmDialogConfig({ isOpen: true, title: "ミッション", message: "報酬の受取済みを確認しました。", confirmText: "マイページへ", cancelText: "", presentation: "canonical", onConfirm: closeReceipt, onCancel: () => setConfirmDialogConfig(null) });
      } else showActionError("報酬を受け取れませんでした", err);
    } finally {
      endMissionClaimAfterPaint();
    }
  };

  const handleClaimAllMissions = async (eventId?: string | null, onReceiptConfirmed?: () => void, receiptMissionIds?: string[]) => {
    if (!session) return;
    const clearMissions = missions.filter(m => canClaimMission(m) && m.category === missionTab && (eventId === undefined || (m.eventId || "unassigned") === eventId));
    if (clearMissions.length === 0) return;

    if (!beginMissionClaim()) return;
    const owner = session.user.id;
    const isCurrent = () => activeInventoryUserIdRef.current === owner;
    setMissions(prev => prev.map(m => clearMissions.some(target => target.id === m.id) ? { ...m, loading: true } : m));
    playCyberSe("gacha");

    let refreshedRows: Map<string, any> | undefined;
    let claimProjection: any;
    const timing = beginActionPerformance("mission_claim");
    timing.mark("request_start");
    const closeReceipt = () => {
      if (!isCurrent()) return;
      setConfirmDialogConfig(null);
      if (clearMissions.some(m => (!receiptMissionIds || receiptMissionIds.includes(m.id)) && refreshedRows?.get(m.id)?.status === "CLAIMED")) onReceiptConfirmed?.();
    };
    try {
      const missionIds = clearMissions.map(m => m.id);
      const res = await reconcileMissionClaim(async () => {
        const response = await supabase.rpc("claim_all_mission_rewards", { p_mission_ids: missionIds });
        if (response.error) throw response.error;
        if (response.data?.error) throw new Error(response.data.error);
        claimProjection = response.data?.mission_state;
        timing.mark("response");
        return response;
      }, async () => { refreshedRows = await refreshMissionClaimState(owner, isCurrent, claimProjection); }, isCurrent);
      timing.mark("state_update");
      timing.markVisualReady();
      if (!isCurrent()) return;

      const rewards = aggregateMissionRewards(Array.isArray(res.data?.rewards) ? res.data.rewards : []);
      if (!rewards.length) {
        setConfirmDialogConfig({ isOpen: true, title: "ミッション", message: "受取状態を更新しました。", confirmText: "閉じる", cancelText: "", onConfirm: closeReceipt, onCancel: () => setConfirmDialogConfig(null) });
        return;
      }
      playCyberSe("MISSION_REWARD");
      setConfirmDialogConfig({ isOpen: true, title: "クリア報酬", message: "報酬を獲得しました。", kind: "reward", delivery: "INVENTORY", rewards, confirmText: onReceiptConfirmed ? "マイページへ" : "閉じる", cancelText: "", presentation: "canonical", onConfirm: closeReceipt, onCancel: () => setConfirmDialogConfig(null) });
    } catch (err: any) {
      console.warn(err.message);
      if (!isCurrent()) return;
      setMissions(prev => prev.map(m => ({ ...m, loading: false })));
      if (onReceiptConfirmed && clearMissions.some(m => (!receiptMissionIds || receiptMissionIds.includes(m.id)) && refreshedRows?.get(m.id)?.status === "CLAIMED")) {
        setConfirmDialogConfig({ isOpen: true, title: "ミッション", message: "報酬の受取済みを確認しました。", confirmText: "マイページへ", cancelText: "", presentation: "canonical", onConfirm: closeReceipt, onCancel: () => setConfirmDialogConfig(null) });
      } else showActionError("一括受け取りに失敗しました", err);
    } finally {
      endMissionClaimAfterPaint();
    }
  };

  return {
    userItems, setUserItems,
    inventoryProjectionOwnerUserId,
    beginUserItemsProjectionRequest,
    projectUserItems,
    resetUserItemsProjection,
    refreshUserItemsProjection,
    energyDrinks, setEnergyDrinks,
    charExpS, setCharExpS,
    charExpM, setCharExpM,
    charExpL, setCharExpL,
    equipExpS, setEquipExpS,
    equipExpM, setEquipExpM,
    equipExpL, setEquipExpL,
    awakeningBooks, setAwakeningBooks,
    skillManuals, setSkillManuals,
    equipLbParts, setEquipLbParts,
    healPotions,
    doctorSprays,
    pvpVipPasses,
    trainingManuals,
    polishingStones,
    missions, setMissions, missionEventsError, setMissionEventsError,
    missionTab, setMissionTab,
    presents, setPresents,
    presentsPrefetched, setPresentsPrefetched,
    presentsSyncing, setPresentsSyncing,
    presentClaimLoading, setPresentClaimLoading,
    itemUseLoading,
    missionClaimLoading, setMissionClaimLoading,
    handleUseItem,
    handleClaimPresent,
    handleClaimAllPresents,
    handleClaimMission,
    handleClaimAllMissions
  };
}

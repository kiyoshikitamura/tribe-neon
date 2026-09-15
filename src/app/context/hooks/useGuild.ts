"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { guildMemberCap, guildRecruitmentMode, canEditGuildSettings, canManageGuildApplications, GUILD_PRODUCTION, type GuildRecruitmentMode } from "@/domain/gameplay/canonical/guild_production";
import { useImmediateActionLock } from "@/hooks/useImmediateActionLock";

const guildWelcomeSessionKey = (userId: string, guildId: string) => (
  `tribe-neon:guild-welcome-shown:${userId}:${guildId}`
);

export function useGuild(
  session: any,
  userLevel: number,
  cash: number,
  setCash: React.Dispatch<React.SetStateAction<number>>,
  setGvgResetLoading: (loading: boolean) => void,
  setErrorMessage: (msg: string | null) => void,
  playCyberSe: (type: string) => void,
  syncBootstrapData: (userId: string) => Promise<void>,
  addGuildXpAndContributionByAction: (actionType: string, sourceId?: string) => Promise<void>,
  setConfirmDialogConfig: React.Dispatch<React.SetStateAction<import("@/app/components/ui/ConfirmDialog").ConfirmDialogConfig | null>>,
  openGuildChat?: () => void
) {
  const [userGuild, setUserGuild] = useState<any | null>(null);
  const [userGuildMember, setUserGuildMember] = useState<any | null>(null);
  const [guildMembersList, setGuildMembersList] = useState<any[]>([]);
  const [newGuildName, setNewGuildName] = useState<string>("");
  const [allGuildsDbList, setAllGuildsDbList] = useState<any[]>([]);
  const [guildSubTab, setGuildSubTab] = useState<"home" | "members" | "settings">("home");
  const [guildLevelMaster, setGuildLevelMaster] = useState<any[]>([]);
  const [guildXpActionMaster, setGuildXpActionMaster] = useState<any[]>([]);
  const [updatingAlignment, setUpdatingAlignment] = useState<boolean>(false);
  const [pendingGuildJoinRequests, setPendingGuildJoinRequests] = useState<any[]>([]);
  const [guildJoinRequests, setGuildJoinRequests] = useState<any[]>([]);
  const [guildPrivilegedOperation, setGuildPrivilegedOperation] = useState<{ key: "promote" | "demote" | "transfer" | "kick"; targetUserId: string } | null>(null);
  const {
    beginAction: beginGuildPrivilegedMutation,
    endActionAfterPaint: endGuildPrivilegedMutationAfterPaint,
  } = useImmediateActionLock();

  const beginPrivilegedOperation = (key: "promote" | "demote" | "transfer" | "kick", targetUserId: string) => {
    if (!beginGuildPrivilegedMutation()) return false;
    setGuildPrivilegedOperation({ key, targetUserId });
    return true;
  };

  const endPrivilegedOperation = () => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => setGuildPrivilegedOperation(null)));
    } else {
      setGuildPrivilegedOperation(null);
    }
    endGuildPrivilegedMutationAfterPaint();
  };

  const openGuildWelcome = (guildId: string, guildName: string) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(guildWelcomeSessionKey(session?.user?.id || "anonymous", guildId), "1");
    }
    setConfirmDialogConfig({
      isOpen: true,
      title: "ギルドへようこそ",
      message: `「${guildName}」への加入が完了しました。`,
      confirmText: "ギルドチャットを見る",
      cancelText: "閉じる",
      presentation: "canonical",
      onConfirm: () => {
        void supabase.rpc("record_client_funnel_event", {
          p_event_name: "guild_welcome_chat_click", p_source_screen: "guild_welcome",
          p_source_cta: "open_chat", p_object_id: guildId, p_metadata: {},
        });
        setConfirmDialogConfig(null);
        openGuildChat?.();
      },
      onCancel: () => setConfirmDialogConfig(null),
    });
  };

  useEffect(() => {
    if (!session?.user?.id || !userGuildMember?.guild_id || !userGuild?.id || typeof window === "undefined") return;
    const sessionKey = guildWelcomeSessionKey(session.user.id, userGuild.id);
    if (window.sessionStorage.getItem(sessionKey)) return;
    void supabase.from("user_funnel_milestones").select("milestone")
      .eq("user_id", session.user.id).eq("milestone", "guild_activation").maybeSingle()
      .then(({ data }) => {
        // The direct-join path may have claimed this presentation while the
        // milestone query was in flight. Re-check here to prevent a late
        // second dialog (and duplicate Strict Mode effects) over Guild Chat.
        if (window.sessionStorage.getItem(sessionKey)) return;
        const pendingGuildId = window.localStorage.getItem("tribe-neon:pending-guild-welcome");
        if (data) return;
        if (pendingGuildId && pendingGuildId !== userGuild.id) window.localStorage.removeItem("tribe-neon:pending-guild-welcome");
        window.sessionStorage.setItem(sessionKey, "1");
        window.localStorage.removeItem("tribe-neon:pending-guild-welcome");
        openGuildWelcome(userGuild.id, userGuild.name || "TRIBE");
      });
  }, [session?.user?.id, userGuildMember?.guild_id, userGuild?.id]);

  const getGuildPenaltyState = () => {
    if (!session || !userGuildMember) return { isPenalty: false, secondsLeft: 0 };
    const leftAt = session.user?.user_metadata?.last_guild_left_at;
    if (!leftAt) return { isPenalty: false, secondsLeft: 0 };
    const leftTime = new Date(leftAt).getTime();
    const now = new Date().getTime();
    const penaltyMs = 24 * 60 * 60 * 1000;
    const diffMs = now - leftTime;
    if (diffMs < penaltyMs) {
      return { isPenalty: true, secondsLeft: Math.ceil((penaltyMs - diffMs) / 1000) };
    }
    return { isPenalty: false, secondsLeft: 0 };
  };

  const executeCreateGuild = async (guildName: string) => {
    if (!session) return;
    setGvgResetLoading(true);
    playCyberSe("click");
    try {
      const res = await supabase.rpc("create_guild_v2", {
        p_user_id: session.user.id,
        p_guild_name: guildName,
        p_creation_cost: GUILD_PRODUCTION.creation.cashCost
      });

      if (res.error) {
        setConfirmDialogConfig(null);
        setErrorMessage("ギルドの設立に失敗しました。入力内容を確認して、もう一度お試しください。");
        return;
      }
      if (res.data?.error) {
        setConfirmDialogConfig(null);
        setErrorMessage("ギルドの設立に失敗しました。入力内容を確認して、もう一度お試しください。");
        return;
      }

      const createdGuildId = res.data?.guild_id;
      if (createdGuildId && typeof window !== "undefined") {
        // Creation has its own success contract. Do not race it with the
        // first-join welcome dialog while bootstrap projects membership.
        window.sessionStorage.setItem(`tribe-neon:guild-welcome-shown:${session.user.id}:${createdGuildId}`, "1");
      }
      setNewGuildName("");
      await syncBootstrapData(session.user.id);
      setGuildSubTab("home");
      setConfirmDialogConfig({
        isOpen: true,
        title: "ギルド設立",
        message: `「${guildName}」を設立しました。`,
        confirmText: "OK",
        cancelText: "",
        presentation: "canonical",
        onConfirm: () => setConfirmDialogConfig(null),
        onCancel: () => setConfirmDialogConfig(null),
      });
    } catch (err: any) {
      console.warn(err.message);
      setConfirmDialogConfig(null);
      setErrorMessage("ギルドの設立に失敗しました。時間をおいて、もう一度お試しください。");
    } finally {
      setGvgResetLoading(false);
    }
  };

  const openGuildJoinCooldownDialog = () => {
    setConfirmDialogConfig({
      isOpen: true,
      title: "ギルドに加入できません",
      message: "ギルド脱退後24時間は、別のギルドに加入できません。",
      confirmText: "OK",
      cancelText: "",
      presentation: "canonical",
      onConfirm: () => setConfirmDialogConfig(null),
      onCancel: () => setConfirmDialogConfig(null),
    });
  };

  const isGuildJoinCooldownError = (error: any) => {
    const authority = [error?.code, error?.details, error?.hint, error?.message]
      .filter(Boolean)
      .join(" ");
    return authority.includes("GUILD_JOIN_COOLDOWN_ACTIVE")
      || /Guild rejoin cooldown is active/i.test(authority);
  };

  const handleCreateGuild = () => {
    if (!session) return;
    const guildName = newGuildName.trim();
    if (userLevel < GUILD_PRODUCTION.creation.userLevel) {
      setErrorMessage(`ギルド創設にはプレイヤーレベル${GUILD_PRODUCTION.creation.userLevel}以上が必要です。`);
      return;
    }
    if (!guildName) {
      setErrorMessage("ギルド名は空欄にできません。");
      return;
    }
    if (Array.from(guildName).length > GUILD_PRODUCTION.creation.nameMax) {
      setErrorMessage("ギルド名は12文字以内で入力してください。");
      return;
    }
    if (cash < GUILD_PRODUCTION.creation.cashCost) {
      setErrorMessage(`創設にはキャッシュ${GUILD_PRODUCTION.creation.cashCost.toLocaleString()}が必要です。`);
      return;
    }
    setConfirmDialogConfig({
      isOpen: true,
      title: "ギルドを設立",
      message: `「${guildName}」を設立しますか？\n設立には${GUILD_PRODUCTION.creation.cashCost.toLocaleString()}キャッシュが必要です。`,
      confirmText: "設立する",
      confirmPendingText: "作成中…",
      cancelText: "キャンセル",
      presentation: "canonical",
      onConfirm: () => executeCreateGuild(guildName),
      onCancel: () => setConfirmDialogConfig(null),
    });
  };

  const handleUpdateGuildAlignment = async (mainAlign: string, subAlign: string): Promise<boolean> => {
    if (!session || !userGuild || !userGuildMember) return false;
    if (!canEditGuildSettings(userGuildMember.role)) {
      setConfirmDialogConfig({ isOpen: true, title: "属性変更", message: "ギルドマスターまたは副団長のみ属性を変更できます。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      return false;
    }
    setUpdatingAlignment(true);
    playCyberSe("click");

    const alignmentJpToEn: { [key: string]: string } = {
      "正義": "JUSTICE",
      "悪": "EVIL",
      "秩序": "ORDER",
      "混沌": "CHAOS",
      "JUSTICE": "JUSTICE",
      "EVIL": "EVIL",
      "ORDER": "ORDER",
      "CHAOS": "CHAOS"
    };

    const mainEn = alignmentJpToEn[mainAlign] || mainAlign;
    const subEn = alignmentJpToEn[subAlign] || subAlign;

    try {
      const { error } = await supabase.rpc("update_guild_alignment", {
        p_guild_id: userGuild.id,
        p_main: mainEn,
        p_sub: subEn
      });

      if (error) throw error;

      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({
        isOpen: true,
        title: "属性設定",
        message: "ギルド属性を保存しました。",
        confirmText: "OK",
        cancelText: "",
        presentation: "canonical",
        onConfirm: () => setConfirmDialogConfig(null),
        onCancel: () => setConfirmDialogConfig(null),
      });
      return true;
    } catch (e: any) {
      console.warn("Update alignment failed:", e.message);
      setErrorMessage("属性の更新に失敗しました。");
      return false;
    } finally {
      setUpdatingAlignment(false);
    }
  };

  const executeLeaveGuild = async () => {
    if (!session || !userGuildMember || !userGuild) return;
    setGvgResetLoading(true);
    playCyberSe("click");

    try {
      const isMaster = userGuildMember.role === "MASTER";
      const otherMembers = guildMembersList.filter(m => m.user_id !== session.user.id);

      if (isMaster && otherMembers.length > 0) {
        setErrorMessage("脱退する前に、マスター権限を譲渡してください。");
        setGvgResetLoading(false);
        return;
      }

      const { error } = await supabase.rpc("leave_guild", {
        p_user_id: session.user.id,
        p_guild_id: userGuild.id,
        p_is_master: isMaster,
        p_has_others: otherMembers.length > 0
      });
      if (error) throw error;

      if (isMaster && otherMembers.length === 0) {
        setConfirmDialogConfig({ isOpen: true, title: "ギルド解散", message: "ギルドを解散しました。", confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      } else {
        setConfirmDialogConfig({ isOpen: true, title: "ギルド脱退", message: "ギルドから正常に脱退しました。", confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      }

      await syncBootstrapData(session.user.id);
    } catch (err: any) {
      console.warn(err.message);
    } finally {
      setGvgResetLoading(false);
    }
  };

  const executeGuildJoin = async (targetGuildId: string, guildName: string, requiresApproval: boolean): Promise<"joined" | "pending" | null> => {
    if (!session) return null;
    if (userLevel < 3) {
      setErrorMessage("ギルド加入にはプレイヤーレベル3以上が必要です。");
      return null;
    }
    setGvgResetLoading(true);
    playCyberSe("click");
    try {
      const targetGuild = allGuildsDbList.find((guild: any) => guild.id === targetGuildId);
      const targetGuildCap = Number(targetGuild?.member_limit ?? guildMemberCap(Number(targetGuild?.level || 1)));
      if (Number(targetGuild?.member_count || 0) >= targetGuildCap) {
        setConfirmDialogConfig({ isOpen: true, title: "加入失敗", message: `対象ギルドは上限人数（${targetGuildCap}名）に達しています。`, onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
        setGvgResetLoading(false);
        return null;
      }

      const { error } = requiresApproval
        ? await supabase.rpc("request_guild_join", { p_guild_id: targetGuildId })
        : await supabase.rpc("join_guild", { p_guild_id: targetGuildId });
      if (error) throw error;

      if (requiresApproval && typeof window !== "undefined") {
        window.localStorage.setItem("tribe-neon:pending-guild-welcome", targetGuildId);
      }
      if (!requiresApproval) playCyberSe("GUILD_JOIN");

      // Claim the direct-join welcome before bootstrap publishes membership.
      // The membership effect remains the owner for later approval joins.
      if (!requiresApproval && typeof window !== "undefined") {
        window.sessionStorage.setItem(guildWelcomeSessionKey(session.user.id, targetGuildId), "1");
      }

      await syncBootstrapData(session.user.id);
      if (requiresApproval) {
        setConfirmDialogConfig({
          isOpen: true,
          title: "加入申請",
          message: `「${guildName}」へ加入申請を送りました。`,
          confirmText: "OK",
          cancelText: "",
          presentation: "canonical",
          onConfirm: () => setConfirmDialogConfig(null),
          onCancel: () => setConfirmDialogConfig(null),
        });
      } else {
        openGuildWelcome(targetGuildId, guildName);
      }
      return requiresApproval ? "pending" : "joined";
    } catch (err: any) {
      console.warn(err.message);
      if (isGuildJoinCooldownError(err)) {
        openGuildJoinCooldownDialog();
        return null;
      }
      const message = String(err?.message || "");
      setErrorMessage(
        /cap|full|上限|満員/i.test(message) ? "このギルドは満員です。" :
        /pending|申請/i.test(message) ? "加入申請はすでに送信済みです。" :
        /already|所属/i.test(message) ? "すでにギルドへ所属しています。" :
        "ギルドへの加入処理に失敗しました。"
      );
      return null;
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handleDemoJoinGuild = async (targetGuildId: string, guildName: string, approvalRequiredOverride?: boolean): Promise<"joined" | "pending" | null> => {
    const targetGuild = allGuildsDbList.find((guild: any) => guild.id === targetGuildId);
    const mode = guildRecruitmentMode(targetGuild?.recruitment_mode, approvalRequiredOverride ?? Boolean(targetGuild?.approval_required));
    if (mode === "CLOSED") {
      setErrorMessage("このギルドは現在募集を停止しています。");
      return null;
    }
    if (mode !== "APPLICATION_REQUIRED") return executeGuildJoin(targetGuildId, guildName, false);

    setConfirmDialogConfig({
      isOpen: true,
      title: "加入申請",
      message: `「${guildName}」へ加入申請を送りますか？`,
      confirmText: "申請する",
      cancelText: "キャンセル",
      presentation: "canonical",
      onConfirm: () => {
        setConfirmDialogConfig(null);
        void executeGuildJoin(targetGuildId, guildName, true);
      },
      onCancel: () => setConfirmDialogConfig(null),
    });
    return null;
  };

  const handleLeaveGuild = () => {
    if (!session || !userGuildMember || !userGuild) return;
    const isMaster = userGuildMember.role === "MASTER";
    const otherMembers = guildMembersList.filter(member => member.user_id !== session.user.id);
    if (isMaster && otherMembers.length > 0) {
      setErrorMessage("脱退する前に、マスター権限を譲渡してください。");
      return;
    }
    setConfirmDialogConfig({
      isOpen: true,
      title: isMaster ? "ギルドを解散" : "ギルドを脱退",
      message: isMaster
        ? `『${userGuild.name}』を解散しますか？この操作は取り消せません。`
        : `「${userGuild.name}」を脱退しますか？`,
      onConfirm: () => {
        setConfirmDialogConfig(null);
        void executeLeaveGuild();
      },
      onCancel: () => setConfirmDialogConfig(null),
      confirmText: isMaster ? "解散する" : "脱退する",
      cancelText: "キャンセル",
      isDanger: true,
      presentation: "canonical",
    });
  };

  const handleUpdateGuildSettings = async (description: string, mode: GuildRecruitmentMode | boolean): Promise<boolean> => {
    if (!session || !userGuild || !canEditGuildSettings(userGuildMember?.role)) return false;
    const recruitmentMode = typeof mode === "boolean" ? (mode ? "APPLICATION_REQUIRED" : "OPEN_JOIN") : mode;
    setGvgResetLoading(true);
    try {
      const { error } = await supabase.rpc("update_guild_recruitment", {
        p_guild_id: userGuild.id,
        p_description: description.trim(),
        p_mode: recruitmentMode,
      });
      if (error) throw error;
      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({
        isOpen: true,
        title: "ギルド設定",
        message: "ギルド設定を更新しました。",
        confirmText: "OK",
        cancelText: "",
        presentation: "canonical",
        onConfirm: () => setConfirmDialogConfig(null),
        onCancel: () => setConfirmDialogConfig(null),
      });
      return true;
    } catch (err: any) {
      console.warn("Update guild settings failed:", err.message);
      setErrorMessage("ギルド設定の更新に失敗しました。");
      return false;
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handleSearchGuilds = async (query = "") => {
    if (!session) return;
    const { data, error } = await supabase.rpc("search_guilds", { p_query: query.trim() });
    if (error) {
      setErrorMessage("ギルド検索に失敗しました。");
      return;
    }
    setAllGuildsDbList(data || []);
  };

  const handleCancelGuildJoinRequest = async (requestId: string) => {
    if (!session) return;
    setGvgResetLoading(true);
    try {
      const { error } = await supabase.rpc("cancel_guild_join_request", { p_request_id: requestId });
      if (error) throw error;
      await syncBootstrapData(session.user.id);
    } catch (err: any) {
      setErrorMessage(err.message || "加入申請の取消に失敗しました。");
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handleReviewGuildJoinRequest = async (requestId: string, approve: boolean) => {
    if (!session || !canManageGuildApplications(userGuildMember?.role)) return;
    setGvgResetLoading(true);
    try {
      const { error } = await supabase.rpc("review_guild_join_request", {
        p_request_id: requestId,
        p_approve: approve,
      });
      if (error) throw error;
      setConfirmDialogConfig({
        isOpen: true,
        title: approve ? "加入承認" : "加入却下",
        message: approve ? "加入申請を承認しました。" : "加入申請を却下しました。",
        confirmText: "OK",
        cancelText: "",
        presentation: "canonical",
        onConfirm: () => setConfirmDialogConfig(null),
        onCancel: () => setConfirmDialogConfig(null),
      });
      await syncBootstrapData(session.user.id);
    } catch (err: any) {
      setErrorMessage(err.message || "加入申請の処理に失敗しました。");
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handleUpdateMemberRole = async (targetUserId: string, targetName: string, newRole: string) => {
    if (!session || !userGuildMember || userGuildMember.role !== "MASTER") return;
    const operationKey = newRole === "MASTER" ? "transfer" : ["SUB_MASTER", "SUBMASTER"].includes(newRole) ? "promote" : "demote";
    if (!beginPrivilegedOperation(operationKey, targetUserId)) return;
    playCyberSe("click");

    try {
      if (newRole === "MASTER") {
        const { error } = await supabase.rpc("transfer_guild_leader", {
          p_guild_id: userGuild.id,
          p_old_id: session.user.id,
          p_new_id: targetUserId
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("set_guild_member_role", {
          p_guild_id: userGuild.id,
          p_target_user_id: targetUserId,
          p_new_role: newRole
        });
        if (error) throw error;
      }
      await syncBootstrapData(session.user.id);
      if (newRole === "MASTER") {
        setConfirmDialogConfig({ isOpen: true, title: "マスター交代", message: `マスター権限を「${targetName}」へ譲渡しました。`, confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      } else {
        const roleLabel = ["SUB_MASTER", "SUBMASTER"].includes(newRole) ? "副団長" : "メンバー";
        setConfirmDialogConfig({ isOpen: true, title: "役職変更", message: `「${targetName}」の役職を${roleLabel}へ変更しました。`, confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      }
    } catch (err: any) {
      console.warn(err.message);
    } finally {
      endPrivilegedOperation();
    }
  };

  const handleKickMember = async (targetUserId: string, targetName: string) => {
    if (!session || !userGuildMember || !["MASTER", "SUB_MASTER", "SUBMASTER"].includes(userGuildMember.role)) return;

    const targetMember = guildMembersList.find(m => m.user_id === targetUserId);
    if (!targetMember) return;

    const rolePower = (role: string) => role === "MASTER" ? 3 : ["SUB_MASTER", "SUBMASTER"].includes(role) ? 2 : 1;
    if (rolePower(userGuildMember.role) <= rolePower(targetMember.role)) {
      setConfirmDialogConfig({ isOpen: true, title: "追放不可", message: "自分と同等以上の階級のメンバーを追放することはできません。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      return;
    }

    setConfirmDialogConfig({
      isOpen: true,
      title: "追放確認",
      message: `「${targetName}」を追放しますか？`,
      confirmText: "追放する",
      cancelText: "キャンセル",
      isDanger: true,
      presentation: "canonical",
      onConfirm: async () => {
        if (!beginPrivilegedOperation("kick", targetUserId)) return;
        setConfirmDialogConfig(null);
        playCyberSe("click");
        try {
          const { error } = await supabase.rpc("kick_guild_member", {
            p_guild_id: userGuild.id,
            p_user_id: targetUserId
          });
          if (error) throw error;
          await syncBootstrapData(session.user.id);
          setConfirmDialogConfig({ isOpen: true, title: "追放完了", message: `「${targetName}」を追放しました。`, confirmText: "OK", cancelText: "", presentation: "canonical", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
        } catch (err: any) {
          console.warn(err.message);
        } finally {
          endPrivilegedOperation();
        }
      },
      onCancel: () => setConfirmDialogConfig(null)
    });
  };

  const handleDonateToGuild = async (_amount: number = GUILD_PRODUCTION.donation.cashCost) => {
    if (!session || !userGuild || !userGuildMember) return;
    const amount = GUILD_PRODUCTION.donation.cashCost;
    if (cash < amount) {
      setConfirmDialogConfig({ isOpen: true, title: "キャッシュ不足", message: "所持キャッシュが不足しています。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      return;
    }

    setGvgResetLoading(true);
    playCyberSe("click");

    try {
      const { data: rpcRes, error: gErr } = await supabase.rpc("donate_to_guild", {
        p_user_id: session.user.id,
        p_guild_id: userGuild.id,
        p_amount: amount
      });

      if (gErr) throw gErr;

      const nextCash = rpcRes?.next_cash ?? (cash - amount);
      setCash(nextCash);

      setConfirmDialogConfig({ isOpen: true, title: "献金完了", message: `ギルドに ${amount.toLocaleString()} キャッシュを献金しました！\n(ギルド資金 +${amount.toLocaleString()} / ギルドXP +${GUILD_PRODUCTION.donation.guildExp})`, onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (e: any) {
      console.warn("Donation failed:", e.message);
      setConfirmDialogConfig({ isOpen: true, title: "献金失敗", message: "献金に失敗しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handleBuyGuildDecoration = async (itemId: string, cost: number, type: "DECORATION" | "BANNER") => {
    if (!session || !userGuild || !userGuildMember) return;
    if (!["MASTER", "SUB_MASTER", "SUBMASTER"].includes(userGuildMember.role)) {
      setConfirmDialogConfig({ isOpen: true, title: "権限エラー", message: "装飾アイテムの購入はマスターまたはサブマスターのみ可能です。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      return;
    }
    if (Number(userGuild.funds || 0) < cost) {
      setConfirmDialogConfig({ isOpen: true, title: "資金不足", message: "ギルド資金が不足しています。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      return;
    }

    setGvgResetLoading(true);
    playCyberSe("click");

    try {
      const field = type === "DECORATION" ? "unlocked_decorations" : "unlocked_banners";
      const currentList = Array.isArray(userGuild[field]) ? userGuild[field] : [];
      if (currentList.includes(itemId)) {
        setConfirmDialogConfig({ isOpen: true, title: "購入済み", message: "このアイテムは既に購入済みです。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
        setGvgResetLoading(false);
        return;
      }

      const res = await supabase.rpc("buy_guild_decoration_v2", {
        p_guild_id: userGuild.id,
        p_type: type,
        p_item_id: itemId,
        p_cost: cost
      });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "購入完了", message: "装飾アイテムを購入しました！", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (e: any) {
      console.warn("Buy decoration failed:", e.message);
      setConfirmDialogConfig({ isOpen: true, title: "購入失敗", message: "購入に失敗しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handleEquipGuildDecoration = async (type: "DECORATION" | "BANNER", itemId: string | null) => {
    if (!session || !userGuild || !userGuildMember) return;
    if (userGuildMember.role !== "MASTER") {
      setConfirmDialogConfig({ isOpen: true, title: "権限エラー", message: "装飾の変更はマスターまたはサブマスターのみ可能です。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      return;
    }

    setGvgResetLoading(true);
    playCyberSe("click");

    try {
      const field = type === "DECORATION" ? "equipped_decoration" : "equipped_banner";
      const unlockField = type === "DECORATION" ? "unlocked_decorations" : "unlocked_banners";
      const currentList = Array.isArray(userGuild[unlockField]) ? userGuild[unlockField] : [];

      if (itemId !== null && !currentList.includes(itemId)) {
        setConfirmDialogConfig({ isOpen: true, title: "未解放", message: "このアイテムは未解放です。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
        setGvgResetLoading(false);
        return;
      }

      const { error } = await supabase.rpc("equip_guild_decoration", {
        p_guild_id: userGuild.id,
        p_type: type,
        p_item_id: itemId
      });

      if (error) throw error;

      if (itemId !== null) {
        const { error: syncError } = await supabase.rpc("sync_legacy_guild_cosmetics", { p_guild_id: userGuild.id });
        if (syncError && syncError.code !== "PGRST202") throw syncError;
        const { error: cosmeticError } = await supabase.rpc("equip_guild_cosmetic", {
          p_guild_id: userGuild.id,
          p_slot: type === "DECORATION" ? "GUILD_BASE_BACKGROUND" : "GUILD_BANNER",
          p_cosmetic_id: itemId
        });
        if (cosmeticError && cosmeticError.code !== "PGRST202") throw cosmeticError;
      }

      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "装飾適用", message: "ギルド装飾を適用しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (e: any) {
      console.warn("Equip decoration failed:", e.message);
      setConfirmDialogConfig({ isOpen: true, title: "適用失敗", message: "装飾の適用に失敗しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } finally {
      setGvgResetLoading(false);
    }
  };

  return {
    userGuild, setUserGuild,
    userGuildMember, setUserGuildMember,
    guildMembersList, setGuildMembersList,
    newGuildName, setNewGuildName,
    allGuildsDbList, setAllGuildsDbList,
    guildSubTab, setGuildSubTab,
    guildLevelMaster, setGuildLevelMaster,
    guildXpActionMaster, setGuildXpActionMaster,
    updatingAlignment, setUpdatingAlignment,
    pendingGuildJoinRequests, setPendingGuildJoinRequests,
    guildJoinRequests, setGuildJoinRequests,
    guildPrivilegedOperation,
    getGuildPenaltyState,
    handleCreateGuild,
    handleUpdateGuildAlignment,
    handleUpdateGuildSettings,
    handleLeaveGuild,
    handleDemoJoinGuild,
    handleSearchGuilds,
    handleCancelGuildJoinRequest,
    handleReviewGuildJoinRequest,
    handleUpdateMemberRole,
    handleKickMember,
    handleDonateToGuild,
    handleBuyGuildDecoration,
    handleEquipGuildDecoration
  };
}

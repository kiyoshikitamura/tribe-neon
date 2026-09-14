"use client";

import SeasonHonors from "./profile/SeasonHonors";
import React, { useEffect, useState } from "react";
import { useGame } from "../context/GameContext";
import "./GuildTab.css";
import OutlawCard from "./ui/OutlawCard";
import OutlawButton from "./ui/OutlawButton";
import EditableSettingSection, { ChoiceGroup } from "./ui/EditableSettingSection";
import UserIdentityRow from "./profile/UserIdentityRow";
import { GuildEmblem, refreshGuildEmblem } from "./profile/GuildIdentity";
import GuildEmblemEditor from "./guild/GuildEmblemEditor";
import { supabase } from "@/utils/supabase";
import { GUILD_PRODUCTION, guildMemberCap, guildRecruitmentMode, type GuildRecruitmentMode } from "@/domain/gameplay/canonical/guild_production";

function guildRoleLabel(role?: string | null): string {
  if (role === "MASTER") return "ギルドマスター";
  if (role === "SUBMASTER" || role === "SUB_MASTER") return "副団長";
  return "メンバー";
}

const guildAlignmentLabel = (value?: string | null) => ({
  JUSTICE: "正義", EVIL: "悪", ORDER: "秩序", CHAOS: "混沌",
}[String(value || "").toUpperCase()] || "未設定");

const recruitmentModeLabel = (mode: GuildRecruitmentMode) => ({
  OPEN_JOIN: "即時加入",
  APPLICATION_REQUIRED: "加入申請・承認制",
  CLOSED: "募集停止",
}[mode]);

const recruitmentModeOptions = [
  { value: "OPEN_JOIN", label: "即時加入" },
  { value: "APPLICATION_REQUIRED", label: "加入申請・承認制" },
  { value: "CLOSED", label: "募集停止" },
] satisfies { value: GuildRecruitmentMode; label: string }[];

const alignmentOptions = [
  { value: "JUSTICE", label: "正義" },
  { value: "EVIL", label: "悪" },
  { value: "ORDER", label: "秩序" },
  { value: "CHAOS", label: "混沌" },
];

export default function GuildTab() {
  const {
    session,
    onboardingState,
    userLevel,
    userGuild,
    setUserGuild,
    userGuildMember,
    cash,
    newGuildName,
    setNewGuildName,
    handleCreateGuild,
    allGuildsDbList,
    handleDemoJoinGuild,
    handleSearchGuilds,
    pendingGuildJoinRequests,
    handleCancelGuildJoinRequest,
    guildJoinRequests,
    handleReviewGuildJoinRequest,
    guildSubTab,
    setGuildSubTab,
    guildMembersList,
    handleUpdateMemberRole,
    handleKickMember,
    guildPrivilegedOperation,
    handleLeaveGuild,
    handleUpdateGuildAlignment,
    handleUpdateGuildSettings,
    gvgResetLoading,
    playCyberSe,
    guildLevelMaster,
    fetchGuildDetail,
    setShowTribeChatPanel,
    setChatChannel,
    fetchPlayerDetail,
  } = useGame();

  // ページへの接触のみを記録する。加入・参加実績の代わりにはしない。
  useEffect(() => {
    if (!session?.user?.id || !onboardingState?.gameplay_authorized) return;
    void supabase.rpc("record_post_tutorial_guild_view").then(({ error }) => {
      if (error) console.warn("Guild guide contact could not be recorded", error);
    });
  }, [session?.user?.id, onboardingState?.gameplay_authorized]);

  const [guildSearchQuery, setGuildSearchQuery] = useState("");
  const [emblemEditorOpen, setEmblemEditorOpen] = useState(false);
  const [guildDescriptionDraft, setGuildDescriptionDraft] = useState(userGuild?.description || "");
  const [recruitmentModeDraft, setRecruitmentModeDraft] = useState<GuildRecruitmentMode>(guildRecruitmentMode(userGuild?.recruitment_mode, Boolean(userGuild?.approval_required)));
  const [welcomeDraft, setWelcomeDraft] = useState(userGuild?.welcome_message || "");
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [welcomeFeedback, setWelcomeFeedback] = useState("");
  const [editingGuildSettings, setEditingGuildSettings] = useState(false);
  const [savingGuildSettings, setSavingGuildSettings] = useState(false);
  const [editingAttributes, setEditingAttributes] = useState(false);
  const [savingAttributes, setSavingAttributes] = useState(false);
  const [recommendedGuilds, setRecommendedGuilds] = useState<any[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeMembers7d, setActiveMembers7d] = useState<number | null>(null);
  const [mainAlignmentDraft, setMainAlignmentDraft] = useState(userGuild?.main_alignment || "JUSTICE");
  const [subAlignmentDraft, setSubAlignmentDraft] = useState(userGuild?.sub_alignment || "ORDER");
  useEffect(() => {
    if (userGuild) return;
    setRecommendationsLoading(true);
    void (async () => {
      try {
        const [{ data }, { data: publicGuilds }] = await Promise.all([
          supabase.rpc("get_recommended_guilds", { p_limit: 5 }),
          supabase.rpc("search_guilds", { p_query: "" }),
        ]);
        if (Array.isArray(data)) {
          const publicById = new Map<string, any>((publicGuilds || []).map((guild: any) => [guild.id, guild]));
          setRecommendedGuilds(data.map((guild: any) => ({ ...guild, ...publicById.get(guild.guild_id), guild_id: guild.guild_id })));
        }
      } finally {
        setRecommendationsLoading(false);
      }
    })();
  }, [userGuild?.id]);
  useEffect(() => {
    setGuildDescriptionDraft(userGuild?.description || "");
    setRecruitmentModeDraft(guildRecruitmentMode(userGuild?.recruitment_mode, Boolean(userGuild?.approval_required)));
  }, [userGuild?.id, userGuild?.description, userGuild?.approval_required, userGuild?.recruitment_mode]);
  useEffect(() => {
    setWelcomeDraft(userGuild?.welcome_message || "");
  }, [userGuild?.id, userGuild?.welcome_message]);
  useEffect(() => {
    setMainAlignmentDraft(["JUSTICE", "EVIL", "ORDER", "CHAOS"].includes(userGuild?.main_alignment) ? userGuild.main_alignment : "JUSTICE");
    setSubAlignmentDraft(["JUSTICE", "EVIL", "ORDER", "CHAOS"].includes(userGuild?.sub_alignment) ? userGuild.sub_alignment : "ORDER");
  }, [userGuild?.id, userGuild?.main_alignment, userGuild?.sub_alignment]);
  useEffect(() => {
    if (!userGuild?.id) {
      setActiveMembers7d(null);
      return;
    }
    void supabase.rpc("get_public_guild_detail", { p_guild_id: userGuild.id }).then(({ data }) => {
      setActiveMembers7d(typeof data?.active_members_7d === "number" ? data.active_members_7d : null);
    });
  }, [userGuild?.id]);
  const isMaster = userGuildMember?.role === "MASTER";
  const isSubMaster = userGuildMember?.role === "SUBMASTER" || userGuildMember?.role === "SUB_MASTER";
  const settingsMutationPending = savingWelcome || savingGuildSettings || savingAttributes;
  const saveWelcomeMessage = async () => {
    if ((!isMaster && !isSubMaster) || savingWelcome) return;
    setSavingWelcome(true);
    setWelcomeFeedback("");
    try {
      const { data, error } = await supabase.rpc("set_current_guild_welcome_message", {
        p_message: welcomeDraft,
      });
      if (error) throw error;
      const welcomeMessage = data?.welcome_message || "";
      setUserGuild((current: any) => current ? { ...current, welcome_message: welcomeMessage } : current);
      setWelcomeDraft(welcomeMessage);
      setEditingWelcome(false);
      setWelcomeFeedback("保存しました。");
      playCyberSe("click");
    } catch (error) {
      console.warn("Failed to update guild welcome message:", error);
      setWelcomeFeedback("保存できませんでした。もう一度お試しください。");
    } finally {
      setSavingWelcome(false);
    }
  };

  // 外枠ベゼルCSSクラスの取得
  const getLevelBorderClass = (level: number) => {
    if (level >= 30) return "pulsing-gold-border";
    if (level >= 16) return "gold-border";
    if (level >= 6) return "silver-border";
    return "bronze-border";
  };

  const borderClass = userGuild ? getLevelBorderClass(userGuild.level) : "";
  const decorationClass = userGuild?.equipped_decoration === "bg_neon_kabukicho"
    ? "guild-decoration-neon-kabukicho"
    : userGuild?.equipped_decoration === "bg_industrial_docks"
      ? "guild-decoration-industrial-docks"
      : "";
  const bannerClass = userGuild?.equipped_banner === "banner_neon_reign"
    ? "guild-banner-neon-reign"
    : userGuild?.equipped_banner === "banner_kabukicho_king"
      ? "guild-banner-kabukicho-king"
      : "";

  const runGuildSearch = async () => {
    if (searchLoading) return;
    setSearchLoading(true);
    try {
      await handleSearchGuilds(guildSearchQuery);
      setHasSearched(Boolean(guildSearchQuery.trim()));
    } finally {
      setSearchLoading(false);
    }
  };

  const saveGuildSettings = async () => {
    if (savingGuildSettings) return;
    setSavingGuildSettings(true);
    try {
      const saved = await handleUpdateGuildSettings(guildDescriptionDraft, recruitmentModeDraft);
      if (saved) setEditingGuildSettings(false);
    } finally {
      setSavingGuildSettings(false);
    }
  };

  const saveGuildAttributes = async () => {
    if (savingAttributes) return;
    setSavingAttributes(true);
    try {
      const saved = await handleUpdateGuildAlignment(mainAlignmentDraft, subAlignmentDraft);
      if (saved) setEditingAttributes(false);
    } finally {
      setSavingAttributes(false);
    }
  };

  if (!userGuild) {
    const joinUnlocked = userLevel >= 3;
    const createUnlocked = userLevel >= GUILD_PRODUCTION.creation.userLevel
      && cash >= GUILD_PRODUCTION.creation.cashCost;
    const renderGuildCard = (g: any) => {
      const guild = { ...g, id: g.id || g.guild_id };
      const pendingRequest = pendingGuildJoinRequests.find((request: any) => request.guild_id === guild.id);
      const hasOtherPendingRequest = pendingGuildJoinRequests.length > 0 && !pendingRequest;
      const isFull = Number(guild.member_count || 0) >= Number(guild.member_limit || 10);
      const recruitmentMode = guildRecruitmentMode(guild.recruitment_mode, guild.approval_required);
      return (
        <div key={guild.id} className="guild-lobby-guild-card">
          <GuildEmblem guildId={guild.id} legacySrc={guild.emblem_url || guild.logo_icon} size="l" />
          <button className="guild-lobby-guild-info guild-detail-trigger" onClick={() => void fetchGuildDetail(guild.id)}>
            <strong>{guild.name}</strong>
            <span>Lv.{guild.level} ・ {guild.member_count || 0}/{guild.member_limit || guildMemberCap(Number(guild.level || 1))}名 ・ {isFull ? "満員" : "空きあり"} ・ {recruitmentMode === "OPEN_JOIN" ? "自由加入" : recruitmentMode === "APPLICATION_REQUIRED" ? "承認制" : "募集停止"}</span>
            <span className="guild-attribute-line">メイン属性 {guildAlignmentLabel(guild.main_alignment)} ・ サブ属性 {guildAlignmentLabel(guild.sub_alignment)}</span>
            <span className="guild-activity-line">直近7日アクティブ {guild.active_members_7d ?? "-"}人 ・ レイド貢献 {Number(guild.raid_contribution_7d || 0).toLocaleString()} ・ 総合力 {Number(guild.guild_power || 0).toLocaleString()}</span>
            <small>詳細を見る ›</small>
          </button>
          {pendingRequest ? (
            <OutlawButton variant="secondary" className="font-size-8 px-3" disabled={gvgResetLoading} loadingLabel="取消中…" onClick={() => handleCancelGuildJoinRequest(pendingRequest.id)}>
              申請中（取消）
            </OutlawButton>
          ) : (
            <OutlawButton
              variant={joinUnlocked && !isFull && !hasOtherPendingRequest ? "primary" : "secondary"}
              className="font-size-8 px-3"
              disabled={!joinUnlocked || isFull || hasOtherPendingRequest || recruitmentMode === "CLOSED" || gvgResetLoading}
              onClick={() => handleDemoJoinGuild(guild.id, guild.name, recruitmentMode === "APPLICATION_REQUIRED")}
            >
              {!joinUnlocked ? "利用不可" : isFull ? "満員" : hasOtherPendingRequest ? "他へ申請中" : recruitmentMode === "CLOSED" ? "募集停止" : recruitmentMode === "APPLICATION_REQUIRED" ? "加入申請" : "加入する"}
            </OutlawButton>
          )}
        </div>
      );
    };
    return (
      <div className="view-container guild-lobby-view">
        <h1 className="sr-only">ギルド</h1>
        <div className="scroll-container flex-1 guild-lobby-scroll">
          <details className={`guild-lobby-create ${createUnlocked ? "is-ready" : ""}`}>
            <summary>ギルドを設立する <small>Lv.{GUILD_PRODUCTION.creation.userLevel} / {GUILD_PRODUCTION.creation.cashCost.toLocaleString()}キャッシュ</small></summary>
            <div className="guild-create-form">
              <input
                type="text"
                placeholder="ギルド名を入力 (12文字)"
                value={newGuildName}
                onChange={(e) => setNewGuildName(e.target.value)}
                maxLength={GUILD_PRODUCTION.creation.nameMax}
                disabled={cash < GUILD_PRODUCTION.creation.cashCost || userLevel < GUILD_PRODUCTION.creation.userLevel}
                className="guild-create-input bg-black-60 border-subtle text-white p-2 rounded outline-none"
              />
              <OutlawButton
                variant={createUnlocked ? "primary" : "secondary"}
                onClick={handleCreateGuild}
                disabled={gvgResetLoading || cash < GUILD_PRODUCTION.creation.cashCost || !newGuildName.trim() || userLevel < GUILD_PRODUCTION.creation.userLevel}
              >
                {gvgResetLoading ? <div className="spinner" /> : userLevel < GUILD_PRODUCTION.creation.userLevel ? `Lv.${GUILD_PRODUCTION.creation.userLevel}で解放` : cash < GUILD_PRODUCTION.creation.cashCost ? "資金不足" : "創設する"}
              </OutlawButton>
            </div>
          </details>

          <section className="guild-lobby-section">
            <div className="guild-lobby-section-heading"><span>おすすめギルド</span><small>{recommendedGuilds.length}件</small></div>
            <div className="guild-lobby-list">
              {recommendationsLoading && <div className="guild-lobby-empty" role="status"><strong>おすすめを取得中</strong></div>}
              {recommendedGuilds.map(renderGuildCard)}
              {!recommendationsLoading && recommendedGuilds.length === 0 && (
                <div className="guild-lobby-empty"><strong>おすすめギルドがありません</strong><span>ギルド名から検索できます。</span></div>
              )}
            </div>
          </section>

          <section className="guild-lobby-section guild-lobby-search-section">
            <div className="guild-lobby-section-heading"><span>ギルドを検索</span>{hasSearched && <small>{allGuildsDbList.length}件</small>}</div>
            <div className="guild-search-form mb-3">
              <input
                type="search"
                value={guildSearchQuery}
                onChange={(event) => setGuildSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runGuildSearch();
                }}
                maxLength={30}
                placeholder="ギルド名で検索"
                className="guild-search-input bg-black-60 border-subtle text-white p-2 rounded outline-none"
              />
              <OutlawButton className="guild-search-button" variant="secondary" onClick={() => void runGuildSearch()} disabled={gvgResetLoading || searchLoading}>
                {searchLoading ? "検索中…" : "検索"}
              </OutlawButton>
            </div>
            {hasSearched && <div className="guild-lobby-list guild-search-results">
              {allGuildsDbList.map(renderGuildCard)}
              {allGuildsDbList.length === 0 && (
                <div className="guild-lobby-empty"><strong>参加できるTRIBEが見つかりません</strong><span>検索条件を変えるか、時間をおいてもう一度確認してください。</span></div>
              )}
            </div>}
          </section>

        </div>
      </div>
    );
  }

  // レベルアップ用のXP情報算出
  const currentLvlMaster = guildLevelMaster.find((l: any) => l.level === userGuild.level) || { next_xp: GUILD_PRODUCTION.levels.find((entry) => entry.level === Number(userGuild.level))?.requiredExp ?? 0 };
  const xpNeeded = currentLvlMaster.next_xp;
  const xpPercent = xpNeeded > 0 ? Math.min((userGuild.xp / xpNeeded) * 100, 100) : 100;

  return (
    <div className={`view-container guild-main-container ${borderClass} ${decorationClass}`}>
      {emblemEditorOpen && <GuildEmblemEditor key={userGuild.id} guildId={userGuild.id} onChanged={() => refreshGuildEmblem(userGuild.id)} onClose={() => setEmblemEditorOpen(false)} />}
      {guildSubTab === "home" && <div className="guild-my-page-scroll">
        <section className={`guild-visual-identity ${bannerClass}`} aria-label="ギルド情報">
          <div className="guild-identity-main">
            <GuildEmblem guildId={userGuild.id} legacySrc={userGuild.logo_icon} size="l" />
            <div className="guild-identity-copy">
              <strong>{userGuild.name}</strong>
              <span>Lv.{userGuild.level}　{guildMembersList.length}/{userGuild.member_limit || guildMemberCap(Number(userGuild.level || 1))}人</span>
            </div>
            <small>{guildRoleLabel(userGuildMember?.role)}</small>
          </div>
          {(isMaster || isSubMaster) && <OutlawButton className="guild-emblem-change" onClick={() => setEmblemEditorOpen(true)}>エンブレム変更</OutlawButton>}
          <SeasonHonors ownerId={userGuild.id} scope="GUILD" editable={isMaster} />
          <div className="guild-identity-attributes"><span>メイン属性 <b>{guildAlignmentLabel(userGuild.main_alignment)}</b></span><i>×</i><span>サブ属性 <b>{guildAlignmentLabel(userGuild.sub_alignment)}</b></span></div>
          <div className="guild-level-progress"><span>Lv EXP</span><div className="xp-bar-container"><div className="xp-bar-fill" style={{ width: `${xpPercent}%` }} /></div><small>{xpNeeded > 0 ? `${userGuild.xp} / ${xpNeeded}` : "MAX"}</small></div>
        </section>

        <section className="guild-status-strip" aria-label="ギルド状況">
          <div><small>戦績</small><strong>準備中</strong></div>
          <div><small>直近7日アクティブ</small><strong>{activeMembers7d ?? "-"}人</strong></div>
          <div><small>資金</small><strong>{Number(userGuild.funds || 0).toLocaleString()}</strong></div>
        </section>

        <section className="guild-welcome-compact">
          <strong>ようこそ {userGuild.name} へ</strong>
          <p>{userGuild.welcome_message || "歓迎メッセージは未設定です。"}</p>
        </section>

        <nav className="guild-action-grid" aria-label="ギルド機能">
          <button type="button" onClick={() => { setChatChannel("GUILD"); setShowTribeChatPanel(true); }}><strong>ギルドチャット</strong><span>メンバーと話す</span></button>
          <button type="button" onClick={() => setGuildSubTab("members")}><strong>メンバー</strong><span>{guildMembersList.length}人</span></button>
          <button type="button" className="is-coming-soon" disabled><strong>ギルドバトル</strong><span>準備中</span></button>
          <button type="button" className="is-coming-soon" disabled><strong>資金＆ショップ</strong><span>COMING SOON</span></button>
        </nav>

        {(isMaster || isSubMaster) && <button type="button" className="guild-settings-link" onClick={() => setGuildSubTab("settings")}>ギルド設定</button>}
        <div className="guild-leave-action"><button type="button" onClick={handleLeaveGuild} disabled={gvgResetLoading}>ギルドを脱退</button></div>
      </div>}

      {guildSubTab !== "home" && <div className="guild-secondary-view">
        <div className="guild-secondary-heading"><button type="button" disabled={settingsMutationPending} onClick={() => setGuildSubTab("home")} aria-label="ギルドマイページへ戻る">←</button><strong>{guildSubTab === "members" ? "メンバー" : "ギルド設定"}</strong></div>
        <div className="scroll-container flex-1">
        
        {/* 1. メンバーリスト表示 */}
        {guildSubTab === "members" && (
          <div className="flex-col-gap-3">
            {(isMaster || isSubMaster) && guildJoinRequests.length > 0 && (
              <OutlawCard glowLine="left">
                <div className="font-bold text-neon-cyan mb-2">加入申請</div>
                <div className="flex-col-gap-2">
                  {guildJoinRequests.map((request: any) => (
                    <div key={request.id} className="list-item flex-row-space-between align-center p-2">
                      <div>
                        <strong className="font-size-9 text-white">{request.user?.username || "申請ユーザー"}</strong>
                        <div className="font-size-7 text-secondary">Lv.{request.user?.level || 1}</div>
                      </div>
                      <div className="flex gap-2">
                        <OutlawButton variant="primary" disabled={gvgResetLoading} loadingLabel="承認中…" onClick={() => handleReviewGuildJoinRequest(request.id, true)}>承認</OutlawButton>
                        <OutlawButton variant="danger" disabled={gvgResetLoading} loadingLabel="処理中…" onClick={() => handleReviewGuildJoinRequest(request.id, false)}>却下</OutlawButton>
                      </div>
                    </div>
                  ))}
                </div>
              </OutlawCard>
            )}
            <p className="guild-member-list-note">ギルドマスター、副団長、メンバーの順に表示します。</p>

            <div className="guild-member-list">
              {[...guildMembersList].sort((a: any, b: any) => {
                const order = (role: string) => role === "MASTER" ? 0 : ["SUBMASTER", "SUB_MASTER"].includes(role) ? 1 : 2;
                return order(a.role) - order(b.role);
              }).map((m: any) => {
                const isMe = m.user_id === userGuildMember.user_id;
                const isLoaderPending = m.userLevel === null;
                const managementLocked = Boolean(guildPrivilegedOperation);
                const targetPending = guildPrivilegedOperation?.targetUserId === m.user_id;

                return (
                  <div 
                    key={m.id} 
                    className="guild-member-row"
                  >
                    <UserIdentityRow
                      userName={m.users?.username || "プレイヤー"}
                      guildName={userGuild.name} guildId={userGuild.id}
                      title={isMe ? "あなた" : undefined}
                      leaderCharacterId={m.users?.favorite_character_id}
                      onOpen={!isLoaderPending && !managementLocked ? () => { playCyberSe("click"); void fetchPlayerDetail(m.user_id); } : undefined}
                      variant="compact"
                    />
                    <span className="guild-member-role">{guildRoleLabel(m.role)}</span>
                    {(isMaster || isSubMaster) && !isMe && <div className="guild-member-management">
                      {isMaster && !isMe && (
                        <>
                          <OutlawButton 
                            variant="secondary"
                            className="font-size-7 py-0.5 px-2" 
                            disabled={managementLocked}
                            isLoading={targetPending && guildPrivilegedOperation?.key !== "transfer" && guildPrivilegedOperation?.key !== "kick"}
                            onClick={() => handleUpdateMemberRole(m.user_id, m.users?.username, ["SUBMASTER", "SUB_MASTER"].includes(m.role) ? "MEMBER" : "SUB_MASTER")}
                          >
                            {["SUBMASTER", "SUB_MASTER"].includes(m.role) ? "降格" : "昇格"}
                          </OutlawButton>
                          <OutlawButton
                            variant="secondary"
                            className="font-size-7 py-0.5 px-2"
                            disabled={managementLocked}
                            isLoading={targetPending && guildPrivilegedOperation?.key === "transfer"}
                            onClick={() => handleUpdateMemberRole(m.user_id, m.users?.username, "MASTER")}
                          >
                            団長を交代
                          </OutlawButton>
                          <OutlawButton 
                            variant="danger"
                            className="font-size-7 py-0.5 px-2" 
                            disabled={managementLocked}
                            isLoading={targetPending && guildPrivilegedOperation?.key === "kick"}
                            onClick={() => handleKickMember(m.user_id, m.users?.username)}
                          >
                            追放
                          </OutlawButton>
                        </>
                      )}
                      {isSubMaster && !isMe && (
                        <>
                          {m.role === "MEMBER" ? (
                            <OutlawButton 
                              variant="danger"
                              className="font-size-7 py-0.5 px-2" 
                              disabled={managementLocked}
                              isLoading={targetPending && guildPrivilegedOperation?.key === "kick"}
                              onClick={() => handleKickMember(m.user_id, m.users?.username)}
                            >
                              追放
                            </OutlawButton>
                          ) : (
                            <span className="font-size-7 text-secondary">権限なし</span>
                          )}
                        </>
                      )}
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. 属性設定表示 */}
        {guildSubTab === "settings" && (
          <div className={`guild-settings-sections ${settingsMutationPending ? "is-mutation-pending" : ""}`}>
            <EditableSettingSection
              title="歓迎メッセージ"
              editing={editingWelcome}
              pending={savingWelcome}
              canEdit={(isMaster || isSubMaster) && !settingsMutationPending}
              onEdit={() => { setWelcomeFeedback(""); setEditingGuildSettings(false); setEditingAttributes(false); setEditingWelcome(true); }}
              summary={<><p>{userGuild.welcome_message || "未設定"}</p>{welcomeFeedback && <span className="editable-setting-feedback" role="status">{welcomeFeedback}</span>}</>}
            >
              <label className="editable-setting-label" htmlFor="guild-welcome-message">新メンバーへの歓迎メッセージ</label>
              <textarea id="guild-welcome-message" value={welcomeDraft} onChange={(event) => setWelcomeDraft(event.target.value)} maxLength={120} rows={3} disabled={savingWelcome} />
              <div className="editable-setting-meta"><span>{welcomeDraft.length}/120</span><span>マイページに1〜2行で表示されます。</span></div>
              <div className="editable-setting-actions"><OutlawButton variant="secondary" disabled={savingWelcome} onClick={() => { setWelcomeDraft(userGuild.welcome_message || ""); setEditingWelcome(false); }}>キャンセル</OutlawButton><OutlawButton variant="primary" isLoading={savingWelcome} loadingLabel="保存中…" disabled={savingWelcome} onClick={saveWelcomeMessage}>保存</OutlawButton></div>
            </EditableSettingSection>

            <EditableSettingSection
              title="加入・公開設定"
              editing={editingGuildSettings}
              pending={savingGuildSettings}
              canEdit={(isMaster || isSubMaster) && !settingsMutationPending}
              onEdit={() => { setEditingWelcome(false); setEditingAttributes(false); setEditingGuildSettings(true); }}
              summary={<dl><dt>ギルド紹介</dt><dd>{userGuild.description || "未設定"}</dd><dt>募集モード</dt><dd>{recruitmentModeLabel(guildRecruitmentMode(userGuild.recruitment_mode, Boolean(userGuild.approval_required)))}</dd></dl>}
            >
              <label className="editable-setting-label" htmlFor="guild-description">ギルド紹介</label>
              <textarea id="guild-description" value={guildDescriptionDraft} onChange={(event) => setGuildDescriptionDraft(event.target.value)} maxLength={200} disabled={savingGuildSettings} placeholder="ギルド紹介（200文字以内）" />
              <div className="editable-setting-meta"><span>{guildDescriptionDraft.length}/200</span></div>
              <ChoiceGroup label="募集モード" value={recruitmentModeDraft} options={recruitmentModeOptions} disabled={savingGuildSettings} onChange={setRecruitmentModeDraft} />
              <div className="editable-setting-actions"><OutlawButton variant="secondary" disabled={savingGuildSettings} onClick={() => { setGuildDescriptionDraft(userGuild.description || ""); setRecruitmentModeDraft(guildRecruitmentMode(userGuild.recruitment_mode, Boolean(userGuild.approval_required))); setEditingGuildSettings(false); }}>キャンセル</OutlawButton><OutlawButton variant="primary" isLoading={savingGuildSettings} loadingLabel="保存中…" disabled={savingGuildSettings} onClick={saveGuildSettings}>設定を保存</OutlawButton></div>
            </EditableSettingSection>

            <EditableSettingSection
              title="ギルド属性"
              helper="GvGでのみ有効"
              editing={editingAttributes}
              pending={savingAttributes}
              canEdit={(isMaster || isSubMaster) && !settingsMutationPending}
              onEdit={() => { setEditingWelcome(false); setEditingGuildSettings(false); setEditingAttributes(true); }}
              summary={<dl><dt>メイン属性</dt><dd>{guildAlignmentLabel(userGuild.main_alignment)}</dd><dt>サブ属性</dt><dd>{guildAlignmentLabel(userGuild.sub_alignment)}</dd></dl>}
            >
              <ChoiceGroup label="メイン属性" value={mainAlignmentDraft} options={alignmentOptions} disabled={savingAttributes} onChange={setMainAlignmentDraft} />
              <ChoiceGroup label="サブ属性" value={subAlignmentDraft} options={alignmentOptions} disabled={savingAttributes} onChange={setSubAlignmentDraft} />
              <div className="editable-setting-actions"><OutlawButton variant="secondary" disabled={savingAttributes} onClick={() => { setMainAlignmentDraft(["JUSTICE", "EVIL", "ORDER", "CHAOS"].includes(userGuild.main_alignment) ? userGuild.main_alignment : "JUSTICE"); setSubAlignmentDraft(["JUSTICE", "EVIL", "ORDER", "CHAOS"].includes(userGuild.sub_alignment) ? userGuild.sub_alignment : "ORDER"); setEditingAttributes(false); }}>キャンセル</OutlawButton><OutlawButton variant="primary" isLoading={savingAttributes} loadingLabel="保存中…" disabled={savingAttributes} onClick={saveGuildAttributes}>属性を保存</OutlawButton></div>
            </EditableSettingSection>
          </div>
        )}

        </div>
      </div>}

    </div>
  );
}

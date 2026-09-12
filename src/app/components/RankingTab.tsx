"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../context/GameContext";
import { supabase } from "../../utils/supabase";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import HubPage from "./ui/HubPage";
import SubTabNav from "./ui/SubTabNav";
import OutlawButton from "./ui/OutlawButton";
import CharacterPresentation from "./character/CharacterPresentation";
import UserIdentityRow from "./profile/UserIdentityRow";
import RankPresentation from "./presentation/RankPresentation";
import StatusMetric from "./presentation/StatusMetric";
import { useScreenReadiness } from "../hooks/useScreenReadiness";
import { SCREEN_ASSET_MANIFESTS } from "../lib/screenManifests";
import { loadRankingProfiles } from "@/domain/ranking/loadRankingProfiles";
import { rankingPeriodText } from "@/domain/ranking/rankingPeriodPresentation";
import RankingRewardDialog from "./ranking/RankingRewardDialog";
import type { RankingRewardMasterPayload } from "@/domain/ranking/rankingRewardPresentation";
import {
  isPreopenGuildPowerSeasonContext,
  normalizeGuildRankingPayload,
  type GuildSeasonMetadata,
} from "@/domain/ranking/preopenGuildPowerSeason";
import "./ranking/RankingRewardButton.css";
import "./RankingTab.css";

type RankingCategory = "power" | "guild_power" | "pvp";
type RankingPeriod = "daily" | "season";

type PublicProfile = {
  user_id: string;
  username?: string | null;
  guild_id?: string | null;
  guild_name?: string | null;
  favorite_character_id?: string | null;
  main_formation_character_ids?: string[] | null;
};

const RANKING_TABS = [
  { id: "power", label: "総合力" },
  { id: "guild_power", label: "ギルド" },
  { id: "pvp", label: "バトル" },
] as const;

const PERIOD_TABS = [
  { id: "daily", label: "デイリー" },
  { id: "season", label: "シーズン" },
] as const;

const validRank = (value: unknown) => {
  const rank = Number(value);
  return Number.isInteger(rank) && rank > 0 ? rank : null;
};

function formatJstTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function RankingDeck({ characterIds = [] }: { characterIds?: string[] | null }) {
  const canonicalIds = (characterIds || []).filter(Boolean).slice(0, 5);
  if (canonicalIds.length === 0) return null;
  return (
    <div className="ranking-deck" aria-label={`公開デッキ ${canonicalIds.length}人`}>
      {canonicalIds.map((characterId, index) => {
        const master = CHARACTERS_MASTER.find((entry) => entry.id === characterId);
        return (
          <CharacterPresentation
            key={`${characterId}-${index}`}
            src={master ? getCharacterTransparentImg(master.name) : undefined}
            alt={master?.jpName || "公開キャラクター"}
            variant="icon"
            rarity={master?.rarity}
            frameKind="character"
            metadata={false}
          />
        );
      })}
    </div>
  );
}

export default function RankingTab() {
  const {
    session,
    currentUser,
    userGuild,
    userGuildMember,
    playCyberSe,
    fetchPlayerDetail,
    fetchGuildDetail,
    rankingActiveTab,
    setRankingActiveTab,
    setActiveTab,
    isRaidActive,
  } = useGame();

  const activeTab: RankingCategory = RANKING_TABS.some((tab) => tab.id === rankingActiveTab)
    ? rankingActiveTab as RankingCategory
    : "power";
  const [activePeriod, setActivePeriod] = useState<RankingPeriod>("season");
  const [rows, setRows] = useState<any[]>([]);
  const [guildRows, setGuildRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  const [currentIdentity, setCurrentIdentity] = useState<{ userId: string; profile: PublicProfile } | null>(null);
  const [selfRank, setSelfRank] = useState<any | null>(null);
  const [guildSeason, setGuildSeason] = useState<GuildSeasonMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [listView, setListView] = useState<"top" | "nearby">("top");
  const [neighbors, setNeighbors] = useState<any[]>([]);
  const [contextError, setContextError] = useState(false);
  const [periodBounds, setPeriodBounds] = useState<{ starts_at?: string; ends_at?: string; status?: string } | null>(null);
  const [rewardDialogOpen, setRewardDialogOpen] = useState(false);
  const [rewardMaster, setRewardMaster] = useState<RankingRewardMasterPayload | undefined>(undefined);
  const [rewardMasterLoading, setRewardMasterLoading] = useState(false);
  const [rewardMasterLoaded, setRewardMasterLoaded] = useState(false);
  const [rewardMasterError, setRewardMasterError] = useState<string | null>(null);
  const [activationMilestones, setActivationMilestones] = useState<Set<string>>(new Set());
  const rankingMilestoneStarted = useRef(false);
  const requestVersion = useRef(0);
  const readiness = useScreenReadiness({ assets: SCREEN_ASSET_MANIFESTS.ranking, dataReady: !loading });

  const loadRanking = useCallback(async () => {
    const requestId = ++requestVersion.current;
    setLoading(true);
    setError(false);
    setRows([]);
    setGuildRows([]);
    setProfiles({});
    setSelfRank(null);
    setGuildSeason(null);
    setNeighbors([]);
    setUpdatedAt(null);
    setPeriodBounds(null);
    setContextError(false);
    if (rankingActiveTab === "raid") { setLoading(false); return; }

    try {
      let nextRows: any[] = [];
      let nextGuildRows: any[] = [];
      let nextSelfRank: any | null = null;
      let nextGuildSeason: GuildSeasonMetadata | null = null;

      if (activeTab === "power") {
        const { data, error: rpcError } = await supabase.rpc("get_public_power_rankings", { p_daily: activePeriod === "daily", p_limit: 100, p_offset: 0 });
        if (rpcError) throw rpcError;
        nextRows = Array.isArray(data) ? data : [];
      } else if (activeTab === "guild_power") {
        let { data, error: rpcError } = activePeriod === "season"
          ? await supabase.rpc("get_preopen_guild_power_ranking", { p_limit: 100, p_offset: 0 })
          : await supabase.rpc("get_public_guild_power_rankings", { p_daily: true, p_limit: 100, p_offset: 0 });
        if (activePeriod === "season" && ((!rpcError && data == null) || (rpcError && ["42883", "PGRST202"].includes(String((rpcError as any).code || ""))))) {
          ({ data, error: rpcError } = await supabase.rpc("get_public_guild_power_rankings", { p_daily: false, p_limit: 100, p_offset: 0 }));
        }
        if (rpcError) throw rpcError;
        let normalized = normalizeGuildRankingPayload(data);
        if (activePeriod === "season" && normalized.season && !isPreopenGuildPowerSeasonContext(normalized.season)) {
          const fallback = await supabase.rpc("get_public_guild_power_rankings", { p_daily: false, p_limit: 100, p_offset: 0 });
          if (fallback.error) throw fallback.error;
          normalized = normalizeGuildRankingPayload(fallback.data);
        }
        nextGuildRows = normalized.rows;
        nextSelfRank = normalized.selfRank;
        nextGuildSeason = activePeriod === "season" ? normalized.season : null;
      } else if (activeTab === "pvp") {
        const { data, error: rpcError } = await supabase.rpc("get_public_pvp_rankings", { p_daily: activePeriod === "daily", p_limit: 100, p_offset: 0 });
        if (rpcError) throw rpcError;
        nextRows = Array.isArray(data) ? data : [];
      }

      let nextNeighbors: any[] = [];
      let nextContextError = false;
      let nextBounds: { starts_at?: string; ends_at?: string; status?: string } | null = null;
      if (activeTab === "guild_power" && isPreopenGuildPowerSeasonContext(nextGuildSeason)) {
        if (nextSelfRank) {
          const offset = Math.max(0, Number(nextSelfRank.rank_position ?? nextSelfRank.rank) - 3);
          const nearby = await supabase.rpc("get_preopen_guild_power_ranking", { p_limit: 5, p_offset: offset });
          if (nearby.error) nextContextError = true;
          else nextNeighbors = normalizeGuildRankingPayload(nearby.data).rows;
        }
      } else {
        // Separate read contract: missing API does not fabricate a rank/score.
        const context = await supabase.rpc("get_ranking_self_context", { p_category: activeTab, p_daily: activePeriod === "daily" });
        if (context.error || !context.data || !Array.isArray(context.data.neighbors)) nextContextError = true;
        else {
          nextSelfRank = context.data.self;
          nextNeighbors = context.data.neighbors;
          nextBounds = context.data;
        }
        if (activePeriod === "season") {
          const seasons = await supabase.rpc("get_active_ranking_seasons");
          const rankingType = activeTab === "power" ? "POWER" : activeTab === "guild_power" ? "GUILD_POWER" : "PVP";
          if (!seasons.error && Array.isArray(seasons.data)) {
            nextBounds = seasons.data.find((season: any) => season.ranking_type === rankingType) || nextBounds;
          }
        }
      }

      const publicUserIds = [...new Set([...[...nextRows, ...nextNeighbors].map((row) => row.user_id).filter(Boolean), session?.user?.id].filter(Boolean))] as string[];
      const nextProfiles = await loadRankingProfiles<PublicProfile>(publicUserIds, async (ids) => {
        const result = await supabase.rpc("get_public_profiles", { p_user_ids: ids });
        if (result.error) throw result.error;
        if (!Array.isArray(result.data)) throw new Error("Invalid public profile response");
        return result.data;
      });

      if (requestId !== requestVersion.current) return;
      setRows(nextRows);
      setGuildRows(nextGuildRows);
      setProfiles(nextProfiles);
      setSelfRank(nextSelfRank);
      setGuildSeason(nextGuildSeason);
      setNeighbors(nextNeighbors);
      setContextError(nextContextError);
      setPeriodBounds(nextBounds);
      setUpdatedAt(new Date().toISOString());
    } catch {
      if (requestId === requestVersion.current) setError(true);
    } finally {
      if (requestId === requestVersion.current) setLoading(false);
    }
  }, [activePeriod, activeTab, rankingActiveTab, session]);

  useEffect(() => {
    if (rankingActiveTab === "raid") {
      setRankingActiveTab("power");
      setActiveTab("raid");
    }
  }, [rankingActiveTab, setRankingActiveTab, setActiveTab]);
  useEffect(() => { void loadRanking(); }, [loadRanking]);
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    void supabase.rpc("get_public_profiles", { p_user_ids: [userId] }).then(({ data, error: profileError }) => {
      if (cancelled || profileError) return;
      const profile = Array.isArray(data) ? data.find((entry: PublicProfile) => entry.user_id === userId) : null;
      if (profile) setCurrentIdentity({ userId, profile });
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);
  useEffect(() => {
    // A tap/open is not a successful ranking view. Record the milestone only
    // after the active ranking request (including public profiles) completed.
    if (!session?.user?.id || loading || error || rankingMilestoneStarted.current) return;
    rankingMilestoneStarted.current = true;
    void supabase.from("user_funnel_milestones").select("milestone").eq("user_id", session.user.id)
      .then(async ({ data }) => {
        const milestones = new Set<string>((data || []).map((row: any) => row.milestone));
        if (!milestones.has("ranking_viewed")) {
          const { error: recordError } = await supabase.rpc("record_client_funnel_event", {
            p_event_name: "ranking_viewed", p_source_screen: "ranking", p_source_cta: "screen_view", p_object_id: null, p_metadata: {},
          });
          if (!recordError) milestones.add("ranking_viewed");
        }
        setActivationMilestones(milestones);
      });
  }, [error, loading, session?.user?.id]);

  const currentUserId = session?.user?.id;
  const currentGuildId = userGuildMember?.guild_id || userGuild?.id || currentUser?.guild_members?.[0]?.guild_id;
  const currentRow = (activeTab !== "guild_power" ? selfRank : null) || rows.find((row) => row.user_id === currentUserId);
  const listedGuildRow = guildRows.find((row) => row.guild_id === currentGuildId);
  const currentGuildRow = listedGuildRow || (activeTab === "guild_power" ? selfRank : null);
  const currentIdentityProfile = currentIdentity && currentIdentity.userId === currentUserId ? currentIdentity.profile : null;
  const currentProfile = currentIdentityProfile || (currentUserId ? profiles[currentUserId] : undefined);
  const currentIdentityName = currentProfile?.username || currentUser?.username;
  const currentRank = activeTab === "guild_power" ? validRank(currentGuildRow?.rank_position ?? currentGuildRow?.rank) : validRank(currentRow?.rank_position ?? selfRank?.rank_position);
  const scoreOf = (row: any): number | null => {
    if (!row) return null;
    const raw = activeTab === "power" ? row.current_power : activeTab === "guild_power"
      ? activePeriod === "daily" ? row.daily_power : row.current_power ?? row.guild_power ?? row.score
      : activePeriod === "daily" ? row.daily_wins : row.rank_points;
    return raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
  };
  const ownRow = activeTab === "guild_power" ? currentGuildRow : currentRow;
  const ownScore = scoreOf(ownRow);
  const currentMetric = ownScore == null ? "—" : ownScore.toLocaleString();
  const sourceRows = activeTab === "guild_power" ? guildRows : rows;
  const nearbyRows = neighbors.length ? neighbors : sourceRows.filter((row) => currentRank && Math.abs(Number(row.rank_position) - currentRank) <= 2);
  const displayedRows = listView === "top" ? sourceRows : nearbyRows;
  const above = [...nearbyRows].reverse().find((row) => currentRank && Number(row.rank_position) < currentRank);
  const aboveScore = scoreOf(above);
  const gapLabel = currentRank === 1 ? "現在1位" : aboveScore != null && ownScore != null
    ? aboveScore === ownScore ? "直上と同スコア" : `直上との差：${(aboveScore - ownScore).toLocaleString()}${activeTab === "pvp" ? activePeriod === "daily" ? "勝" : " RATE" : ""}`
    : null;
  const ruleLabel = activeTab === "power" ? activePeriod === "daily" ? "本日活動したプレイヤーのメイン編成総合力" : "メイン編成の総合力"
    : activeTab === "guild_power" ? activePeriod === "daily" ? "本日活動したメンバーの総合力合計" : "所属メンバー全員の総合力合計"
      : activePeriod === "daily" ? "本日のバトル勝利数" : "シーズンRATE";
  const bounds = guildSeason || periodBounds;
  const periodText = rankingPeriodText(bounds, {
    preopen: activeTab === "guild_power" && activePeriod === "season" && isPreopenGuildPowerSeasonContext(guildSeason),
    daily: activePeriod === "daily",
    now: Date.now(),
    format: formatJstTimestamp,
  });
  const rankState = loading ? "—" : error ? "取得失敗" : activeTab === "guild_power" && !currentGuildId ? "未所属"
    : currentRank ? null : contextError ? "順位取得不可" : "順位未成立";

  const activeCategoryLabel = RANKING_TABS.find((tab) => tab.id === activeTab)?.label || "総合力";
  const metricLabel = activeTab === "power" ? "総合力" : activeTab === "guild_power" ? "ギルド総合力" : activePeriod === "daily" ? "勝利数" : "RATE";
  const periodLabel = activePeriod === "daily" ? "デイリー" : "シーズン";
  const isGuildSeasonTab = activeTab === "guild_power" && activePeriod === "season";
  const isPreopenGuildSeason = isGuildSeasonTab && isPreopenGuildPowerSeasonContext(guildSeason);
  const guildSeasonFinalized = Boolean(guildSeason?.finalized_at) || ["FINALIZED", "COMPLETED", "CLOSED"].includes(String(guildSeason?.status || "").toUpperCase());
  const serverUpdatedAt = formatJstTimestamp(guildSeason?.updated_at || guildSeason?.finalized_at);
  const updateLabel = isPreopenGuildSeason && serverUpdatedAt
    ? `最終更新 ${serverUpdatedAt}`
    : updatedAt ? `取得 ${formatJstTimestamp(updatedAt)} JST` : "";

  const openPlayer = (userId: string) => { if (userId) { playCyberSe("click"); void fetchPlayerDetail(userId); } };
  const openGuild = (guildId: string) => { if (guildId) { playCyberSe("click"); void fetchGuildDetail(guildId); } };
  const loadRewardMaster = () => {
    if (rewardMasterLoaded || rewardMasterLoading) return;
    setRewardMasterLoading(true);
    setRewardMasterError(null);
    void (async () => {
      try {
        const { data, error: masterError } = await supabase.rpc("get_public_ranking_reward_master");
        if (masterError) {
          console.warn("Failed to load ranking reward master", masterError);
          setRewardMasterError("報酬情報を取得できませんでした");
          return;
        }
        if (data && typeof data === "object" && !Array.isArray(data)) {
          setRewardMaster(data as RankingRewardMasterPayload);
          setRewardMasterLoaded(true);
          return;
        }
        setRewardMasterError("報酬情報を取得できませんでした");
      } finally {
        setRewardMasterLoading(false);
      }
    })();
  };
  const openRewardDialog = () => {
    setRewardDialogOpen(true);
    loadRewardMaster();
  };

  return (
    <HubPage className="ranking-tab-view" title="ランキング" hideVisualHeader status={readiness.status} onRetry={readiness.retry}>
      <div className="ranking-context"><div><small>RANKING</small><strong>{activeCategoryLabel}</strong></div><button type="button" onClick={() => void loadRanking()} disabled={loading}>更新</button></div>
      <SubTabNav className="ranking-category-nav" tabs={[...RANKING_TABS]} activeTabId={activeTab} onSelect={(tabId) => setRankingActiveTab(tabId)} />
      <div className="ranking-period-row"><div role="group" aria-label="集計期間">{PERIOD_TABS.map((period) => <button key={period.id} type="button" className={activePeriod === period.id ? "is-active" : ""} onClick={() => setActivePeriod(period.id)}>{period.label}</button>)}</div><span>{periodLabel}・{updateLabel}</span><button type="button" className="ranking-reward-button" onClick={openRewardDialog}>報酬確認</button></div>

      <div className="ranking-rules"><span>{ruleLabel}</span><span>{periodText}</span></div>

      {isPreopenGuildSeason && <section className={`ranking-guild-season-summary ${guildSeasonFinalized ? "is-finalized" : ""}`} aria-label="プレオープン限定シーズン情報">
        <div><strong>プレオープン限定シーズン</strong><span>{guildSeasonFinalized ? "順位確定" : "集計中"}</span></div>
        <p className="ranking-guild-season-period">{guildSeasonFinalized ? "開催終了" : "プレオープン中開催"}</p>
        <p>ギルドメンバー全員の総合力で順位が決まります。仲間を集めて戦力を強化し、限定ギルド装飾を獲得しよう！</p>
      </section>}

      <section className="ranking-current" aria-label="あなたの現在地">
        <div className="ranking-current-identity">
          {activeTab === "guild_power" ? <div><small>YOUR GUILD</small><strong>{userGuild?.name || "未所属"}</strong></div> : currentIdentityName ? <UserIdentityRow userName={currentIdentityName} guildName={currentProfile?.guild_name || userGuild?.name} leaderCharacterId={currentProfile?.favorite_character_id || currentUser?.favorite_character_id} onOpen={currentUserId ? () => openPlayer(currentUserId) : undefined} variant="compact" /> : <div className="ranking-current-identity-loading" role="status">ユーザー情報を取得中</div>}
        </div>
        <StatusMetric label="順位" value={rankState || <RankPresentation rank={currentRank} />} />
        <StatusMetric label={metricLabel} value={currentMetric} />
      </section>

      {gapLabel && !loading && !error && <p className="ranking-next-target">{gapLabel}</p>}
      <OutlawButton variant="primary" fullWidth className="ranking-category-action" onClick={() => setActiveTab(activeTab === "power" ? "character" : activeTab === "guild_power" ? "guild" : "pvp")}>
        {activeTab === "power" ? "キャラ・編成へ" : activeTab === "guild_power" ? currentGuildId ? "ギルドへ" : "ギルドを探す" : "バトルへ"}
      </OutlawButton>
      {contextError && !loading && !error && <div className="ranking-context-error" role="status">自己・周辺順位の追加情報を取得できませんでした。<button type="button" onClick={() => void loadRanking()}>再試行</button></div>}
      <div className="ranking-list-heading"><div className="ranking-view-toggle" role="group" aria-label="ランキング表示範囲">{(["top", "nearby"] as const).map(view => <button key={view} type="button" aria-pressed={listView === view} onClick={() => setListView(view)}>{view === "top" ? "上位" : "自分周辺"}</button>)}</div><span>{periodLabel}</span></div>
      {error ? <div className="ranking-state" role="alert"><span>ランキングを取得できませんでした</span><button type="button" onClick={() => void loadRanking()}>再試行</button></div>
        : loading ? <div className="ranking-skeleton" aria-label="ランキング取得中">{[0, 1, 2].map((key) => <span key={key} />)}</div>
          : activeTab === "guild_power" ? <div className="ranking-list">{displayedRows.length > 0 ? displayedRows.map((row) => {
            const rank = validRank(row.rank_position);
            return <button type="button" key={row.guild_id} className={`ranking-guild-row ${row.guild_id === currentGuildId ? "is-current" : ""}`} onClick={() => openGuild(row.guild_id)}><span className={`ranking-position is-${rank || "out"}`}><RankPresentation rank={rank} /></span><span className="ranking-guild-identity"><strong>{row.name || row.guild_name || "ギルド"}</strong><small>{Number(row.member_count || row.participant_count || 0)} MEMBERS</small></span><span className="ranking-metric">{Number(activePeriod === "daily" ? row.daily_power : row.current_power ?? row.guild_power ?? row.score ?? row.contribution ?? 0).toLocaleString()}<small>総合力</small></span></button>;
          }) : <div className="ranking-empty">{listView === "nearby" ? contextError ? "周辺順位を取得できませんでした" : currentGuildId || activeTab !== "guild_power" ? "表示できる自己順位がありません" : "ギルドに所属すると確認できます" : "まだランキングデータがありません"}</div>}</div>
            : <div className="ranking-list">{displayedRows.length > 0 ? displayedRows.map((row) => {
              const profile = profiles[row.user_id];
              const rank = validRank(row.rank_position);
              const metric = activeTab === "power" ? Number(row.current_power || 0).toLocaleString() : activePeriod === "daily" ? `${Number(row.daily_wins || 0)}勝` : Number(row.rank_points || 0).toLocaleString();
              return <article key={row.user_id} className={`ranking-user-row ${row.user_id === currentUserId ? "is-current" : ""}`}><span className={`ranking-position is-${rank || "out"}`}><RankPresentation rank={rank} /></span><div className="ranking-user-main"><UserIdentityRow userName={profile?.username || row.username || "プレイヤー"} guildName={profile?.guild_name || row.guild_name} leaderCharacterId={profile?.favorite_character_id} onOpen={() => openPlayer(row.user_id)} variant="compact" /><RankingDeck characterIds={profile?.main_formation_character_ids} /></div><span className="ranking-metric">{metric}<small>{activeTab === "power" ? "総合力" : activePeriod === "daily" ? "WIN" : "RATE"}</small></span></article>;
            }) : <div className="ranking-empty">{listView === "nearby" ? contextError ? "周辺順位を取得できませんでした" : "表示できる自己順位がありません" : "まだランキングデータがありません"}</div>}</div>}

      {activationMilestones.has("first_pvp") && !activationMilestones.has("first_raid") && isRaidActive ? <OutlawButton variant="primary" fullWidth className="ranking-return-cta" onClick={() => setActiveTab("raid")}>次はレイドへ挑戦</OutlawButton>
        : activationMilestones.has("first_pvp") && !userGuildMember ? <OutlawButton variant="primary" fullWidth className="ranking-return-cta" onClick={() => setActiveTab("guild")}>おすすめTRIBEを見る</OutlawButton>
          : activationMilestones.has("first_pvp") && userGuildMember && !activationMilestones.has("guild_activation") ? <OutlawButton variant="primary" fullWidth className="ranking-return-cta" onClick={() => setActiveTab("guild")}>所属TRIBEへ</OutlawButton>
            : null}
      {rewardDialogOpen && <RankingRewardDialog
        currentRank={loading || error ? null : currentRank}
        finalized={isPreopenGuildSeason ? guildSeasonFinalized : ["FINALIZED", "COMPLETED", "CLOSED"].includes(String(periodBounds?.status || "").toUpperCase())}
        category={activeTab}
        period={activePeriod}
        master={rewardMaster}
        loading={rewardMasterLoading}
        error={rewardMasterError}
        preopenGuildSeason={isPreopenGuildSeason}
        onPeriodChange={setActivePeriod}
        onRetry={loadRewardMaster}
        onClose={() => setRewardDialogOpen(false)}
      />}
    </HubPage>
  );
}

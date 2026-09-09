"use client";

import React, { useEffect, useRef } from "react";
import { useGame } from "../context/GameContext";
import { CANONICAL_EQUIPMENT_VIEW } from "@/utils/equipments_master_data";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { CHARACTERS_MASTER } from "@/utils/game_constants";
import CharacterPresentation from "./character/CharacterPresentation";
import OutlawButton from "./ui/OutlawButton";
import TutorialNavigator from "./TutorialNavigator";
import { getAcquisitionBadgeAsset, getAwakeningBadgeAsset, getRarityFrameAsset } from "@/utils/rarityAssets";
import { GACHA_RARITY_ASSETS } from "../lib/screenManifests";
import { preloadAssetManifest } from "../lib/screenAssets";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import "./CommonModals.css";
import { resolvePresentableAssetUrl } from "@/utils/assetPresentation";
import { userFacingErrorMessage } from "../lib/userFacingError";
import CharacterGachaPresentation from "./gacha/CharacterGachaPresentation";
import CanonicalDialog from "./ui/CanonicalDialog";
import PublicUserProfile from "./profile/PublicUserProfile";
import UserIdentityRow from "./profile/UserIdentityRow";
import { SkillIcon } from "./skill/SkillPresentation";

function gachaLocationBackground(result: any): string {
  const master = CHARACTERS_MASTER.find((character: any) => character.id === result?.characterId);
  return getCharacterLocationBackground(master?.homeTown);
}

const guildAlignmentLabel = (value?: string | null) => ({
  JUSTICE: "正義", EVIL: "悪", ORDER: "秩序", CHAOS: "混沌",
}[String(value || "").toUpperCase()] || "未設定");

const guildRoleLabel = (role?: string | null) => {
  if (role === "MASTER") return "ギルドマスター";
  if (role === "SUB_MASTER" || role === "SUBMASTER") return "副団長";
  return "メンバー";
};

export default function CommonModals() {
  const {
    showGearModal,
    setShowGearModal,
    activeGearSlot,
    userEquipmentsList,
    handleEquipGear,
    showSkillModal,
    setShowSkillModal,
    activeSkillSlot,
    userSkillsList,
    handleEquipSkill,
    upgradeLoading,
    scoutAnimationState,
    setScoutAnimationState,
    scoutFlashingColor,
    scoutResults,
    scoutPresentationCategory,
    errorMessage,
    setErrorMessage,
    playCyberSe,
    activePlayerDetail,
    setActivePlayerDetail,
    session,
    setDmRecipientId,
    setShowTribeChatPanel,
    setChatChannel,
    activeGuildDetail,
    setActiveGuildDetail,
    onboardingState,
    navigateTab,
    userGuildMember,
    pendingGuildJoinRequests,
    handleDemoJoinGuild,
    fetchGuildDetail,
    fetchPlayerDetail,
    playSe,
  } = useGame();
  const announcedScoutResultRef = useRef<any[] | null>(null);
  const [tutorialPullStarted, setTutorialPullStarted] = React.useState(false);
  const [tutorialPullBurst, setTutorialPullBurst] = React.useState(false);
  const isCharacterReveal = scoutResults.length > 0
    && scoutResults.every((result: any) => result?.type === "CHARACTER" && result?.characterId);
  const isCommonOpening = scoutAnimationState === "PROCESSING"
    || scoutAnimationState === "FLASHING"
    || scoutAnimationState === "READY";
  useEffect(() => {
    if (isCharacterReveal || scoutAnimationState !== "SHOW_RESULTS" || announcedScoutResultRef.current === scoutResults) return;
    announcedScoutResultRef.current = scoutResults;
    playSe("GACHA_REVEAL");
    const rarities = scoutResults.map((result: any) => String(result.rarity || "").toUpperCase());
    if (!rarities.includes("SSR") && rarities.includes("SR")) playSe("GACHA_SR");
  }, [isCharacterReveal, playSe, scoutAnimationState, scoutResults]);

  useEffect(() => {
    if (scoutAnimationState === null) {
      announcedScoutResultRef.current = null;
      setTutorialPullStarted(false);
      setTutorialPullBurst(false);
    }
  }, [scoutAnimationState]);

  useEffect(() => {
    if (scoutAnimationState === null) return;
    void preloadAssetManifest(GACHA_RARITY_ASSETS.map((src) => ({ src, required: false })));
  }, [scoutAnimationState]);

  useEffect(() => {
    if (isCharacterReveal || scoutAnimationState !== "READY" || !tutorialPullStarted) return;
    setTutorialPullBurst(true);
    const timer = window.setTimeout(() => setScoutAnimationState("SHOW_RESULTS"), 620);
    return () => window.clearTimeout(timer);
  }, [isCharacterReveal, scoutAnimationState, setScoutAnimationState, tutorialPullStarted]);

  const compactGachaOutcome = (result: any) => {
    const outcome = String(result.convertReward || "");
    if (outcome === "新規獲得") return "NEW";
    if (outcome.includes("覚醒")) return outcome.replace("段階", " ");
    if (result.converted || outcome.includes("抗争の掟")) return "重複 / 掟+1";
    if (outcome.includes("限界突破")) return outcome;
    return outcome || "獲得";
  };
  const assetProgressionLevel = (result: any) => {
    const projectedLevel = Math.trunc(Number(result.progressionLevel));
    if (Number.isFinite(projectedLevel) && projectedLevel > 0) return projectedLevel;
    const match = String(result.convertReward || "").match(/限界突破\s*\+(\d+)/);
    return match ? Number(match[1]) : null;
  };

  return (
    <>
      {/* 🛡️ 装備選択モーダル */}
      {showGearModal && activeGearSlot !== null && (
        <CanonicalDialog title={`装備選択（スロット${activeGearSlot + 1}）`} size="large" onClose={upgradeLoading ? undefined : () => { setShowGearModal(false); playCyberSe("click"); }}>
            <div className="list-container scroll-container max-h-300 mt-2">
              {userEquipmentsList
                .filter((eq: any) => eq.equipped_character_id === null)
                .map((eq: any) => {
                  const master = CANONICAL_EQUIPMENT_VIEW.find((m: any) => m.id === eq.equipment_id);
                  return (
                    <div key={eq.id} className="list-item">
                      <div className="equipment-list-visual">{master && <><img className="equipment-list-art" src={master.assetPath} alt="" aria-hidden="true" /><img className="production-rarity-item-frame" src={getRarityFrameAsset("equipment", master.rarity)} alt="" aria-hidden="true" /></>}</div>
                      <div className="item-left">
                        <span className="item-title">{master?.name || "未確認の装備"}</span>
                        <span className="item-desc">Lv.{eq.level}</span>
                      </div>
                      <button 
                        className="action-btn claim active-scale-effect font-size-8 px-3"
                        disabled={upgradeLoading}
                        onClick={() => handleEquipGear(eq.id)}
                      >
                        {upgradeLoading ? "装備中…" : "装備"}
                      </button>
                    </div>
                  );
                })}
              {userEquipmentsList.filter((eq: any) => eq.equipped_character_id === null).length === 0 && (
                <div className="font-size-8 text-secondary text-center py-4">未装備の装備品がありません。</div>
              )}
            </div>
        </CanonicalDialog>
      )}

      {/* 🎴 スキルカード選択モーダル */}
      {showSkillModal && activeSkillSlot !== null && (
        <CanonicalDialog title={`スキル選択（スロット${activeSkillSlot + 1}）`} size="large" onClose={upgradeLoading ? undefined : () => { setShowSkillModal(false); playCyberSe("click"); }}>
            <div className="list-container scroll-container max-h-300 mt-2">
              {userSkillsList
                .filter((us: any) => us.equipped_character_id === null)
                .map((us: any) => {
                  const master = CANONICAL_SKILL_VIEW.find((s: any) => s.id === us.skill_card_id);
                  return (
                    <div key={us.id} className="list-item">
                      <SkillIcon skill={master} />
                      <div className="item-left">
                        <span className="item-title">{master?.name || "未確認のスキル"}</span>
                        <span className="item-desc">限界突破 +{us.plus_val}</span>
                      </div>
                      <button 
                        className="action-btn claim active-scale-effect font-size-8 px-3"
                        disabled={upgradeLoading}
                        onClick={() => handleEquipSkill(us.id)}
                      >
                        {upgradeLoading ? "装備中…" : "装備"}
                      </button>
                    </div>
                  );
                })}
              {userSkillsList.filter((us: any) => us.equipped_character_id === null).length === 0 && (
                <div className="font-size-8 text-secondary text-center py-4">未装備のスキルカードがありません。</div>
              )}
            </div>
        </CanonicalDialog>
      )}

      {/* 🎰 ガチャ演出モーダル (FLASHING / SHOW_RESULTS) */}
      {scoutAnimationState !== null && isCharacterReveal && (scoutAnimationState === "READY" || scoutAnimationState === "SHOW_RESULTS") ? (
        <CharacterGachaPresentation results={scoutResults} tutorial={onboardingState?.tutorial_step === "AUTO_FORMATION"}
          onReveal={() => setScoutAnimationState("SHOW_RESULTS")} playSound={playSe}
          onClose={() => { setScoutAnimationState(null); playCyberSe("click"); if (onboardingState?.tutorial_step === "AUTO_FORMATION") navigateTab("character"); }} />
      ) : scoutAnimationState !== null && (scoutPresentationCategory === "CHARACTER" || isCharacterReveal || onboardingState?.tutorial_step === "FREE_GACHA") ? (
        <div className="cg-overlay"><div className="cg-loading" role="status" aria-label="ガチャ演出を準備中"><i className="cg-loading-spinner" aria-hidden="true" /></div></div>
      ) : scoutAnimationState !== null && (
        <div className={`modal-overlay background-black-95 ${isCommonOpening ? "gacha-processing-overlay gacha-common-opening-overlay" : ""}`} style={{ zIndex: 20000 }} data-gacha-transition-state={scoutAnimationState.toLowerCase()} data-gacha-visual={isCommonOpening ? "tokyo-night-opening" : undefined}>
          {scoutAnimationState === "PROCESSING" || scoutAnimationState === "FLASHING" || scoutAnimationState === "READY" ? (
            <div className={`gacha-opening-stage rarity-${scoutFlashingColor.toLowerCase()} ${scoutAnimationState === "READY" ? "is-ready" : "is-processing"} ${tutorialPullStarted ? "is-pull-started" : ""} ${tutorialPullStarted && scoutFlashingColor === "GOLD" && !isCharacterReveal ? "is-ssr-presence" : ""}`} data-gacha-common-opening>
              <div className="gacha-opening-city" aria-hidden="true" />
              <div className="gacha-opening-neon" aria-hidden="true"><i /><i /><i /></div>
              {scoutAnimationState === "READY" && !tutorialPullStarted ? (
                <button
                  type="button"
                  className="gacha-opening-logo-gate"
                  onClick={() => {
                    setTutorialPullStarted(true);
                    playCyberSe("click");
                  }}
                  aria-label="TRIBE NEON ガチャ結果を開く"
                  data-gacha-logo-gate
                >
                  <img src="/branding/tribe-neon-logo.png" alt="TRIBE NEON" />
                  <span>TAP!</span>
                </button>
              ) : scoutAnimationState === "READY" ? (
                <div className={`gacha-opening-release ${tutorialPullBurst ? "is-ready" : ""}`} role="status" aria-label="ガチャ結果を表示中">
                  <img src="/branding/tribe-neon-logo.png" alt="" aria-hidden="true" />
                  <i />
                </div>
              ) : (
                <div className="gacha-opening-status" role="status" aria-live="polite" aria-label="ガチャ抽選結果を同期中" data-gacha-short-effect>
                  <small>抽選中…</small>
                </div>
              )}
            </div>
          ) : (
            <div className="gacha-result-panel">
              {onboardingState?.tutorial_step === "AUTO_FORMATION" && (
                <TutorialNavigator message="いいじゃん。じゃ、この中から一緒に動くメンバーを決めよ。" />
              )}
              <header className="gacha-result-heading">
                <h3>ガチャ結果</h3>
                <p>{scoutResults.length}件の獲得結果</p>
              </header>

              <div className={`gacha-result-grid ${isCharacterReveal ? "is-character-results" : "is-asset-results"} ${scoutResults.length >= 10 ? "is-ten-pull" : ""}`}>
                {scoutResults.map((res: any, idx: number) => (
                  <article
                    key={`${res.name}-${idx}`}
                    data-acquisition={res.convertReward === "新規獲得" ? "NEW" : "DUPLICATE"}
                    data-ssr-glint={String(res.rarity).toUpperCase() === "SSR" ? "enabled" : undefined}
                    style={{ "--gacha-result-glint-delay": `${(idx % 5) * -0.17}s` } as React.CSSProperties}
                    className={`gacha-result-card rarity-${String(res.rarity).toLowerCase()} ${res.convertReward === "新規獲得" ? "is-new" : "is-duplicate"}`}
                  >
                    {res.type === "CHARACTER" && res.imageUrl ? (
                      <CharacterPresentation
                        src={res.imageUrl}
                        alt={res.name}
                        variant="gacha-result-compact"
                        rarity={res.rarity}
                        attribute={res.attributeKey}
                        backgroundSrc={gachaLocationBackground(res)}
                        frameKind="character"
                        rarityBadge
                        attributeBadge
                      />
                    ) : (
                      res.assetPath || (res.type === "EQUIPMENT" && CANONICAL_EQUIPMENT_VIEW.find((item) => item.id === (res.equipmentId || res.itemId))) ? (
                        <div className={`gacha-result-asset-art is-${String(res.type).toLowerCase()}`}>
                          <img className="gacha-result-item-asset" src={res.assetPath || CANONICAL_EQUIPMENT_VIEW.find((item) => item.id === (res.equipmentId || res.itemId))?.assetPath} alt={res.name} />
                          <img
                            className="gacha-result-rarity-frame"
                            src={getRarityFrameAsset(res.type === "SKILL" ? "skill" : "equipment", res.rarity)}
                            alt={`${res.rarity}レアリティフレーム`}
                          />
                          {res.convertReward === "新規獲得" ? (
                            <img className="gacha-result-asset-badge is-new" src={getAcquisitionBadgeAsset("NEW") || ""} alt="NEW" />
                          ) : assetProgressionLevel(res) ? (
                            <span className="gacha-result-asset-badge is-progression" aria-label={`限界突破 +${assetProgressionLevel(res)}`}>
                              {getAwakeningBadgeAsset(assetProgressionLevel(res)) ? (
                                <img src={getAwakeningBadgeAsset(assetProgressionLevel(res)) || ""} alt="" aria-hidden="true" />
                              ) : (
                                <b>+{assetProgressionLevel(res)}</b>
                              )}
                            </span>
                          ) : null}
                        </div>
                      ) : <div className="gacha-result-asset-placeholder"><span>{res.type === "SKILL" ? "スキル" : "装備"}</span><strong>{res.name}</strong></div>
                    )}
                    {res.type !== "CHARACTER" && <div className="gacha-result-name" title={res.name}>{res.name}</div>}
                    {res.type === "CHARACTER" && getAcquisitionBadgeAsset(res.convertReward === "新規獲得" ? "NEW" : "AWAKENING", res.awakeningLevel) && (
                      <img className="gacha-result-acquisition-badge" src={getAcquisitionBadgeAsset(res.convertReward === "新規獲得" ? "NEW" : "AWAKENING", res.awakeningLevel) || ""} alt={compactGachaOutcome(res)} />
                    )}
                  </article>
                ))}
              </div>

              <button 
                className="gacha-result-next semantic-cta semantic-cta--primary active-scale-effect"
                onClick={() => {
                  setScoutAnimationState(null);
                  playCyberSe("click");
                  if (onboardingState?.tutorial_step === "AUTO_FORMATION") {
                    navigateTab("character");
                  }
                }}
              >
                {onboardingState?.tutorial_step === "AUTO_FORMATION" ? "編成へ進む" : "ガチャへ戻る"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ❌ 汎用エラーモーダル */}
      {errorMessage && (
        <CanonicalDialog title="エラー" onClose={() => setErrorMessage(null)} actions={[{ label: "閉じる", semantic: "secondary", onClick: () => setErrorMessage(null) }]}>
          {userFacingErrorMessage(errorMessage)}
        </CanonicalDialog>
      )}

      {/* 👤 プレイヤー自己紹介ポップアップ */}
      {activePlayerDetail && (
        <PublicUserProfile
          profile={activePlayerDetail}
          currentUserId={session?.user?.id}
          onClose={() => { setActivePlayerDetail(null); playCyberSe("click"); }}
          onRetry={() => void fetchPlayerDetail(activePlayerDetail.id)}
          onGuild={(guildId) => fetchGuildDetail(guildId)}
          onDm={(userId) => {
            setDmRecipientId(userId);
            setActivePlayerDetail(null);
            setChatChannel("DM");
            setShowTribeChatPanel(true);
            playCyberSe("click");
          }}
        />
      )}

      {/* 🏢 ギルド紹介ポップアップ */}
      {activeGuildDetail && (
        <CanonicalDialog
          title={activeGuildDetail.name}
          size="large"
          ariaLabel={`${activeGuildDetail.name}の詳細`}
          onClose={() => { setActiveGuildDetail(null); playCyberSe("click"); }}
        >
            <div className="guild-public-detail">
              <div className="guild-public-identity">
                {resolvePresentableAssetUrl(activeGuildDetail.emblem_url)
                  ? <img className="guild-emblem-placeholder" src={resolvePresentableAssetUrl(activeGuildDetail.emblem_url) || ""} alt="" />
                  : <div className="guild-emblem-placeholder is-placeholder" aria-hidden="true" />}
                <div><strong>{activeGuildDetail.name}</strong><span>Lv.{activeGuildDetail.level} ・ {activeGuildDetail.member_count}/{activeGuildDetail.member_limit}名</span></div>
              </div>
              <div className="guild-meta-section flex justify-between mb-3">
                <div className="guild-public-master">
                  <small>ギルドマスター</small>
                  <UserIdentityRow
                    userName={activeGuildDetail.leaderName}
                    guildName={activeGuildDetail.name}
                    leaderCharacterId={activeGuildDetail.leaderCharacterId}
                    onOpen={activeGuildDetail.leaderUserId ? () => fetchPlayerDetail(activeGuildDetail.leaderUserId) : undefined}
                    variant="compact"
                  />
                </div>
                <div className="guild-alignment text-right">
                  <span className="alignment-badge main font-size-7 px-1.5 py-0.5 font-weight-bold text-white rounded">
                    メイン属性: {guildAlignmentLabel(activeGuildDetail.main_alignment)}
                  </span>
                  <span className="alignment-badge sub font-size-7 px-1.5 py-0.5 font-weight-bold text-white rounded block mt-1">
                    サブ属性: {guildAlignmentLabel(activeGuildDetail.sub_alignment)}
                  </span>
                </div>
              </div>

              <div className="guild-public-status-grid">
                <span><small>参加方法</small><strong>{Number(activeGuildDetail.member_count || 0) >= Number(activeGuildDetail.member_limit || 0) ? "満員" : activeGuildDetail.recruitment_mode === "CLOSED" ? "募集停止" : activeGuildDetail.recruitment_mode === "APPLICATION_REQUIRED" || activeGuildDetail.approval_required ? "承認制" : "自由加入"}</strong></span>
                <span><small>空き枠</small><strong>{Math.max(0, Number(activeGuildDetail.member_limit || 0) - Number(activeGuildDetail.member_count || 0))}枠</strong></span>
                <span><small>直近7日アクティブ</small><strong>{Number(activeGuildDetail.active_members_7d || 0)}人</strong></span>
                <span><small>レイド貢献</small><strong>{Number(activeGuildDetail.raid_contribution_7d || 0).toLocaleString()}</strong></span>
                <span><small>総合力</small><strong>{Number(activeGuildDetail.guild_power || 0).toLocaleString()}</strong></span>
              </div>

              <div className="guild-desc-box steel-tray p-2.5 mb-3 font-size-8 text-white line-height-14">
                {activeGuildDetail.description}
              </div>

              <section className="guild-public-members" aria-label="メンバー">
                <div className="guild-public-section-title"><strong>メンバー</strong><small>{activeGuildDetail.members?.length || 0}名</small></div>
                <div className="guild-public-member-list">
                  {(activeGuildDetail.members || []).map((member: any) => (
                    <div className="guild-public-member-row" key={member.user_id}>
                      <UserIdentityRow
                        userName={member.username}
                        guildName={activeGuildDetail.name}
                        leaderCharacterId={member.favorite_character_id || null}
                        onOpen={() => fetchPlayerDetail(member.user_id)}
                        variant="compact"
                      />
                      <span>{guildRoleLabel(member.role)}</span>
                    </div>
                  ))}
                </div>
              </section>

              {!userGuildMember && (() => {
                const pendingRequest = pendingGuildJoinRequests?.find((request: any) => request.guild_id === activeGuildDetail.id && request.status === "PENDING");
                const unavailable = activeGuildDetail.recruitment_mode === "CLOSED" || Number(activeGuildDetail.member_count || 0) >= Number(activeGuildDetail.member_limit || 0);
                return <OutlawButton variant="primary" fullWidth className="mt-3" disabled={Boolean(pendingRequest) || unavailable} onClick={async () => {
                  const targetGuild = activeGuildDetail;
                  setActiveGuildDetail(null);
                  void import("../../utils/supabase").then(({ supabase }) => supabase.rpc("record_client_funnel_event", {
                    p_event_name: "guild_detail_join_click", p_source_screen: "guild_detail",
                    p_source_cta: targetGuild.recruitment_mode === "APPLICATION_REQUIRED" || targetGuild.approval_required ? "apply" : "join",
                    p_object_id: targetGuild.id, p_metadata: {}
                  }));
                  await handleDemoJoinGuild(targetGuild.id, targetGuild.name, targetGuild.recruitment_mode === "APPLICATION_REQUIRED" || targetGuild.approval_required);
                }}>
                  {pendingRequest ? "申請中" : activeGuildDetail.recruitment_mode === "CLOSED" ? "募集停止" : Number(activeGuildDetail.member_count || 0) >= Number(activeGuildDetail.member_limit || 0) ? "満員" : activeGuildDetail.recruitment_mode === "APPLICATION_REQUIRED" || activeGuildDetail.approval_required ? "加入申請する" : "このギルドに加入する"}
                </OutlawButton>;
              })()}
            </div>
        </CanonicalDialog>
      )}
    </>
  );
}

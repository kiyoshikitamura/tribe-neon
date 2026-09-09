"use client";

import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { supabase } from "@/utils/supabase";
import { loadRaidActivity } from "@/domain/raidRoomActivity";
import { createRaidRoomRpcTransport } from "@/domain/raidRoomRpcTransport";
import { useRaidRoomActivity } from "./hooks/useRaidRoomActivity";
import { EMAIL_ONBOARDING_INTENT_KEY, readEmailOnboardingIntent } from "@/utils/authIntents";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { CANONICAL_EQUIPMENT_VIEW } from "@/utils/equipments_master_data";
import { getCanonicalSkillIcon } from "@/utils/skillVisualAssets";
import {
  TEST_SKILL_ID,
  CHARACTERS_MASTER,
  BASE_MAP_MASTER,
  GEAR_SLOTS_MASTER,
  STORY_EPISODES_MASTER,
  MASTER_AVATARS,
  getCharacterTransparentImg
} from "@/utils/game_constants";
import {
  LoginBonusMaster,
  UserLoginBonus,
  LoginBonusClaimResult,
  DEFAULT_LOGIN_BONUS_MASTERS,
} from "@/utils/login_bonus_master_data";
import { useBattle } from "@/hooks/useBattle";
import { getCharacterBaseStats, getCharacterTotalStats } from "@/utils/stats_calculator";
import { SHOP_PRODUCTS_MASTER, ShopProductItem } from "@/utils/shop_master_data";
import { ConfirmDialogConfig } from "@/app/components/ui/ConfirmDialog";
import { useNavigation } from "./hooks/useNavigation";
import { useProfileRequestState } from "./hooks/useProfileRequestState";
import type { PublicUserProfileModel } from "@/app/components/profile/PublicUserProfile";
import { EXISTING_GOOGLE_LOGIN_INTENT_KEY, useAuth } from "./hooks/useAuth";
import { useFriends } from "./hooks/useFriends";
import { useChat } from "./hooks/useChat";
import { useInventory } from "./hooks/useInventory";
import { useUserProfile } from "./hooks/useUserProfile";
import { useGuild } from "./hooks/useGuild";
import { beginActionPerformance } from "@/utils/actionPerformance";
import { useAudio } from "@/audio/AudioProvider";
import type { SeEvent } from "@/audio/audioContract";
import { beginAssetTierMetric, finishAssetTierMetric, preloadAssetManifest } from "@/app/lib/screenAssets";
import { clearHomeResumeSnapshot, markHomeReloadStage, readHomeResumeSnapshot } from "@/app/lib/homeResumePresentation";
import { canonicalMissionUiStatus } from "@/domain/gameplay/canonical/missions";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { normalizeUserBio } from "@/domain/presentation/userBio";
import { waitForBrowserPaint } from "@/domain/presentation/browserPaint";
import { CANONICAL_QUEST_REWARD_POOLS, CANONICAL_QUESTS } from "@/domain/gameplay/canonical/quests";
import {
  featureUiExposure,
  isFeatureOpen,
  isMaintenanceEnabled,
  mergeServerOperationsState,
  sanitizeOperationsTab,
} from "@/domain/operations/operations";

const ONBOARDING_AUTH_INTENT_KEY = "tribe_onboarding_auth_intent";
const ONBOARDING_AUTH_INTENT_MAX_AGE_MS = 30 * 60 * 1000;
const AUTHENTICATION_REMINDER_KEY_PREFIX = "tribe_account_authentication_reminder";

function authenticationReminderKey(userId: string) {
  return `${AUTHENTICATION_REMINDER_KEY_PREFIX}:${userId}`;
}

function hasValidExistingGoogleLoginIntent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const intent = JSON.parse(window.localStorage.getItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY) || "null");
    const age = Date.now() - Number(intent?.startedAt || 0);
    if (age >= 0 && age <= ONBOARDING_AUTH_INTENT_MAX_AGE_MS) return true;
  } catch {
    // Invalid browser state is handled like an expired login attempt.
  }
  window.localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
  return false;
}

function isMatchingGoogleOnboardingReturn(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const intent = JSON.parse(window.localStorage.getItem(ONBOARDING_AUTH_INTENT_KEY) || "null");
    const age = Date.now() - Number(intent?.startedAt || 0);
    return intent?.method === "GOOGLE"
      && intent?.userId === userId
      && age >= 0
      && age <= ONBOARDING_AUTH_INTENT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function hasPendingGoogleAccountSwitch(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  return query.get("account_switch") === "google" || query.has("account_switch_error");
}
import { usePvp } from "./hooks/usePvp";
import { useGvg } from "./hooks/useGvg";
import { useRaid } from "./hooks/useRaid";
import { usePatrol } from "./hooks/usePatrol";
import { useGacha } from "./hooks/useGacha";
import { useShop } from "./hooks/useShop";
import { useStory } from "./hooks/useStory";
import { useCharacterProgression } from "./hooks/useCharacterProgression";
import { shouldRevalidateAuthSession } from "@/utils/auth_session_events";
import { getJstDateString } from "@/utils/jst_date";
import { clearLegalSettingsReturn, hasPendingLegalSettingsReturn, isLegalSettingsReturnRequested } from "@/utils/legalSettingsReturn";
import { bindAcquisitionSubject } from "@/utils/acquisitionAttribution";

export const GameContext = createContext<any>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const lastValidatedAuthUserIdRef = useRef<string | null>(null);
  const currentAuthUserIdRef = useRef<string | null>(null);
  const bootstrapSerialRef = useRef<Promise<void>>(Promise.resolve());
  const onboardingCheckRef = useRef<Map<string, Promise<void>>>(new Map());
  const tutorialResultCommitRef = useRef(false);
  const patrolStateRevisionRef = useRef(0);
  const audio = useAudio();
  const playCyberSe = (type: string) => audio.playLegacySe(type);
  const handleFirstUserInteraction = () => { void audio.unlockAudio(); };
  const startCyberBgm = () => audio.playBgm("HOME");
  const stopCyberBgm = () => audio.stopBgm();
  // ==========================================
  // 0. ナビゲーション ＆ UI状態管理
  // ==========================================
  const nav = useNavigation(
    playCyberSe,
    handleFirstUserInteraction
  );

  const {
    activeTab, setActiveTab,
    showInboxPanel, setShowInboxPanel,
    showMissionPanel, setShowMissionPanel,
    showFriendPanel, setShowFriendPanel,
    showSettingsPanel, setShowSettingsPanel,
    showTribeChatPanel, setShowTribeChatPanel,
    showMoveBaseModal, setShowMoveBaseModal,
    showLegalPage, setShowLegalPage,
    showTitleView, setShowTitleView,
    inboxPanelTab, setInboxPanelTab,
    rankingActiveTab, setRankingActiveTab,
    characterEntryView, setCharacterEntryView,
    confirmDialogConfig, setConfirmDialogConfig,
    globalInteractionBlocking, setGlobalInteractionBlocking
  } = nav;

  // ==========================================
  // 1. 認証 ＆ セッション管理ステート
  // ==========================================
  const friends = useFriends();
  
  const auth = useAuth(
    (type: string) => playCyberSe(type as any),
    () => stopCyberBgm(),
    (userId: string) => syncBootstrapData(userId),
    (tab: string, subTab?: string) => navigateTab(tab, subTab),
    (userId: string) => checkIfSetupRequired(userId),
    setConfirmDialogConfig,
    () => setShowTitleView(true)
  );

  const {
    session, setSession,
    authLoading, setAuthLoading,
    isSetupRequired, setIsSetupRequired,
    onboardingState, setOnboardingState,
    setupUsername, setSetupUsername,
    setupCharacterId, setSetupCharacterId,
    setupAreaId, setSetupAreaId,
    setupGiftCode, setSetupGiftCode,
    giftCode, setGiftCode,
    setupLoading, setSetupLoading,
    setupGender, setSetupGender,
    setupHairId, setSetupHairId,
    setupFaceId, setSetupFaceId,
    email, setEmail,
    password, setPassword,
    errorMessage, setErrorMessage,
    googleExternalBrowserUrl,
    dismissGoogleExternalBrowserPrompt,
    handleEmailSignup,
    handleEmailLogin,
    handleGoogleLogin,
    handleStartNewGame,
    handleGoogleDemoLogin,
    handleInitializeUser,
    handleLogout
  } = auth;
  // --- アバターシステム状態 ---
  const [userAvatar, setUserAvatar] = useState<any>(null);
  const [unlockedAvatarParts, setUnlockedAvatarParts] = useState<string[]>([]);
  const [avatarPartsMaster, setAvatarPartsMaster] = useState<any[]>([]);
  const [avatarLoading, setAvatarLoading] = useState<boolean>(false);

  // ==========================================
  // 2. ゲーム内状態管理ステート
  // ==========================================
  const [userLevel, setUserLevel] = useState<number>(1);
  const [hasShownGuildDialog, setHasShownGuildDialog] = useState<boolean>(false);
  const [activeBanners, setActiveBanners] = useState<any[]>([]);
  const [userXp, setUserXp] = useState<number>(0);
  const [raidPoints, setRaidPoints] = useState<number>(5);
  const [raidRescueTarget, setRaidRescueTarget] = useState<{ rescueId: string; revision: number } | null>(null);
  const roomUiEnabled = process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED === "true";
  const roomActivity = useRaidRoomActivity(session?.user?.id, roomUiEnabled);
  const roomActivityRef = useRef(roomActivity);
  useLayoutEffect(() => { roomActivityRef.current = roomActivity; }, [roomActivity]);
  const [raidTopRefreshRevision, setRaidTopRefreshRevision] = useState(0);
  const [raidRoomReturnTarget, setRaidRoomReturnTarget] = useState<{ userId: string; roomId: string } | null>(null);
  const [raidFirstEntryFree, setRaidFirstEntryFree] = useState<boolean>(true);
  const [cash, setCash] = useState<number>(2600);
  const [diamonds, setDiamonds] = useState<number>(200);
  const [vitality, setVitality] = useState<number>(100);
  const [vitalityNextRecoveryAt, setVitalityNextRecoveryAt] = useState<string | null>(null);
  const [pvpNextRecoveryAt, setPvpNextRecoveryAt] = useState<string | null>(null);
  const [monthlyPassActive, setMonthlyPassActive] = useState<boolean>(false);
  const [monthlyPassClaimedToday, setMonthlyPassClaimedToday] = useState<boolean>(false);

  const inventory = useInventory(
    session,
    cash, setCash,
    diamonds, setDiamonds,
    vitality, setVitality,
    (type: string) => playCyberSe(type as any),
    (userId: string) => syncBootstrapData(userId),
    setConfirmDialogConfig
  );

  const {
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
    missions, setMissions,
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
  } = inventory;




  const guild = useGuild(
    session,
    userLevel,
    cash, setCash,
    (loading: boolean) => setGvgResetLoading(loading),
    setErrorMessage,
    (type: string) => playCyberSe(type as any),
    (userId: string) => syncBootstrapData(userId),
    (actionType: string, sourceId?: string) => addGuildXpAndContributionByAction(actionType, sourceId),
    setConfirmDialogConfig,
    () => { setChatChannel("GUILD"); setShowTribeChatPanel(true); }
  );

  const {
    userGuild, setUserGuild,
    userGuildMember, setUserGuildMember,
    guildMembersList, setGuildMembersList,
    newGuildName, setNewGuildName,
    allGuildsDbList, setAllGuildsDbList,
    guildSubTab, setGuildSubTab,
    pendingGuildJoinRequests, setPendingGuildJoinRequests,
    guildJoinRequests, setGuildJoinRequests,
    guildPrivilegedOperation,
    guildLevelMaster, setGuildLevelMaster,
    guildXpActionMaster, setGuildXpActionMaster,
    updatingAlignment, setUpdatingAlignment,
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
  } = guild;

  const profile = useUserProfile(
    session,
    userLevel,
    diamonds,
    cash,
    userGuild,
    playCyberSe,
    audio.bgmEnabled,
    audio.setBgmEnabled,
    audio.seEnabled,
    audio.setSeEnabled,
    (userId: string) => syncBootstrapData(userId),
    setShowSettingsPanel,
    setErrorMessage,
    setConfirmDialogConfig
  );

  const {
    username, setUsername,
    bio, setBio,
    avatarUrl, setAvatarUrl,
    currentBaseId, setCurrentBaseId,
    lastGuildLeftAt, setLastGuildLeftAt,
    bgmEnabled, setBgmEnabled,
    seEnabled, setSeEnabled,
    profileLoading, setProfileLoading,
    equippedBackground, setEquippedBackground,
    selectedBgMode, setSelectedBgMode,
    equippedFrontEffect, setEquippedFrontEffect,
    titleEquipped, setTitleEquipped,
    ownedTitles,
    ownedHomeCosmeticIds,
    interiorItem, setInteriorItem,
    selectedLeader, setSelectedLeader,
    upgradeSelectedCharId, setUpgradeSelectedCharId,
    handleUpdateProfile,
    handleToggleSound
  } = profile;

  const pvp = usePvp(
    session,
    setErrorMessage,
    (type: string) => playCyberSe(type as any),
    (userId: string) => syncBootstrapData(userId),
    setConfirmDialogConfig
  );

  const {
    pvpPoints, setPvpPoints,
    battleSubTab, setBattleSubTab,
    pvpOpponents, setPvpOpponents,
    opponentsLoading, setOpponentsLoading,
    pvpRate, setPvpRate,
    pvpSubView, setPvpSubView,
    myPvpDefenseDeck, setMyPvpDefenseDeck,
    pvpRankings, setPvpRankings,
    powerRankings, setPowerRankings,
    guildPowerRankings, setGuildPowerRankings,
    pvpSeasonLoading, setPvpSeasonLoading,
    pvpDefenseLogs, setPvpDefenseLogs,
    simulatingDefense, setSimulatingDefense,
    pvpDefenseSaveLoading,
    fetchPvpOpponents,
    savePvpDefenseDeck,
    syncUserPower
  } = pvp;

  const gvg = useGvg(
    session,
    setErrorMessage,
    (type: string) => playCyberSe(type as any),
    (userId: string) => syncBootstrapData(userId)
  );

  const {
    gvgBases, setGvgBases,
    gvgBaseControls, setGvgBaseControls,
    gvgResetLoading, setGvgResetLoading,
    gvgSeasonDay, setGvgSeasonDay,
    gvgMatches, setGvgMatches,
    myGvgMatch, setMyGvgMatch,
    gvgDefenseDeck, setGvgDefenseDeck,
    personalGvgPoints, setPersonalGvgPoints,
    gvgActiveRound, setGvgActiveRound
  } = gvg;

  const raid = useRaid(
    session,
    setErrorMessage,
    (type: string) => playCyberSe(type as any),
    (userId: string) => syncBootstrapData(userId)
  );

  const {
    raidBossHp, setRaidBossHp,
    raidBossMaxHp, setRaidBossMaxHp,
    raidBossSecondsLeft, setRaidBossSecondsLeft,
    raidTotalDamage, setRaidTotalDamage,
    raidBossBaseId, setRaidBossBaseId,
    raidBossName, setRaidBossName,
    raidDamageLogs, setRaidDamageLogs,
    raidSeasonRankings, setRaidSeasonRankings,
    raidDefeatLoading, setRaidDefeatLoading,
    isRaidActive
  } = raid;

  const patrol = usePatrol(
    session,
    vitality, setVitality,
    () => userCharactersDbList,
    currentBaseId,
    setErrorMessage,
    (type: string) => playCyberSe(type as any),
    (userId: string) => syncBootstrapData(userId),
    setUserLevel,
    setUserXp,
    (actionType: string, sourceId?: string) => addGuildXpAndContributionByAction(actionType, sourceId),
    (step: string) => setOnboardingState(current => current ? { ...current, tutorial_step: step } : current),
    () => { patrolStateRevisionRef.current += 1; }
  );

  const {
    selectedCourse, setSelectedCourse,
    selectedMembers, setSelectedMembers,
    selectedPatrolMember, setSelectedPatrolMember,
    dailyCashSkips, setDailyCashSkips, dailyPaidSkips, setDailyPaidSkips,
    dailyCashSkipsResetDate, setDailyCashSkipsResetDate,
    activePatrols, setActivePatrols,
    patrolLogs, setPatrolLogs,
    patrolCourses, setPatrolCourses,
    patrolNpcs, setPatrolNpcs,
    hasActivePatrolBattle, setHasActivePatrolBattle,
    lastPatrolRewards, setLastPatrolRewards,
    showPatrolRewardModal, setShowPatrolRewardModal,
    dispatchLoading, setDispatchLoading,
    handleStartPatrol,
    handleInstantComplete,
    transitionTutorialQuestToBattle,
    handleClaimRewards
  } = patrol;

  const gacha = useGacha();

  const {
    featureOperatingStates, setFeatureOperatingStates,
    gachaMasters, setGachaMasters,
    gachaItemsMaster, setGachaItemsMaster,
    gachaRarityRates, setGachaRarityRates,
    dailyFreeGachaFlags, setDailyFreeGachaFlags,
    dailyFreeGachaReady, setDailyFreeGachaReady,
    guideGachaCategory, setGuideGachaCategory,
    specialPityPoints, setSpecialPityPoints,
    scoutAnimationState, setScoutAnimationState,
    scoutFlashingColor, setScoutFlashingColor,
    scoutResults, setScoutResults,
    scoutPresentationCategory, setScoutPresentationCategory
  } = gacha;

  const shop = useShop();

  const {
    shopSubTab, setShopSubTab,
    userShopPurchases, setUserShopPurchases,
    userCreatedAt, setUserCreatedAt,
    boughtResultModal, setBoughtResultModal
  } = shop;

  const story = useStory(
    session,
    (type: string) => playCyberSe(type as any),
    (userId: string) => syncBootstrapData(userId),
    (mode: string, enemyName: string) => battle.startCardBattle(mode as any, enemyName),
    setConfirmDialogConfig
  );

  const {
    activeStorySession, setActiveStorySession,
    storySending, setStorySending,
    handleStoryNext,
    completeStorySession,
    triggerTutorialStory
  } = story;

  const characterProgression = useCharacterProgression(
    session,
    cash, setCash,
    charExpS, charExpM, charExpL,
    equipExpS, equipExpM, equipExpL,
    equipLbParts, skillManuals,
    upgradeSelectedCharId,
    setErrorMessage,
    (type: string) => playCyberSe(type as any),
    (userId: string) => syncBootstrapData(userId),
    setConfirmDialogConfig
  );

  const {
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
    skillLevel, setSkillLevel,
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
  } = characterProgression;


  const chat = useChat(
    session,
    username,
    userGuildMember,
    showTribeChatPanel,
    (type: string) => playCyberSe(type as any),
    setErrorMessage,
    (userId: string) => syncBootstrapData(userId)
  );

  const {
    guildChats, setGuildChats,
    chatChannel, setChatChannel,
    chatInput, setChatInput,
    chatSending, setChatSending,
    chatCooldown, setChatCooldown,
    activeUsersCount, setActiveUsersCount,
    directMessages, setDirectMessages,
    dmRecipientId, setDmRecipientId,
    dmUnreadConversations,
    dmUnreadTotal,
    refreshDirectMessageUnreadCounts,
    chatUnreadCounts,
    refreshChatUnreadCounts,
    markChatChannelRead,
    bbsThreads, setBbsThreads,
    bbsActiveThread, setBbsActiveThread,
    bbsPosts, setBbsPosts,
    bbsLoading, setBbsLoading,
    bbsUnreadCounts,
    bbsUnreadTotal,
    refreshBbsUnreadCounts,
    markBbsThreadRead,
    handleSendChat,
    handleSendDirectMessage,
    fetchBbsThreads,
    fetchBbsPosts,
    createBbsThread,
    createBbsPost
  } = chat;







  const [selectedTown, setSelectedTown] = useState<string>("shinjuku");

  // Public identity authority is the explicitly saved favorite character only.
  // Keep this separate from selectedLeader, whose legacy gameplay paths may fall
  // back to a formation member when no favorite has been selected.
  const [identityLeaderCharacterId, setIdentityLeaderCharacterId] = useState<string>("");
  const [identityLeaderOwnerUserId, setIdentityLeaderOwnerUserId] = useState<string>("");
  const [identityLeaderAuthorityReady, setIdentityLeaderAuthorityReady] = useState(false);
  const [guildAuthorityOwnerUserId, setGuildAuthorityOwnerUserId] = useState<string>("");
  const [guildDiscoveryState, setGuildDiscoveryState] = useState<"pending" | "error" | "empty" | "available">("pending");
  const [authenticatedProjectionOwnerUserId, setAuthenticatedProjectionOwnerUserId] = useState<string>("");
  const [authenticatedProjectionError, setAuthenticatedProjectionError] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const { value: activePlayerDetail, set: setActivePlayerDetail, begin: beginPlayerDetail } = useProfileRequestState<PublicUserProfileModel>(
    JSON.stringify([session?.user?.id ?? null, session?.user?.is_anonymous ?? null, activeTab, showTitleView, showLegalPage]),
  );
  const [activeGuildDetail, setActiveGuildDetail] = useState<any | null>(null);

  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [lastPaymentSessionId, setLastPaymentSessionId] = useState<string>("");

  // ログインボーナス用ステート
  const [loginBonusMasters, setLoginBonusMasters] = useState<LoginBonusMaster[]>(DEFAULT_LOGIN_BONUS_MASTERS);
  const [userLoginBonus, setUserLoginBonus] = useState<UserLoginBonus | null>(null);
  const [showLoginBonusModal, setShowLoginBonusModal] = useState<boolean>(false);
  const [loginBonusClaimResult, setLoginBonusClaimResult] = useState<LoginBonusClaimResult | null>(null);
  const [loginBonusCheckComplete, setLoginBonusCheckComplete] = useState(false);
  const [showPrepMissionDialog, setShowPrepMissionDialog] = useState(false);
  const [prepMissionDialogCheckComplete, setPrepMissionDialogCheckComplete] = useState(false);
  const [rankingRewardNotificationCheckComplete, setRankingRewardNotificationCheckComplete] = useState(false);
  const [showAccountAuthenticationModal, setShowAccountAuthenticationModal] = useState(false);
  const [showAuthenticationReminder, setShowAuthenticationReminder] = useState(false);
  const loginBonusRequestUserRef = useRef<string | null>(null);

  const [newsList, setNewsList] = useState<any[]>([]);
  const [selectedNews, setSelectedNews] = useState<any | null>(null);
  const [totalPower, setTotalPower] = useState<number>(0);
  // A displayed zero is valid only after the character and deck data has loaded.
  const [totalPowerLoading, setTotalPowerLoading] = useState<boolean>(true);
  const identityAuthorityRequestRef = useRef(0);
  const dailyFreeAuthorityRequestRef = useRef(0);

  const refreshIdentityLeaderAuthority = useCallback(async (explicitUserId?: string) => {
    const userId = explicitUserId || session?.user?.id;
    if (!userId) return false;
    const requestId = ++identityAuthorityRequestRef.current;
    setIdentityLeaderAuthorityReady(false);

    // Identity is needed by the first paint. Fetch it independently from the
    // heavier bootstrap so login bonus, guild and mission work cannot delay it.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await supabase
        .from("users")
        .select("favorite_character_id")
        .eq("id", userId)
        .single();
      if (requestId !== identityAuthorityRequestRef.current) return false;
      if (error) {
        if (attempt === 0) continue;
        console.warn("Current User leader authority is unavailable:", error);
        return false;
      }
      const favoriteCharacterId = data?.favorite_character_id;
      const canonicalFavoriteCharacterId =
        favoriteCharacterId && CHARACTERS_MASTER.some((character) => character.id === favoriteCharacterId)
          ? favoriteCharacterId
          : "";
      setIdentityLeaderOwnerUserId(userId);
      setIdentityLeaderCharacterId(canonicalFavoriteCharacterId);
      setSelectedLeader(canonicalFavoriteCharacterId);
      setIdentityLeaderAuthorityReady(true);
      return true;
    }
    return false;
  }, [session?.user?.id, setSelectedLeader]);

  const refreshDailyFreeGachaAuthority = useCallback(async (explicitUserId?: string) => {
    const userId = explicitUserId || session?.user?.id;
    if (!userId) return false;
    const requestId = ++dailyFreeAuthorityRequestRef.current;
    setDailyFreeGachaReady(false);
    const { data, error } = await supabase
      .from("user_daily_gacha_claims")
      .select("gacha_type,last_claimed_date")
      .eq("user_id", userId);
    if (requestId !== dailyFreeAuthorityRequestRef.current) return false;
    if (error) {
      console.warn("Daily free Gacha authority is unavailable:", error);
      return false;
    }
    const today = getJstDateString();
    const next = { CHARACTER: true, SKILL: true, EQUIPMENT: true };
    for (const claim of data || []) {
      if (claim.last_claimed_date !== today) continue;
      if (claim.gacha_type === "CHARACTER") next.CHARACTER = false;
      if (claim.gacha_type === "SKILL") next.SKILL = false;
      if (claim.gacha_type === "EQUIPMENT") next.EQUIPMENT = false;
    }
    setDailyFreeGachaFlags(next);
    setDailyFreeGachaReady(true);
    return true;
  }, [session?.user?.id, setDailyFreeGachaFlags, setDailyFreeGachaReady]);




  const [selectedMapAreaId, setSelectedMapAreaId] = useState<string | null>(null);
  const [movingAreaLoading, setMovingAreaLoading] = useState<boolean>(false);

  // ==========================================
  // 3. Supabase Auth セッション監視
  // ==========================================
  // ==========================================
  // Persisted sessions are restored automatically. A brand-new anonymous
  // account is created only after the player explicitly starts a new game.
  // ==========================================
  const resetAuthenticatedProjection = (nextUserId: string | null) => {
    if (currentAuthUserIdRef.current === nextUserId) return;
    setActivePlayerDetail(null);
    currentAuthUserIdRef.current = nextUserId;
    if (readHomeResumeSnapshot()?.userId !== nextUserId) clearHomeResumeSnapshot();
    setAuthenticatedProjectionOwnerUserId("");
    setAuthenticatedProjectionError(null);
    setIdentityLeaderOwnerUserId("");
    setIdentityLeaderCharacterId("");
    setIdentityLeaderAuthorityReady(false);
    setGuildAuthorityOwnerUserId("");
    setGuildDiscoveryState("pending");
    setOnboardingState(null);
    setUsername("");
    setSelectedLeader("");
    setUserGuild(null);
    setUserGuildMember(null);
    setGuildMembersList([]);
    setPendingGuildJoinRequests([]);
    setGuildJoinRequests([]);
    setUserCharactersDbList([]);
    setUserSkillsList([]);
    setUserEquipmentsList([]);
    resetUserItemsProjection(nextUserId || "");
    setCash(0);
    setDiamonds(0);
    setUserLevel(1);
    setUserXp(0);
    setDailyFreeGachaReady(false);
    setDailyFreeGachaFlags({ CHARACTER: false, SKILL: false, EQUIPMENT: false });
    setGuideGachaCategory(null);
    setTotalPower(0);
    setTotalPowerLoading(Boolean(nextUserId));
    loginBonusRequestUserRef.current = null;
    setLoginBonusClaimResult(null);
    setUserLoginBonus(null);
    setShowLoginBonusModal(false);
    setLoginBonusCheckComplete(false);
    setShowPrepMissionDialog(false);
    setPrepMissionDialogCheckComplete(false);
    setRankingRewardNotificationCheckComplete(false);
    setShowAccountAuthenticationModal(false);
    setShowAuthenticationReminder(false);
  };

  useEffect(() => {
    const restoreAuthSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      markHomeReloadStage("authSessionReady");
      if (session) {
        resetAuthenticatedProjection(session.user.id);
        setSession(session);
        lastValidatedAuthUserIdRef.current = session.user.id;
        if (isMatchingGoogleOnboardingReturn(session.user.id) || hasPendingGoogleAccountSwitch()) setShowTitleView(false);
        await checkIfSetupRequired(session.user.id);
        return;
      }
      lastValidatedAuthUserIdRef.current = null;
      resetAuthenticatedProjection(null);
      clearHomeResumeSnapshot();
      setSession(null);
      setOnboardingState(null);
      setIsSetupRequired(false);
      clearLegalSettingsReturn();
      setShowTitleView(true);
      setAuthLoading(false);
    };
    void restoreAuthSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        lastValidatedAuthUserIdRef.current = null;
        resetAuthenticatedProjection(null);
        setSession(null);
        setOnboardingState(null);
        setIsSetupRequired(false);
        return;
      }
      const authUserChanged = currentAuthUserIdRef.current !== session.user.id;
      if (authUserChanged) {
        setAuthLoading(true);
        resetAuthenticatedProjection(session.user.id);
      }
      setSession((current: typeof session) => current
        && current.user.id === session.user.id
        && current.access_token === session.access_token
        ? current
        : session);
      if (!shouldRevalidateAuthSession(event, lastValidatedAuthUserIdRef.current, session.user.id)) return;
      lastValidatedAuthUserIdRef.current = session.user.id;
      if (isMatchingGoogleOnboardingReturn(session.user.id) || hasPendingGoogleAccountSwitch()) setShowTitleView(false);
      void checkIfSetupRequired(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    const interval = setInterval(() => {
      syncActiveUsers(session.user.id);
    }, 30000);
    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const interval = setInterval(() => {
      syncBootstrapData(session.user.id);
    }, 15 * 60 * 1000); // 15分動的ランキング変動
    return () => clearInterval(interval);
  }, [session]);

  const checkIfSetupRequired = async (userId: string) => {
    const runningCheck = onboardingCheckRef.current.get(userId);
    if (runningCheck) return runningCheck;
    const checkPromise = (async () => {
      try {
      const { data, error } = await supabase.rpc("get_current_onboarding_state");
      if (error) throw error;
      let nextState = data as import("./hooks/useAuth").OnboardingState;
      if (nextState?.user_id !== userId || (currentAuthUserIdRef.current && currentAuthUserIdRef.current !== userId)) {
        throw new Error("Authenticated player projection did not match the active session.");
      }
      const emailIntent = readEmailOnboardingIntent();
      if (emailIntent && emailIntent.userId !== userId) {
        await supabase.auth.signOut();
        setSession(null);
        setOnboardingState(null);
        setIsSetupRequired(false);
        window.localStorage.removeItem(EMAIL_ONBOARDING_INTENT_KEY);
        setErrorMessage("メール連携を開始したゲームデータと異なるユーザーが検出されました。データ保護のため連携を中止しました。");
        setShowTitleView(true);
        return;
      }
      if (nextState.tutorial_step === "TUTORIAL_BATTLE") {
        // Reward claiming is authoritative and idempotent, but the tutorial
        // step is deliberately kept on TUTORIAL_BATTLE while its result modal
        // is visible. Recover the narrow reload/crash window after the reward
        // commit by advancing only when no tutorial encounter remains pending.
        const { data: tutorialPatrols } = await supabase
          .from("user_patrols")
          .select("status,has_battle_event,battle_resolved")
          .eq("user_id", userId);
        const hasPendingEncounter = (tutorialPatrols || []).some((patrol: any) =>
          patrol.status !== "COMPLETED" && patrol.has_battle_event
        );
        const hasClaimedEncounter = (tutorialPatrols || []).some((patrol: any) =>
          patrol.status === "COMPLETED" && patrol.battle_resolved
        );
        if (!hasPendingEncounter && hasClaimedEncounter) {
          const { data: resumedBattle, error: resumeBattleError } = await supabase.rpc("advance_tutorial_progress", {
            p_expected_step: "TUTORIAL_BATTLE",
            p_next_step: "RULE_GUIDE",
          });
          if (!resumeBattleError) {
            nextState = { ...nextState, tutorial_step: resumedBattle || "RULE_GUIDE" };
          }
        }
      }
      if (!nextState.has_profile && !nextState.is_anonymous) {
        // Existing-account login is not a player-registration route. Keeping
        // this session would expose SetupView, whose RPC correctly rejects it.
        await supabase.auth.signOut();
        setSession(null);
        setOnboardingState(null);
        setIsSetupRequired(false);
        setErrorMessage("この認証アカウントにはゲームデータがありません。「はじめから」で匿名チュートリアルを開始し、完了後にアカウントを連携してください。");
        window.localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
        setShowTitleView(true);
        return;
      }
      setOnboardingState(nextState);
      setIsSetupRequired(nextState.is_anonymous && !nextState.has_profile);
      const legalSettingsReturnRequested = isLegalSettingsReturnRequested();
      if (nextState.gameplay_authorized && hasPendingLegalSettingsReturn(userId)) {
        setShowTitleView(false);
        setShowSettingsPanel(true);
        clearLegalSettingsReturn();
      } else if (legalSettingsReturnRequested) {
        clearLegalSettingsReturn();
        setShowTitleView(true);
      }
      // A verified email may return in a browser context without the local
      // intent. Resume from the same-UID server projection instead of leaving
      // the account on COMPLETE with gameplay_authorized=false.
      const isVerifiedEmailReturn = Boolean(!nextState.is_anonymous
        && nextState.has_profile
        && nextState.tutorial_step === "COMPLETE"
        && nextState.auth_method === "EMAIL"
        && nextState.identity_integrity_valid
        && (!emailIntent || emailIntent.userId === userId));
      if (isVerifiedEmailReturn) {
        setShowTitleView(false);
        setShowAccountAuthenticationModal(true);
      }
      if (nextState.gameplay_authorized && hasValidExistingGoogleLoginIntent()) {
        window.localStorage.removeItem(EXISTING_GOOGLE_LOGIN_INTENT_KEY);
        setShowTitleView(false);
      }
      if (nextState.has_profile) {
        // Persisted progress is hydrated here, but entry remains on the title.
        // Only an explicit "続きから" action selects the resume route.
        // Resume an interrupted mandatory tutorial at the screen required by
        // the persisted server-side step instead of falling back to Home.
        if (nextState.tutorial_step === "FREE_GACHA") setActiveTab("gacha");
        else if (nextState.tutorial_step === "AUTO_FORMATION") setActiveTab("character");
        else if (["DISPATCH", "FREE_INSTANT", "TUTORIAL_BATTLE"].includes(nextState.tutorial_step || "")) setActiveTab("patrol");
        // Routing needs the compact onboarding projection, not the entire
        // gameplay bootstrap. Keep the valid tutorial/game screen visible and
        // hydrate secondary data in the background.
        void syncBootstrapData(userId).catch((bootstrapError) => {
          console.warn("Background bootstrap failed:", bootstrapError);
          setTotalPowerLoading(false);
        });
      }
      } catch (err) {
        console.warn("Check setup required failed:", err);
        setTotalPowerLoading(false);
        if (!currentAuthUserIdRef.current || currentAuthUserIdRef.current === userId) {
          // A core onboarding projection failure is not an unfinished load and
          // must never be treated as a ready player. Keep the account ownership
          // guard closed, but give the player a canonical retry path instead of
          // leaving the shell on an infinite checking state.
          setAuthenticatedProjectionError("プレイヤーデータを確認できませんでした。再度お試しください。");
        }
      } finally {
        setAuthLoading(false);
      }
    })();
    onboardingCheckRef.current.set(userId, checkPromise);
    try {
      await checkPromise;
    } finally {
      if (onboardingCheckRef.current.get(userId) === checkPromise) onboardingCheckRef.current.delete(userId);
    }
  };

  useEffect(() => {
    if (session?.user?.id && onboardingState?.has_profile) void bindAcquisitionSubject();
  }, [onboardingState?.has_profile, session?.user?.id]);

  const retryAuthenticatedProjection = async () => {
    const userId = session?.user?.id;
    if (!userId || currentAuthUserIdRef.current !== userId) return;
    setAuthenticatedProjectionError(null);
    await checkIfSetupRequired(userId);
  };

  const syncActiveUsers = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc("sync_active_users");
      if (error) throw error;
      if (typeof data === "number") setActiveUsersCount(data);
    } catch (err) {
      console.warn("Failed to sync active users:", err);
    }
  };

  // ==========================================
  // 3.5 ギルドへのXPおよび貢献度付与の共通処理
  // ==========================================
  const addGuildXpAndContributionByAction = async (actionType: string, sourceId?: string) => {
    // Canonical Guild EXP is granted by authoritative DB triggers/ledger.
    // This compatibility callback remains for older hooks but must not grant XP.
    void actionType;
    void sourceId;
  };

  // ==========================================
  // ⚡ バトルフックの構築
  // ==========================================
  const battle = useBattle({
    session,
    userCharactersDbList,
    userEquipmentsList,
    userSkillsList,
    skillLimitBreakMaster,
    selectedMembers,
    selectedLeader,
    userGuild,
    userGuildMember,
    gvgBaseControls,
    currentBaseId,
    username,
    playCyberSe,
    syncBootstrapData: async (userId: string) => {
      await syncBootstrapData(userId);
    },
    pvpPoints,
    setPvpPoints,
    pvpRate,
    setPvpRate,
    pvpRankings,
    userLevel,
    setUserLevel,
    userXp,
    setUserXp,
    raidPoints,
    setRaidPoints,
    setRaidFirstEntryFree,
    requestRaidTopRefresh: (roomId) => {
      if (roomId) setRaidRescueTarget(null);
      setRaidRoomReturnTarget(roomId && session?.user?.id ? { userId: session.user.id, roomId } : null);
      setRaidTopRefreshRevision((revision) => revision + 1);
    },
    vitality,
    setVitality,
    selectedBattleHelper: null,
    raidBossHp,
    setRaidBossHp,
    raidBossMaxHp,
    setRaidBossMaxHp,
    raidTotalDamage,
    setRaidTotalDamage,
    cash,
    setCash,
    diamonds,
    setDiamonds,
    setErrorMessage,
    addGuildXpAndContributionByAction,
    setConfirmDialogConfig,
    setGlobalInteractionBlocking,
    patrolNpcs,
    patrol: activePatrols.find((entry: any) => entry.has_battle_event && !entry.battle_resolved),
    tutorialStep: onboardingState?.tutorial_step,
    navigateTab: (tabName: string) => setActiveTab(tabName as any),
    setTutorialStep: (step: string) => setOnboardingState(current => current ? { ...current, tutorial_step: step } : current)
  });

  // Tutorial quest result has one owner. The battle viewer stays mounted until
  // the authoritative patrol reward is visible, then this action advances the
  // tutorial exactly once and releases the battle surface.
  const completeTutorialBattleResult = async () => {
    const isTutorialResult = battle.battleMode === "PATROL"
      && battle.battleState === "RESULT"
      && battle.tutorialBattleActive;
    if (!isTutorialResult) {
      battle.completeBattleResult();
      return;
    }
    if (tutorialResultCommitRef.current || !lastPatrolRewards?.isTutorialReward) return;
    tutorialResultCommitRef.current = true;
    setGlobalInteractionBlocking(true);
    try {
      const { data, error } = await supabase.rpc("advance_tutorial_progress", {
        p_expected_step: "TUTORIAL_BATTLE",
        p_next_step: "RULE_GUIDE",
      });
      if (error) throw error;
      setShowPatrolRewardModal(false);
      setLastPatrolRewards(null);
      setOnboardingState((current: any) => current ? { ...current, tutorial_step: data || "RULE_GUIDE" } : current);
      battle.completeBattleResult();
    } catch (error: any) {
      setErrorMessage(`チュートリアルを進められませんでした。${error?.message ? `（${error.message}）` : ""}`);
    } finally {
      tutorialResultCommitRef.current = false;
      setGlobalInteractionBlocking(false);
    }
  };


  // ログインボーナスのチェックと受取処理 (RPC呼び出し)
  const checkAndClaimLoginBonus = async (userId: string) => {
    try {
      const { data: masterData } = await supabase
        .from("login_bonus_master")
        .select("*")
        .order("day_number", { ascending: true });
      if (masterData && masterData.length > 0) {
        setLoginBonusMasters(masterData as LoginBonusMaster[]);
      }

      const { data: result, error } = await supabase.rpc("process_login_bonus");
      if (error) {
        console.warn("Failed to process login bonus RPC:", error);
        return;
      }

      if (result) {
        const claimRes = result as LoginBonusClaimResult;
        setLoginBonusClaimResult(claimRes);
        setUserLoginBonus({
          user_id: userId,
          current_step: claimRes.current_step,
          total_logins: claimRes.total_logins || claimRes.current_step,
          last_claimed_date: claimRes.last_claimed_date || null
        });

        if (claimRes.claimed) {
          if (onboardingState?.gameplay_authorized && activeTab === "home") {
            setShowLoginBonusModal(true);
            setPresentsPrefetched(false);
          }
        }
      }
    } catch (err: any) {
      console.warn("checkAndClaimLoginBonus error:", err);
    } finally {
      setLoginBonusCheckComplete(true);
    }
  };

  // Generic bootstrap runs during the tutorial, so it must not process the
  // login reward. Claim only on the first authenticated Home entry.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || showTitleView || !onboardingState?.gameplay_authorized || activeTab !== "home") return;
    const requestKey = `${userId}:${getJstDateString()}`;
    if (loginBonusRequestUserRef.current === requestKey) return;
    loginBonusRequestUserRef.current = requestKey;
    void checkAndClaimLoginBonus(userId);
  }, [activeTab, onboardingState?.gameplay_authorized, session?.user?.id, showTitleView]);

  useEffect(() => {
    const userId = session?.user?.id;
    const emailConfirmationPending = Boolean(
      userId
      && !session?.user?.is_anonymous
      && onboardingState?.user_id === userId
      && onboardingState?.tutorial_step === "COMPLETE"
      && onboardingState?.auth_method === "EMAIL"
      && onboardingState?.identity_integrity_valid
    );
    const authenticationPending = Boolean(
      userId
      && onboardingState?.user_id === userId
      && onboardingState?.is_anonymous
      && onboardingState?.authentication_pending
      && onboardingState?.gameplay_authorized
    );
    if (emailConfirmationPending) {
      setShowAuthenticationReminder(false);
      setShowAccountAuthenticationModal(true);
      return;
    }
    if (!authenticationPending) {
      setShowAuthenticationReminder(false);
      setShowAccountAuthenticationModal(false);
      return;
    }
    if (showTitleView
      || activeTab !== "home"
      || !loginBonusCheckComplete
      || showLoginBonusModal
      || !prepMissionDialogCheckComplete
      || showPrepMissionDialog
      || !rankingRewardNotificationCheckComplete
      || showAccountAuthenticationModal) return;
    const reminderKey = authenticationReminderKey(userId!);
    const today = getJstDateString();
    if (window.localStorage.getItem(reminderKey) === today) return;
    // Record on presentation so a reload cannot duplicate the same day's guide.
    window.localStorage.setItem(reminderKey, today);
    setShowAuthenticationReminder(true);
  }, [
    activeTab,
    loginBonusCheckComplete,
    prepMissionDialogCheckComplete,
    rankingRewardNotificationCheckComplete,
    onboardingState,
    session?.user?.id,
    showAccountAuthenticationModal,
    showLoginBonusModal,
    showPrepMissionDialog,
    showTitleView,
  ]);

  // ==========================================
  // 4. Supabase DB実データ同期ロード
  // ==========================================
  const syncBootstrapData = async (userId: string) => {
    const previousBootstrap = bootstrapSerialRef.current.catch(() => undefined);
    let releaseBootstrap!: () => void;
    bootstrapSerialRef.current = new Promise<void>((resolve) => { releaseBootstrap = resolve; });
    await previousBootstrap;
    if (currentAuthUserIdRef.current && currentAuthUserIdRef.current !== userId) {
      releaseBootstrap();
      return;
    }
    const patrolRevisionAtStart = patrolStateRevisionRef.current;
    let coreProjectionReady = false;
    let localGuildRec: any = null;
    let localCharIds: string[] = [];
    let localDeck: string[] = [];
    setTotalPowerLoading(true);
    if (identityLeaderOwnerUserId !== userId) setIdentityLeaderAuthorityReady(false);
    const identityAuthorityPromise = refreshIdentityLeaderAuthority(userId);
    const dailyFreeAuthorityPromise = refreshDailyFreeGachaAuthority(userId);
    const inventoryProjectionPromise = refreshUserItemsProjection(userId).catch((error) => {
      console.warn("Failed to prime inventory projection:", error);
      return [];
    });

    // Materialize the current mission cycle/event state before reading the Home
    // projection. Fresh users can otherwise render SPECIAL missions at zero
    // until the next reload, including missing start-time power achievements.
    try {
      const { error: missionSyncError } = await supabase.rpc("sync_current_missions");
      if (missionSyncError) throw missionSyncError;
    } catch (err) {
      console.warn("Failed to sync current missions:", err);
    }

    // Home badges are independent projections. Start their canonical reads at
    // bootstrap entry so Mission / Present badges do not wait behind the wider
    // inventory, social and battle bootstrap. The overlays already reserve no
    // layout space, so an authoritative update cannot shift Home geometry.
    const homeBadgeProjectionPromise = Promise.all([
      supabase.from("presents").select("*").eq("user_id", userId).order("sent_at", { ascending: false }),
      supabase.from("missions").select("*").eq("is_enabled", true),
      supabase.from("user_missions").select("*").eq("user_id", userId),
      supabase.from("mission_reward_components").select("mission_id,item_id,quantity,reward_order").order("reward_order", { ascending: true }),
      supabase.rpc("get_active_mission_events"),
    ]).then(([presentsResult, missionMasterResult, userMissionResult, rewardComponentResult, activeEventResult]) => {
      if (currentAuthUserIdRef.current && currentAuthUserIdRef.current !== userId) return;
      if (presentsResult.data) {
        setPresents(presentsResult.data.map((present) => {
          const diffMs = new Date(present.expire_at).getTime() - Date.now();
          const diffHrs = Math.ceil(diffMs / (1000 * 60 * 60));
          let expireText = `期限: あと${diffHrs}時間`;
          if (diffHrs > 24) expireText = `期限: あと${Math.ceil(diffHrs / 24)}日`;
          else if (diffHrs <= 0) expireText = "期限切れ";
          return {
            id: present.id.toString(),
            title: present.message ? present.message.split(":")[0] : "配布アイテム",
            desc: present.message ? present.message.split(":")[1] || present.message : "",
            reward: `${canonicalItemName(present.item_id)} +${present.quantity}`,
            itemId: present.item_id,
            qty: present.quantity,
            expireText,
            status: present.status,
            loading: false,
          };
        }));
      }
      if (missionMasterResult.data && userMissionResult.data) {
        const rewardComponentsByMission = new Map<string, Array<{ itemId: string; quantity: number }>>();
        for (const component of rewardComponentResult.data || []) {
          const missionId = String(component.mission_id || "");
          if (!missionId) continue;
          const rewards = rewardComponentsByMission.get(missionId) || [];
          rewards.push({ itemId: String(component.item_id || ""), quantity: Number(component.quantity || 0) });
          rewardComponentsByMission.set(missionId, rewards);
        }
        const visibleEvents = new Map(
          (Array.isArray(activeEventResult.data) ? activeEventResult.data : [])
            .map((event: any) => [String(event.event_id || event.id || ""), event] as const)
            .filter(([eventId]) => Boolean(eventId)),
        );
        const userMissionById = new Map(userMissionResult.data.map((row: any) => [row.mission_id, row]));
        const claimedMissionIds = new Set(
          userMissionResult.data.filter((row: any) => row.status === "CLAIMED").map((row: any) => row.mission_id),
        );
        setMissions(missionMasterResult.data
          .filter((mission: any) => mission.trigger_type !== "USER_INVITE" || featureUiExposure("INVITE") === "ACTIVE")
          .filter((mission: any) => mission.category !== "SPECIAL" || !mission.event_id || visibleEvents.has(String(mission.event_id)))
          .map((mission: any) => {
          const userMission: any = userMissionById.get(mission.id);
          const eventProjection: any = mission.event_id ? visibleEvents.get(String(mission.event_id)) : null;
          const prerequisiteClaimed = !mission.prerequisite_mission_id || claimedMissionIds.has(mission.prerequisite_mission_id);
          return {
            id: mission.id,
            title: mission.title || "不明なミッション",
            description: mission.description || mission.desc_text || "",
            reward_item: mission.reward_item_id || "CASH",
            reward_amount: mission.reward_quantity || 0,
            rewardItemId: mission.reward_item_id || "CASH",
            rewardQty: mission.reward_quantity || 0,
            rewards: rewardComponentsByMission.get(String(mission.id)) || [{ itemId: mission.reward_item_id || "CASH", quantity: Number(mission.reward_quantity || 0) }],
            cashReward: Number(mission.cash_reward || 0),
            current_progress: userMission?.current_progress || 0,
            target_value: mission.target_value || 1,
            display_order: mission.display_order || 0,
            category: mission.category || "DAILY",
            eventId: mission.event_id || null,
            eventProgressOpen: eventProjection?.progress_open !== false,
            displayGroup: mission.display_group || "PROGRESS",
            conditionParams: mission.condition_params || {},
            triggerType: mission.trigger_type || "",
            isCompletion: Boolean(
              mission.is_completion
              || mission.condition_params?.is_completion
              || mission.display_group === "COMPLETE"
              || mission.trigger_type === "EVENT_ALL_COMPLETE"
              || mission.trigger_type === "GVG_PREP_REQUIRED_MISSIONS_COMPLETED"
            ),
            prerequisiteMissionId: mission.prerequisite_mission_id || null,
            ctaTab: mission.condition_params?.cta_tab || null,
            ctaAction: mission.condition_params?.cta_action || null,
            ctaLabel: mission.condition_params?.cta_label || null,
            isProvisional: Boolean(mission.is_provisional),
            status: canonicalMissionUiStatus(userMission?.status, prerequisiteClaimed),
            loading: false,
          };
          }).sort((left: any, right: any) => left.display_order - right.display_order));
      }
    }).catch((error) => {
      console.warn("Failed to prime Home badge projections:", error);
    });

    // The Home HUD reads the canonical server projection without waiting for
    // rankings, chat, raids, or the rest of the bootstrap.
    const primeHomePower = async () => {
      try {
        const { data, error } = await supabase.rpc("get_my_power_snapshot");
        if (error) throw error;
        setTotalPower(Number(data?.total_power || 0));
      } catch (err) {
        console.warn("Failed to prime home power:", err);
      } finally {
        setTotalPowerLoading(false);
      }
    };
    void primeHomePower();
    try {
      // 各種マスタデータのフェッチとメモリキャッシュ (並列 Promise.all 実行)
      Promise.all([
        supabase.from("guild_level_master").select("*"),
        supabase.from("guild_xp_action_master").select("*"),
        supabase.from("skill_limit_break_master").select("*"),
        supabase.from("equipment_level_up_master").select("*"),
        supabase.from("equipment_limit_break_master").select("*"),
        supabase.from("gacha_masters").select("*"),
        supabase.from("gacha_items_master").select("*"),
        supabase.from("gacha_rarity_rates").select("gacha_id,rarity,weight"),
        supabase.from("feature_operating_states").select("feature_key,state"),
        supabase.from("login_bonus_master").select("*").order("day_number", { ascending: true })
      ]).then(([lvlRes, xpRes, skillLbrRes, eqLvlRes, eqLbrRes, gachaRes, gachaItemsRes, gachaRatesRes, featureStatesRes, loginBonusRes]) => {
        if (lvlRes.data) setGuildLevelMaster(lvlRes.data);
        if (xpRes.data) setGuildXpActionMaster(xpRes.data);
        if (skillLbrRes.data) setSkillLimitBreakMaster(skillLbrRes.data);
        if (eqLvlRes.data) setEquipmentLevelUpMaster(eqLvlRes.data);
        if (eqLbrRes.data) setEquipmentLimitBreakMaster(eqLbrRes.data);
        if (gachaRes.data) setGachaMasters(gachaRes.data);
        if (gachaItemsRes.data) setGachaItemsMaster(gachaItemsRes.data);
        if (gachaRatesRes.data) setGachaRarityRates(gachaRatesRes.data);
        if (featureStatesRes.data) {
          setFeatureOperatingStates(mergeServerOperationsState(featureStatesRes.data));
        }
        if (loginBonusRes.data && loginBonusRes.data.length > 0) setLoginBonusMasters(loginBonusRes.data as LoginBonusMaster[]);
      }).catch(err => {
        console.warn("Failed to fetch master data:", err);
      });

      await syncActiveUsers(userId);
      void supabase.rpc("record_current_guild_login").then(({ error }) => {
        if (error && error.code !== "PGRST202") console.warn("Failed to record Guild login activity:", error.message);
      });
      // Friend/Friend Helper are PRE-OPEN OMIT. Existing relationship data is
      // retained server-side, but bootstrap does not expose or notify it.
      
      const { data: recovered } = await supabase.rpc("sync_and_recover_vitality_and_pvp_points", {
        p_user_id: userId
      });
      
      // 月額パス状態フェッチ
      try {
        const { data: mpData } = await supabase
          .from("user_monthly_passes")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true)
          .gte("expires_at", new Date().toISOString());

        if (mpData && mpData.length > 0) {
          setMonthlyPassActive(true);
          const today = new Date().toISOString().split("T")[0];
          setMonthlyPassClaimedToday(mpData[0].daily_claimed_at === today);
        } else {
          setMonthlyPassActive(false);
          setMonthlyPassClaimedToday(false);
        }
      } catch (err) {
        console.warn("Failed to fetch monthly pass:", err);
      }
      
      if (recovered) {
        const row = Array.isArray(recovered) ? recovered[0] : recovered;
        setVitality(row.out_vitality);
        setVitalityNextRecoveryAt(row.vitality_next_recovery_at ?? null);
        setPvpPoints(row.out_pvp_points);
        setPvpNextRecoveryAt(row.pvp_next_recovery_at ?? null);
        setRaidPoints(Number(row.out_raid_points ?? 0));
        setRaidFirstEntryFree(Boolean(row.raid_first_entry_free));
        setCash(Number(row.out_cash));
        setDiamonds(row.out_diamonds);
      }

      const { data: userProfile, error: userProfileError } = await supabase
        .from("users")
        .select("id, username, favorite_character_id, bio, avatar_url, sound_settings, current_base_id, daily_cash_skips_count, daily_cash_skips_reset_date, quest_free_skips_count, quest_paid_skips_count, quest_skips_reset_date, last_guild_left_at, gift_code, title_equipped, equipped_background, equipped_front_effect, selected_bg_mode, interior_item, level, xp, created_at")
        .eq("id", userId)
        .single();
      markHomeReloadStage("profileReady");

      if (userProfileError || userProfile?.id !== userId) {
        console.warn("Current User identity authority is unavailable:", userProfileError);
      } else {
        const favoriteCharacterId = userProfile?.favorite_character_id;
        setIdentityLeaderOwnerUserId(userId);
        setIdentityLeaderCharacterId(
          favoriteCharacterId && CHARACTERS_MASTER.some((character) => character.id === favoriteCharacterId)
            ? favoriteCharacterId
            : ""
        );
        setIdentityLeaderAuthorityReady(true);
      }
      await identityAuthorityPromise;
      
      if (userProfile) {
        setUsername(userProfile.username);
        if (userProfile.favorite_character_id) {
          setSelectedLeader(userProfile.favorite_character_id);
        }
        setBio(normalizeUserBio(userProfile.bio));
        setAvatarUrl(userProfile.avatar_url || "/characters/reiji_transparent_asset.png");
        setDailyCashSkips(userProfile.quest_free_skips_count ?? userProfile.daily_cash_skips_count ?? 0);
        setDailyPaidSkips(userProfile.quest_paid_skips_count ?? 0);
        setDailyCashSkipsResetDate(userProfile.quest_skips_reset_date || userProfile.daily_cash_skips_reset_date || null);
        setCurrentBaseId(userProfile.current_base_id || "shinjuku");
        setLastGuildLeftAt(userProfile.last_guild_left_at);
        setGiftCode(userProfile.gift_code || null);
        setTitleEquipped(userProfile.title_equipped || "title_none");
        setEquippedBackground(userProfile.equipped_background || "bg_default");
        setEquippedFrontEffect(userProfile.equipped_front_effect || "effect_none");
        if ((userProfile as any).selected_bg_mode) setSelectedBgMode((userProfile as any).selected_bg_mode);
        if ((userProfile as any).interior_item) setInteriorItem((userProfile as any).interior_item);
        setUserLevel(userProfile.level || 1);
        setHasShownGuildDialog((userProfile as any).has_shown_guild_dialog || false);
        setUserXp(userProfile.xp || 0);
        
        setUserCreatedAt((userProfile as any).created_at || null);

      }

      // ショップ購入履歴の取得
      try {
        const { data: purchaseData } = await supabase
          .from("user_shop_purchases")
          .select("product_id, purchase_count")
          .eq("user_id", userId);
        
        if (purchaseData) {
          const pMap: Record<string, number> = {};
          purchaseData.forEach((p: any) => {
            pMap[p.product_id] = p.purchase_count;
          });
          setUserShopPurchases(pMap);
        }
      } catch (pErr) {
        console.warn("Failed to fetch user shop purchases:", pErr);
      }

      // 無料ガチャ利用状況 ＆ 天井Ptのフェッチ
      try {
        await dailyFreeAuthorityPromise;

        const { data: pityData } = await supabase
          .from("user_gacha_pity_points")
          .select("current_points")
          .eq("user_id", userId)
          .eq("pity_master_id", "pity_special_common")
          .maybeSingle();

        if (pityData) {
          setSpecialPityPoints(pityData.current_points || 0);
        }
      } catch (gachaErr) {
        console.warn("Gacha daily/pity fetch warning:", gachaErr);
      }

      // --- アバターデータの同期 ---
      const { data: userAvatarRec } = await supabase
        .from("user_avatars")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (userAvatarRec) {
        setUserAvatar(userAvatarRec);
        // バックグラウンドでアバターパーツ画像をプリロードする
        if (typeof window !== "undefined") {
          const partsToLoad = [
            userAvatarRec.hair_id,
            userAvatarRec.face_id,
            userAvatarRec.body_id,
            userAvatarRec.shoes_id,
            userAvatarRec.accessory_id,
            userAvatarRec.bg_effect_1_id,
            userAvatarRec.bg_effect_2_id,
            userAvatarRec.gender === "MALE" ? "base_male" : "base_female"
          ].filter(Boolean);

          partsToLoad.forEach(partId => {
            const img = new Image();
            img.src = `/avatar/${partId}.webp`;
          });
        }
      }

      const { data: unlockedPartsList } = await supabase
        .from("user_avatar_parts")
        .select("part_id")
        .eq("user_id", userId);

      if (unlockedPartsList) {
        setUnlockedAvatarParts(unlockedPartsList.map((p: any) => p.part_id));
      }

      const { data: partsMasterList } = await supabase
        .from("avatar_parts")
        .select("*");

      if (partsMasterList) {
        setAvatarPartsMaster(partsMasterList);
      }

      const { data: guildMemberRec } = await supabase
        .from("guild_members")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (guildMemberRec) {
        setGuildDiscoveryState("pending");
        setUserGuildMember(guildMemberRec);
        setPendingGuildJoinRequests([]);

        const { data: guildRec } = await supabase
          .from("guilds")
          .select("*")
          .eq("id", guildMemberRec.guild_id)
          .single();

        if (guildRec) {
          setUserGuild(guildRec);
          localGuildRec = guildRec;
        }

        const { data: membersList } = await supabase
          .from("guild_members")
          .select("*")
          .eq("guild_id", guildMemberRec.guild_id)
          .order("role", { ascending: true });
        
        if (membersList && membersList.length > 0) {
          const memberUserIds = membersList.map((m: any) => m.user_id);
          const { data: publicProfiles } = await supabase.rpc("get_public_profiles", { p_user_ids: memberUserIds });
          const profileByUserId = new Map((publicProfiles || []).map((p: any) => [p.user_id, p]));
          const membersWithProfiles = membersList.map((m: any) => ({ ...m, users: profileByUserId.get(m.user_id) || null }));
          // 初期プレースホルダー表示用にnullを設定
          setGuildMembersList(membersWithProfiles.map((m: any) => ({ ...m, userLevel: null, userPower: null, partyCharIds: null })));

          const userIds = membersWithProfiles.map((m: any) => m.user_id);

          Promise.all([
            supabase.rpc("get_public_leader_characters", { p_user_ids: userIds }),
          ]).then(([charsRes]) => {
            const mappedMembers = membersWithProfiles.map((m: any) => {
              const userPower = Number(m.users?.total_power || 0);
              const favCharId = m.users?.favorite_character_id;
              const userChars = (charsRes.data || []).filter((c: any) => c.user_id === m.user_id);
              const leaderChar = favCharId ? userChars.find((c: any) => c.character_id === favCharId) : null;
              const userLevel = Number(m.users?.level || leaderChar?.level || 1);

              const partyCharIds = Array.isArray(m.users?.main_formation_character_ids)
                ? m.users.main_formation_character_ids
                : [];

              return {
                ...m,
                userLevel,
                userPower,
                partyCharIds
              };
            });
            setGuildMembersList(mappedMembers);
          }).catch(err => {
            console.warn("Failed to load details for guild members:", err);
            setGuildMembersList(membersList.map((m: any) => ({ ...m, userLevel: 1, userPower: 0, partyCharIds: [] })));
          });
        } else {
          setGuildMembersList([]);
        }

        if (guildMemberRec.role === "MASTER") {
          const { data: requests } = await supabase
            .from("guild_join_requests")
            .select("id,guild_id,user_id,status,requested_at")
            .eq("guild_id", guildMemberRec.guild_id)
            .eq("status", "PENDING")
            .order("requested_at", { ascending: true });
          const requestUserIds = (requests || []).map((request: any) => request.user_id);
          const { data: requestProfiles } = requestUserIds.length > 0
            ? await supabase.rpc("get_public_profiles", { p_user_ids: requestUserIds })
            : { data: [] };
          const profileByUserId = new Map((requestProfiles || []).map((profile: any) => [profile.user_id, profile]));
          setGuildJoinRequests((requests || []).map((request: any) => ({
            ...request,
            user: profileByUserId.get(request.user_id) || null,
          })));
        } else {
          setGuildJoinRequests([]);
        }
      } else {
        setUserGuild(null);
        setUserGuildMember(null);
        setGuildMembersList([]);
        setGuildJoinRequests([]);
        setGuildDiscoveryState("pending");

        const [{ data: listAllGuilds, error: guildDiscoveryError }, { data: pendingRequests }] = await Promise.all([
          supabase.rpc("search_guilds", { p_query: "" }),
          supabase.from("guild_join_requests")
            .select("id,guild_id,user_id,status,requested_at")
            .eq("user_id", userId)
            .eq("status", "PENDING"),
        ]);
        if (guildDiscoveryError) {
          console.warn("Guild discovery authority is unavailable:", guildDiscoveryError);
          setAllGuildsDbList([]);
          setGuildDiscoveryState("error");
        } else {
          const guilds = Array.isArray(listAllGuilds) ? listAllGuilds : [];
          setAllGuildsDbList(guilds);
          setGuildDiscoveryState(guilds.length === 0 ? "empty" : "available");
        }
        setPendingGuildJoinRequests(pendingRequests || []);
      }
      // Membership=null and pending=[] are authoritative only after both
      // Guild projections above have completed for this authenticated user.
      setGuildAuthorityOwnerUserId(userId);
      // Core account-owned projections (profile/identity, wallet, Gacha
      // entitlement and Guild membership) are now resolved for the same UID.
      // Remaining gameplay bootstrap work may continue without holding the UI.
      if ((!currentAuthUserIdRef.current || currentAuthUserIdRef.current === userId) && userProfile?.id === userId) {
        setAuthenticatedProjectionOwnerUserId(userId);
        setAuthenticatedProjectionError(null);
        coreProjectionReady = true;
      }

      // 見回り関連データとマスタデータの同期
      const [{ data: questsData }, { data: canonicalQuestData }, { data: questPoolData }, { data: encounterData }, { data: questProgressionData }] = await Promise.all([
        supabase.from("quests").select("*"),
        supabase.from("canonical_quest_master").select("*"),
        supabase.from("canonical_quest_reward_pool_items").select("*"),
        Promise.resolve({ data: [] as any[] }),
        supabase.rpc("get_canonical_quest_progression"),
      ]);
      if (questsData) {
        const canonicalRows = canonicalQuestData?.length ? canonicalQuestData : CANONICAL_QUESTS.map((quest) => ({
          quest_id: quest.questId,
          cash_reward: quest.cashReward,
          user_exp: quest.userExp,
          first_clear_user_exp: quest.firstClearUserExp,
          reward_pool_id: quest.rewardPoolId,
          first_clear_reward_pool_id: quest.firstClearRewardPoolId,
        }));
        const poolRows = questPoolData?.length ? questPoolData : CANONICAL_QUEST_REWARD_POOLS.flatMap((pool) => pool.items.map((item, rollIndex) => ({
          reward_pool_id: pool.rewardPoolId,
          roll_index: rollIndex + 1,
          item_id: item.itemId,
          quantity: item.quantity,
          probability_bp: item.probabilityBp,
        })));
        const canonicalByQuest = new Map(canonicalRows.map((quest: any) => [quest.quest_id, quest]));
        const progressionByQuest = new Map(((questProgressionData as any[]) || []).map((quest: any) => [quest.quest_id, quest]));
        setPatrolCourses(questsData.map((quest: any) => {
          const canonical: any = canonicalByQuest.get(quest.id);
          const progression: any = progressionByQuest.get(quest.id);
          const rewardPoolItems = poolRows.filter((item: any) => item.reward_pool_id === canonical?.reward_pool_id);
          const firstClearItems = poolRows.filter((item: any) => item.reward_pool_id === canonical?.first_clear_reward_pool_id);
          return {
            ...quest,
            reward_cash: canonical?.cash_reward ?? quest.cash_reward ?? quest.reward_cash ?? 0,
            reward_xp: canonical?.user_exp ?? quest.exp_reward ?? quest.reward_xp ?? 0,
            reward_items: rewardPoolItems,
            first_clear_user_exp: canonical?.first_clear_user_exp ?? 0,
            first_clear_items: firstClearItems,
            reward_item_id: rewardPoolItems[0]?.item_id ?? null,
            reward_item_chance: Number(rewardPoolItems[0]?.probability_bp ?? 0) / 100,
            battle_trigger_chance: quest.battle_trigger_chance ?? 0.2,
            is_unlocked: progression?.is_unlocked ?? (typeof canonical?.unlock_condition === "object" ? canonical.unlock_condition.type === "OPEN" : canonical?.unlock_condition === "OPEN"),
            unlock_condition: progression?.unlock_condition ?? canonical?.unlock_condition ?? "OPEN",
            is_first_cleared: progression?.is_first_cleared ?? false,
            enemy_tactic: progression?.enemy_tactic ?? null,
            enemy_member_count: progression?.enemy_member_count ?? 0,
            enemy_members: progression?.enemy_members ?? [],
            recommended_level: progression?.recommended_level ?? null,
            recommended_power: progression?.recommended_power ?? null,
            enemy_attributes: progression?.enemy_attributes ?? [],
          };
        }));
      }

      const { data: raidAttemptState, error: raidAttemptStateError } = await supabase.rpc("get_current_raid_attempt_state");
      if (!raidAttemptStateError && raidAttemptState) {
        setRaidPoints(Number(raidAttemptState.raidPoints ?? 0));
        setRaidFirstEntryFree(Boolean(raidAttemptState.firstEntryFree));
      }

      const encounterRows = encounterData?.length ? encounterData : [];
      const canonicalEncounterProjection = encounterRows.map((encounter: any) => ({
        id: encounter.encounter_id,
        quest_id: encounter.quest_id,
        town_id: encounter.town_id,
        difficulty: encounter.difficulty,
        npc_name: "Canonical NPC Party",
        members: encounter.members,
      }));
      // M9-X presentation fixtures intentionally use non-Production quest IDs.
      // Keep their tiny visual-test encounter isolated to the mock build; real
      // Runtime never reads the retired patrol_npcs Gameplay master.
      const mockFixtureEncounters = process.env.NEXT_PUBLIC_USE_MOCK_DB === "true"
        ? ((await supabase.from("patrol_npcs").select("*")).data || []).filter((npc: any) => (
          !canonicalEncounterProjection.some((encounter: any) => encounter.quest_id === npc.quest_id)
        ))
        : [];
      setPatrolNpcs([...canonicalEncounterProjection, ...mockFixtureEncounters]);

      const { data: userPatrols } = await supabase.from("user_patrols").select("*").eq("user_id", userId);
      
      if (userPatrols && patrolRevisionAtStart === patrolStateRevisionRef.current) {
        const active = userPatrols.filter((p: any) => p.status !== "COMPLETED");
        const formattedPatrols = active.map((p: any) => {
          const expiresAt = new Date(p.expires_at).getTime();
          const startedAt = new Date(p.started_at).getTime();
          const now = Date.now();
          const secondsTotal = Math.ceil((expiresAt - startedAt) / 1000);
          const secondsLeft = Math.max(Math.ceil((expiresAt - now) / 1000), 0);

          return {
            id: p.id,
            courseId: p.course_id || p.quest_id,
            characterId: p.character_id,
            secondsTotal,
            secondsLeft,
            status: (secondsLeft <= 0 ? "CLAIMABLE" : "ONGOING") as "ONGOING" | "CLAIMABLE",
            has_battle_event: p.has_battle_event,
            battle_resolved: p.battle_resolved,
            battle_result: p.battle_result,
            rewards_accrued: p.rewards_accrued,
            encounterSnapshot: p.encounter_snapshot,
            started_at: p.started_at,
            expires_at: p.expires_at
          };
        });
        setActivePatrols(formattedPatrols);

        const needBadge = formattedPatrols.some((p: any) => p.status === "CLAIMABLE" && p.has_battle_event && !p.battle_resolved);
        setHasActivePatrolBattle(needBadge);
      } else if (patrolRevisionAtStart === patrolStateRevisionRef.current) {
        setActivePatrols([]);
        setHasActivePatrolBattle(false);
      }

      const { data: pvpRanks } = await supabase.rpc("get_public_pvp_rankings", {
        p_daily: false, p_limit: 100, p_offset: 0,
      });
      const pvpData = (pvpRanks || []).map((r: any) => ({
        ...r,
        users: {
          username: r.username,
          avatar_url: r.avatar_url,
          guild_members: r.guild_id ? [{ guild_id: r.guild_id, guilds: r.guild_name ? { name: r.guild_name } : null }] : [],
        },
      }));
      if (pvpData.length > 0) {
        setPvpRankings(pvpData);
        const me = pvpData.find((r: any) => r.user_id === userId);
        if (me) {
          setPvpRate(me.rank_points);
          fetchPvpOpponents(userId, me.rank_points);
        }
      }

      const { data: defData } = await supabase
        .from("pvp_defense_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (defData) {
        setPvpDefenseLogs(defData);
      }

      const { data: deckData } = await supabase
        .from("pvp_defense_decks")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (deckData) {
        setMyPvpDefenseDeck(deckData);
      }

      const { data: storyData } = await supabase
        .from("story_sessions")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (storyData && (storyData.status === "INTRO_TALK" || storyData.status === "OUTRO_TALK")) {
        setActiveStorySession({
          stageId: storyData.stage_id,
          currentNodeId: storyData.current_node_id,
          status: storyData.status
        });
      } else {
        setActiveStorySession(null);
      }

      const { data: payHistory } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (payHistory) {
        setPaymentHistory(payHistory);
      }

      const { data: publicBaseControls } = await supabase.rpc("get_public_guild_base_controls");
      const gvgData = (publicBaseControls || []).map((control: any) => ({
        ...control,
        daily_points: 0,
        guilds: control.guild_name ? { name: control.guild_name } : null,
      }));
      
      if (gvgData) {
        setGvgBaseControls(gvgData);

        const mappedBases = BASE_MAP_MASTER.map(base => {
          const baseRecords = gvgData.filter((g: any) => g.base_id === base.id);
          if (baseRecords.length > 0) {
            const topRecord = baseRecords[0];
            const isOurGuild = topRecord.guild_id === (guildMemberRec?.guild_id || "");
            return {
              ...base,
              controlledBy: isOurGuild ? `${localGuildRec?.name || "自ギルド"} (自組織)` : (topRecord.guilds as any)?.name || "他組織",
              topPoints: topRecord.daily_points,
              ourPoints: baseRecords.find((g: any) => g.guild_id === (guildMemberRec?.guild_id || ""))?.daily_points || 0
            };
          }
          return { ...base, controlledBy: "無所属", topPoints: 0, ourPoints: 0 };
        });
        setGvgBases(mappedBases);
      }

      // GvG状態の同期
      try {
        const { data: dayRec } = await supabase.from("gvg_season_status").select("current_day").eq("id", 1).maybeSingle();
        const currentDay = dayRec?.current_day || 1;
        setGvgSeasonDay(currentDay);

        const { data: defDeckRec } = await supabase.from("gvg_defense_decks").select("*").eq("user_id", userId).maybeSingle();
        setGvgDefenseDeck(defDeckRec || null);

        const { data: officialGvgRanking } = await supabase.rpc("get_public_gvg_rankings", { p_limit: 100, p_offset: 0 });
        const personalRankRec = (officialGvgRanking?.individual || []).find((rank: any) => rank.user_id === userId);
        setPersonalGvgPoints(Number(personalRankRec?.actual_damage || 0));

        const isFinalDay = currentDay === 7;
        const { data: matchRecs } = await supabase
          .from("gvg_matches")
          .select("*")
          .eq("status", "ONGOING")
          .eq("is_finals", isFinalDay);

        if (matchRecs) {
          setGvgMatches(matchRecs);
          const myGuildId = guildMemberRec?.guild_id || "";
          const myMatchRec = matchRecs.find((m: any) => m.guild_a_id === myGuildId || m.guild_b_id === myGuildId);
          setMyGvgMatch(myMatchRec || null);
        } else {
          setGvgMatches([]);
          setMyGvgMatch(null);
        }

        const nowTime = new Date();
        const hour = nowTime.getHours();
        const min = nowTime.getMinutes();
        const totalMinutes = hour * 60 + min;

        let activeRound = 0;
        if (totalMinutes >= 12 * 60 && totalMinutes < 12 * 60 + 30) {
          activeRound = 1;
        } else if (totalMinutes >= 20 * 60 && totalMinutes < 20 * 60 + 30) {
          activeRound = 2;
        } else if (totalMinutes >= 23 * 60 && totalMinutes < 23 * 60 + 30) {
          activeRound = 3;
        }
        setGvgActiveRound(activeRound);
      } catch (err: any) {
        console.warn("Failed to sync GvG states:", err.message);
      }

      try {
        if (roomUiEnabled) {
          if (currentAuthUserIdRef.current === userId) {
            await roomActivityRef.current.tracker.observeTransport(createRaidRoomRpcTransport(supabase)).listRooms();
          }
        } else {
          const activity = await loadRaidActivity(supabase, false);
          if (activity.mode !== "legacy") throw new Error("Unexpected Raid mode");
          const { data: activeRaidData, error: activeRaidError } = activity;
          if (activeRaidError) {
            console.warn("Failed to project active Raid state:", activeRaidError);
            setRaidBossHp(0);
            setRaidBossMaxHp(0);
            setRaidBossSecondsLeft(0);
          } else {
            const activeRaid = Array.isArray(activeRaidData)
              ? activeRaidData.find((entry: any) => String(entry.status || "ACTIVE") === "ACTIVE"
                && Number(entry.currentHp ?? 0) > 0
                && new Date(entry.expiresAt).getTime() > Date.now())
              : null;
            if (activeRaid) {
              setRaidBossHp(Number(activeRaid.currentHp));
              setRaidBossMaxHp(Number(activeRaid.maxHp));
              setRaidBossSecondsLeft(Math.max(0, Math.floor((new Date(activeRaid.expiresAt).getTime() - Date.now()) / 1000)));
              setRaidBossBaseId(String(activeRaid.baseId || "shinjuku"));
              setRaidBossName(String(activeRaid.bossName || "Raid Boss"));
            } else {
              setRaidBossHp(0);
              setRaidBossMaxHp(0);
              setRaidBossSecondsLeft(0);
            }
          }
        }
      } catch (error) {
        console.warn("Failed to project active Raid state:", error);
        if (!roomUiEnabled) {
          setRaidBossHp(0); setRaidBossMaxHp(0); setRaidBossSecondsLeft(0);
        }
      }

      setRaidSeasonRankings([]);
      setRaidDamageLogs([]);

      const { data: charsData } = await supabase
        .from("user_characters")
        .select("*")
        .eq("user_id", userId);
      
      if (charsData && charsData.length > 0) {
        setUserCharactersDbList(charsData);
        const charIds = charsData.map(c => c.character_id);
        localCharIds = charIds;
        
        // 🛡️ PvP防衛デッキ（＝出撃パーティ）の取得
        const { data: mainFormation } = await supabase.rpc("get_current_main_formation");

        if (Array.isArray(mainFormation?.characters) && mainFormation.characters.length > 0) {
          const members = mainFormation.characters.map((entry: any) => entry.character_id).filter(Boolean);
          setSelectedMembers(members);
          localDeck = members;
        } else {
          const fallbackDeck = charsData.slice(0, 5).map(c => c.character_id);
          setSelectedMembers(fallbackDeck);
          localDeck = fallbackDeck;
        }

        const explicitLeader = userProfile?.favorite_character_id;
        const targetLeader = explicitLeader && charIds.includes(explicitLeader)
          ? explicitLeader
          : localDeck[0] || charIds[0];
        if (targetLeader) setSelectedLeader(targetLeader);
        const leaderData = charsData.find(c => c.character_id === targetLeader);
        if (leaderData) {
          setCharacterLevel(leaderData.level);
          setCharacterAwaken(leaderData.awakening_level);
        }
      }

      const { data: skillsData } = await supabase
        .from("user_skills")
        .select("*")
        .eq("user_id", userId);
      
      if (skillsData) {
        setUserSkillsList(skillsData);
        if (selectedSkill) {
          const currentSkill = skillsData.find(s => s.id === selectedSkill.id);
          if (currentSkill) {
            setSelectedSkill(currentSkill);
          }
        }
      }

      await inventoryProjectionPromise;

      // Initial equipment is granted by the authenticated authority and projected from saved rows.
      const readPersistedEquipment = () => supabase.from("user_equipments")
        .select("*").eq("user_id", userId).order("created_at", { ascending: false });
      const initialEquipment = await readPersistedEquipment();
      if (currentAuthUserIdRef.current !== userId) return;
      if (initialEquipment.error || !initialEquipment.data) throw new Error("Equipment projection unavailable");
      let equipsData = initialEquipment.data;
      if (equipsData.length === 0 && charsData?.length) {
        const grant = await supabase.rpc("ensure_initial_equipment_v1");
        if (currentAuthUserIdRef.current !== userId) return;
        // Even after a lost response, reconcile persisted rows. Never reconstruct a grant.
        const refreshedEquipment = await readPersistedEquipment();
        if (currentAuthUserIdRef.current !== userId) return;
        if (refreshedEquipment.error || !refreshedEquipment.data) throw new Error("Equipment projection unavailable");
        equipsData = refreshedEquipment.data;
        if (grant.error) console.warn("Initial equipment authority unavailable", grant.error.code);
      }
      setUserEquipmentsList(equipsData);
      const currentEquip = equipsData.find(e => e.id === selectedEquipment?.id) || equipsData[0] || null;
      setSelectedEquipment(currentEquip);
      setEquipmentLevel(currentEquip?.level ?? 1);
      setEquipmentLimitBreak(currentEquip?.plus_val ?? 0);
      setSubOptions(currentEquip?.random_options || []);
      // Existing next syncUserPower(userId, charsData, equipsData || [], localDeck)
      // consumes this same persisted projection; no formula change.

      // 総合力データの同期
      if (charsData && charsData.length > 0) {
        const calculatedPower = await syncUserPower(userId, charsData, equipsData || [], localDeck);
        setTotalPower(calculatedPower);
      }

      // 総合力およびギルド総合力ランキングの取得・集計
      const [{ data: publicPowerRankings }, { data: publicGuildPowerRankings }] = await Promise.all([
        supabase.rpc("get_public_power_rankings", { p_daily: false, p_limit: 100, p_offset: 0 }),
        supabase.rpc("get_public_guild_power_rankings", { p_daily: false, p_limit: 100, p_offset: 0 }),
      ]);
      const rawPowerRankings = (publicPowerRankings || []).map((r: any) => ({
        user_id: r.user_id,
        current_power: r.current_power,
        updated_at: r.updated_at,
        users: {
          username: r.username,
          avatar_url: r.avatar_url,
          guild_members: r.guild_id ? [{ guild_id: r.guild_id, guilds: r.guild_name ? { name: r.guild_name } : null }] : []
        }
      }));

      if (rawPowerRankings) {
        setPowerRankings(rawPowerRankings);

        // ギルド別の総合力を集計
        if (false) { // Retained only to avoid disturbing unrelated accumulated UI diffs; server aggregation is canonical below.
        const guildMap: { [key: string]: { name: string, members: any[], current_power_sum: number, daily_power_sum: number, updated_at_max: string } } = {};
        
        rawPowerRankings.forEach((r: any) => {
          const gMember = r.users?.guild_members?.[0] || r.users?.guild_members;
          const guild = gMember?.guilds || gMember?.[0]?.guilds;
          const guildId = gMember?.guild_id || gMember?.[0]?.guild_id;
          
          if (guildId && guild) {
            if (!guildMap[guildId]) {
              guildMap[guildId] = {
                name: guild.name,
                members: [],
                current_power_sum: 0,
                daily_power_sum: 0,
                updated_at_max: '1970-01-01'
              };
            }
            guildMap[guildId].members.push(r);
            guildMap[guildId].current_power_sum += r.current_power;
            
            // 本日アクティブ判定（24時間以内）なら、デイリー集計にも加算する
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recordDate = new Date(r.updated_at);
            if (recordDate >= oneDayAgo) {
              guildMap[guildId].daily_power_sum += r.current_power;
            }
            
            if (r.updated_at > guildMap[guildId].updated_at_max) {
              guildMap[guildId].updated_at_max = r.updated_at;
            }
          }
        });
        
        const guildRankList = Object.entries(guildMap).map(([id, val]) => ({
          guild_id: id,
          name: val.name,
          current_power: val.current_power_sum,
          daily_power: val.daily_power_sum,
          updated_at: val.updated_at_max
        }));
        
        setGuildPowerRankings(guildRankList);
        }
        setGuildPowerRankings((publicGuildPowerRankings || []).map((guild: any) => ({
          ...guild,
          current_power: Number(guild.current_power || 0),
          daily_power: Number(guild.daily_power || 0),
          updated_at: new Date().toISOString(),
        })));
      }

      // ==========================================
      // 🛡️ 戦闘セッション復帰 (Resume) ロジック
      // ==========================================
      const pendingRoomHandled = await battle.resumePendingRaidRoomBattle();
      const { data: activeBattleSession } = await supabase
        .from("battle_sessions")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pendingRoomHandled && activeBattleSession) battle.resumeBattleSession(activeBattleSession, localCharIds);

      const { data: newsData } = await supabase
        .from("news")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (newsData) {
        setNewsList(newsData.map(n => ({
          id: n.id.toString(),
          category: n.category.toLowerCase(),
          title: n.title,
          date: new Date(n.start_at).toLocaleDateString(),
          content: n.content
        })));
      }

      await homeBadgeProjectionPromise;

    } catch (err: any) {
      console.warn("Sync error:", err.message);
      if (!coreProjectionReady && (!currentAuthUserIdRef.current || currentAuthUserIdRef.current === userId)) {
        setAuthenticatedProjectionError("プレイヤーデータを確認できませんでした。再度お試しください。");
      }
    } finally {
      setTotalPowerLoading(false);
      releaseBootstrap();
    }
  };

  const resumeCurrentSession = async () => {
    const userId = session?.user?.id;
    if (!userId || resumeLoading) return false;
    setResumeLoading(true);
    setAuthenticatedProjectionError(null);
    try {
      // Continue waits for the compact Home and inventory authority projections.
      // Guild, ranking and other secondary bootstrap work stays in the background.
      const [{ data: state, error }, { data: profile, error: profileError }, { data: recovered }, { data: power }] = await Promise.all([
        supabase.rpc("get_current_onboarding_state"),
        supabase.from("users")
          .select("id,username,favorite_character_id,bio,avatar_url,current_base_id,level,xp")
          .eq("id", userId)
          .single(),
        supabase.rpc("sync_and_recover_vitality_and_pvp_points", { p_user_id: userId }),
        supabase.rpc("get_my_power_snapshot"),
        refreshUserItemsProjection(userId),
      ]);
      if (error || state?.user_id !== userId) throw error || new Error("Resume authority mismatch");
      // An anonymous onboarding identity exists before the player submits a
      // name, so public.users, wallet and power projections do not exist yet.
      // Resume that pre-profile lifecycle directly into SetupView instead of
      // treating the intentionally absent profile as a broken save.
      if (state.is_anonymous && !state.has_profile) {
        setOnboardingState(state);
        setIsSetupRequired(true);
        setShowTitleView(false);
        return true;
      }
      if (profileError || profile?.id !== userId) throw profileError || new Error("Resume profile mismatch");
      const recovery = Array.isArray(recovered) ? recovered[0] : recovered;
      if (recovery) {
        setVitality(recovery.out_vitality);
        setVitalityNextRecoveryAt(recovery.vitality_next_recovery_at ?? null);
        setPvpPoints(recovery.out_pvp_points);
        setPvpNextRecoveryAt(recovery.pvp_next_recovery_at ?? null);
        setRaidPoints(Number(recovery.out_raid_points ?? 0));
        setRaidFirstEntryFree(Boolean(recovery.raid_first_entry_free));
        setCash(Number(recovery.out_cash));
        setDiamonds(Number(recovery.out_diamonds));
      }
      setUsername(profile.username || "");
      setBio(normalizeUserBio(profile.bio));
      setAvatarUrl(profile.avatar_url || "/characters/reiji_transparent_asset.png");
      setCurrentBaseId(profile.current_base_id || "shinjuku");
      setUserLevel(profile.level || 1);
      setUserXp(profile.xp || 0);
      const favoriteCharacterId = profile.favorite_character_id
        && CHARACTERS_MASTER.some((character) => character.id === profile.favorite_character_id)
          ? profile.favorite_character_id
          : "";
      setIdentityLeaderOwnerUserId(userId);
      setIdentityLeaderCharacterId(favoriteCharacterId);
      setIdentityLeaderAuthorityReady(true);
      setSelectedLeader(favoriteCharacterId);
      setTotalPower(Number(power?.total_power || 0));
      setTotalPowerLoading(false);
      setAuthenticatedProjectionOwnerUserId(userId);
      setOnboardingState(state);
      const requiresEmailCompletion = Boolean(!state.is_anonymous
        && state.has_profile
        && state.tutorial_step === "COMPLETE"
        && state.auth_method === "EMAIL"
        && state.identity_integrity_valid
        && !state.gameplay_authorized);
      if (requiresEmailCompletion) {
        setActiveTab("home");
        setShowAccountAuthenticationModal(true);
        setShowTitleView(false);
        void syncBootstrapData(userId).catch((bootstrapError) => console.warn("Background resume bootstrap failed:", bootstrapError));
        return true;
      }
      if (state.tutorial_step === "TUTORIAL_BATTLE") {
        const { data: resumablePatrol } = await supabase
          .from("user_patrols")
          .select("id")
          .eq("user_id", userId)
          .neq("status", "COMPLETED")
          .eq("has_battle_event", true)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (resumablePatrol?.id) await battle.resumeActiveBattleSession(resumablePatrol.id);
      }
      if (state.tutorial_step === "FREE_GACHA") setActiveTab("gacha");
      else if (state.tutorial_step === "AUTO_FORMATION") setActiveTab("character");
      else if (["DISPATCH", "FREE_INSTANT", "TUTORIAL_BATTLE"].includes(state.tutorial_step || "")) setActiveTab("patrol");
      else if (!battle.battleState) setActiveTab("home");
      setShowTitleView(false);
      void syncBootstrapData(userId).catch((bootstrapError) => console.warn("Background resume bootstrap failed:", bootstrapError));
      return true;
    } catch (error) {
      console.warn("Resume authority resolution failed:", error);
      setAuthenticatedProjectionError("プレイヤーデータを確認できませんでした。再度お試しください。");
      // TitleView has render priority over the authenticated projection guard.
      // Close it on a failed explicit resume so the canonical retry dialog is
      // visible instead of leaving the player on a non-responsive title menu.
      setShowTitleView(false);
      return false;
    } finally {
      setResumeLoading(false);
    }
  };


  // 🕒 30秒バックグラウンド自動回復タイマー
  useEffect(() => {
    if (!session) return;
    const recoveryTimer = setInterval(async () => {
      try {
        const { data: recovered } = await supabase.rpc("sync_and_recover_vitality_and_pvp_points", {
          p_user_id: session.user.id
        });
        
        if (recovered) {
          const row = Array.isArray(recovered) ? recovered[0] : recovered;
          setVitality(row.out_vitality);
          setVitalityNextRecoveryAt(row.vitality_next_recovery_at ?? null);
          setPvpPoints(row.out_pvp_points);
          setPvpNextRecoveryAt(row.pvp_next_recovery_at ?? null);
          setRaidPoints(Number(row.out_raid_points ?? 0));
          setRaidFirstEntryFree(Boolean(row.raid_first_entry_free));
          setCash(Number(row.out_cash));
          setDiamonds(row.out_diamonds);
        }
      } catch (e) {
        console.warn("Background auto-recovery failed:", e);
      }
    }, 30000);

    return () => clearInterval(recoveryTimer);
  }, [session]);

  // ⏱️ レイドボス出現残り時間カウントダウン
  useEffect(() => {
    if (roomUiEnabled || raidBossSecondsLeft <= 0) return;
    const timer = setInterval(() => {
      setRaidBossSecondsLeft(prev => {
        if (prev <= 1) {
          if (session) syncBootstrapData(session.user.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [roomUiEnabled, raidBossSecondsLeft, session]);

  // 💬 チャットフェッチ ＆ Realtime
  useEffect(() => {
    if (!session) return;
    if (chatChannel === "DM") {
      setGuildChats([]);
      return;
    }
    
    const fetchChats = async () => {
      let query = supabase
        .from("board_posts")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(30);

      if (chatChannel === "GLOBAL") {
        query = query.eq("target_type", "GLOBAL");
      } else if (chatChannel === "GUILD") {
        const guildIdFilter = userGuildMember?.guild_id || "";
        query = query.eq("target_type", "GUILD").eq("target_id", guildIdFilter);
      }

      const { data } = await query;
      if (data) {
        setGuildChats(data);
      }
    };

    fetchChats();

    const guildIdFilter = userGuildMember?.guild_id || "";
    const channelName = `realtime_posts_${chatChannel}_${chatChannel === "GUILD" ? guildIdFilter : currentBaseId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "board_posts"
        },
        (payload) => {
          const newPost = payload.new as any;

          let isMatch = false;
          if (chatChannel === "GLOBAL" && newPost.target_type === "GLOBAL") isMatch = true;
          else if (chatChannel === "GUILD" && newPost.target_type === "GUILD" && newPost.target_id === guildIdFilter) isMatch = true;

          if (isMatch) {
            setGuildChats((prev) => {
              if (prev.some((p) => p.id === newPost.id)) return prev;
              return [...prev, newPost];
            });
          }

          void refreshChatUnreadCounts();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void fetchChats();
          void refreshChatUnreadCounts();
        }
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchChats();
        void refreshChatUnreadCounts();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [chatChannel, currentBaseId, userGuildMember, session, refreshChatUnreadCounts]);

  // 見回り進行タイマー
  useEffect(() => {
    if (activePatrols.length === 0) return;
    const hasOngoing = activePatrols.some(p => p.secondsLeft > 0);
    if (!hasOngoing) return;

    const timer = setInterval(() => {
      setActivePatrols((prev) => {
        let anyCompletedThisTick = false;
        const nextPatrols = prev.map(p => {
          if (p.secondsLeft <= 0) return p;
          const nextLeft = p.secondsLeft - 1;
          if (nextLeft <= 0) {
            anyCompletedThisTick = true;
            return { ...p, secondsLeft: 0, status: "CLAIMABLE" as const };
          }
          return { ...p, secondsLeft: nextLeft };
        });

        if (anyCompletedThisTick && session) {
          syncBootstrapData(session.user.id);
        }

        return nextPatrols;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activePatrols, session]);

  // SWR追加プレゼントフェッチ
  useEffect(() => {
    if (session && showInboxPanel && inboxPanelTab === "presents" && !presentsPrefetched) {
      setPresentsSyncing(true);
      const timer = setTimeout(() => {
        setPresentsSyncing(false);
        setPresentsPrefetched(true);
        setPresents((prev) => {
          if (!prev.some(p => p.id === "p_swr")) {
            return [
              ...prev,
              { id: "p_swr", title: "SWR同期追加: アンケート協力のお礼", desc: "アンケート回答のお礼ダイヤ", reward: "ダイヤ +50", itemId: "DIAMOND", qty: 50, expireText: "期限: あと23時間", status: "UNCLAIMED", loading: false }
            ];
          }
          return prev;
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [showInboxPanel, inboxPanelTab, presentsPrefetched, session]);

  // ==========================================
  // 5. 認証 ＆ 初期セットアップハンドラ (useAuthフックへ移譲)
  // ==========================================

  // --- アバターシステムAPI関数 ---
  const handleBuyAvatarPart = async (partId: string, currency: "CASH" | "DIAMOND", price: number) => {
    if (!session?.user?.id) return { success: false, message: "ログインが必要です。" };
    setAvatarLoading(true);
    try {
      // 資金チェック
      if (currency === "CASH" && cash < price) {
        return { success: false, message: "Cashが不足しています。" };
      }
      if (currency === "DIAMOND" && diamonds < price) {
        return { success: false, message: "ダイヤが不足しています。" };
      }

      // 所持パーツに登録
      const { error: insertError } = await supabase
        .from("user_avatar_parts")
        .insert({
          user_id: session.user.id,
          part_id: partId
        });

      if (insertError) {
        throw insertError;
      }

      // 資金の減算
      const nextCash = currency === "CASH" ? cash - price : cash;
      const nextDiamonds = currency === "DIAMOND" ? diamonds - price : diamonds;

      const { error: userUpdateError } = await supabase.rpc("buy_avatar_part", {
        p_user_id: session.user.id,
        p_part_id: partId,
        p_currency_type: currency,
        p_price: price
      });

      if (userUpdateError) {
        throw userUpdateError;
      }

      setCash(nextCash);
      setDiamonds(nextDiamonds);
      setUnlockedAvatarParts(prev => [...prev, partId]);
      playCyberSe("click");

      return { success: true };
    } catch (err: any) {
      console.error(err);
      return { success: false, message: "購入処理中にエラーが発生しました。" };
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleSaveAvatar = async (
    gender: string,
    hairId: string,
    faceId: string,
    bodyId: string,
    shoesId: string | null,
    accessoryId: string | null,
    bgEffect1Id: string | null,
    bgEffect2Id: string | null
  ) => {
    if (!session?.user?.id) return { success: false, message: "ログインが必要です。" };
    setAvatarLoading(true);
    try {
      const nextConfig = {
        user_id: session.user.id,
        gender,
        hair_id: hairId,
        face_id: faceId,
        body_id: bodyId,
        shoes_id: shoesId,
        accessory_id: accessoryId,
        bg_effect_1_id: bgEffect1Id,
        bg_effect_2_id: bgEffect2Id,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("user_avatars")
        .upsert(nextConfig);

      if (error) {
        throw error;
      }

      setUserAvatar(nextConfig);
      
      // プリロード
      if (typeof window !== "undefined") {
        const partsToLoad = [
          hairId,
          faceId,
          bodyId,
          shoesId,
          accessoryId,
          bgEffect1Id,
          bgEffect2Id,
          gender === "MALE" ? "base_male" : "base_female"
        ].filter(Boolean);

        partsToLoad.forEach(partId => {
          const img = new Image();
          img.src = `/avatar/${partId}.webp`;
        });
      }

      playCyberSe("click");

      return { success: true };
    } catch (err: any) {
      console.error(err);
      return { success: false, message: "アバター設定の保存中にエラーが発生しました。" };
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleGenerateGiftCode = async () => {
    if (!session) return;
    setUpgradeLoading(true);
    playCyberSe("click");
    try {
      const { data, error } = await supabase.rpc("generate_current_user_invite_code");
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      if (data) {
        setGiftCode(data);
        setConfirmDialogConfig({ isOpen: true, title: "ギフトコード", message: `ギフトコード【${data}】を新規発行しました。`, onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      }
    } catch (e: any) {
      console.warn("Generate gift code failed:", e);
      setErrorMessage("ギフトコードの発行に失敗しました。");
    } finally {
      setUpgradeLoading(false);
    }
  };



  // ==========================================
  // 6. 各種ゲームロジックアクション
  // ==========================================
  const triggerNpcDefenseSimulation = async () => {
    if (!session) return;
    if (simulatingDefense || battle.battleLoading) return;
    setSimulatingDefense(true);
    playCyberSe("click");

    try {
      await battle.startCardBattle("PVP_PRACTICE", "NPC防衛訓練部隊", "npc_dummy_practice");
    } catch (err: any) {
      console.warn("Defense simulation failed:", err.message);
      setErrorMessage("NPC模擬戦を開始できませんでした。");
    } finally {
      setSimulatingDefense(false);
    }
  };



  const handleMoveBase = async (baseId: string) => {
    if (!session || movingAreaLoading) return false;
    setMovingAreaLoading(true);
    playCyberSe("click");

    const prevBase = currentBaseId;
    // Switch the scene before persisting it. A failed request is the only case
    // in which the player needs to wait for a rollback.
    setCurrentBaseId(baseId);
    setSelectedMapAreaId(null);

    try {
      const { data, error } = await supabase.rpc("move_current_user_base", {
        p_base_id: baseId,
      });

      if (error) throw error;
      if (data?.current_base_id !== baseId) throw new Error("Location movement response mismatch");
      return true;
    } catch (err: any) {
      console.warn("Move base failed, rolling back:", err.message);
      setCurrentBaseId(prevBase);
      setErrorMessage("拠点移動の同期に失敗しました。");
      return false;
    } finally {
      setMovingAreaLoading(false);
    }
  };



  const triggerStripeWebhookSimulation = async (duplicateRequest: boolean) => {
    if (!session) return;
    setProfileLoading(true);
    playCyberSe("click");

    const sessionId = duplicateRequest 
      ? lastPaymentSessionId 
      : `stripe_session_${Math.floor(Math.random() * 899999) + 100000}`;

    if (!sessionId) {
      setErrorMessage("前回のセッションが見つかりません。新規購入を行ってください。");
      setProfileLoading(false);
      return;
    }

    try {
      const { data: existTx } = await supabase
        .from("payment_transactions")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .limit(1);

      if (existTx && existTx.length > 0) {
        setConfirmDialogConfig({ isOpen: true, title: "決済シミュレーション", message: "【Stripe Webhook 冪等性競合検知】 重複トランザクションを安全に無視しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
        setProfileLoading(false);
        return;
      }

      await supabase.from("payment_transactions").insert({
        user_id: session.user.id,
        stripe_session_id: sessionId,
        amount: 1200,
        currency: "jpy",
        diamonds_added: 120,
        status: "COMPLETED"
      });

      const nextDiamonds = diamonds + 120;
      await supabase.rpc("add_test_diamonds", { p_user_id: session.user.id, p_amount: 120 });
      
      setDiamonds(nextDiamonds);
      setLastPaymentSessionId(sessionId);
      await syncBootstrapData(session.user.id);

      setConfirmDialogConfig({ isOpen: true, title: "決済完了", message: `Stripe決済シミュレート完了。有償ダイヤ+120。`, onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (err: any) {
      console.warn(err.message);
    } finally {
      setProfileLoading(false);
    }
  };








  const handleDeployGvgDefense = async (charIds: string[]) => {
    if (!session) return;
    if (!userGuildMember?.guild_id) {
      setConfirmDialogConfig({ isOpen: true, title: "GvG防衛", message: "ギルドに所属していないため、守備デッキの登録はできません。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      return;
    }
    playCyberSe("click");
    setGvgResetLoading(true);

    try {
      const { error } = await supabase.rpc("save_gvg_defense_deck", { p_character_ids: charIds });
      if (error) throw error;
      if (charIds.length === 0) {
        setConfirmDialogConfig({ isOpen: true, title: "GvG防衛", message: "守備デッキの登録を解除しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      } else {
        setConfirmDialogConfig({ isOpen: true, title: "GvG防衛", message: "守備デッキを登録しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      }
      await syncBootstrapData(session.user.id);
    } catch (e: any) {
      console.warn("Failed to deploy GvG defense deck:", e.message);
      setConfirmDialogConfig({ isOpen: true, title: "GvG防衛", message: "守備デッキの登録に失敗しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handlePowerDailyReset = async () => {
    // ADMIN_ONLY: 管理者デバッグ専用。RLSで一般ユーザーからのUPDATEを制限すること。中長期でServer Actions/Edge Functionsに移行予定。
    if (!session) return;
    setGvgResetLoading(true);
    try {
      const { error } = await supabase.rpc("reset_daily_power_rankings");
      if (error) throw error;
      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "リセット完了", message: "総合力デイリーリセットを実行しました（アクティブ状態の初期化）。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (e: any) {
      console.warn("Failed to reset daily power rankings:", e.message);
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handlePowerSeasonReset = async () => {
    // ADMIN_ONLY: 管理者デバッグ専用。RLSで一般ユーザーからのUPDATEを制限すること。中長期でServer Actions/Edge Functionsに移行予定。
    if (!session) return;
    setGvgResetLoading(true);
    try {
      const { error } = await supabase.rpc("reset_seasonal_power_rankings");
      if (error) throw error;
      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "リセット完了", message: "総合力シーズンリセットを実行しました（全ユーザーの初期化）。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (e: any) {
      console.warn("Failed to reset seasonal power rankings:", e.message);
    } finally {
      setGvgResetLoading(false);
    }
  };

  const fetchPlayerDetail = async (userId: string) => {
    // タップへの反応を通信完了に依存させない。公開情報を取得後に同じモーダルを更新する。
    setActiveGuildDetail(null);
    const request = beginPlayerDetail({
      id: userId,
      status: "loading",
      username: "プレイヤー情報を取得中",
      bio: null,
      level: 1,
      titleName: null,
      leaderCharacterId: null,
      guildId: null,
      guildName: null,
      party: []
    });
    try {
      const [{ data: publicPlayer, error: publicPlayerError }, { data: profileRows, error: profileError }, { data: dailyRows, error: dailyError }, { data: publicRoster, error: publicRosterError }] = await Promise.all([
        supabase.rpc("get_public_player_detail", { p_user_id: userId }),
        supabase.rpc("get_public_profiles", { p_user_ids: [userId] }),
        supabase.rpc("get_public_pvp_rankings", { p_daily: true, p_limit: 100, p_offset: 0 }),
        supabase.rpc("get_public_battle_roster", { p_target_user_id: userId }),
      ]);
      if (!request.isCurrent()) return;
      if (publicPlayerError) throw publicPlayerError;
      if (profileError) console.warn("Public identity projection unavailable:", profileError.message);
      if (dailyError) console.warn("Public daily PvP rank unavailable:", dailyError.message);
      if (publicRosterError) console.warn("Public equipped skill projection unavailable:", publicRosterError.message);
      const identity = (Array.isArray(profileRows) ? profileRows : [])[0] || {};
      const dailyStanding = (Array.isArray(dailyRows) ? dailyRows : []).find((row: any) => row.user_id === userId);
      const rosterCharacters = Array.isArray(publicRoster?.characters) ? publicRoster.characters : [];
      request.publish({
        id: publicPlayer.user_id,
        status: "ready",
        username: publicPlayer.username,
        leaderCharacterId: identity.favorite_character_id || null,
        bio: publicPlayer.bio || null,
        level: Number(publicPlayer.level || 1),
        titleName: identity.title_name || identity.title_equipped || null,
        guildId: publicPlayer.guild_id || null,
        guildName: publicPlayer.guild_name || null,
        totalPower: Number(publicPlayer.total_power || 0),
        dailyPvpRank: dailyStanding ? Number(dailyStanding.rank_position) : null,
        party: (publicPlayer.main_formation || []).map((character: any) => {
          const rosterCharacter = rosterCharacters.find((entry: any) => entry.character_id === character.character_master_id);
          const statValue = (key: "atk" | "def" | "spd") => Number.isFinite(Number(rosterCharacter?.stats?.[key])) ? Number(rosterCharacter.stats[key]) : undefined;
          return {
            characterId: character.character_master_id,
            name: character.display_name,
            level: Number(character.level || 1),
            plus_val: Number(character.awakening_level || 0),
            rarity: character.rarity,
            assetIdentifier: character.asset_identifier,
            power: Number(character.character_power || 0),
            atk: statValue("atk"),
            def: statValue("def"),
            spd: statValue("spd"),
            skillIds: (Array.isArray(rosterCharacter?.skills) ? rosterCharacter.skills : []).sort((left: any, right: any) => Number(left.slot_index || 0) - Number(right.slot_index || 0)).map((skill: any) => skill.skill_card_id).filter(Boolean).slice(0, 6),
          };
        }),
      });
      return;
      /* Retired: public player detail is supplied exclusively by the server snapshot RPC.
      const { data: profiles, error: userErr } = await supabase.rpc("get_public_profiles", { p_user_ids: [userId] });
      if (userErr) throw userErr;
      const profileRows = Array.isArray(profiles) ? profiles : profiles ? [profiles] : [];
      const user = profileRows[0];
      if (!user) throw new Error("Public profile was not found");
      const profileUserId = user.user_id || user.id || userId;

      // プロフィール本体は先に開き、編成詳細の追加取得失敗で
      // ポップアップ全体が表示されなくなることを防ぐ。
      setActivePlayerDetail({
        id: profileUserId,
        username: user.username,
        avatarUrl: user.avatar_url || "/characters/reiji_transparent_asset.png",
        bio: user.bio || "自己紹介が未設定です。",
        level: user.level,
        xp: user.xp || 0,
        titleName: user.title_name || user.title_equipped || "称号なし",
        guildId: user.guild_id || null,
        guildName: user.guild_name || null,
        party: []
      });

      const { data: deck, error: deckErr } = await supabase
        .from("pvp_defense_decks")
        .select("character_1_id, character_2_id, character_3_id, character_4_id, character_5_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (deckErr) throw deckErr;

      let characterIds: string[] = [];
      if (deck) {
        if (deck.character_1_id) characterIds.push(deck.character_1_id);
        if (deck.character_2_id) characterIds.push(deck.character_2_id);
        if (deck.character_3_id) characterIds.push(deck.character_3_id);
        if (deck.character_4_id) characterIds.push(deck.character_4_id);
        if (deck.character_5_id) characterIds.push(deck.character_5_id);
      }

      const { data: userChars, error: charErr } = await supabase
        .from("user_characters")
        .select("id, character_id, level, plus_val, break_val")
        .eq("user_id", userId);

      if (charErr) throw charErr;

      if (characterIds.length === 0 && userChars && userChars.length > 0) {
        const sorted = [...userChars].sort((a, b) => b.level - a.level || b.plus_val - a.plus_val);
        characterIds = sorted.slice(0, 5).map(c => c.id);
      }

      const partyDetails: any[] = [];
      for (const charId of characterIds) {
        const charData = userChars.find(c => c.id === charId || c.character_id === charId);
        if (!charData) continue;

        const { data: masterChar } = await supabase
          .from("characters")
          .select("name, hp, atk, def, spd, luk")
          .eq("id", charData.character_id)
          .maybeSingle();

        if (!masterChar) continue;

        const { data: equips } = await supabase
          .from("user_equipments")
          .select("id, item_id, hp, atk, def, spd, luk, plus_val, level")
          .eq("equipped_character_id", charId);

        const totalStats = getCharacterTotalStats(charData, equips || []);

        partyDetails.push({
          name: masterChar.name,
          level: charData.level,
          plus_val: charData.plus_val,
          stats: totalStats
        });
      }

      setActivePlayerDetail({
        id: profileUserId,
        username: user.username,
        avatarUrl: user.avatar_url || "/characters/reiji_transparent_asset.png",
        bio: user.bio || "自己紹介が未設定です。",
        level: user.level,
        xp: user.xp || 0,
        titleName: user.title_name || user.title_equipped || "称号なし",
        guildId: user.guild_id || null,
        guildName: user.guild_name || null,
        party: partyDetails
      });
      */
    } catch (e: any) {
      if (!request.isCurrent()) return;
      console.warn("Failed to fetch player detail:", e.message);
      request.publish({
        id: userId,
        status: "error",
        username: "プロフィール",
        bio: null,
        level: 0,
        titleName: null,
        leaderCharacterId: null,
        guildId: null,
        guildName: null,
        party: [],
        errorMessage: "通信状態を確認して、再試行してください。",
      });
    }
  };

  const fetchGuildDetail = async (guildId: string) => {
    // 追加情報の取得に失敗しても、タップ直後に詳細モーダル自体は表示する。
    setActivePlayerDetail(null);
    setActiveGuildDetail({
      id: guildId,
      name: "ギルド情報を取得中",
      level: 1,
      xp: 0,
      member_limit: 0,
      member_count: 0,
      main_alignment: "未設定",
      sub_alignment: null,
      emblem_url: null,
      leaderUserId: null,
      leaderCharacterId: null,
      leaderName: "取得中",
      description: "公開情報を取得しています。",
      approval_required: false,
      recruitment_mode: "OPEN_JOIN",
      controlledBases: [],
      members: [],
    });
    try {
      const { data: publicGuild, error: publicGuildError } = await supabase.rpc("get_public_guild_detail", { p_guild_id: guildId });
      if (publicGuildError) throw publicGuildError;
      if (!publicGuild) throw new Error("Guild public snapshot was empty");
      const publicBaseNames: Record<string, string> = {
        shinjuku: "新宿", shibuya: "渋谷", ikebukuro: "池袋", roppongi: "六本木", akihabara: "秋葉原",
      };
      const publicControlledBases = (Array.isArray(publicGuild.controlled_base_ids) ? publicGuild.controlled_base_ids : [])
        .map((baseId: string) => publicBaseNames[baseId] || baseId);
      setActiveGuildDetail({
        id: publicGuild.guild_id,
        name: publicGuild.name,
        level: publicGuild.level,
        xp: publicGuild.xp,
        member_limit: publicGuild.member_limit,
        member_count: publicGuild.member_count,
        main_alignment: publicGuild.main_alignment,
        sub_alignment: publicGuild.sub_alignment,
        emblem_url: publicGuild.emblem_url,
        leaderUserId: publicGuild.leader_user_id || null,
        leaderCharacterId: publicGuild.leader_favorite_character_id || null,
        leaderName: publicGuild.leader_name,
        description: publicGuild.description || "紹介文はまだ登録されていません。",
        approval_required: Boolean(publicGuild.approval_required),
        recruitment_mode: publicGuild.recruitment_mode || (publicGuild.approval_required ? "APPLICATION_REQUIRED" : "OPEN_JOIN"),
        controlledBases: publicControlledBases,
        active_members_7d: publicGuild.active_members_7d,
        raid_contribution_7d: publicGuild.raid_contribution_7d,
        guild_power: publicGuild.guild_power,
        members: Array.isArray(publicGuild.members) ? publicGuild.members : [],
      });
      void supabase.rpc("record_client_funnel_event", {
        p_event_name: "guild_detail_view", p_source_screen: "guild_detail", p_source_cta: "open",
        p_object_id: guildId, p_metadata: {},
      });
      return;

      const guild: any = null;
      const count = 0;

      let leaderName = "不明";
      if (guild.leader_id) {
        const { data: leaderProfiles } = await supabase.rpc("get_public_profiles", { p_user_ids: [guild.leader_id] });
        const leader = leaderProfiles?.[0];
        if (leader) leaderName = leader.username;
      }

      const bases = ["shinjuku", "shibuya", "ikebukuro", "roppongi", "akihabara"];
      const baseNames: { [key: string]: string } = {
        shinjuku: "新宿",
        shibuya: "渋谷",
        ikebukuro: "池袋", roppongi: "六本木", akihabara: "秋葉原",
        
      };

      const controlledBases: string[] = [];
      bases.forEach(baseId => {
        const records = gvgBaseControls
          .filter((g: any) => g.base_id === baseId)
          .sort((a: any, b: any) => b.daily_points - a.daily_points);
        if (records.length > 0 && records[0].guild_id === guildId) {
          controlledBases.push(baseNames[baseId] || baseId);
        }
      });

      setActiveGuildDetail({
        id: guild.id,
        name: guild.name,
        level: guild.level,
        xp: guild.xp,
        member_limit: guild.member_limit || (guild.level <= 1 ? 10 : guild.level === 2 ? 12 : guild.level === 3 ? 14 : guild.level === 4 ? 17 : 20),
        member_count: count || 0,
        main_alignment: guild.main_alignment,
        sub_alignment: guild.sub_alignment,
        emblem_url: guild.emblem_url,
        leaderName,
        description: guild.description || "紹介文はまだ登録されていません。",
        approval_required: Boolean(guild.approval_required),
        recruitment_mode: guild.recruitment_mode || (guild.approval_required ? "APPLICATION_REQUIRED" : "OPEN_JOIN"),
        controlledBases
      });
    } catch (e: any) {
      console.warn("Failed to fetch guild detail:", e.message);
    }
  };

  const handleGvgDailyReset = async () => {
    // ADMIN_ONLY: 管理者デバッグ専用。RLSで一般ユーザーからのUPDATEを制限すること。中長期でServer Actions/Edge Functionsに移行予定。
    if (!session) return;
    setGvgResetLoading(true);
    playCyberSe("click");
    try {
      const guildIdFilter = userGuildMember?.guild_id || "";

      // 1. 各拠点 (shinjuku, deep_dock, junk_bazar, kitakura_gate) ごとに daily_points トップのギルドを支配ギルドに設定
      const bases = ["shinjuku", "shibuya", "ikebukuro", "roppongi", "akihabara"];
      let wonAreasCount = 0;

      // ギルドXPマスタが必要なため並列フェッチ
      const { data: lvlMaster } = await supabase.from("guild_level_master").select("*");
      const currentLvlMaster = lvlMaster || guildLevelMaster;

      for (const baseId of bases) {
        // 当該拠点の各ギルドのポイントを取得
        const { data: baseControls } = await supabase
          .from("guild_base_controls")
          .select("*")
          .eq("base_id", baseId)
          .order("daily_points", { ascending: false });

        if (baseControls && baseControls.length > 0) {
          const topControl = baseControls[0];
          const controllingGuildId = topControl.guild_id;

          // 支配フラグの更新 (1位を true, 他を false に)
          await supabase.from("guild_base_controls").update({ is_controlling: true, total_seasonal_days: topControl.total_seasonal_days + 1 }).eq("base_id", baseId).eq("guild_id", controllingGuildId);
          await supabase.from("guild_base_controls").update({ is_controlling: false }).eq("base_id", baseId).neq("guild_id", controllingGuildId);

          if (controllingGuildId === guildIdFilter) {
            wonAreasCount++;
          }

          // 支配ギルドへの恩恵付与: 資金 +50,000, XP +500
          const { data: guildRec } = await supabase.from("guilds").select("*").eq("id", controllingGuildId).maybeSingle();
          if (guildRec) {
            const nextFunds = Number(guildRec.funds || 0) + 50000;
            let nextXp = (guildRec.xp || 0) + 500;
            let nextLvl = guildRec.level || 1;

            while (true) {
              const lvlConfig = currentLvlMaster.find((l: any) => l.level === nextLvl);
              if (lvlConfig && nextXp >= lvlConfig.next_xp) {
                nextXp -= lvlConfig.next_xp;
                nextLvl += 1;
              } else {
                break;
              }
            }

            await supabase.rpc("admin_update_guild", { p_guild_id: controllingGuildId, p_funds: nextFunds, p_level: nextLvl, p_xp: nextXp });
          }

          // 支配ギルドメンバー全員へのデイリー報酬配布 (ダイヤ+50, Cash+5000)
          const { data: members } = await supabase.from("guild_members").select("user_id").eq("guild_id", controllingGuildId);
          if (members && members.length > 0) {
            const now = new Date();
            const expire = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            
            for (const member of members) {
              await supabase.from("presents").insert([
                {
                  user_id: member.user_id,
                  item_id: "DIAMOND",
                  quantity: 50,
                  message: `GvGデイリー報酬 [拠点: ${baseId}]`,
                  status: "UNCLAIMED",
                  sent_at: now.toISOString(),
                  expire_at: expire.toISOString()
                },
                {
                  user_id: member.user_id,
                  item_id: "CASH",
                  quantity: 5000,
                  message: `GvGデイリー報酬 [拠点: ${baseId}]`,
                  status: "UNCLAIMED",
                  sent_at: now.toISOString(),
                  expire_at: expire.toISOString()
                }
              ]);
            }
          }
        }
      }

      // 2. シーズン経過日数の更新
      const { data: dayRec } = await supabase.from("gvg_season_status").select("current_day").eq("id", 1).maybeSingle();
      const currentDay = dayRec?.current_day || 1;
      const nextDay = Math.min(currentDay + 1, 7);
      await supabase.from("gvg_season_status").update({ current_day: nextDay }).eq("id", 1);
      setGvgSeasonDay(nextDay);

      // 3. 対戦終了 & 翌日マッチングの自動生成
      const isFinalDay = currentDay === 7;
      await supabase.from("gvg_matches").update({ status: "FINISHED" }).eq("status", "ONGOING").eq("is_finals", isFinalDay);

      // 翌日のマッチングをシミュレーション構築
      const { data: guildsAll } = await supabase.from("guilds").select("id");
      if (guildsAll && guildsAll.length > 0) {
        const nextIsFinal = nextDay === 7;
        const matchGuilds = [...guildsAll];

        if (nextIsFinal) {
          // 7日目の決戦: 4拠点の支配ギルド（計4ギルド）を抽出
          const { data: finalGuildsCtrl } = await supabase.from("guild_base_controls").select("guild_id").eq("is_controlling", true);
          const finalGuilds = finalGuildsCtrl?.map((c: any) => c.guild_id).filter(Boolean) || [];

          // 4つに満たない場合は支配日数の多い順に補填
          if (finalGuilds.length < 4) {
            const { data: allCtrl } = await supabase.from("guild_base_controls").select("guild_id, total_seasonal_days");
            if (allCtrl) {
              const sorted = allCtrl
                .filter(c => c.guild_id && !finalGuilds.includes(c.guild_id))
                .sort((a, b) => (b.total_seasonal_days || 0) - (a.total_seasonal_days || 0));
              for (const c of sorted) {
                if (finalGuilds.length >= 4) break;
                finalGuilds.push(c.guild_id);
              }
            }
          }

          // 決戦用総当たりマッチングを構築 (1日3ラウンド、4ギルド総当たり＋決勝戦)
          // 予選マッチング (第1部、第2部)
          if (finalGuilds.length >= 2) {
            await supabase.from("gvg_matches").insert([
              { round: 1, guild_a_id: finalGuilds[0], guild_b_id: finalGuilds[1], is_finals: true },
              { round: 1, guild_a_id: finalGuilds[2] || finalGuilds[0], guild_b_id: finalGuilds[3] || finalGuilds[1], is_finals: true },
              { round: 2, guild_a_id: finalGuilds[0], guild_b_id: finalGuilds[2] || finalGuilds[1], is_finals: true },
              { round: 2, guild_a_id: finalGuilds[1], guild_b_id: finalGuilds[3] || finalGuilds[0], is_finals: true }
            ]);
            // 第3部 (23:00) は予選ポイントに応じた 1-2位決定戦 / 3-4位決定戦
            await supabase.from("gvg_matches").insert([
              { round: 3, guild_a_id: finalGuilds[0], guild_b_id: finalGuilds[1], is_finals: true }, // 覇者決定戦
              { round: 3, guild_a_id: finalGuilds[2] || finalGuilds[0], guild_b_id: finalGuilds[3] || finalGuilds[1], is_finals: true }
            ]);
          }
        } else {
          // 通常日のマッチング (ランダムマッチ)
          for (let i = matchGuilds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [matchGuilds[i], matchGuilds[j]] = [matchGuilds[j], matchGuilds[i]];
          }

          for (let i = 0; i < matchGuilds.length; i += 2) {
            const ga = matchGuilds[i].id;
            const gb = (i + 1 < matchGuilds.length) ? matchGuilds[i + 1].id : "g_npc_1";
            await supabase.from("gvg_matches").insert([
              { round: 1, guild_a_id: ga, guild_b_id: gb, is_finals: false },
              { round: 2, guild_a_id: ga, guild_b_id: gb, is_finals: false },
              { round: 3, guild_a_id: ga, guild_b_id: gb, is_finals: false }
            ]);
          }
        }
      }

      // 4. デイリー拠点ポイントのリセット
      await supabase.from("guild_base_controls").update({ daily_points: 0 }).neq("base_id", "");

      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "リセット完了", message: `GvG日次集計完了。自ギルドの支配権: ${wonAreasCount} 箇所。支配報酬（ダイヤ/Cash）を対象メンバーのプレゼントBOXへ配布しました。経過日数を ${nextDay} 日目に進め、新規マッチングを自動生成しました。`, onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (err: any) {
      console.warn(err.message);
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handleGvgSeasonReset = async () => {
    // ADMIN_ONLY: 管理者デバッグ専用。RLSで一般ユーザーからのUPDATEを制限すること。中長期でServer Actions/Edge Functionsに移行予定。
    if (!session) return;
    setGvgResetLoading(true);
    playCyberSe("click");

    try {
      const { error } = await supabase.rpc("gvg_season_reset");
      if (error) throw error;
      setGvgSeasonDay(1);

      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "リセット完了", message: "【GvG シーズンリセット完了】\n\nシーズン結果を確定し、累積日数・個人ポイントをリセットして次シーズンへ移行しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (err: any) {
      console.warn("GvG season reset failed:", err.message);
    } finally {
      setGvgResetLoading(false);
    }
  };

  const handlePvpSeasonReset = async () => {
    // ADMIN_ONLY: 管理者デバッグ専用。RLSで一般ユーザーからのUPDATEを制限すること。中長期でServer Actions/Edge Functionsに移行予定。
    if (!session) return;
    setPvpSeasonLoading(true);
    playCyberSe("click");
    try {
      const { error } = await supabase.rpc("pvp_season_reset", {
        p_user_id: session.user.id,
        p_current_rate: pvpRate
      });
      if (error) throw error;

      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "リセット完了", message: "バトルシーズン終了。報酬転送完了。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (err: any) {
      console.warn("Failed to reset PvP season:", err.message);
      setErrorMessage("シーズンリセット処理に失敗しました。");
    } finally {
      setPvpSeasonLoading(false);
    }
  };

  const handleRaidBossDefeat = async () => {
    // ADMIN_ONLY: 管理者デバッグ専用。RLSで一般ユーザーからのUPDATEを制限すること。中長期でServer Actions/Edge Functionsに移行予定。
    if (!session) return;
    setRaidDefeatLoading(true);
    playCyberSe("click");
    try {
      const { error } = await supabase.rpc("raid_boss_defeat");
      if (error) throw error;

      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "レイドボス撃破", message: "レイドボス撃破完了。報酬配布 ＆ ボスランダム再配置完了。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (err: any) {
      console.warn(err.message);
    } finally {
      setRaidDefeatLoading(false);
    }
  };

  const handleRaidSeasonReset = async () => {
    // ADMIN_ONLY: 管理者デバッグ専用。RLSで一般ユーザーからのUPDATEを制限すること。中長期でServer Actions/Edge Functionsに移行予定。
    if (!session) return;
    setRaidDefeatLoading(true);
    playCyberSe("click");

    try {
      const { error } = await supabase.rpc("raid_season_reset");
      if (error) throw error;
      
      await syncBootstrapData(session.user.id);
      setConfirmDialogConfig({ isOpen: true, title: "リセット完了", message: "【レイド シーズンリセット完了】\n\n個人・組織ランキング順位報酬をプレゼントBOXに配布しました。\nボスは全快し、ランダムな拠点へ再出現しました。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
    } catch (err: any) {
      console.warn("Raid season reset failed:", err.message);
    } finally {
      setRaidDefeatLoading(false);
    }
  };


  // ==========================================
  // ⚡ 育成アクション
  // ==========================================


  const handleScout = async (
    scoutType: string,
    scoutCount: number,
    useCurrency: "CASH" | "DIAMOND" | "FREE" | "TICKET"
  ) => {
    if (!session) return;
    const actionPerformance = beginActionPerformance("gacha");
    const requestId = crypto.randomUUID();

    const scoutTimingStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const reportScoutTiming = (stage: string, metadata: Record<string, unknown> = {}) => {
      if (process.env.NEXT_PUBLIC_APP_ENV === "production") return;
      const current = typeof performance !== "undefined" ? performance.now() : Date.now();
      console.info("[M9 scout timing]", {
        stage,
        elapsedMs: Math.round(current - scoutTimingStartedAt),
        scoutType,
        scoutCount,
        useCurrency,
        ...metadata,
      });
    };
    reportScoutTiming("tap");

    setUpgradeLoading(true);
    playCyberSe("click");

    let category: "CHARACTER" | "SKILL" | "EQUIPMENT" = "CHARACTER";
    if (scoutType.includes("SKILL")) category = "SKILL";
    else if (scoutType.includes("EQUIP")) category = "EQUIPMENT";

    const isNormal = scoutType.endsWith("_NORMAL");
    const isSpecial = scoutType.endsWith("_SPECIAL");
    const isLimit = scoutType.startsWith("LIMIT_");
    const presentationStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      // Common FA opening owns the foreground for every category while the
      // existing server-authoritative mutation proceeds behind it.
      flushSync(() => {
        setScoutPresentationCategory(category);
        setScoutResults([]);
        setScoutFlashingColor("BLUE");
        setScoutAnimationState("PROCESSING");
      });
      actionPerformance.mark("state_update");
      reportScoutTiming("animation_committed", { category, phase: "common_opening" });
      await waitForBrowserPaint();
      actionPerformance.markVisualReady();
      reportScoutTiming("animation_painted", { category, phase: "common_opening" });

      if ((category as string) === "CHARACTER") {
        actionPerformance.mark("request_start");
        const serverCurrency = useCurrency === "FREE" ? "free" : useCurrency === "DIAMOND" ? "diamonds" : useCurrency === "TICKET" ? "ticket" : "cash";
        const isTutorialTenPull = onboardingState?.tutorial_step === "FREE_GACHA"
          && scoutType === "CHAR_NORMAL" && scoutCount === 10 && useCurrency === "FREE";
        const drawResult = isTutorialTenPull
          ? await supabase.rpc("execute_tutorial_character_gacha", { p_request_id: requestId })
          : await supabase.rpc("execute_character_gacha", {
              p_user_id: session.user.id,
              p_gacha_id: scoutType === "CHAR_NORMAL" || scoutType === "CHAR_SPECIAL" ? scoutType : "CHAR_SPECIAL",
              p_pull_count: scoutCount,
              p_currency_type: serverCurrency,
              p_request_id: requestId
            });
        if (drawResult.error || drawResult.data?.error) {
          throw drawResult.error || new Error(drawResult.data.error);
        }
        reportScoutTiming("server_response");
        actionPerformance.mark("response");

        const serverResults = drawResult.data?.results || [];
        const awakenedCharacterIds = Array.from(new Set(serverResults
          .filter((result: { outcome?: string }) => result.outcome === "awakening" || result.outcome === "awakening_progress")
          .map((result: { character_id: string }) => result.character_id)));
        const authoritativeAwakeningByCharacter = new Map<string, number>();
        if (awakenedCharacterIds.length > 0) {
          const { data: awakenedRows, error: awakenedRowsError } = await supabase
            .from("user_characters")
            .select("character_id,awakening_level,awakening_progress")
            .in("character_id", awakenedCharacterIds);
          if (awakenedRowsError) console.warn("Authoritative gacha awakening display state is unavailable:", awakenedRowsError);
          for (const row of awakenedRows || []) {
            authoritativeAwakeningByCharacter.set(String(row.character_id), Number(row.awakening_level));
          }
        }
        const results = serverResults.map((result: { character_id: string; outcome: string; rarity?: string; awakening_level?: number; awakening_progress?: number; awakening_required?: number }) => {
          const character = CHARACTERS_MASTER.find(c => c.id === result.character_id);
          if (!character) throw new Error(`Canonical Character is missing for gacha result: ${result.character_id}`);
          if (result.rarity && result.rarity !== character.rarity) {
            console.warn("Gacha rarity projection mismatch; Character Master wins.", {
              characterId: result.character_id,
              rpcRarity: result.rarity,
              canonicalRarity: character.rarity,
            });
          }
          const revealStats = character ? getCharacterBaseStats(character.id, 1, 0) : null;
          const attributeLabels: Record<string, string> = {
            ORDER: "秩序", JUSTICE: "正義", CHAOS: "混沌", EVIL: "悪",
          };
          return {
            type: "CHARACTER",
            characterId: result.character_id,
            name: character?.jpName || result.character_id,
            // Character Master is the sole rarity authority. The RPC value is
            // retained only as a transport diagnostic and must never drive the
            // frame, label or reveal tier.
            rarity: character.rarity,
            imageUrl: character ? getCharacterTransparentImg(character.name) : undefined,
            title: character?.title || "新たな仲間",
            role: character?.homeTown || "東京",
            attribute: attributeLabels[character?.alignment || ""] || "無所属",
            attributeKey: character?.alignment || null,
            hp: revealStats?.hp,
            atk: revealStats?.atk,
            def: revealStats?.def,
            initialLevel: 1,
            awakeningLevel: result.awakening_level ?? authoritativeAwakeningByCharacter.get(result.character_id),
            converted: result.outcome === "converted",
            convertReward: result.outcome === "awakening"
              ? `覚醒 +${result.awakening_level ?? authoritativeAwakeningByCharacter.get(result.character_id) ?? ""}`
              : result.outcome === "awakening_progress"
                ? `覚醒進捗 +1（${result.awakening_progress}/${result.awakening_required}）`
                : result.outcome === "converted" ? "覚醒の書 x1" : "新規獲得"
          };
        });
        if (typeof drawResult.data?.cash === "number") setCash(drawResult.data.cash);
        if (typeof drawResult.data?.diamonds === "number") setDiamonds(drawResult.data.diamonds);
        if (useCurrency === "FREE") setDailyFreeGachaFlags(prev => ({ ...prev, CHARACTER: false }));
        reportScoutTiming("result_confirmed", { resultCount: results.length });
        if (isTutorialTenPull) {
          // The next mandatory screen needs only ownership and Growth items.
          // Project those independently of the much wider Home bootstrap so a
          // slow or unrelated feature query cannot strand the tutorial result.
          const tutorialInventoryRequestGeneration = beginUserItemsProjectionRequest(session.user.id);
          void Promise.all([
            supabase.from("user_characters").select("*").eq("user_id", session.user.id),
            supabase.from("user_items").select("*").eq("user_id", session.user.id),
          ]).then(([charactersResult, itemsResult]) => {
            if (charactersResult.error) throw charactersResult.error;
            if (itemsResult.error) throw itemsResult.error;
            const ownedCharacters = charactersResult.data || [];
            const ownedItems = itemsResult.data || [];
            setUserCharactersDbList(ownedCharacters);
            projectUserItems(ownedItems, session.user.id, tutorialInventoryRequestGeneration);
          }).catch((projectionError) => console.warn("Tutorial acquisition projection failed:", projectionError));
        }
        const bootstrapPromise = syncBootstrapData(session.user.id)
          .then(() => reportScoutTiming("bootstrap_complete"))
          .catch((bootstrapError) => console.warn("Post-gacha bootstrap failed:", bootstrapError));
        if (useCurrency === "FREE" && scoutType === "CHAR_NORMAL" && scoutCount === 10) {
          const { data: nextTutorialStep, error: tutorialAdvanceError } = await supabase.rpc("advance_tutorial_progress", {
            p_expected_step: "FREE_GACHA",
            p_next_step: "AUTO_FORMATION"
          });
          if (!tutorialAdvanceError) {
            setOnboardingState(current => current ? {
              ...current,
              tutorial_step: nextTutorialStep || "AUTO_FORMATION"
            } : current);
          }
        }
        setScoutResults(results);
        setScoutFlashingColor(results.some((r: { rarity: string }) => r.rarity === "SSR") ? "GOLD" : results.some((r: { rarity: string }) => r.rarity === "SR") ? "PURPLE" : "BLUE");
        setScoutAnimationState("FLASHING");
        actionPerformance.mark("state_update");
        actionPerformance.markVisualReady();
        reportScoutTiming("animation_start", { resultCount: results.length });
        const resultImageStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        beginAssetTierMetric("DYNAMIC_RESULT");
        const resultImagePromise = preloadAssetManifest(
          results
            .filter((result: { imageUrl?: string }) => Boolean(result.imageUrl))
            .map((result: { imageUrl: string }) => ({ src: result.imageUrl, required: true })),
        ).then((assetResults) => {
          finishAssetTierMetric("DYNAMIC_RESULT", assetResults);
          reportScoutTiming("asset_ready", {
            assetWaitMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - resultImageStartedAt),
            failedAssets: assetResults.filter((asset) => asset.status === "failed").length,
          });
        });
        const elapsedOpeningMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - presentationStartedAt;
        const presentationPromise = new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 1800 - elapsedOpeningMs)));
        void Promise.all([resultImagePromise, presentationPromise]).then(() => {
          reportScoutTiming("result_display");
          setScoutAnimationState("READY");
        });
        void bootstrapPromise;
        return;
      }

      // 1. コスト判定 ＆ 残高/無料フラグチェック
      const assetGachaId = category === "SKILL"
        ? (scoutType === "SKILL_NORMAL" || scoutType === "SKILL_SPECIAL" ? scoutType : "SKILL_SPECIAL")
        : (scoutType === "EQUIP_NORMAL" || scoutType === "EQUIP_SPECIAL" ? scoutType : "EQUIP_SPECIAL");
      const serverCurrency = useCurrency === "FREE" ? "free" : useCurrency === "DIAMOND" ? "diamonds" : useCurrency === "TICKET" ? "ticket" : "cash";
      actionPerformance.mark("request_start");
      const drawResult = await supabase.rpc("execute_asset_gacha", { p_user_id: session.user.id, p_gacha_id: assetGachaId, p_pull_count: scoutCount, p_currency_type: serverCurrency, p_request_id: requestId });
      if (drawResult.error || drawResult.data?.error) throw drawResult.error || new Error(drawResult.data.error);
      reportScoutTiming("server_response");
      actionPerformance.mark("response");
      const serverResults = drawResult.data?.results || [];
      const assetResults = serverResults.map((result: { type: string; item_id: string; outcome: string; rarity?: string; plus_val?: number; conversion_item_id?: string; conversion_quantity?: number }) => {
        const master = result.type === "SKILL" ? CANONICAL_SKILL_VIEW.find(s => s.id === result.item_id) : CANONICAL_EQUIPMENT_VIEW.find(e => e.id === result.item_id);
        const conversionItemId = result.conversion_item_id;
        return {
          type: result.type,
          itemId: result.item_id,
          name: master?.name || result.item_id,
          rarity: result.rarity || master?.rarity || "R",
          assetPath: result.type === "SKILL" ? getCanonicalSkillIcon(result.item_id) : (master as any)?.assetPath,
          converted: result.outcome === "converted",
          progressionLevel: result.outcome === "limit_break" ? Number(result.plus_val || 1) : null,
          convertReward: result.outcome === "converted"
            ? conversionItemId
              ? `${canonicalItemName(conversionItemId)} ×${Number(result.conversion_quantity || 1)}`
              : "育成素材へ変換"
            : result.outcome === "limit_break" ? `限界突破 +${Number(result.plus_val || 1)}` : "新規獲得",
        };
      });
      if (typeof drawResult.data?.cash === "number") setCash(drawResult.data.cash);
      if (typeof drawResult.data?.diamonds === "number") setDiamonds(drawResult.data.diamonds);
      if (useCurrency === "FREE") setDailyFreeGachaFlags(prev => ({ ...prev, [category]: false }));
      if (useCurrency === "FREE" && scoutCount === 10 && scoutType === "SKILL_NORMAL") {
        setGuideGachaCategory("EQUIPMENT");
      } else if (useCurrency === "FREE" && scoutCount === 10 && scoutType === "EQUIP_NORMAL") {
        setGuideGachaCategory(null);
      }
      reportScoutTiming("result_confirmed", { resultCount: assetResults.length });
      const bootstrapPromise = syncBootstrapData(session.user.id)
        .then(() => reportScoutTiming("bootstrap_complete"))
        .catch((bootstrapError) => console.warn("Post-gacha bootstrap failed:", bootstrapError));
      if (useCurrency === "FREE" && scoutType === "SKILL_NORMAL" && scoutCount === 10) {
        const { data: nextTutorialStep, error: tutorialAdvanceError } = await supabase.rpc("advance_tutorial_progress", {
          p_expected_step: "FREE_GACHA",
          p_next_step: "AUTO_FORMATION"
        });
        if (!tutorialAdvanceError) {
          setOnboardingState(current => current ? {
            ...current,
            tutorial_step: nextTutorialStep || "AUTO_FORMATION"
          } : current);
        }
      }
      setScoutResults(assetResults);
      setScoutFlashingColor(assetResults.some((result: { rarity: string }) => result.rarity === "SSR") ? "GOLD" : assetResults.some((result: { rarity: string }) => result.rarity === "SR") ? "PURPLE" : "BLUE");
      await bootstrapPromise;
      const elapsedTransitionMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - presentationStartedAt;
      const minimumTransitionRemainingMs = Math.max(0, 1400 - elapsedTransitionMs);
      if (minimumTransitionRemainingMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, minimumTransitionRemainingMs));
      }
      const hasSsr = assetResults.some((result: { rarity: string }) => result.rarity === "SSR");
      reportScoutTiming("opening_ready", { hasSsr });
      setScoutAnimationState("READY");
      return;

      if (useCurrency === "FREE") {
        if (!dailyFreeGachaFlags[category]) {
          setErrorMessage("本日の無料10連ガチャは使用済みです。");
          setUpgradeLoading(false);
          return;
        }
      } else if (useCurrency === "TICKET") {
        const ticketCount = scoutCount;
        const chargeResult = await supabase.rpc("execute_gacha", { p_user_id: session.user.id, p_currency_type: "ticket", p_currency_cost: ticketCount, p_results: [] });
        if (chargeResult.error || chargeResult.data?.error) {
          throw chargeResult.error || new Error(chargeResult.data.error);
        }
      } else if (useCurrency === "DIAMOND") {
        let reqDia = 100;
        if (isNormal) reqDia = scoutCount === 10 ? 1000 : 100;
        else if (isSpecial) reqDia = scoutCount === 10 ? 3000 : 300;
        else if (isLimit) reqDia = scoutCount === 10 ? 400 : 40;

        if (diamonds < reqDia) {
          setErrorMessage("ダイヤが不足しています。");
          setUpgradeLoading(false);
          return;
        }
        const nextDiamonds = diamonds - reqDia;
        const chargeResult = await supabase.rpc("execute_gacha", { p_user_id: session.user.id, p_currency_type: "diamonds", p_currency_cost: reqDia, p_results: [] });
        if (chargeResult.error || chargeResult.data?.error) {
          throw chargeResult.error || new Error(chargeResult.data.error);
        }
        setDiamonds(nextDiamonds);
      } else {
        // CASH
        let reqCash = 1000;
        if (isNormal) reqCash = scoutCount === 10 ? 10000 : 1000;
        else if (isSpecial) reqCash = scoutCount === 10 ? 30000 : 3000;
        else if (isLimit) reqCash = scoutCount === 10 ? 120000 : 12000;

        if (cash < reqCash) {
          setErrorMessage("キャッシュが不足しています。");
          setUpgradeLoading(false);
          return;
        }
        const nextCash = cash - reqCash;
        const chargeResult = await supabase.rpc("execute_gacha", { p_user_id: session.user.id, p_currency_type: "cash", p_currency_cost: reqCash, p_results: [] });
        if (chargeResult.error || chargeResult.data?.error) {
          throw chargeResult.error || new Error(chargeResult.data.error);
        }
        setCash(nextCash);
      }

      // 無料利用の更新
      if (useCurrency === "FREE") {
        const todayStr = new Date().toISOString().split("T")[0];
        await supabase.from("user_daily_gacha_claims").upsert({
          user_id: session.user.id,
          gacha_type: category,
          last_claimed_date: todayStr,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id,gacha_type" });
        setDailyFreeGachaFlags(prev => ({ ...prev, [category]: false }));
      }

      // スペシャルガチャ天井Pt加算
      if (isSpecial) {
        const nextPts = specialPityPoints + scoutCount;
        setSpecialPityPoints(nextPts);
        await supabase.from("user_gacha_pity_points").upsert({
          user_id: session.user.id,
          pity_master_id: "pity_special_common",
          current_points: nextPts,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id,pity_master_id" });
      }

      // 2. 抽選・排出処理
      const results: any[] = [];
      let highestRarity: "BLUE" | "PURPLE" | "GOLD" = "BLUE";

      if (category === "SKILL") {
        for (let i = 0; i < scoutCount; i++) {
          const rand = Math.random();
          let targetRarity = "R";
          if (isNormal) {
            if (rand < 0.10) targetRarity = "SR";
            else if (rand < 0.50) targetRarity = "R";
            else targetRarity = "N";
          } else {
            if (rand < 0.05) targetRarity = "SSR";
            else if (rand < 0.40) targetRarity = "SR";
            else targetRarity = "R";
          }

          let pool = CANONICAL_SKILL_VIEW.filter(s => s.rarity === targetRarity);
          if (pool.length === 0) pool = CANONICAL_SKILL_VIEW;
          const selected = pool[Math.floor(Math.random() * pool.length)];

          const existSkill = userSkillsList.find(s => s.skill_card_id === selected.id);
          if (existSkill) {
            if (existSkill.plus_val >= 10) {
              const { data: itemData } = await supabase.from("user_items").select("quantity").eq("user_id", session.user.id).eq("item_id", "SKILL_MANUAL").maybeSingle();
              await supabase.from("user_items").upsert({ user_id: session.user.id, item_id: "SKILL_MANUAL", quantity: (itemData?.quantity || 0) + 2 });
              results.push({ type: "SKILL", name: selected.name, rarity: selected.rarity, converted: true, convertReward: "指南書 x2" });
            } else {
              await supabase.from("user_skills").update({ plus_val: existSkill.plus_val + 1 }).eq("id", existSkill.id);
              results.push({ type: "SKILL", name: selected.name, rarity: selected.rarity, converted: false, convertReward: "限界突破+1" });
            }
          } else {
            await supabase.from("user_skills").insert({ user_id: session.user.id, skill_card_id: selected.id, plus_val: 0 });
            results.push({ type: "SKILL", name: selected.name, rarity: selected.rarity, converted: false, convertReward: "新規獲得" });
          }

          if (selected.rarity === "SSR") highestRarity = "GOLD";
          else if (selected.rarity === "SR" && highestRarity !== "GOLD") highestRarity = "PURPLE";
        }
      } else {
        // EQUIPMENT
        for (let i = 0; i < scoutCount; i++) {
          const rand = Math.random();
          let targetRarity = "R";
          if (isNormal) {
            if (rand < 0.10) targetRarity = "SR";
            else if (rand < 0.50) targetRarity = "R";
            else targetRarity = "N";
          } else {
            if (rand < 0.05) targetRarity = "SSR";
            else if (rand < 0.40) targetRarity = "SR";
            else targetRarity = "R";
          }

          let pool = CANONICAL_EQUIPMENT_VIEW.filter(e => e.rarity === targetRarity);
          if (pool.length === 0) pool = CANONICAL_EQUIPMENT_VIEW;
          const selected = pool[Math.floor(Math.random() * pool.length)];

          await supabase.from("user_equipments").insert({
            user_id: session.user.id,
            equipment_id: selected.id,
            level: 1,
            plus_val: 0,
            random_options: [
              { name: "クリティカル率", val: "+5%", unlocked: true },
              { name: "命中率", val: "+8%", unlocked: false },
              { name: "回避率", val: "+6%", unlocked: false },
              { name: "防御貫通力", val: "+12%", unlocked: false }
            ]
          });

          results.push({ type: "EQUIPMENT", name: selected.name, rarity: selected.rarity, converted: false, convertReward: "新規獲得" });

          if (selected.rarity === "SSR") highestRarity = "GOLD";
          else if (selected.rarity === "SR" && highestRarity !== "GOLD") highestRarity = "PURPLE";
        }
      }

      await syncBootstrapData(session.user.id);

      setScoutResults(results);
      setScoutFlashingColor(highestRarity);
      setScoutAnimationState("FLASHING");
      setTimeout(() => {
        setScoutAnimationState("SHOW_RESULTS");
      }, 1800);

    } catch (err: unknown) {
      setScoutAnimationState(null);
      const detail = err instanceof Error ? err.message : String(err);
      console.warn("Gacha execution error:", detail);
      setErrorMessage(
        detail.includes("gacha not found")
          ? "ガチャ設定が見つかりません。運営へお問い合わせください。"
          : detail.includes("already claimed")
            ? "本日の無料10連ガチャは使用済みです。"
            : detail.includes("insufficient gacha currency")
              ? "残高が不足しています。"
              : detail.includes("insufficient gacha tickets")
                ? "ガチャチケットが不足しています。"
            : "ガチャの実行に失敗しました。通信状態を確認して、もう一度お試しください。"
      );
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleExchangePityReward = async (rewardType: "CHARACTER" | "SKILL" | "EQUIPMENT", rewardId: string) => {
    if (!session) return;
    if (specialPityPoints < 200) {
      setErrorMessage("天井Ptが不足しています（200Pt必要）。");
      return;
    }

    setUpgradeLoading(true);
    try {
      const { data: pityResult, error: pityError } = await supabase.rpc("exchange_pity_reward", {
        p_user_id: session.user.id,
        p_reward_type: rewardType,
        p_reward_id: rewardId
      });
      if (pityError || pityResult?.error) throw pityError || new Error(pityResult.error);
      setSpecialPityPoints((pityResult?.current_points ?? Math.max(0, specialPityPoints - 200)) as number);
      await syncBootstrapData(session.user.id);
      return;
    } catch (err: unknown) {
      console.error("Exchange pity error:", err);
      setErrorMessage("天井交換に失敗しました。");
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleBuyNormalProduct = async (productId: string, currencyType: "CASH" | "DIAMOND"): Promise<boolean> => {
    if (!session) return false;
    if (!isFeatureOpen("SHOP", featureOperatingStates)) {
      setErrorMessage("ショップは現在利用できません。");
      return false;
    }
    const product = SHOP_PRODUCTS_MASTER.find(p => p.id === productId);
    if (!product) return false;

    setUpgradeLoading(true);
    playCyberSe("click");

    const price = currencyType === "CASH" ? (product.priceCash || 0) : (product.priceDiamond || 0);

    if (currencyType === "CASH" && cash < price) {
      setErrorMessage("キャッシュが不足しています。");
      setUpgradeLoading(false);
      return false;
    }
    if (currencyType === "DIAMOND" && diamonds < price) {
      setErrorMessage("ダイヤが不足しています。");
      setUpgradeLoading(false);
      return false;
    }

    try {
      setGlobalInteractionBlocking(true);
      const { data: rpcRes, error } = await supabase.rpc("buy_normal_shop_product", {
        p_user_id: session.user.id,
        p_product_id: product.id,
        p_currency_type: currencyType,
        p_price: price,
        p_items: product.items,
        p_product_title: product.title
      });

      if (error || !rpcRes) {
        console.error("buy_normal_shop_product rpc error:", error);
        setErrorMessage("購入処理中にエラーが発生しました。");
        setUpgradeLoading(false);
        return false;
      }

      setBoughtResultModal({
        productTitle: product.title,
        items: product.items,
        message: `${product.title} を購入しました！獲得アイテムはプレゼントBOXに送られました。`
      });

      playCyberSe("gacha");
      await syncBootstrapData(session.user.id);
      return true;
    } catch (err: any) {
      console.error("handleBuyNormalProduct error:", err);
      setErrorMessage("購入処理中にエラーが発生しました。");
      return false;
    } finally {
      // Keep the application inert until either the result/error state has
      // committed. Releasing immediately after the RPC left a tappable frame
      // before the destination dialog's effect could mount it.
      await waitForBrowserPaint();
      setGlobalInteractionBlocking(false);
      setUpgradeLoading(false);
    }
  };

  const handleBuyStripeProduct = async (productId: string, isSimulatedDuplicate: boolean = false): Promise<boolean> => {
    if (!session) return false;
    if (!isFeatureOpen("PAYMENT", featureOperatingStates)) {
      setErrorMessage("決済機能は現在利用できません。");
      return false;
    }
    const product = SHOP_PRODUCTS_MASTER.find(p => p.id === productId);
    if (!product) return false;
    if (product.id === "vip_pass_01") {
      const result = await handlePurchaseMonthlyPass();
      return !!result?.success;
    }

    setProfileLoading(true);
    playCyberSe("click");

    const sessionId = isSimulatedDuplicate
      ? lastPaymentSessionId
      : `stripe_session_${Math.floor(Math.random() * 899999) + 100000}`;

    if (!sessionId) {
      setErrorMessage("前回のセッションが見つかりません。新規購入を行ってください。");
      setProfileLoading(false);
      return false;
    }

    try {
      const isBeginner = product.category === "BEGINNER";
      const purchaseLimit = product.purchaseLimit || 0;

      setGlobalInteractionBlocking(true);
      const { data: rpcRes, error } = await supabase.rpc("process_stripe_shop_purchase", {
        p_user_id: session.user.id,
        p_stripe_session_id: sessionId,
        p_product_id: product.id,
        p_amount_jpy: product.priceJpy || 0,
        p_items: product.items,
        p_product_title: product.title,
        p_is_beginner: isBeginner,
        p_purchase_limit: purchaseLimit
      });

      if (error) {
        console.error("process_stripe_shop_purchase RPC error:", error);
        setErrorMessage("決済処理中にエラーが発生しました。");
        setProfileLoading(false);
        return false;
      } else if (rpcRes && rpcRes.duplicate) {
        setConfirmDialogConfig({
          isOpen: true,
          title: "重複トランザクション",
          message: "【Stripe Webhook 冪等性競合検知】 重複トランザクションを安全に無視しました。",
          onConfirm: () => setConfirmDialogConfig(null),
          onCancel: () => setConfirmDialogConfig(null)
        });
        setProfileLoading(false);
        return false;
      }

      setLastPaymentSessionId(sessionId);

      setBoughtResultModal({
        productTitle: product.title,
        items: product.items,
        message: `${product.title} の購入が完了しました！獲得アイテムはプレゼントBOXに送付されました。`
      });

      playCyberSe("gacha");
      await syncBootstrapData(session.user.id);
      return true;
    } catch (err: any) {
      console.error("handleBuyStripeProduct error:", err);
      setErrorMessage("決済処理中にエラーが発生しました。");
      return false;
    } finally {
      await waitForBrowserPaint();
      setGlobalInteractionBlocking(false);
      setProfileLoading(false);
    }
  };

  const handleBuyPack = async (packId: string) => {
    if (!session) return;
    if (!isFeatureOpen("SHOP", featureOperatingStates)) {
      setErrorMessage("ショップは現在利用できません。");
      return;
    }
    playCyberSe("gacha");
    
    let cost = 0;
    let success = false;
    let message = "";

    if (packId === "stamina") {
      cost = 20;
      if (diamonds >= cost) {
        setVitality(prev => Math.min(prev + 100, 200));
        await supabase.rpc("add_user_vitality", { p_user_id: session.user.id, p_amount: 100 });
        success = true;
        message = "スタミナパックを購入しました！スタミナが100回復しました。";
      }
    } else if (packId === "strife") {
      cost = 50;
      if (diamonds >= cost) {
        setAwakeningBooks(prev => prev + 1);
        const { data: itemData } = await supabase.from("user_items").select("quantity").eq("user_id", session.user.id).eq("item_id", "AWAKENING_BOOK").single();
        await supabase.from("user_items").upsert({ user_id: session.user.id, item_id: "AWAKENING_BOOK", quantity: (itemData?.quantity || 0) + 1 });
        success = true;
        message = "覚醒パックを購入しました！覚醒の書+1を獲得しました。";
      }
    } else if (packId === "polish") {
      cost = 15;
      if (diamonds >= cost) {
        setEquipExpM(prev => prev + 5);
        const { data: itemData } = await supabase.from("user_items").select("quantity").eq("user_id", session.user.id).eq("item_id", "EQUIP_EXP_M").single();
        await supabase.from("user_items").upsert({ user_id: session.user.id, item_id: "EQUIP_EXP_M", quantity: (itemData?.quantity || 0) + 5 });
        success = true;
        message = "カスタムオイルパックを購入しました！カスタムオイル[中] +5を獲得しました。";
      }
    } else if (packId === "cash") {
      cost = 30;
      if (diamonds >= cost) {
        setCash(prev => prev + 10000);
        await supabase.rpc("add_test_cash", { p_user_id: session.user.id, p_amount: 10000 });
        success = true;
        message = "資金調達パックを購入しました！キャッシュ+10,000を獲得しました。";
      }
    }

    if (success) {
      const nextDiamonds = diamonds - cost;
      await supabase.rpc("add_test_diamonds", { p_user_id: session.user.id, p_amount: 5000 });
      setDiamonds(nextDiamonds);
      setConfirmDialogConfig({ isOpen: true, title: "パック購入", message: message, onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
      await syncBootstrapData(session.user.id);
    } else {
      setErrorMessage("ダイヤが不足しています。");
    }
  };




  const selectUpgradeEquipment = (equip: any) => {
    setSelectedEquipment(equip);
    setEquipmentLevel(equip.level);
    setEquipmentLimitBreak(equip.plus_val);
    if (equip.random_options) setSubOptions(equip.random_options);
  };

  const togglePatrolMemberSelection = (charId: string) => {
    playCyberSe("click");
    if (selectedPatrolMember === charId) {
      setSelectedPatrolMember(null);
    } else {
      setSelectedPatrolMember(charId);
    }
  };

  const persistPartyFormation = async (party: string[]) => {
    if (!session?.user?.id) return null;
    const { data, error } = await supabase.rpc("save_main_formation", {
      p_character_ids: party,
    });
    if (!error) setTotalPower(Number(data?.total_power || 0));
    return error;
  };

  const handleTogglePartyMember = async (charId: string) => {
    playCyberSe("click");
    let nextParty = [...selectedMembers];
    if (nextParty.includes(charId)) {
      nextParty = nextParty.filter(id => id !== charId);
    } else {
      if (nextParty.length >= 5) {
        setConfirmDialogConfig({ isOpen: true, title: "パーティ編成", message: "出撃パーティは最大5名までです。", onConfirm: () => setConfirmDialogConfig(null), onCancel: () => setConfirmDialogConfig(null) });
        return;
      }
      nextParty.push(charId);
    }
    
    const saveError = await persistPartyFormation(nextParty);
    if (saveError) {
      console.warn("Failed to update party deck:", saveError);
      setErrorMessage(`編成の保存に失敗しました。（${saveError.code || "unknown"}）`);
      return false;
    }
    setSelectedMembers(nextParty);
    return true;
  };

  const handleSetPartyLeader = async (charId: string) => {
    if (!session?.user?.id) return false;
    if (!selectedMembers.includes(charId)) {
      setErrorMessage("パーティに編成中のキャラクターを選択してください。");
      return false;
    }
    const nextParty = [charId, ...selectedMembers.filter((id) => id !== charId)];
    const saveError = await persistPartyFormation(nextParty);
    if (saveError) {
      console.warn("Failed to update party leader:", saveError);
      setErrorMessage("パーティリーダーの変更に失敗しました。");
      return false;
    }
    const { error: identityLeaderError } = await supabase
      .from("users")
      .update({ favorite_character_id: charId })
      .eq("id", session.user.id);
    if (identityLeaderError) {
      console.warn("Failed to update identity leader:", identityLeaderError);
      setErrorMessage("リーダーの変更に失敗しました。");
      return false;
    }
    const identityRefreshed = await refreshIdentityLeaderAuthority(session.user.id);
    if (!identityRefreshed) {
      setErrorMessage("リーダーの最新状態を確認できませんでした。");
      return false;
    }
    setSelectedMembers(nextParty);
    setUpgradeSelectedCharId(charId);
    return true;
  };

  const handleSaveParty = async (draft?: string[]) => {
    const nextParty = (draft ?? selectedMembers).slice(0, 5);
    const saveError = await persistPartyFormation(nextParty);
    if (saveError) {
      console.warn("Failed to save party:", saveError);
      setErrorMessage("パーティの保存に失敗しました。");
      return false;
    }
    if (draft) setSelectedMembers(nextParty);
    return true;
  };

  const handleAutoFormation = async ({ navigateAfter = true, presentationDelayMs = 0, onPreviewReady, waitForTutorialContinue }: { navigateAfter?: boolean; presentationDelayMs?: number; onPreviewReady?: () => void; waitForTutorialContinue?: (result: any) => Promise<void> } = {}) => {
    const actionPerformance = beginActionPerformance("formation_save");
    let committedParty = [...userCharactersDbList]
      .sort((left: any, right: any) => {
        const leftStats = getCharacterTotalStats(left, userEquipmentsList);
        const rightStats = getCharacterTotalStats(right, userEquipmentsList);
        const leftPower = leftStats.hp + leftStats.atk + leftStats.def;
        const rightPower = rightStats.hp + rightStats.atk + rightStats.def;
        return rightPower - leftPower || String(left.character_id).localeCompare(String(right.character_id)) || String(left.id).localeCompare(String(right.id));
      })
      .slice(0, 5)
      .map((character: any) => character.character_id);

    if (committedParty.length === 0) {
      setErrorMessage("編成できるキャラクターがいません。");
      return false;
    }

    playCyberSe("click");
    if (session?.user?.id) {
      actionPerformance.mark("request_start");
      if (onboardingState?.tutorial_step === "AUTO_FORMATION") {
        // Tutorial formation is one server-authoritative transaction: party,
        // recommended skill and the persisted tutorial step commit together.
        const { data: tutorialFormation, error: tutorialFormationError } = await supabase.rpc("complete_current_tutorial_formation");
        if (tutorialFormationError) {
          console.warn("Failed to complete tutorial formation:", tutorialFormationError);
          setErrorMessage(`編成チュートリアルの完了に失敗しました。（${tutorialFormationError.message}）`);
          return false;
        }
        const nextStep = tutorialFormation?.tutorial_step || "DISPATCH";
        const serverParty = tutorialFormation?.formation?.character_ids;
        if (Array.isArray(serverParty) && serverParty.length > 0) committedParty = serverParty;
        // Reflect the authoritative formation before leaving the tutorial page so
        // the player can see which five members and recommended skill were set.
        setSelectedMembers(committedParty);
        if (tutorialFormation?.leader_character_id) {
          setSelectedLeader(String(tutorialFormation.leader_character_id));
        }
        setUpgradeSelectedCharId(committedParty[0]);
        // Register the explicit-continuation owner before exposing the completion
        // panel. Otherwise a fast tap during the presentation delay is lost.
        const tutorialContinue = waitForTutorialContinue?.(tutorialFormation);
        onPreviewReady?.();
        if (presentationDelayMs > 0) {
          await new Promise(resolve => window.setTimeout(resolve, presentationDelayMs));
        }
        if (tutorialContinue) {
          await tutorialContinue;
        }
        setOnboardingState(current => current ? { ...current, tutorial_step: nextStep } : current);
        setActiveTab("patrol");
        void Promise.all([
          syncBootstrapData(session.user.id),
          supabase.rpc("get_current_onboarding_state"),
        ]).then(([, refreshedOnboarding]) => {
          if (!refreshedOnboarding.error && refreshedOnboarding.data) {
            setOnboardingState(current => {
              // This refresh starts while formation still owns DISPATCH. A
              // fast quest start can commit FREE_INSTANT before the wider
              // bootstrap finishes, so never let its older snapshot rewind
              // the already-rendered tutorial step.
              if (current?.tutorial_step !== nextStep) return current;
              return refreshedOnboarding.data as import("./hooks/useAuth").OnboardingState;
            });
          }
        }).catch((bootstrapError) => console.warn("Tutorial formation bootstrap refresh failed:", bootstrapError));
      } else {
        const { data: recommendedFormation, error: recommendedFormationError } = await supabase.rpc("save_recommended_main_formation");
        if (recommendedFormationError) {
          console.warn("Failed to save auto formation:", recommendedFormationError);
          setErrorMessage(`編成の保存に失敗しました。（${recommendedFormationError.code || "unknown"}）`);
          return false;
        }
        if (Array.isArray(recommendedFormation?.character_ids) && recommendedFormation.character_ids.length > 0) {
          committedParty = recommendedFormation.character_ids.map(String);
        }
        setTotalPower(Number(recommendedFormation?.total_power || 0));
      }
      actionPerformance.mark("response");
    }
    setSelectedMembers(committedParty);
    setUpgradeSelectedCharId(committedParty[0]);
    actionPerformance.mark("state_update");
    actionPerformance.markVisualReady();
    if (navigateAfter && onboardingState?.tutorial_step !== "AUTO_FORMATION") {
      navigateTab("patrol");
    }
    return true;
  };

  const unreadMissionsCount = missions.filter(m => m.status === "CLEAR").length;
  const unclaimedPresentsCount = presents.filter(p => p.status === "UNCLAIMED").length;

  const openRaidRescue = (rescueId: string) => {
    if (process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED !== "true") return;
    setRaidRescueTarget(previous => ({ rescueId, revision: (previous?.revision ?? 0) + 1 }));
    setShowTribeChatPanel(false);
    navigateTab("raid");
  };
  useEffect(() => { setRaidRescueTarget(null); }, [session?.user?.id]);

  const navigateTab = (tabName: string, subTab?: string) => {
    setActivePlayerDetail(null);
    setSelectedNews(null);
    if (tabName === "ranking" && subTab === "raid") {
      nav.navigateTab("raid");
      return;
    }
    nav.navigateTab(tabName, subTab);
  };

  // Keep mandatory tutorial navigation derived from its persisted state. This
  // also closes race windows where an RPC succeeds but a component-local
  // navigation callback runs before the shared onboarding state is rendered.
  useEffect(() => {
    const step = onboardingState?.tutorial_step;
    if (!step || battle.battleState) return;
    if (step === "FREE_GACHA") setActiveTab("gacha");
    else if (step === "AUTO_FORMATION") setActiveTab("character");
    else if (["DISPATCH", "FREE_INSTANT", "TUTORIAL_BATTLE"].includes(step)) setActiveTab("patrol");
  }, [onboardingState?.tutorial_step, battle.battleState, setActiveTab]);

  useEffect(() => {
    const safeTab = sanitizeOperationsTab(activeTab, featureOperatingStates);
    if (safeTab !== activeTab) setActiveTab(safeTab);
    if (!isFeatureOpen("FRIEND", featureOperatingStates)) setShowFriendPanel(false);
  }, [activeTab, featureOperatingStates, setActiveTab, setShowFriendPanel]);

  useEffect(() => {
    if (chatCooldown <= 0) return;
    const timer = setTimeout(() => {
      setChatCooldown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [chatCooldown]);

  const handlePurchaseMonthlyPass = async () => {
    if (!session?.user?.id) return { success: false, message: "Not logged in" };
    if (!isFeatureOpen("PAYMENT", featureOperatingStates)) return { success: false, message: "Payment is closed" };
    try {
      const res = await supabase.rpc("purchase_monthly_pass", { p_user_id: session.user.id });
      if (res.error) throw res.error;
      
      setMonthlyPassActive(true);
      setMonthlyPassClaimedToday(false);
      return { success: true };
    } catch (err: any) {
      console.warn("Failed to purchase monthly pass:", err);
      return { success: false, message: err.message };
    }
  };

  const handleClaimDailyPassReward = async () => {
    if (!session?.user?.id || monthlyPassClaimedToday) return { success: false, message: "Already claimed" };
    if (!isFeatureOpen("PAYMENT", featureOperatingStates)) return { success: false, message: "Payment is closed" };
    try {
      const res = await supabase.rpc("claim_daily_pass_reward", { p_user_id: session.user.id });
      if (res.error) throw res.error;
      
      setMonthlyPassClaimedToday(true);
      setDiamonds(prev => prev + 100);
      return { success: true };
    } catch (err: any) {
      console.warn("Failed to claim daily pass reward:", err);
      return { success: false, message: err.message };
    }
  };

  const value = {
    // 状態
    session, setSession,
    authLoading, setAuthLoading,
    isSetupRequired, setIsSetupRequired,
    onboardingState, setOnboardingState,
    setupUsername, setSetupUsername,
    setupCharacterId, setSetupCharacterId,
    setupAreaId, setSetupAreaId,
    setupLoading, setSetupLoading,
    email, setEmail,
    password, setPassword,
    cash, setCash,
    diamonds, setDiamonds,
    vitality, setVitality, vitalityNextRecoveryAt,
    pvpNextRecoveryAt,
    pvpPoints, setPvpPoints,
    activeTab, setActiveTab,
    maintenanceEnabled: isMaintenanceEnabled(featureOperatingStates),
    showInboxPanel, setShowInboxPanel,
    showMissionPanel, setShowMissionPanel,
    showFriendPanel, setShowFriendPanel,
    showSettingsPanel, setShowSettingsPanel,
    showTribeChatPanel, setShowTribeChatPanel,
    showMoveBaseModal, setShowMoveBaseModal,
    showLegalPage, setShowLegalPage,
    showTitleView, setShowTitleView,
    bbsThreads, setBbsThreads,
    bbsActiveThread, setBbsActiveThread,
    bbsPosts, setBbsPosts,
    bbsLoading,
    bbsUnreadCounts,
    bbsUnreadTotal,
    refreshBbsUnreadCounts,
    markBbsThreadRead,
    fetchBbsThreads,
    createBbsThread,
    fetchBbsPosts,
    createBbsPost,
    username, setUsername,
    bio, setBio,
    avatarUrl, setAvatarUrl,
    currentBaseId, setCurrentBaseId,
    lastGuildLeftAt, setLastGuildLeftAt,
    bgmEnabled, setBgmEnabled,
    seEnabled, setSeEnabled,
    bgmVolume: audio.bgmVolume,
    seVolume: audio.seVolume,
    setBgmVolume: audio.setBgmVolume,
    setSeVolume: audio.setSeVolume,
    playBgm: audio.playBgm,
    stopBgm: audio.stopBgm,
    playSe: (event: SeEvent) => audio.playSe(event),
    preloadAudio: audio.preloadAudio,
    profileLoading, setProfileLoading,
    activeUsersCount, setActiveUsersCount,
    chatCooldown, setChatCooldown,
    inboxPanelTab, setInboxPanelTab,
    characterEntryView, setCharacterEntryView,
    userGuild, setUserGuild,
    userGuildMember, setUserGuildMember,
    guildMembersList, setGuildMembersList,
    newGuildName, setNewGuildName,
    allGuildsDbList, setAllGuildsDbList,
    guildSubTab, setGuildSubTab,
    pendingGuildJoinRequests, setPendingGuildJoinRequests,
    guildMembershipAuthorityReady: guildAuthorityOwnerUserId === session?.user?.id,
    guildDiscoveryState,
    authenticatedProjectionReady: Boolean(session?.user?.id)
      && onboardingState?.user_id === session.user.id
      && authenticatedProjectionOwnerUserId === session.user.id,
    authenticatedProjectionError,
    retryAuthenticatedProjection,
    resumeLoading,
    resumeCurrentSession,
    guildJoinRequests, setGuildJoinRequests,
    selectedLeader, setSelectedLeader,
    identityLeaderCharacterId: identityLeaderOwnerUserId === session?.user?.id ? identityLeaderCharacterId : "",
    identityLeaderAuthorityReady: identityLeaderOwnerUserId === session?.user?.id && identityLeaderAuthorityReady,
    upgradeSelectedCharId, setUpgradeSelectedCharId,
    characterLevel, setCharacterLevel,
    characterAwaken, setCharacterAwaken,
    userCharactersDbList, setUserCharactersDbList,
    trainingManuals,
    polishingStones,
    awakeningBooks, setAwakeningBooks,
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
    scoutAnimationState, setScoutAnimationState,
    scoutFlashingColor, setScoutFlashingColor,
    scoutResults, setScoutResults,
    scoutPresentationCategory,
    selectedCourse, setSelectedCourse,
    selectedMembers, setSelectedMembers,
    selectedPatrolMember, setSelectedPatrolMember,
    dailyCashSkips, setDailyCashSkips, dailyPaidSkips, setDailyPaidSkips,
    dailyCashSkipsResetDate, setDailyCashSkipsResetDate,
    activePatrols, setActivePatrols,
    patrolLogs, setPatrolLogs,
    patrolCourses,
    patrolNpcs,
    hasActivePatrolBattle,
    lastPatrolRewards, setLastPatrolRewards,
    showPatrolRewardModal, setShowPatrolRewardModal,
    battleSubTab, setBattleSubTab,
    pvpOpponents,
    pvpRate, setPvpRate,
    selectedTown, setSelectedTown,
    gvgBases, setGvgBases,
    gvgBaseControls, setGvgBaseControls,
    gvgResetLoading, setGvgResetLoading,
    gvgSeasonDay, setGvgSeasonDay,
    gvgMatches, setGvgMatches,
    myGvgMatch, setMyGvgMatch,
    gvgDefenseDeck, setGvgDefenseDeck,
    personalGvgPoints, setPersonalGvgPoints,
    gvgActiveRound, setGvgActiveRound,
    pvpSubView, setPvpSubView,
    pvpRankings, setPvpRankings,
    raidDamageLogs, setRaidDamageLogs,
    pvpSeasonLoading, setPvpSeasonLoading,
    raidDefeatLoading, setRaidDefeatLoading,
    pvpDefenseLogs, setPvpDefenseLogs,
    simulatingDefense, setSimulatingDefense,
    pvpDefenseSaveLoading,
    activeStorySession, setActiveStorySession,
    storySending, setStorySending,
    paymentHistory, setPaymentHistory,
    lastPaymentSessionId, setLastPaymentSessionId,
    raidBossHp, setRaidBossHp,
    raidBossMaxHp, setRaidBossMaxHp,
    raidBossSecondsLeft, setRaidBossSecondsLeft,
    raidTotalDamage, setRaidTotalDamage,
    rankingActiveTab, setRankingActiveTab,
    raidBossBaseId, setRaidBossBaseId,
    raidBossName, setRaidBossName,
    upgradeSubTab, setUpgradeSubTab,
    shopSubTab, setShopSubTab,
    missions, setMissions,
    missionTab, setMissionTab,
    presents, setPresents,
    presentsPrefetched, setPresentsPrefetched,
    presentsSyncing, setPresentsSyncing,
    presentClaimLoading, setPresentClaimLoading,
    itemUseLoading,
    missionClaimLoading, setMissionClaimLoading,

    // ログインボーナス
    loginBonusMasters, setLoginBonusMasters,
    userLoginBonus, setUserLoginBonus,
    showLoginBonusModal, setShowLoginBonusModal,
    loginBonusClaimResult, setLoginBonusClaimResult,
    loginBonusCheckComplete,
    showPrepMissionDialog, setShowPrepMissionDialog,
    prepMissionDialogCheckComplete, setPrepMissionDialogCheckComplete,
    rankingRewardNotificationCheckComplete, setRankingRewardNotificationCheckComplete,
    showAccountAuthenticationModal, setShowAccountAuthenticationModal,
    showAuthenticationReminder, setShowAuthenticationReminder,
    checkAndClaimLoginBonus,

    newsList, setNewsList,
    selectedNews, setSelectedNews,
    guildChats, setGuildChats,
    chatChannel, setChatChannel,
    chatUnreadCounts,
    refreshChatUnreadCounts,
    markChatChannelRead,
    chatInput, setChatInput,
    chatSending, setChatSending,
    errorMessage, setErrorMessage,
    upgradeLoading, setUpgradeLoading,
    dispatchLoading, setDispatchLoading,
    selectedMapAreaId, setSelectedMapAreaId,
    movingAreaLoading, setMovingAreaLoading,
    unreadMissionsCount,
    unclaimedPresentsCount,
    giftCode, setGiftCode,
    setupGiftCode, setSetupGiftCode,
    powerRankings,
    guildPowerRankings,
    raidSeasonRankings,
    equippedBackground, setEquippedBackground,
    equippedFrontEffect, setEquippedFrontEffect,
    titleEquipped, setTitleEquipped,
    ownedTitles,
    ownedHomeCosmeticIds,
    userTitle: titleEquipped === "title_none"
      ? "称号なし"
      : ownedTitles.find((title) => title.id === titleEquipped)?.name || titleEquipped || "称号なし",
    totalPower,
    totalPowerLoading,
    isRaidActive: roomUiEnabled ? roomActivity.isActive : raidBossHp > 0 && raidBossSecondsLeft > 0,

    // アバターシステム状態
    setupGender, setSetupGender,
    setupHairId, setSetupHairId,
    setupFaceId, setSetupFaceId,
    userAvatar, setUserAvatar,
    unlockedAvatarParts, setUnlockedAvatarParts,
    avatarPartsMaster, setAvatarPartsMaster,
    avatarLoading, setAvatarLoading,
    handleBuyAvatarPart,
    handleSaveAvatar,

    // バトルステート＆関数分配 (useBattle フックより公開)
    battleSessionId: battle.battleSessionId,
    setBattleSessionId: battle.setBattleSessionId,
    battleMode: battle.battleMode,
    setBattleMode: battle.setBattleMode,
    battleOpponentName: battle.battleOpponentName,
    setBattleOpponentName: battle.setBattleOpponentName,
    battleState: battle.battleState,
    setBattleState: battle.setBattleState,
    battleOutcome: battle.battleOutcome,
    tutorialBattleActive: battle.tutorialBattleActive,
    battleEncounterLocked: battle.battleEncounterLocked,
    settledPatrolEncounterId: battle.settledPatrolEncounterId,
    battleLog: battle.battleLog,
    setBattleLog: battle.setBattleLog,
    ap: battle.ap,
    setAp: battle.setAp,
    maxAp: battle.maxAp,
    setMaxAp: battle.setMaxAp,
    tactic: battle.tactic,
    setTactic: battle.setTactic,
    battleSpeed: battle.battleSpeed,
    setBattleSpeed: battle.setBattleSpeed,
    isAutoPaused: battle.isAutoPaused,
    setIsAutoPaused: battle.setIsAutoPaused,
    playerPartyStates: battle.playerPartyStates,
    setPlayerPartyStates: battle.setPlayerPartyStates,
    enemyPartyStates: battle.enemyPartyStates,
    setEnemyPartyStates: battle.setEnemyPartyStates,
    timeline: battle.timeline,
    setTimeline: battle.setTimeline,
    timelineIndex: battle.timelineIndex,
    setTimelineIndex: battle.setTimelineIndex,
    battleRound: battle.battleRound,
    activeSkillCutIn: battle.activeSkillCutIn,
    targetLine: battle.targetLine,
    activeShakingCharId: battle.activeShakingCharId,
    damagePopup: battle.damagePopup,
    setDamagePopup: battle.setDamagePopup,
    battleResultReplayEvents: battle.battleResultReplayEvents,
    battlePresentationContext: battle.battlePresentationContext,
    battleModeResultDetail: battle.battleModeResultDetail,
    battleSkipPending: battle.battleSkipPending,
    gvgTargetBaseId: battle.gvgTargetBaseId,
    setGvgTargetBaseId: battle.setGvgTargetBaseId,
    battleLoading: battle.battleLoading,
    setBattleLoading: battle.setBattleLoading,

    // ハンドラ
    startCardBattle: battle.startCardBattle,
    prepareRaidRoomBattle: battle.prepareRaidRoomBattle,
    confirmPreparedPvpBattle: battle.confirmPreparedPvpBattle,
    cancelPreparedPvpBattle: battle.cancelPreparedPvpBattle,
    confirmPreparedRaidBattle: battle.confirmPreparedRaidBattle,
    cancelPreparedRaidBattle: battle.cancelPreparedRaidBattle,
    launchBattlePlaying: battle.launchBattlePlaying,
    skipBattlePresentation: battle.skipBattlePresentation,
    handleEndTurn: battle.handleEndTurn,
    endBattleSession: battle.endBattleSession,
    completeBattleResult: battle.completeBattleResult,
    completeTutorialBattleResult,

    // 共通ハンドラ
    playCyberSe,
    handleFirstUserInteraction,
    syncBootstrapData,
    handleEmailSignup,
    handleEmailLogin,
    handleGoogleLogin,
    googleExternalBrowserUrl,
    dismissGoogleExternalBrowserPrompt,
    handleStartNewGame,
    handleGoogleDemoLogin,
    handleInitializeUser,
    handleGenerateGiftCode,
    handleLogout,
    triggerNpcDefenseSimulation,
    handleUpdateProfile,
    handleMoveBase,
    handleToggleSound,
    handleStoryNext,
    completeStorySession,
    triggerTutorialStory,
    triggerStripeWebhookSimulation,
    handleCreateGuild,
    handleUpdateGuildAlignment,
    handleUpdateGuildSettings,
    handleLeaveGuild,
    handleDemoJoinGuild,
    handleSearchGuilds,
    handleCancelGuildJoinRequest,
    handleReviewGuildJoinRequest,
    handleUpdateMemberRole,
    guildPrivilegedOperation,
    handleKickMember,
    handleDonateToGuild,
    handleBuyGuildDecoration,
    handleEquipGuildDecoration,
    addGuildXpAndContributionByAction,
    guildLevelMaster,
    guildXpActionMaster,
    handleStartPatrol,
    handleInstantComplete,
    transitionTutorialQuestToBattle,
    handleClaimRewards,
    handleDeployGvgDefense,
    handleGvgDailyReset,
    handleGvgSeasonReset,
    handlePvpSeasonReset,
    handleRaidBossDefeat,
    handleRaidSeasonReset,
    handleCharacterLevelUp,
    handleCharacterGrowthBatch,
    handleCharacterAwaken,
    handleEquipGear,
    handleUnequipGear,
    handleUnequipGearBulk,
    handleEquipGearBulkRecommended,
    handleEquipSkill,
    handleUnequipSkill,
    handleUnequipSkillBulk,
    handleEquipSkillBulkRecommended,
    handleAutoEquipComposite,
    handleSellGearBulk,
    handleEquipmentLevelUp,
    handleEquipmentGrowthBatch,
    handleEquipmentLimitBreak,
    handleSkillUpgrade,
    selectedSkill,
    setSelectedSkill,
    skillLimitBreakMaster,
    handleScout,
    featureOperatingStates,
    dailyFreeGachaFlags,
    dailyFreeGachaReady,
    guideGachaCategory,
    setGuideGachaCategory,
    refreshDailyFreeGachaAuthority,
    refreshIdentityLeaderAuthority,
    specialPityPoints,
    handleExchangePityReward,
    handleBuyPack,
    gachaMasters,
    gachaItemsMaster,
    gachaRarityRates,
    handleSendChat,
    handleClaimPresent,
    handleClaimAllPresents,
    handleClaimMission,
    handleClaimAllMissions,
    selectUpgradeEquipment,
    togglePatrolMemberSelection,
    handleTogglePartyMember,
    handleSetPartyLeader,
    handleSaveParty,
    handleAutoFormation,
    navigateTab,
    getGuildPenaltyState,
    handlePowerDailyReset,
    handlePowerSeasonReset,
    activePlayerDetail,
    setActivePlayerDetail,
    activeGuildDetail,
    setActiveGuildDetail,
    fetchPlayerDetail,
    fetchGuildDetail,
    fetchPvpOpponents,
    savePvpDefenseDeck,
    opponentsLoading,
    myPvpDefenseDeck,
    setMyPvpDefenseDeck,
    userLevel,
    setUserLevel,
    userXp,
    setUserXp,
    equipmentLevelUpMaster,
    equipmentLimitBreakMaster,
    healPotions,
    doctorSprays,
    energyDrinks,
    setEnergyDrinks,
    pvpVipPasses,
    charExpS,
    charExpM,
    charExpL,
    equipExpS,
    equipExpM,
    equipExpL,
    skillManuals,
    equipLbParts,
    handleUseItem,
    userShopPurchases,
    userCreatedAt,
    boughtResultModal,
    setBoughtResultModal,
    handleBuyNormalProduct,
    handleBuyStripeProduct,
    selectedBgMode,
    setSelectedBgMode,
    interiorItem,
    setInteriorItem,
    directMessages,
    setDirectMessages,
    dmRecipientId,
    setDmRecipientId,
    dmUnreadConversations,
    dmUnreadTotal,
    refreshDirectMessageUnreadCounts,
    handleSendDirectMessage,
    confirmDialogConfig,
    setConfirmDialogConfig,
    globalInteractionBlocking,
    setGlobalInteractionBlocking,
    activeBanners, setActiveBanners,
    userItems, setUserItems,
    inventoryProjectionOwnerUserId,
    raidPoints, setRaidPoints, raidFirstEntryFree, raidTopRefreshRevision, raidRoomReturnTarget, raidRescueTarget, openRaidRescue, raidRoomActivityTracker: roomActivity.tracker,
    monthlyPassActive, setMonthlyPassActive,
    monthlyPassClaimedToday, setMonthlyPassClaimedToday,
    handlePurchaseMonthlyPass, handleClaimDailyPassReward,
    ...friends
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
}

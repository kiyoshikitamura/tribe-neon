"use client";

import { CANONICAL_CHARACTERS, CANONICAL_EQUIPMENTS, CANONICAL_MISSIONS, CANONICAL_RAID_BOSSES, CANONICAL_SKILLS } from "../../domain/gameplay/canonical/masters.ts";
import { canonicalCharacterStats, canonicalEquipmentFlatStat, canonicalEquipmentLevelCap, canonicalSkillSlotCount } from "../../domain/gameplay/canonical/calculations.ts";
import { applyCharacterAwakeningCopyEquivalent } from "../../domain/gameplay/canonical/awakening.ts";
import { applyFrozenUserXp, canUseEnergyDrink, recoverCanonicalResource } from "../../domain/gameplay/canonical/action_resources.ts";
import { CANONICAL_QUESTS, canonicalQuestById, generateCanonicalQuestEncounter, rollCanonicalQuestItems } from "../../domain/gameplay/canonical/quests.ts";
import { parseCanonicalEffects } from "../../domain/battle/canonical_effects.ts";
import { DEFAULT_OPERATIONS_STATE, type OperationsFeatureKey } from "../../domain/operations/operations.ts";
import { isInsideRankingSeason, rankingSeasonWindow } from "../../domain/ranking/rankingSeason.ts";
import { CANONICAL_RANKING_REWARDS } from "../../domain/gameplay/canonical/combat_production.ts";
import {
  evaluateCanonicalMissionProgress,
  FUNNEL_TRIGGER_BY_MILESTONE,
  jstCycleDate,
  syncCanonicalMissions,
  unlockClaimedMissionChildren,
  type MissionMasterRow,
  type UserMissionRow,
} from "../../domain/gameplay/canonical/mission_runtime.ts";

const canonicalMissionRows = (): MissionMasterRow[] => CANONICAL_MISSIONS.map((mission) => ({
  id: mission.id,
  category: mission.category,
  trigger_type: mission.triggerType,
  target_value: mission.targetValue,
  prerequisite_mission_id: mission.prerequisiteMissionId,
  is_enabled: mission.isEnabled && mission.preopen,
  reward_item_id: mission.rewardItemId,
  reward_quantity: mission.rewardQuantity,
  cash_reward: mission.cashReward,
  display_group: mission.displayGroup,
  preopen: mission.preopen,
}));

const resolveCanonicalRewardItem = (rewardId: string): string => {
  if (rewardId === "NORMAL_GACHA_TICKET_RANDOM") {
    return ["NORMAL_GACHA_TICKET_CHARACTER", "NORMAL_GACHA_TICKET_SKILL", "NORMAL_GACHA_TICKET_EQUIPMENT"][Math.floor(Math.random() * 3)];
  }
  if (rewardId === "SPECIAL_TICKET_RANDOM") {
    return ["SPECIAL_TICKET_CHARACTER", "SPECIAL_TICKET_SKILL", "SPECIAL_TICKET_EQUIPMENT"][Math.floor(Math.random() * 3)];
  }
  if (rewardId === "SPECIAL_TICKET_SKILL_OR_EQUIPMENT") {
    return ["SPECIAL_TICKET_SKILL", "SPECIAL_TICKET_EQUIPMENT"][Math.floor(Math.random() * 2)];
  }
  return rewardId;
};

const grantMockMissionReward = (client: any, userId: string, itemId: string, quantity: number) => {
  if (!itemId || quantity <= 0) return;
  const users = client.getStorage("users") || [];
  const user = users.find((entry: any) => entry.id === userId);
  if (!user) throw new Error("User not found");
  if (itemId === "CASH") {
    user.cash = Number(user.cash || 0) + quantity;
    client.setStorage("users", users);
    return;
  }
  if (itemId === "DIA" || itemId === "DIAMOND") {
    user.neon_diamonds = Number(user.neon_diamonds || 0) + quantity;
    client.setStorage("users", users);
    return;
  }
  if (CANONICAL_EQUIPMENTS.some((master) => master.equipment_id === itemId)) {
    const equipments = client.getStorage("user_equipments") || [];
    for (let index = 0; index < quantity; index += 1) {
      equipments.push({
        id: `mission_equipment_${userId}_${itemId}_${Date.now()}_${index}`,
        user_id: userId,
        equipment_id: itemId,
        equipment_master_id: itemId,
        level: 1,
        plus_val: 0,
      });
    }
    client.setStorage("user_equipments", equipments);
    return;
  }
  const items = client.getStorage("user_items") || [];
  const existing = items.find((entry: any) => entry.user_id === userId && entry.item_id === itemId);
  if (existing) existing.quantity = Number(existing.quantity || 0) + quantity;
  else items.push({ id: `mission_item_${userId}_${itemId}`, user_id: userId, item_id: itemId, quantity });
  client.setStorage("user_items", items);
};

const missionClaimKey = (userId: string, missionId: string, cycleDate?: string | null) => (
  `${userId}:${missionId}:${cycleDate || "ONCE"}`
);

const canonicalQuestEnemySnapshot = (questId: string, encounterOverride?: ReturnType<typeof generateCanonicalQuestEncounter>) => {
  const encounter = encounterOverride ?? (canonicalQuestById(questId) ? generateCanonicalQuestEncounter(questId) : null);
  if (!encounter) return null;
  return encounter.members.map((member) => {
    const character = CANONICAL_CHARACTERS.find((entry) => entry.character_id === member.characterId);
    if (!character) throw new Error(`Canonical Quest encounter references unknown Character: ${member.characterId}`);
    const stats = member.stats;
    return {
      id: `${encounter.encounterId}_${member.slot}`,
      name: character.name,
      team: "ENEMY",
      alignment: character.attribute,
      characterId: character.character_id,
      level: member.level,
      awakeningLevel: member.awakening,
      stats,
      equipment: [],
      equippedSkillRefs: member.skillLoadout,
      skills: member.skillLoadout.map((skillId) => {
        const skill = CANONICAL_SKILLS.find((entry) => entry.skill_id === skillId);
        if (!skill) throw new Error(`Canonical Quest encounter references unknown Skill: ${skillId}`);
        return { id:skill.skill_id, name:skill.name, kind:skill.kind, target:skill.target, activationType:skill.activation_type, cooldown:skill.cooldown, availableFromRound:skill.available_from_round, effects:skill.effects, exclusiveCharacterId:skill.exclusive_character_id };
      }),
    };
  });
};

const achievedFunnelTriggers = (client: any, userId: string): Set<string> => new Set(
  (client.getStorage("user_funnel_milestones") || [])
    .filter((entry: any) => entry.user_id === userId)
    .map((entry: any) => FUNNEL_TRIGGER_BY_MILESTONE[entry.milestone])
    .filter(Boolean),
);

const evaluateMockMissionProgress = (client: any, userId: string, triggerType: string, increment: number) => {
  const rows = client.getStorage("user_missions") as UserMissionRow[];
  evaluateCanonicalMissionProgress(canonicalMissionRows(), rows, userId, triggerType, increment);
  client.setStorage("user_missions", rows);
};

const recordMockFunnelMilestone = (client: any, userId: string, milestone: string, metadata: Record<string, unknown> = {}) => {
  const milestones = client.getStorage("user_funnel_milestones") || [];
  const now = new Date().toISOString();
  const existing = milestones.find((entry: any) => entry.user_id === userId && entry.milestone === milestone);
  if (existing) {
    existing.occurrence_count = Number(existing.occurrence_count || 1) + 1;
    existing.last_occurred_at = now;
    existing.metadata = { ...(existing.metadata || {}), ...metadata };
  } else {
    milestones.push({ user_id: userId, milestone, occurrence_count: 1, first_occurred_at: now, last_occurred_at: now, metadata });
  }
  client.setStorage("user_funnel_milestones", milestones);
  const trigger = FUNNEL_TRIGGER_BY_MILESTONE[milestone];
  if (trigger) evaluateMockMissionProgress(client, userId, trigger, 1);
};

const recordMockLifetimeMilestone = (client: any, userId: string, milestone: string, metadata: Record<string, unknown> = {}) => {
  const exists = (client.getStorage("user_funnel_milestones") || [])
    .some((entry: any) => entry.user_id === userId && entry.milestone === milestone);
  if (!exists) recordMockFunnelMilestone(client, userId, milestone, metadata);
};

const rarityScore = (rarity?: string) => ({ SSR: 4, SR: 3, R: 2, N: 1 }[rarity || "N"] || 0);

const mockCharacterPower = (character: any, equipments: any[]) => {
  const master = CANONICAL_CHARACTERS.find((entry) => entry.character_id === character.character_id);
  if (!master) return 0;
  const stats = canonicalCharacterStats(master.lv1, master.lv100, Number(character.level || 1), Number(character.awakening_level || 0));
  const equipmentPower = equipments
    .filter((entry: any) => entry.equipped_character_id === character.id)
    .reduce((total: number, owned: any) => {
      const equipment = CANONICAL_EQUIPMENTS.find((entry) => entry.equipment_id === (owned.equipment_id || owned.equipment_master_id));
      if (!equipment || (equipment.exclusive_character_id && equipment.exclusive_character_id !== character.character_id)) return total;
      return total + (["hp", "atk", "def"] as const).reduce((sum, key) => (
        sum + canonicalEquipmentFlatStat(equipment.base_stats[key], Number(owned.level || 1), Number(owned.plus_val || 0))
      ), 0);
    }, 0);
  return stats.hp + stats.atk + stats.def + equipmentPower;
};

const applyMockCharacterAwakeningEquivalent = (character: any) => {
  const result = applyCharacterAwakeningCopyEquivalent(
    Number(character.awakening_level || 0),
    Number(character.awakening_progress || 0),
    1,
  );
  character.awakening_level = result.awakeningLevel;
  character.awakening_progress = result.awakeningProgress;
  return {
    outcome: result.levelsAdvanced > 0 ? "awakening" : "awakening_progress",
    awakening_progress_added: 1,
    awakening_level: result.awakeningLevel,
    awakening_progress: result.awakeningProgress,
    awakening_required: result.nextRequired,
  };
};

export async function executeMockRpc(client: any, funcName: string, params: any): Promise<any> {
  // Explicit fresh-user test fixture only. This does not model stored Raid
  // recovery or replace the real RPC/ack authority; absent fixture stays unsupported.
  if (funcName === "list_raid_room_battle_recoveries_v1" && typeof window !== "undefined"
    && localStorage.getItem("mock_rpc_fixture:empty_raid_recoveries") === "true") {
    return { data: [], error: null };
  }
  const qaDelay = typeof window === "undefined" ? 0 : Number(localStorage.getItem(`mock_rpc_delay_ms:${funcName}`) || 0);
  if (Number.isFinite(qaDelay) && qaDelay > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, Math.min(qaDelay, 5000)));
  }
  if (typeof window !== "undefined" && ["create_guild_v2", "set_current_guild_welcome_message", "update_guild_recruitment", "update_guild_alignment"].includes(funcName)) {
    const mutationDelay = Number(localStorage.getItem("mock_guild_mutation_delay_ms") || 0);
    if (mutationDelay > 0) await new Promise((resolve) => window.setTimeout(resolve, mutationDelay));
  }
  console.log(`[Mock DB RPC] Calling ${funcName} with:`, params);

  const operationState = (featureKey: OperationsFeatureKey) => (
    (client.getStorage("feature_operating_states") || []).find((entry: any) => entry.feature_key === featureKey)?.state
    || DEFAULT_OPERATIONS_STATE[featureKey]
  );
  const closedError = (featureKey: OperationsFeatureKey) => ({ data: null, error: { message: `${featureKey.toLowerCase()} is closed`, code: "P0001" } });
  const mutationPattern = /^(initialize|create|update|delete|set|claim|start|finalize|execute|send|accept|reject|remove|buy|process|purchase|donate|awaken|limit|record|apply|join|leave|transfer|kick|equip|save|use_)/;
  if (operationState("MAINTENANCE") === "MAINTENANCE" && mutationPattern.test(funcName)) {
    return { data: null, error: { message: "maintenance is active", code: "P0001" } };
  }
  if (["search_user_by_name", "send_friend_request", "accept_friend_request", "reject_friend_request", "remove_friend"].includes(funcName) && operationState("FRIEND") !== "OPEN") return closedError("FRIEND");
  if (funcName === "get_friend_helper_loadout" && operationState("FRIEND_HELPER") !== "OPEN") return closedError("FRIEND_HELPER");
  if (funcName === "buy_normal_shop_product" && operationState("SHOP") !== "OPEN") return closedError("SHOP");
  if (["process_stripe_shop_purchase", "purchase_monthly_pass", "claim_daily_pass_reward"].includes(funcName) && operationState("PAYMENT") !== "OPEN") return closedError("PAYMENT");
  if (["begin_gvg_attack", "resolve_gvg_attack", "cancel_unresolved_gvg_attack", "process_gvg_battle_result_v2"].includes(funcName) && operationState("GVG") !== "OPEN") return closedError("GVG");

  if (funcName === "sync_current_missions") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const cycleDate = jstCycleDate();
    const rows = client.getStorage("user_missions") as UserMissionRow[];
    const result = syncCanonicalMissions(canonicalMissionRows(), rows, userId, cycleDate);
    if (result.rescued.length > 0) {
      const presents = client.getStorage("presents") || [];
      for (const rescued of result.rescued) {
        const master = CANONICAL_MISSIONS.find((mission) => mission.id === rescued.mission_id);
        if (!master) continue;
        presents.push({
          id: `mission_rescue_${userId}_${rescued.mission_id}_${rescued.cycle_date}`,
          user_id: userId,
          item_id: master.rewardItemId,
          quantity: master.rewardQuantity,
          message: "デイリーミッション未受取報酬",
          status: "UNCLAIMED",
          sent_at: new Date().toISOString(),
          expire_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }
      client.setStorage("presents", presents);
    }
    client.setStorage("user_missions", result.rows);
    return { data: { cycle_date: cycleDate, rescued_count: result.rescued.length }, error: null };
  }

  if (funcName === "get_current_skill_display") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const requested = Array.isArray(params?.p_skill_ids) ? new Set(params.p_skill_ids) : null;
    if (requested && requested.size > 70) return { data: null, error: { message: "too many skill ids", code: "22023" } };
    const owned = (client.getStorage("user_skills") || []).filter((entry: any) => entry.user_id === userId && (!requested || requested.has(entry.skill_card_id)));
    const grouped = new Map<string, any>();
    for (const skill of owned) {
      const current = grouped.get(skill.skill_card_id);
      if (!current || Number(skill.plus_val || 0) > Number(current.plus_val || 0)) grouped.set(skill.skill_card_id, skill);
    }
    return { data: Array.from(grouped.entries()).map(([skillId, skill]) => {
      const master = CANONICAL_SKILLS.find((entry) => entry.skill_id === skillId);
      const effects = master ? parseCanonicalEffects(master.effects) : [];
      const effectType = effects.some((effect) => effect.type === "DAMAGE") ? "ATTACK"
        : effects.some((effect) => effect.type === "HEAL" || effect.type === "REGEN") ? "HEAL"
          : effects.some((effect) => effect.type === "DEBUFF" || ["BLIND", "SILENCE", "STUN", "POISON", "BLEED", "TAUNT"].includes(effect.type)) ? "DEBUFF" : "BUFF";
      const status = effects.find((effect) => ["BLIND", "SILENCE", "STUN", "POISON", "BLEED", "TAUNT"].includes(effect.type))?.type || null;
      const displayEffect = effectType === "ATTACK" ? "対象へダメージを与える" : effectType === "HEAL" ? "対象のHPを回復する" : effectType === "BUFF" ? "対象の能力を一定ターン強化する" : "対象の能力を一定ターン低下させる";
      return {
        skill_master_id: skillId,
        display_name: master?.name || "スキル",
        rarity: master?.rarity || "N",
        description: `${displayEffect}${status ? `。追加効果: ${status}` : ""}`,
        display_effect: `${displayEffect}${status ? `。追加効果: ${status}` : ""}`,
        effect_type: effectType,
        target_type: master?.target || "ENEMY_SINGLE",
        cooldown: master?.cooldown,
        status_effect: status,
        enhancement_level: Number(skill.plus_val || 0),
        max_enhancement_level: 10,
        is_equipped: owned.some((entry: any) => entry.skill_card_id === skillId && entry.equipped_character_id),
      };
    }).sort((a, b) => a.skill_master_id.localeCompare(b.skill_master_id)), error: null };
  }

  if (funcName === "get_active_raids") {
    const raids = client.getStorage("raid_bosses") || [];
    const fallbackBoss = CANONICAL_RAID_BOSSES.bosses[0];
    return { data: raids.map((raid: any) => {
      const bossMasterId = raid.boss_master_id || raid.boss_id || fallbackBoss.bossId;
      const master = CANONICAL_RAID_BOSSES.bosses.find((entry) => entry.bossId === bossMasterId) || fallbackBoss;
      return {
        id: raid.id,
        bossMasterId,
        bossName: raid.boss_name || raid.name || master.displayName,
        level: Number(raid.level || master.referenceLevel),
        currentHp: Number(raid.current_hp ?? master.maxHp),
        maxHp: Number(raid.max_hp ?? master.maxHp),
        profileType: raid.profile_type || master.profileType,
        baseId: raid.base_id || master.townId,
        spawnedAt: raid.spawned_at || new Date().toISOString(),
        expiresAt: raid.expires_at || new Date(Date.now() + 86_400_000).toISOString(),
        status: raid.status || "ACTIVE",
        skillLoadout: raid.skill_loadout || master.skillLoadout,
      };
    }), error: null };
  }

  if (funcName === "get_recommended_guilds") {
    const guilds = client.getStorage("guilds") || [];
    const memberships = client.getStorage("guild_members") || [];
    const users = client.getStorage("users") || [];
    const eligible = guilds.filter((guild: any) => {
      const mode = guild.recruitment_mode || (guild.approval_required ? "APPLICATION_REQUIRED" : "OPEN_JOIN");
      const members = memberships.filter((member: any) => member.guild_id === guild.id);
      const cap = Number(guild.member_limit || (guild.level >= 5 ? 20 : guild.level === 4 ? 17 : guild.level === 3 ? 14 : guild.level === 2 ? 12 : 10));
      return !guild.is_disbanded && mode !== "CLOSED" && members.length < cap;
    });
    return { data: eligible.map((guild: any, index: number) => {
      const members = memberships.filter((member: any) => member.guild_id === guild.id);
      const activeMembers = members.filter((member: any) => users.find((user: any) => user.id === member.user_id)?.last_active_at).length;
      const mode = guild.recruitment_mode || (guild.approval_required ? "APPLICATION_REQUIRED" : "OPEN_JOIN");
      const cap = Number(guild.member_limit || (guild.level >= 5 ? 20 : guild.level === 4 ? 17 : guild.level === 3 ? 14 : guild.level === 2 ? 12 : 10));
      const fillRatio = members.length / cap;
      const recommendationScore = activeMembers * 18 + members.length * 16 + members.length * 10 + members.length * 12
        + (fillRatio >= 0.5 && fillRatio <= 0.8 ? 45 : 0) + (mode === "OPEN_JOIN" ? 12 : 0)
        + Math.log(Math.max(1, 250000 - index * 25000)) * 4 + Math.log(Math.max(1, 50000 - index * 5000)) * 2;
      return { guild_id: guild.id, name: guild.name, description: guild.description || "活動中のTRIBE", level: guild.level || 1, approval_required: Boolean(guild.approval_required), recruitment_mode: mode, member_count: Number(guild.member_count ?? members.length), member_limit: cap, active_members_7d: activeMembers, raid_participants_7d: members.length, raid_contribution_7d: 250000 - index * 25000, chatters_7d: members.length, activity_contributors_7d: members.length, guild_power: 50000 - index * 5000, recommendation_score: recommendationScore };
    }).sort((a: any, b: any) => b.recommendation_score - a.recommendation_score || String(a.guild_id).localeCompare(String(b.guild_id))).slice(0, Math.min(5, Math.max(3, Number(params?.p_limit || 5)))), error: null };
  }

  if (funcName === "set_current_guild_welcome_message") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const membership = (client.getStorage("guild_members") || [])
      .find((entry: any) => entry.user_id === userId && ["MASTER", "SUB_MASTER"].includes(entry.role));
    const clean = String(params?.p_message || "").trim();
    if (!membership) return { data: null, error: { message: "guild master required", code: "42501" } };
    if (clean.length > 120) return { data: null, error: { message: "welcome message is too long", code: "22023" } };
    const guilds = client.getStorage("guilds") || [];
    const guild = guilds.find((entry: any) => entry.id === membership.guild_id);
    if (!guild) return { data: null, error: { message: "guild not found", code: "P0002" } };
    guild.welcome_message = clean || null;
    client.setStorage("guilds", guilds);
    return { data: { status: "success", welcome_message: clean || "加入ありがとう。まずは挨拶して、仲間とレイドへ挑もう。" }, error: null };
  }

  if (funcName === "get_public_guild_detail") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const guild = (client.getStorage("guilds") || []).find((entry: any) => entry.id === params?.p_guild_id);
    if (!guild) return { data: null, error: { message: "Guild not found", code: "P0002" } };
    const members = (client.getStorage("guild_members") || []).filter((entry: any) => entry.guild_id === guild.id);
    const users = client.getStorage("users") || [];
    const rankings = client.getStorage("user_power_rankings") || [];
    const controls = (client.getStorage("guild_base_controls") || [])
      .filter((entry: any) => entry.guild_id === guild.id && entry.is_controlling)
      .map((entry: any) => entry.base_id);
    const leader = users.find((entry: any) => entry.id === guild.leader_id);
    const activeSince = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return { data: {
      guild_id: guild.id, name: guild.name, level: Number(guild.level || 1), xp: Number(guild.xp || 0),
      description: guild.description || "", approval_required: Boolean(guild.approval_required), recruitment_mode: guild.recruitment_mode || (guild.approval_required ? "APPLICATION_REQUIRED" : "OPEN_JOIN"),
      member_count: members.length, member_limit: Number(guild.member_limit || (guild.level >= 5 ? 20 : guild.level === 4 ? 17 : guild.level === 3 ? 14 : guild.level === 2 ? 12 : 10)),
      main_alignment: guild.main_alignment || "NEUTRAL", sub_alignment: guild.sub_alignment || "NEUTRAL",
      emblem_url: guild.logo_icon || null, leader_user_id: leader?.id || null, leader_name: leader?.username || "不在", leader_favorite_character_id: leader?.favorite_character_id || null, controlled_base_ids: controls,
      members: members
        .map((member: any) => {
          const profile = users.find((entry: any) => entry.id === member.user_id) || {};
          return { user_id: member.user_id, username: profile.username || "プレイヤー", favorite_character_id: profile.favorite_character_id || null, role: member.role, level: Number(profile.level || 1), joined_at: member.joined_at || "" };
        })
        .sort((left: any, right: any) => {
          const roleOrder = (role: string) => role === "MASTER" ? 0 : ["SUB_MASTER", "SUBMASTER"].includes(role) ? 1 : 2;
          return roleOrder(left.role) - roleOrder(right.role) || String(left.joined_at).localeCompare(String(right.joined_at)) || String(left.user_id).localeCompare(String(right.user_id));
        }),
      active_members_7d: members.filter((member: any) => {
        const profile = users.find((entry: any) => entry.id === member.user_id);
        return profile?.last_active_at && new Date(profile.last_active_at).getTime() >= activeSince;
      }).length,
      raid_contribution_7d: Number(guild.raid_contribution_7d || 0),
      guild_power: members.reduce((total: number, member: any) => total + Number(rankings.find((entry: any) => entry.user_id === member.user_id)?.total_power || 0), 0),
    }, error: null };
  }

  if (funcName === "record_client_funnel_event") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const allowlist = new Set([
      "game_start", "tutorial_complete", "first_gacha", "first_growth", "first_battle", "ranking_viewed",
      "guild_recommendation_impression", "guild_detail_view", "pvp_to_raid_cta", "raid_to_guild_cta",
      "home_primary_cta_impression", "home_primary_cta_click", "mission_cta_click", "ranking_player_detail",
      "ranking_guild_detail", "guild_recommendation_click", "guild_detail_join_click", "guild_welcome_chat_click", "guild_chat_raid_click",
    ]);
    if (!allowlist.has(params?.p_event_name)) return { data: null, error: { message: "event is not allowlisted", code: "22023" } };
    const events = client.getStorage("client_funnel_events") || [];
    events.push({ id: `event_${Date.now()}_${events.length}`, user_id: userId, event_name: params.p_event_name,
      source_screen: params.p_source_screen || null, source_cta: params.p_source_cta || null,
      object_id: params.p_object_id || null, metadata: params.p_metadata || {}, created_at: new Date().toISOString() });
    client.setStorage("client_funnel_events", events);
    const milestoneName = params.p_event_name === "ranking_viewed" ? "ranking_viewed"
      : params.p_event_name === "guild_detail_view" ? "guild_detail_view" : null;
    if (milestoneName) recordMockFunnelMilestone(client, userId, milestoneName, params.p_metadata || {});
    return { data: null, error: null };
  }

  if (funcName === "complete_activation_mission_handoff") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const members = client.getStorage("guild_members") || [];
    const milestones = client.getStorage("user_funnel_milestones") || [];
    const isGuildMember = members.some((entry: any) => entry.user_id === userId);
    if (!isGuildMember) {
      return { data: null, error: { message: "activation prerequisites not met", code: "55000" } };
    }
    if (!milestones.some((entry: any) => entry.user_id === userId && entry.milestone === "activation_mission_handoff")) {
      milestones.push({
        user_id: userId,
        milestone: "activation_mission_handoff",
        occurrence_count: 1,
        metadata: { source: "home", destination: "mission" },
        first_occurred_at: new Date().toISOString(),
        last_occurred_at: new Date().toISOString(),
      });
      client.setStorage("user_funnel_milestones", milestones);
    }
    return { data: true, error: null };
  }

  if (funcName === "get_public_power_rankings") {
    const users = client.getStorage("users") || [];
    const rankings = client.getStorage("user_power_rankings") || [];
    const memberships = client.getStorage("guild_members") || [];
    const guilds = client.getStorage("guilds") || [];
    return { data: rankings.sort((a: any, b: any) => Number(b.total_power || 0) - Number(a.total_power || 0)).map((ranking: any, index: number) => {
      const user = users.find((entry: any) => entry.id === ranking.user_id) || {};
      const membership = memberships.find((entry: any) => entry.user_id === ranking.user_id);
      const guild = membership && guilds.find((entry: any) => entry.id === membership.guild_id);
      return { user_id: ranking.user_id, current_power: Number(ranking.total_power || 0), updated_at: ranking.updated_at || new Date().toISOString(), username: user.username || "プレイヤー", avatar_url: user.avatar_url || null, guild_id: guild?.id || null, guild_name: guild?.name || null, rank_position: Object.prototype.hasOwnProperty.call(ranking, "rank_position") ? ranking.rank_position : index + 1 };
    }), error: null };
  }

  if (funcName === "get_active_ranking_seasons") {
    const monthly = rankingSeasonWindow("PVP");
    const weekly = rankingSeasonWindow("RAID");
    return { data: ["POWER", "GUILD_POWER", "PVP", "GVG", "RAID"].map((rankingType) => ({
      season_id: `mock-${rankingType.toLowerCase()}-season`, ranking_type: rankingType,
      starts_at: rankingType === "RAID" ? weekly.startsAt : monthly.startsAt,
      ends_at: rankingType === "RAID" ? weekly.endsAt : monthly.endsAt,
      status: "ACTIVE",
    })), error: null };
  }

  if (funcName === "get_recent_social_activity_feed") {
    const now = Date.now();
    const oldestVisibleAt = now - 24 * 60 * 60 * 1000;
    const limit = Math.max(1, Math.min(Number(params?.p_limit || 20), 50));
    const activities = (client.getStorage("social_activity_feed") || [])
      .filter((entry: any) => {
        const createdAt = Date.parse(entry.created_at || "");
        return Number.isFinite(createdAt) && createdAt >= oldestVisibleAt && createdAt <= now;
      })
      .sort((left: any, right: any) => {
        const createdAtDifference = Date.parse(right.created_at) - Date.parse(left.created_at);
        if (createdAtDifference !== 0) return createdAtDifference;
        if (String(left.id) === String(right.id)) return 0;
        return String(left.id) < String(right.id) ? 1 : -1;
      })
      .slice(0, limit);
    return { data: activities, error: null };
  }

  if (funcName === "get_public_ranking_reward_master") {
    const dailyTiers = [
      [1, 1, "L", 2],
      [2, 3, "L", 1],
      [4, 10, "M", 3],
      [11, 30, "M", 2],
      [31, 100, "M", 1],
    ].flatMap(([rankMin, rankMax, size, quantity]) => [
      [rankMin, rankMax, `CHAR_EXP_${size}`, quantity],
      [rankMin, rankMax, `EQUIP_EXP_${size}`, quantity],
    ]);
    return { data: {
      ...CANONICAL_RANKING_REWARDS,
      daily: Object.fromEntries(["POWER", "GUILD_POWER", "PVP", "RAID_PERSONAL"].map((key) => [key, dailyTiers])),
      guildSeasonCosmetics: [
        { cosmeticId: "guild_preopen_2026_participation", displayName: "プレオープン参加記念ギルド装飾", rewardKind: "GUILD_COSMETIC", quantity: 1, isParticipation: true, eligibilityLabel: "参加ギルド" },
        ...[1, 2, 3].map((rank) => ({ cosmeticId: `guild_preopen_2026_rank_${rank}`, displayName: `プレオープン第${rank}位限定ギルド装飾`, rewardKind: "GUILD_COSMETIC", quantity: 1, rankMin: rank, rankMax: rank })),
      ],
    }, error: null };
  }

  if (funcName === "get_preopen_guild_power_ranking") {
    const guilds = client.getStorage("guilds") || [];
    const memberships = client.getStorage("guild_members") || [];
    const powers = client.getStorage("user_power_rankings") || [];
    const rows = guilds.map((guild: any) => {
      const members = memberships.filter((member: any) => member.guild_id === guild.id);
      const currentPower = members.reduce((sum: number, member: any) => sum + Number(powers.find((power: any) => power.user_id === member.user_id)?.total_power || 0), 0);
      return { guild_id: guild.id, name: guild.name, current_power: currentPower, member_count: members.length };
    }).sort((a: any, b: any) => b.current_power - a.current_power)
      .map((row: any, index: number) => ({ ...row, rank_position: index + 1 }));
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const myGuildId = memberships.find((member: any) => member.user_id === userId)?.guild_id;
    return { data: {
      event_key: "PREOPEN_GUILD_POWER_2026",
      starts_at: "2026-09-03T15:00:00.000Z",
      ends_at: "2026-09-08T15:00:00.000Z",
      status: "ACTIVE",
      is_current_context: true,
      server_updated_at: new Date().toISOString(),
      rows,
      self_guild: rows.find((row: any) => row.guild_id === myGuildId) || null,
    }, error: null };
  }

  if (funcName === "get_public_guild_power_rankings") {
    const guilds = client.getStorage("guilds") || [];
    const memberships = client.getStorage("guild_members") || [];
    const powers = client.getStorage("user_power_rankings") || [];
    return { data: guilds.map((guild: any) => {
      const members = memberships.filter((member: any) => member.guild_id === guild.id);
      const currentPower = members.reduce((sum: number, member: any) => sum + Number(powers.find((power: any) => power.user_id === member.user_id)?.total_power || 0), 0);
      return { guild_id: guild.id, name: guild.name, current_power: currentPower, daily_power: currentPower, member_count: members.length, active_member_count: members.length };
    }).sort((a: any, b: any) => b.current_power - a.current_power).map((row: any, index: number) => ({ ...row, rank_position: index + 1 })), error: null };
  }

  if (funcName === "get_public_pvp_rankings") {
    const users = client.getStorage("users") || [];
    const ranks = client.getStorage("pvp_ranks") || [];
    const powers = client.getStorage("user_power_rankings") || [];
    const memberships = client.getStorage("guild_members") || [];
    const guilds = client.getStorage("guilds") || [];
    return { data: ranks.map((rank: any) => {
      const user = users.find((entry: any) => entry.id === rank.user_id) || {};
      const membership = memberships.find((entry: any) => entry.user_id === rank.user_id);
      const guild = membership && guilds.find((entry: any) => entry.id === membership.guild_id);
      return { user_id: rank.user_id, username: user.username, avatar_url: user.avatar_url || null,
        rank_points: Number(rank.rank_points || 1000), daily_wins: Number(rank.daily_wins || 0),
        current_power: Number(powers.find((entry: any) => entry.user_id === rank.user_id)?.total_power || 0),
        guild_id: guild?.id || null, guild_name: guild?.name || null };
    }).sort((a: any, b: any) => Number(params?.p_daily ? b.daily_wins - a.daily_wins : b.rank_points - a.rank_points))
      .map((row: any, index: number) => ({ ...row, rank_position: index + 1 })), error: null };
  }

  if (funcName === "search_guilds") {
    if (typeof window !== "undefined" && localStorage.getItem("mock_rpc_error:search_guilds") === "true") {
      return { data: null, error: { message: "mock guild discovery failure", code: "MOCK_ERROR" } };
    }
    const query = String(params?.p_query || "").trim().toLocaleLowerCase();
    const guilds = client.getStorage("guilds") || [];
    const members = client.getStorage("guild_members") || [];
    return { data: guilds
      .filter((guild: any) => !guild.is_disbanded && (!query || String(guild.name || "").toLocaleLowerCase().includes(query)))
      .map((guild: any) => ({
        ...guild,
        member_count: members.filter((member: any) => member.guild_id === guild.id).length,
        member_limit: Number(guild.member_limit || (guild.level >= 5 ? 20 : guild.level === 4 ? 17 : guild.level === 3 ? 14 : guild.level === 2 ? 12 : 10)),
        recruitment_mode: guild.recruitment_mode || (guild.approval_required ? "APPLICATION_REQUIRED" : "OPEN_JOIN"),
      }))
      .sort((left: any, right: any) => Number(right.level || 1) - Number(left.level || 1) || String(left.name).localeCompare(String(right.name)))
      .slice(0, 50), error: null };
  }

  if (funcName === "request_guild_join") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === userId);
    const leftAt = user?.last_guild_left_at ? new Date(user.last_guild_left_at).getTime() : 0;
    const guilds = client.getStorage("guilds") || [];
    const guild = guilds.find((entry: any) => entry.id === params?.p_guild_id && !entry.is_disbanded);
    const memberships = client.getStorage("guild_members") || [];
    const requests = client.getStorage("guild_join_requests") || [];
    if (leftAt > 0 && Date.now() - leftAt < 24 * 60 * 60 * 1000) {
      return { data: null, error: { code: "P0001", details: "GUILD_JOIN_COOLDOWN_ACTIVE", message: "Guild rejoin cooldown is active" } };
    }
    if (!userId || !guild || (guild.recruitment_mode || (guild.approval_required ? "APPLICATION_REQUIRED" : "OPEN_JOIN")) !== "APPLICATION_REQUIRED" || memberships.some((entry: any) => entry.user_id === userId)) {
      return { data: null, error: { message: "Guild application requirements are not met" } };
    }
    const existing = requests.find((entry: any) => entry.user_id === userId && entry.status === "PENDING");
    if (existing) return { data: { status: "pending", request_id: existing.id }, error: null };
    const request = { id: `gjr_${Date.now()}`, guild_id: guild.id, user_id: userId, status: "PENDING", requested_at: new Date().toISOString() };
    requests.push(request);
    client.setStorage("guild_join_requests", requests);
    return { data: { status: "pending", request_id: request.id }, error: null };
  }

  if (funcName === "cancel_guild_join_request") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const requests = client.getStorage("guild_join_requests") || [];
    const request = requests.find((entry: any) => entry.id === params?.p_request_id && entry.user_id === userId && entry.status === "PENDING");
    if (!request) return { data: null, error: { message: "Pending Guild application not found" } };
    request.status = "CANCELLED";
    client.setStorage("guild_join_requests", requests);
    return { data: { status: "cancelled" }, error: null };
  }

  if (funcName === "review_guild_join_request") {
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const requests = client.getStorage("guild_join_requests") || [];
    const request = requests.find((entry: any) => entry.id === params?.p_request_id && entry.status === "PENDING");
    const members = client.getStorage("guild_members") || [];
    const reviewer = members.find((entry: any) => entry.guild_id === request?.guild_id && entry.user_id === currentUserId);
    if (!request || !["MASTER", "SUB_MASTER", "SUBMASTER"].includes(reviewer?.role)) {
      return { data: null, error: { message: "Guild application review is not permitted" } };
    }
    request.status = params?.p_approve ? "APPROVED" : "REJECTED";
    if (params?.p_approve && !members.some((entry: any) => entry.guild_id === request.guild_id && entry.user_id === request.user_id)) {
      members.push({ id: `gm_${Date.now()}`, guild_id: request.guild_id, user_id: request.user_id, role: "MEMBER", joined_at: new Date().toISOString() });
      const users = client.getStorage("users") || [];
      const applicant = users.find((entry: any) => entry.id === request.user_id);
      if (applicant) applicant.guild_id = request.guild_id;
      client.setStorage("users", users);
      client.setStorage("guild_members", members);
    }
    client.setStorage("guild_join_requests", requests);
    return { data: { status: String(request.status).toLocaleLowerCase() }, error: null };
  }

  if (funcName === "get_my_raid_contribution_v1") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const bosses = client.getStorage("raid_bosses") || [];
    const instance = bosses.find((boss: any) => boss.id === params?.p_instance_id);
    if (!instance) return { data: null, error: { message: "Raid not found", code: "P0002" } };
    const isRoom = (client.getStorage("raid_rooms") || []).some((room: any) => room.raid_boss_instance_id === instance.id);
    // SQL261: RoomはInstance、旧Raidは同日分。appliedではなく本人のrawを参照する。
    const eligibleIds = new Set(bosses.filter((boss: any) => isRoom
      ? boss.id === instance.id
      : instance.raid_day_key != null && boss.raid_day_key === instance.raid_day_key
    ).map((boss: any) => boss.id));
    const contribution = (client.getStorage("raid_damage_logs") || [])
      .filter((log: any) => log.user_id === userId && eligibleIds.has(log.raid_boss_instance_id))
      .reduce((total: number, log: any) => total + Number(log.raw_damage ?? 0), 0);
    return { data: { contribution }, error: null };
  }

  if (funcName === "get_raid_rankings") {
    const users = client.getStorage("users") || [];
    const guilds = client.getStorage("guilds") || [];
    const logs = (client.getStorage("raid_damage_logs") || []).filter((log: any) => log.raid_boss_instance_id === params?.p_instance_id);
    const personalTotals = new Map<string, number>();
    const guildTotals = new Map<string, { contribution: number; participants: Set<string> }>();
    logs.forEach((log: any) => {
      if (log.user_id) personalTotals.set(log.user_id, (personalTotals.get(log.user_id) || 0) + Number(log.raw_damage || log.damage || 0));
      if (log.guild_id) {
        const current = guildTotals.get(log.guild_id) || { contribution: 0, participants: new Set<string>() };
        current.contribution += Number(log.raw_damage || log.damage || 0);
        if (log.user_id) current.participants.add(log.user_id);
        guildTotals.set(log.guild_id, current);
      }
    });
    const individual = [...personalTotals.entries()].sort((a, b) => b[1] - a[1]).map(([userId, contribution], index) => ({ user_id: userId, username: users.find((user: any) => user.id === userId)?.username || "プレイヤー", contribution, rank_position: index + 1 }));
    const guild = [...guildTotals.entries()].sort((a, b) => b[1].contribution - a[1].contribution).map(([guildId, total], index) => ({ guild_id: guildId, guild_name: guilds.find((entry: any) => entry.id === guildId)?.name || "ギルド", contribution: total.contribution, participant_count: total.participants.size, rank_position: index + 1 }));
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    return { data: { individual, guild, selfRank: individual.find((row) => row.user_id === userId) || null }, error: null };
  }

  if (funcName === "get_raid_season_rankings") {
    const users = client.getStorage("users") || [];
    const guilds = client.getStorage("guilds") || [];
    const season = rankingSeasonWindow("RAID");
    const logs = (client.getStorage("raid_damage_logs") || []).filter((log: any) => isInsideRankingSeason(log.created_at, season));
    const personalTotals = new Map<string, number>();
    const guildTotals = new Map<string, { contribution: number; participants: Set<string> }>();
    logs.forEach((log: any) => {
      if (log.user_id) personalTotals.set(log.user_id, (personalTotals.get(log.user_id) || 0) + Number(log.raw_damage || log.damage || 0));
      if (log.guild_id) {
        const current = guildTotals.get(log.guild_id) || { contribution: 0, participants: new Set<string>() };
        current.contribution += Number(log.raw_damage || log.damage || 0);
        if (log.user_id) current.participants.add(log.user_id);
        guildTotals.set(log.guild_id, current);
      }
    });
    const individual = [...personalTotals.entries()].sort((a, b) => b[1] - a[1]).map(([userId, contribution], index) => ({ user_id: userId, username: users.find((user: any) => user.id === userId)?.username || "プレイヤー", contribution, rank_position: index + 1 }));
    const guild = [...guildTotals.entries()].sort((a, b) => b[1].contribution - a[1].contribution).map(([guildId, total], index) => ({ guild_id: guildId, guild_name: guilds.find((entry: any) => entry.id === guildId)?.name || "ギルド", contribution: total.contribution, participant_count: total.participants.size, rank_position: index + 1 }));
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    return { data: { season_id: "mock-raid-season", starts_at: season.startsAt, ends_at: season.endsAt, individual, guild, selfRank: individual.find((row) => row.user_id === userId) || null }, error: null };
  }

  if (funcName === "get_public_gvg_rankings") {
    return { data: { season_id: "mock-gvg-season", starts_at: new Date(Date.now() - 86400000).toISOString(), ends_at: new Date(Date.now() + 86400000).toISOString(), guild: [], individual: [] }, error: null };
  }

  if (funcName === "get_public_guild_base_controls") {
    const guilds = client.getStorage("guilds") || [];
    return { data: (client.getStorage("guild_base_controls") || []).map((control: any) => ({
      base_id: control.base_id,
      guild_id: control.guild_id || null,
      guild_name: guilds.find((guild: any) => guild.id === control.guild_id)?.name || null,
      is_controlling: Boolean(control.is_controlling),
      total_seasonal_days: Number(control.total_seasonal_days || 0),
      updated_at: control.updated_at || new Date().toISOString(),
    })), error: null };
  }

  if (funcName === "save_main_formation") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const requested = Array.isArray(params?.p_character_ids)
      ? params.p_character_ids.filter(Boolean)
      : Array.isArray(params?.p_user_character_ids)
        ? params.p_user_character_ids.filter(Boolean)
        : [];
    const owned = client.getStorage("user_characters") || [];
    const ids = requested.map((id: string) => owned.find((character: any) => character.user_id === userId && (character.id === id || character.character_id === id))?.id || id);
    if (ids.length > 5 || new Set(ids).size !== ids.length) return { data: null, error: { message: "invalid main formation", code: "22023" } };
    if (ids.some((id: string) => !owned.some((character: any) => character.user_id === userId && character.id === id))) return { data: null, error: { message: "formation character is not owned", code: "42501" } };
    const formations = (client.getStorage("user_main_formations") || []).filter((row: any) => row.user_id !== userId);
    ids.forEach((id: string, index: number) => formations.push({ user_id: userId, slot: index + 1, user_character_id: id, updated_at: new Date().toISOString() }));
    client.setStorage("user_main_formations", formations);
    const power = (client.getStorage("user_power_rankings") || []).find((entry: any) => entry.user_id === userId)?.total_power || 0;
    return { data: { total_power: Number(power), slots: ids.length, character_ids: requested }, error: null };
  }

  if (funcName === "save_recommended_main_formation") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const characters = (client.getStorage("user_characters") || []).filter((entry: any) => entry.user_id === userId);
    const equipments = client.getStorage("user_equipments") || [];
    const selected = characters.slice().sort((left: any, right: any) => (
      mockCharacterPower(right, equipments) - mockCharacterPower(left, equipments)
      || String(left.character_id).localeCompare(String(right.character_id))
      || String(left.id).localeCompare(String(right.id))
    )).slice(0, 5);
    if (selected.length === 0) return { data: null, error: { message: "owned character required", code: "P0002" } };
    const formations = (client.getStorage("user_main_formations") || []).filter((row: any) => row.user_id !== userId);
    selected.forEach((character: any, index: number) => formations.push({ user_id: userId, slot: index + 1, user_character_id: character.id, updated_at: new Date().toISOString() }));
    client.setStorage("user_main_formations", formations);
    const totalPower = selected.reduce((sum: number, character: any) => sum + mockCharacterPower(character, equipments), 0);
    const powers = client.getStorage("user_power_rankings") || [];
    const power = powers.find((entry: any) => entry.user_id === userId);
    if (power) power.total_power = totalPower;
    else powers.push({ user_id: userId, total_power: totalPower, updated_at: new Date().toISOString() });
    client.setStorage("user_power_rankings", powers);
    return { data: { status: "success", character_ids: selected.map((entry: any) => entry.character_id), total_power: totalPower }, error: null };
  }

  if (funcName === "apply_recommended_main_loadout") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const allCharacters = client.getStorage("user_characters") || [];
    const formation = (client.getStorage("user_main_formations") || []).filter((row: any) => row.user_id === userId).sort((a: any, b: any) => a.slot - b.slot);
    const party = formation.map((row: any) => allCharacters.find((entry: any) => entry.user_id === userId && entry.id === row.user_character_id)).filter(Boolean);
    if (party.length !== 5) return { data: null, error: { message: "Main Formation must contain five Characters", code: "23514" } };
    const partyIds = new Set(party.map((entry: any) => entry.id));
    const skills = client.getStorage("user_skills") || [];
    const equipments = client.getStorage("user_equipments") || [];
    skills.filter((entry: any) => entry.user_id === userId && partyIds.has(entry.equipped_character_id)).forEach((entry: any) => { entry.equipped_character_id = null; entry.slot_index = null; });
    equipments.filter((entry: any) => entry.user_id === userId && partyIds.has(entry.equipped_character_id)).forEach((entry: any) => { entry.equipped_character_id = null; entry.slot_index = null; });

    let skillCount = 0;
    for (let slot = 0; slot < 6; slot += 1) {
      for (const character of party) {
        if (slot >= canonicalSkillSlotCount(Number(character.awakening_level || 0))) continue;
        const alreadyHasExclusive = skills.some((entry: any) => entry.user_id === userId && entry.equipped_character_id === character.id
          && CANONICAL_SKILLS.find((master) => master.skill_id === entry.skill_card_id)?.exclusive_character_id);
        const candidates = skills.filter((entry: any) => {
          if (entry.user_id !== userId || entry.equipped_character_id) return false;
          const master = CANONICAL_SKILLS.find((item) => item.skill_id === entry.skill_card_id);
          return master && (!master.exclusive_character_id || (master.exclusive_character_id === character.character_id && !alreadyHasExclusive));
        }).sort((left: any, right: any) => {
          const leftMaster = CANONICAL_SKILLS.find((entry) => entry.skill_id === left.skill_card_id)!;
          const rightMaster = CANONICAL_SKILLS.find((entry) => entry.skill_id === right.skill_card_id)!;
          return Number(rightMaster.exclusive_character_id === character.character_id) - Number(leftMaster.exclusive_character_id === character.character_id)
            || Number(right.plus_val || 0) - Number(left.plus_val || 0)
            || rarityScore(rightMaster.rarity) - rarityScore(leftMaster.rarity)
            || leftMaster.skill_id.localeCompare(rightMaster.skill_id)
            || String(left.id).localeCompare(String(right.id));
        });
        if (candidates[0]) { candidates[0].equipped_character_id = character.id; candidates[0].slot_index = slot; skillCount += 1; }
      }
    }

    const slotCategories = ["WEAPON", "WEAPON", "HEAD", "BODY", "LEGS", "ACCESSORY", "ACCESSORY"];
    let equipmentCount = 0;
    for (let slot = 0; slot < slotCategories.length; slot += 1) {
      const members = slot % 2 === 0 ? party : party.slice().reverse();
      for (const character of members) {
        const candidates = equipments.filter((entry: any) => {
          if (entry.user_id !== userId || entry.equipped_character_id) return false;
          const master = CANONICAL_EQUIPMENTS.find((item) => item.equipment_id === (entry.equipment_id || entry.equipment_master_id));
          return master?.category === slotCategories[slot] && (!master.exclusive_character_id || master.exclusive_character_id === character.character_id);
        }).sort((left: any, right: any) => {
          const leftMaster = CANONICAL_EQUIPMENTS.find((entry) => entry.equipment_id === (left.equipment_id || left.equipment_master_id))!;
          const rightMaster = CANONICAL_EQUIPMENTS.find((entry) => entry.equipment_id === (right.equipment_id || right.equipment_master_id))!;
          const contribution = (owned: any, master: any) => (["hp", "atk", "def"] as const).reduce((sum, key) => sum + canonicalEquipmentFlatStat(master.base_stats[key], Number(owned.level || 1), Number(owned.plus_val || 0)), 0);
          return Number(rightMaster.exclusive_character_id === character.character_id) - Number(leftMaster.exclusive_character_id === character.character_id)
            || contribution(right, rightMaster) - contribution(left, leftMaster)
            || Number(right.level || 1) - Number(left.level || 1)
            || Number(right.plus_val || 0) - Number(left.plus_val || 0)
            || rarityScore(rightMaster.rarity) - rarityScore(leftMaster.rarity)
            || leftMaster.equipment_id.localeCompare(rightMaster.equipment_id)
            || String(left.id).localeCompare(String(right.id));
        });
        if (candidates[0]) { candidates[0].equipped_character_id = character.id; candidates[0].slot_index = slot; equipmentCount += 1; }
      }
    }
    if (skillCount === 0 || equipmentCount === 0) return { data: null, error: { message: "Main Formation requires at least one Skill and one Equipment", code: "23514" } };
    client.setStorage("user_skills", skills);
    client.setStorage("user_equipments", equipments);
    recordMockLifetimeMilestone(client, userId, "first_main_loadout", { skillCount, equipmentCount });
    const totalPower = party.reduce((sum: number, character: any) => sum + mockCharacterPower(character, equipments), 0);
    const powers = client.getStorage("user_power_rankings") || [];
    const power = powers.find((entry: any) => entry.user_id === userId);
    if (power) power.total_power = totalPower;
    else powers.push({ user_id: userId, total_power: totalPower, updated_at: new Date().toISOString() });
    client.setStorage("user_power_rankings", powers);
    return { data: { status: "success", skillCount, equipmentCount, totalPower, characters: party.map((character: any) => ({
      characterId: character.character_id, userCharacterId: character.id,
      skillCount: skills.filter((entry: any) => entry.equipped_character_id === character.id).length,
      equipmentCount: equipments.filter((entry: any) => entry.equipped_character_id === character.id).length,
    })) }, error: null };
  }

  if (funcName === "get_current_main_formation") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const rows = (client.getStorage("user_main_formations") || []).filter((row: any) => row.user_id === userId).sort((a: any, b: any) => a.slot - b.slot);
    const owned = client.getStorage("user_characters") || [];
    const characters = rows.map((row: any) => {
      const record = owned.find((entry: any) => entry.id === row.user_character_id && entry.user_id === userId) || {};
      return {
        slot: row.slot,
        character_id: record.character_id || null,
        level: Number(record.level || 1),
        awakening_level: Number(record.awakening_level || 0),
        character_power: 0,
      };
    }).filter((row: any) => Boolean(row.character_id));
    const totalPower = (client.getStorage("user_power_rankings") || []).find((entry: any) => entry.user_id === userId)?.total_power || 0;
    return { data: { characters, total_power: Number(totalPower) }, error: null };
  }

  if (funcName === "get_my_power_snapshot") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const power = (client.getStorage("user_power_rankings") || []).find((entry: any) => entry.user_id === userId)?.total_power || 0;
    return { data: { user_id: userId, total_power: Number(power), updated_at: new Date().toISOString() }, error: null };
  }

  if (funcName === "get_public_player_detail") {
    const users = client.getStorage("users") || [];
    const player = users.find((entry: any) => entry.id === params?.p_user_id);
    if (!player) return { data: null, error: { message: "public player was not found", code: "P0002" } };
    const membership = (client.getStorage("guild_members") || []).find((entry: any) => entry.user_id === player.id);
    const guild = membership && (client.getStorage("guilds") || []).find((entry: any) => entry.id === membership.guild_id);
    const formation = (client.getStorage("user_main_formations") || []).filter((row: any) => row.user_id === player.id).sort((a: any, b: any) => a.slot - b.slot);
    const characters = client.getStorage("user_characters") || [];
    return { data: { user_id: player.id, username: player.username, avatar_url: player.avatar_url || null, bio: player.bio || null, level: Number(player.level || 1),
      guild_id: guild?.id || null, guild_name: guild?.name || null,
      total_power: Number((client.getStorage("user_power_rankings") || []).find((entry: any) => entry.user_id === player.id)?.total_power || 0),
      main_formation: formation.map((row: any) => { const owned = characters.find((entry: any) => entry.id === row.user_character_id) || {}; return { slot: row.slot, character_master_id: owned.character_id, display_name: owned.name || owned.character_id, rarity: owned.rarity || "N", asset_identifier: owned.asset_path || null, level: Number(owned.level || 1), awakening_level: Number(owned.awakening_level || owned.plus_val || 0), character_power: 0 }; }) }, error: null };
  }

  if (funcName === "process_login_bonus") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const user = (client.getStorage("users") || []).find((entry: any) => entry.id === userId);
    if (!userId || !user) return { data: null, error: { message: "Player authentication required" } };
    const todayJst = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const states = client.getStorage("user_login_bonuses") || [];
    let state = states.find((entry: any) => entry.user_id === userId);
    if (state?.last_claimed_date === todayJst) {
      return { data: {
        claimed: false, already_claimed: true, reason: "ALREADY_CLAIMED",
        current_step: state.current_day, day_number: state.current_day,
        total_logins: state.total_logins, last_claimed_date: todayJst
      }, error: null };
    }
    const currentStep = state ? (Number(state.current_day || 1) % 30) + 1 : 1;
    const totalLogins = state ? Number(state.total_logins || state.current_day || 0) + 1 : 1;
    const master = (client.getStorage("login_bonus_master") || []).find((entry: any) => Number(entry.day_number) === currentStep);
    if (!master) return { data: null, error: { message: `Login bonus master is missing for step ${currentStep}` } };
    if (!state) {
      state = { user_id: userId };
      states.push(state);
    }
    Object.assign(state, { current_day: currentStep, total_logins: totalLogins, last_claimed_date: todayJst, last_claimed_at: new Date().toISOString() });
    client.setStorage("user_login_bonuses", states);
    const presents = client.getStorage("presents") || [];
    presents.push({ id: `login_${userId}_${totalLogins}`, user_id: userId, item_id: master.item_id, quantity: master.quantity, message: `ログインボーナス: ${master.item_name}`, status: "UNCLAIMED", sent_at: new Date().toISOString() });
    client.setStorage("presents", presents);
    return { data: {
      claimed: true, already_claimed: false, current_step: currentStep, day_number: currentStep,
      total_logins: totalLogins, last_claimed_date: todayJst,
      item_id: master.item_id, quantity: master.quantity, item_name: master.item_name,
      reward: { ...master, is_featured: Boolean(master.is_featured) }
    }, error: null };
  }

  if (funcName === "set_character_equipment" || funcName === "set_character_equipment_bulk" || funcName === "unequip_character_equipment" || funcName === "unequip_character_equipment_bulk") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const characters = client.getStorage("user_characters") || [];
    const equipments = client.getStorage("user_equipments") || [];
    const masters = CANONICAL_EQUIPMENTS;
    const slotTypes = ["WEAPON", "WEAPON", "HEAD", "BODY", "LEGS", "ACCESSORY", "ACCESSORY"];

    if (funcName === "unequip_character_equipment") {
      const equipment = equipments.find((entry: any) => entry.id === params.p_equipment_id && entry.user_id === userId);
      if (!equipment) return { data: null, error: { message: "owned equipment not found", code: "P0002" } };
      equipment.equipped_character_id = null;
      equipment.slot_index = null;
      client.setStorage("user_equipments", equipments);
      return { data: { status: "success", equipment_id: equipment.id }, error: null };
    }

    const characterId = params.p_character_id;
    const character = characters.find((entry: any) => entry.id === characterId && entry.user_id === userId);
    if (!character) return { data: null, error: { message: "owned character not found", code: "P0002" } };
    if (funcName === "unequip_character_equipment_bulk") {
      let count = 0;
      for (const equipment of equipments) {
        if (equipment.user_id === userId && equipment.equipped_character_id === characterId) {
          equipment.equipped_character_id = null;
          equipment.slot_index = null;
          count++;
        }
      }
      client.setStorage("user_equipments", equipments);
      return { data: { status: "success", unequipped_count: count }, error: null };
    }

    const requestedIds = funcName === "set_character_equipment" ? [params.p_equipment_id] : params.p_equipment_ids;
    const requestedSlots = funcName === "set_character_equipment" ? [params.p_slot_index] : params.p_slot_indexes;
    if (!Array.isArray(requestedIds) || !Array.isArray(requestedSlots) || requestedIds.length !== requestedSlots.length || requestedIds.length > 7
      || new Set(requestedIds).size !== requestedIds.length || new Set(requestedSlots).size !== requestedSlots.length) {
      return { data: null, error: { message: "invalid equipment loadout", code: "22023" } };
    }
    const requested = requestedIds.map((id: string, index: number) => {
      const equipment = equipments.find((entry: any) => entry.id === id && entry.user_id === userId);
      const master = equipment && masters.find((entry) => entry.equipment_id === (equipment.equipment_id || equipment.equipment_master_id));
      return { equipment, master, slot: Number(requestedSlots[index]) };
    });
    for (const item of requested) {
      if (!item.equipment || !item.master) return { data: null, error: { message: "owned equipment not found", code: "P0002" } };
      if (slotTypes[item.slot] !== item.master.category) return { data: null, error: { message: "equipment type does not match slot", code: "23514" } };
      if (item.master.exclusive_character_id && item.master.exclusive_character_id !== character.character_id) return { data: null, error: { message: "exclusive equipment cannot be equipped by this character", code: "42501" } };
      if (item.equipment.equipped_character_id && item.equipment.equipped_character_id !== characterId) return { data: null, error: { message: "equipment is already equipped by another character", code: "23505" } };
    }
    if (funcName === "set_character_equipment_bulk") {
      for (const equipment of equipments) {
        if (equipment.user_id === userId && equipment.equipped_character_id === characterId) {
          equipment.equipped_character_id = null;
          equipment.slot_index = null;
        }
      }
    }
    for (const item of requested) {
      const occupied = equipments.find((entry: any) => entry.user_id === userId && entry.equipped_character_id === characterId && entry.slot_index === item.slot && entry.id !== item.equipment.id);
      if (occupied) {
        occupied.equipped_character_id = null;
        occupied.slot_index = null;
      }
      item.equipment.equipped_character_id = characterId;
      item.equipment.slot_index = item.slot;
    }
    client.setStorage("user_equipments", equipments);
    return { data: { status: "success", equipped_count: requested.length }, error: null };
  }

  if (funcName === "set_character_skill" || funcName === "unequip_character_skill" || funcName === "set_character_skill_loadout") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const characters = client.getStorage("user_characters") || [];
    const skills = client.getStorage("user_skills") || [];
    const masters = CANONICAL_SKILLS;

    if (funcName === "unequip_character_skill") {
      const skill = skills.find((entry: any) => entry.id === params.p_skill_id && entry.user_id === userId);
      if (!skill) return { data: null, error: { message: "owned skill not found", code: "P0002" } };
      skill.equipped_character_id = null;
      skill.slot_index = null;
      client.setStorage("user_skills", skills);
      return { data: { status: "success" }, error: null };
    }

    const character = characters.find((entry: any) => entry.id === params.p_character_id && entry.user_id === userId);
    if (!character) return { data: null, error: { message: "owned character not found", code: "P0002" } };
    const requestedIds = funcName === "set_character_skill" ? [params.p_skill_id] : params.p_skill_ids;
    const requestedSlots = funcName === "set_character_skill" ? [params.p_slot_index] : params.p_slot_indexes;
    if (!Array.isArray(requestedIds) || !Array.isArray(requestedSlots) || requestedIds.length !== requestedSlots.length || requestedIds.length > 6
      || new Set(requestedIds).size !== requestedIds.length || new Set(requestedSlots).size !== requestedSlots.length) {
      return { data: null, error: { message: "invalid skill loadout arrays", code: "22023" } };
    }
    const maxSlot = canonicalSkillSlotCount(Math.max(0, Math.min(5, Number(character.awakening_level || 0)))) - 1;
    const requested = requestedIds.map((id: string, index: number) => {
      const skill = skills.find((entry: any) => entry.id === id && entry.user_id === userId);
      const master = skill && masters.find((entry: any) => entry.skill_id === skill.skill_card_id);
      return { skill, master, slot: Number(requestedSlots[index]) };
    });
    for (const item of requested) {
      if (!Number.isInteger(item.slot) || item.slot < 0 || item.slot > maxSlot) return { data: null, error: { message: "skill slot is locked", code: "23514" } };
      if (!item.skill || !item.master) return { data: null, error: { message: "owned executable skill not found", code: "P0002" } };
      if (item.master.exclusive_character_id && item.master.exclusive_character_id !== character.character_id) {
        return { data: null, error: { message: "exclusive skill character mismatch", code: "23514" } };
      }
    }
    const requestedExclusiveCount = requested.filter((item) => item.master?.exclusive_character_id).length;
    const retainedExclusiveCount = funcName === "set_character_skill_loadout" ? 0 : skills.filter((entry: any) => entry.user_id === userId && entry.equipped_character_id === character.id && !requestedIds.includes(entry.id) && CANONICAL_SKILLS.some((master) => master.skill_id === entry.skill_card_id && master.exclusive_character_id)).length;
    if (requestedExclusiveCount + retainedExclusiveCount > 1) return { data: null, error: { message: "only one exclusive skill may be equipped", code: "23514" } };
    if (funcName === "set_character_skill_loadout") {
      for (const skill of skills) {
        if (skill.user_id === userId && skill.equipped_character_id === character.id) {
          skill.equipped_character_id = null;
          skill.slot_index = null;
        }
      }
    }
    for (const item of requested) {
      const occupied = skills.find((entry: any) => entry.user_id === userId && entry.equipped_character_id === character.id && entry.slot_index === item.slot && entry.id !== item.skill.id);
      if (occupied) {
        occupied.equipped_character_id = null;
        occupied.slot_index = null;
      }
      item.skill.equipped_character_id = character.id;
      item.skill.slot_index = item.slot;
    }
    client.setStorage("user_skills", skills);
    return { data: { status: "success", equipped_count: requested.length }, error: null };
  }

  if (funcName === "awaken_character") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const characters = client.getStorage("user_characters") || [];
    const character = characters.find((entry: any) => entry.id === params.p_character_id && entry.user_id === userId);
    if (!character) return { data: null, error: { message: "owned character not found", code: "P0002" } };
    const currentLevel = Number(character.awakening_level || 0);
    if (currentLevel >= 5) return { data: null, error: { message: "character awakening is already at maximum", code: "23514" } };
    const items = client.getStorage("user_items") || [];
    const book = items.find((entry: any) => entry.user_id === userId && entry.item_id === "AWAKENING_BOOK");
    if (!book || Number(book.quantity || 0) < 1) return { data: null, error: { message: "insufficient Awakening Book", code: "23514" } };
    book.quantity = Number(book.quantity) - 1;
    const result = applyMockCharacterAwakeningEquivalent(character);
    client.setStorage("user_items", items);
    client.setStorage("user_characters", characters);
    return { data: { status: "success", consumed_item_id: "AWAKENING_BOOK", consumed_quantity: 1, ...result }, error: null };
  }

  if (funcName === "level_up_character" || funcName === "level_up_equipment") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const isCharacter = funcName === "level_up_character";
    const itemPrefixes = isCharacter ? ["CHAR_EXP_S", "CHAR_EXP_M", "CHAR_EXP_L"] : ["EQUIP_EXP_S", "EQUIP_EXP_M", "EQUIP_EXP_L"];
    const count = Number(params.p_count || 1);
    if (!itemPrefixes.includes(params.p_exp_item_id) || !Number.isInteger(count) || count < 1 || count > 100) {
      return { data: null, error: { message: `invalid ${isCharacter ? "character" : "equipment"} training request`, code: "22023" } };
    }
    const rowsKey = isCharacter ? "user_characters" : "user_equipments";
    const rows = client.getStorage(rowsKey) || [];
    const ownedId = isCharacter ? params.p_character_id : params.p_equipment_id;
    const owned = rows.find((entry: any) => entry.id === ownedId && entry.user_id === userId);
    if (!owned) return { data: null, error: { message: `owned ${isCharacter ? "character" : "equipment"} not found`, code: "P0002" } };
    const unlock = Number(isCharacter ? owned.awakening_level : owned.plus_val) || 0;
    const levelCap = isCharacter
      ? Math.min(100, 50 + Math.min(Math.max(unlock, 0), 5) * 10)
      : canonicalEquipmentLevelCap(Math.max(0, Math.min(10, unlock)));
    const currentLevel = Number(owned.level || 1);
    const newLevel = Math.min(currentLevel + count, levelCap);
    const levelsGained = newLevel - currentLevel;
    if (levelsGained <= 0) return { data: null, error: { message: `${isCharacter ? "character" : "equipment"} level cap reached`, code: "23514" } };
    const masterKey = isCharacter ? "character_level_up_master" : "equipment_level_up_master";
    const masters = client.getStorage(masterKey) || [];
    const fallbackCash = isCharacter ? 100 : 50;
    let cashCost = 0;
    let materialCost = 0;
    for (let level = currentLevel + 1; level <= newLevel; level++) {
      const master = masters.find((entry: any) => Number(entry.level) === level);
      cashCost += Number(master?.cost_cash ?? fallbackCash);
      materialCost += Number(isCharacter ? master?.required_material_count ?? 1 : master?.required_exp ?? 1);
    }
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === userId);
    const items = client.getStorage("user_items") || [];
    const material = items.find((entry: any) => entry.user_id === userId && entry.item_id === params.p_exp_item_id);
    if (!user || Number(user.cash || 0) < cashCost) return { data: null, error: { message: "insufficient cash", code: "23514" } };
    if (!material || Number(material.quantity || 0) < materialCost) return { data: null, error: { message: `insufficient ${isCharacter ? "character" : "equipment"} training material`, code: "23514" } };
    user.cash -= cashCost;
    material.quantity -= materialCost;
    owned.level = newLevel;
    client.setStorage("users", users);
    client.setStorage("user_items", items);
    client.setStorage(rowsKey, rows);
    evaluateMockMissionProgress(client, userId, isCharacter ? "CHAR_LEVEL_UP" : "GEAR_UPGRADE", levelsGained);
    recordMockFunnelMilestone(client, userId, "first_growth", { source: rowsKey });
    return { data: { status: "success", level: newLevel, levels_gained: levelsGained, level_cap: levelCap, cash_spent: cashCost, remaining_cash: user.cash }, error: null };
  }

  if (funcName === "limit_break_equipment" || funcName === "limit_break_skill") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const isEquipment = funcName === "limit_break_equipment";
    const rowsKey = isEquipment ? "user_equipments" : "user_skills";
    const ownedId = isEquipment ? params.p_equipment_id : params.p_skill_id;
    const masterIdKey = isEquipment ? "equipment_id" : "skill_card_id";
    const rows = client.getStorage(rowsKey) || [];
    const owned = rows.find((entry: any) => entry.id === ownedId && entry.user_id === userId);
    if (!owned) return { data: null, error: { message: `owned ${isEquipment ? "equipment" : "skill"} not found`, code: "P0002" } };
    const nextPlus = Number(owned.plus_val || 0) + 1;
    if (nextPlus > 10) return { data: null, error: { message: `${isEquipment ? "equipment" : "skill"} limit break cap reached`, code: "23514" } };
    const masterKey = isEquipment ? "equipment_limit_break_master" : "skill_limit_break_master";
    const master = (client.getStorage(masterKey) || []).find((entry: any) => Number(entry.plus_val) === nextPlus);
    const cashCost = Number(master?.cost_cash ?? nextPlus * 1000);
    const materialCost = Number(isEquipment ? master?.required_hammer ?? 1 : master?.required_book ?? 1);
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === userId);
    if (!user || Number(user.cash || 0) < cashCost) return { data: null, error: { message: "insufficient cash", code: "23514" } };
    const items = client.getStorage("user_items") || [];
    let material: any = null;
    let dupeIndex = -1;
    let materialId: string | null = null;
    if (params.p_use_wildcard) {
      materialId = isEquipment ? "EQUIP_LB_PART" : "SKILL_MANUAL";
      material = items.find((entry: any) => entry.user_id === userId && entry.item_id === materialId);
      if (!material || Number(material.quantity || 0) < materialCost) return { data: null, error: { message: `insufficient ${isEquipment ? "equipment" : "skill"} limit break material`, code: "23514" } };
    } else {
      dupeIndex = rows.findIndex((entry: any) => entry.id === params.p_dupe_id && entry.id !== ownedId && entry.user_id === userId && entry.equipped_character_id == null && (entry[masterIdKey] || entry.equipment_master_id) === (owned[masterIdKey] || owned.equipment_master_id));
      if (dupeIndex < 0) return { data: null, error: { message: `matching unequipped duplicate ${isEquipment ? "equipment" : "skill"} is required`, code: "23514" } };
    }
    user.cash -= cashCost;
    if (material) material.quantity -= materialCost;
    if (dupeIndex >= 0) rows.splice(dupeIndex, 1);
    owned.plus_val = nextPlus;
    client.setStorage("users", users);
    client.setStorage("user_items", items);
    client.setStorage(rowsKey, rows);
    evaluateMockMissionProgress(client, userId, isEquipment ? "GEAR_LIMIT_BREAK" : "SKILL_LIMIT_BREAK", 1);
    recordMockFunnelMilestone(client, userId, "first_growth", { source: rowsKey });
    return { data: { status: "success", plus_val: nextPlus, cash_spent: cashCost, remaining_cash: user.cash, material_id: materialId }, error: null };
  }

  if (funcName === "save_pvp_defense_deck" || funcName === "save_gvg_defense_deck") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const requestedIds = Array.isArray(params.p_character_ids) ? params.p_character_ids.filter(Boolean) : [];
    if (requestedIds.length > 5) return { data: null, error: { message: "party supports at most five characters", code: "22023" } };
    const ownedCharacters = client.getStorage("user_characters") || [];
    const canonicalIds = requestedIds.map((requestedId: string) => {
      const owned = ownedCharacters.find((character: any) =>
        character.user_id === userId && (character.id === requestedId || character.character_id === requestedId)
      );
      return owned?.id || null;
    });
    if (canonicalIds.some((id: string | null) => !id)) {
      return { data: null, error: { message: "party contains a character that is not owned", code: "23503" } };
    }
    if (new Set(canonicalIds).size !== canonicalIds.length) {
      return { data: null, error: { message: "party contains duplicate characters", code: "23505" } };
    }

    if (funcName === "save_gvg_defense_deck") {
      const memberships = client.getStorage("guild_members") || [];
      const membership = memberships.find((member: any) => member.user_id === userId);
      if (!membership) return { data: null, error: { message: "guild membership required", code: "42501" } };
      const decks = client.getStorage("gvg_defense_decks") || [];
      const remaining = decks.filter((deck: any) => deck.user_id !== userId);
      if (canonicalIds.length > 0) {
        remaining.push({
          id: `gvg_defense_${userId}`,
          user_id: userId,
          guild_id: membership.guild_id,
          character_1_id: canonicalIds[0] || null,
          character_2_id: canonicalIds[1] || null,
          character_3_id: canonicalIds[2] || null,
          character_4_id: canonicalIds[3] || null,
          character_5_id: canonicalIds[4] || null,
          updated_at: new Date().toISOString(),
        });
      }
      client.setStorage("gvg_defense_decks", remaining);
      return { data: { status: "success", removed: canonicalIds.length === 0, character_ids: canonicalIds }, error: null };
    }

    const tactic = params.p_tactic || "ATTACK_PRIORITY";
    const validTactics = ["ATTACK_PRIORITY", "HEAL_PRIORITY", "SKILL_PRIORITY", "BALANCED", "WEAKNESS_FOCUS"];
    if (!validTactics.includes(tactic)) return { data: null, error: { message: "invalid tactic", code: "22023" } };
    const decks = client.getStorage("pvp_defense_decks") || [];
    const existing = decks.find((deck: any) => deck.user_id === userId);
    const nextDeck = {
      ...(existing || { id: `pvp_defense_${userId}`, user_id: userId }),
      character_1_id: canonicalIds[0] || null,
      character_2_id: canonicalIds[1] || null,
      character_3_id: canonicalIds[2] || null,
      character_4_id: canonicalIds[3] || null,
      character_5_id: canonicalIds[4] || null,
      tactic,
      updated_at: new Date().toISOString(),
    };
    client.setStorage("pvp_defense_decks", existing ? decks.map((deck: any) => deck.user_id === userId ? nextDeck : deck) : [...decks, nextDeck]);
    return { data: { status: "success", character_ids: canonicalIds, tactic }, error: null };
  }

  if (funcName === "begin_gvg_attack") {
    const gvgState = (client.getStorage("feature_operating_states") || []).find((entry: any) => entry.feature_key === "GVG")?.state || "CLOSED";
    if (gvgState !== "OPEN") return { data: null, error: { message: "GvG is closed", code: "P0001" } };
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === userId);
    const members = client.getStorage("guild_members") || [];
    const membership = members.find((entry: any) => entry.user_id === userId);
    const matches = client.getStorage("gvg_match_sessions") || [];
    const match = matches.find((entry: any) => entry.id === params.p_match_session_id && entry.status === "ACTIVE");
    if (!user || !membership || !match || Number(user.vitality || 0) < 20) return { data: null, error: { message: "公式GvGに参加できません。" } };
    const defenderSide = match.guild_a_id === membership.guild_id ? "B" : "A";
    const snapshots = client.getStorage("gvg_match_member_snapshots") || [];
    const candidates = snapshots.filter((entry: any) => entry.match_session_id === match.id && entry.side === defenderSide);
    const target = candidates[0];
    if (!target) return { data: null, error: { message: "防衛スナップショットがありません。" } };
    user.vitality -= 20;
    const attacks = client.getStorage("gvg_attack_logs") || [];
    const attack = { id: `gvg_attack_${Date.now()}`, match_session_id: match.id, attacker_user_id: userId, attacker_guild_id: membership.guild_id, defender_snapshot_id: target.id, battle_result: "PENDING", raw_damage: 0, applied_damage: 0 };
    attacks.push(attack);
    client.setStorage("users", users);
    client.setStorage("gvg_attack_logs", attacks);
    return { data: { attack_id: attack.id, remaining_ap: user.vitality, defense_deck: target.defense_deck || [] }, error: null };
  }

  if (funcName === "cancel_unresolved_gvg_attack") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const attacks = client.getStorage("gvg_attack_logs") || [];
    const attack = attacks.find((entry: any) => entry.id === params.p_attack_id && entry.attacker_user_id === userId && entry.battle_result === "PENDING");
    if (!attack) return { data: null, error: { message: "未確定の公式GvG攻撃がありません。" } };

    const replays = client.getStorage("battle_replay_sessions") || [];
    const relatedReplays = replays.filter((entry: any) => entry.requester_user_id === userId && entry.battle_mode === "GVG" && entry.source_reference_id === attack.id);
    if (relatedReplays.some((entry: any) => entry.status !== "PENDING")) {
      return { data: null, error: { message: "確定済みの公式GvGリプレイは取消できません。" } };
    }

    client.setStorage("battle_replay_sessions", replays.filter((entry: any) => !relatedReplays.includes(entry)));
    client.setStorage("gvg_attack_logs", attacks.filter((entry: any) => entry !== attack));
    return { data: null, error: null };
  }

  if (funcName === "create_battle_replay_pending") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId || !Array.isArray(params.p_player_snapshot) || !Array.isArray(params.p_enemy_snapshot)) return { data: null, error: { message: "リプレイ入力が不正です。" } };
    const sessions = client.getStorage("battle_replay_sessions") || [];
    const id = `replay_${Date.now()}`;
    sessions.push({ id, requester_user_id: userId, battle_mode: params.p_battle_mode, tactic_id: params.p_tactic_id, random_seed: params.p_random_seed, source_reference_id: params.p_source_reference_id || null, status: "PENDING", player_snapshot: params.p_player_snapshot, enemy_snapshot: params.p_enemy_snapshot });
    client.setStorage("battle_replay_sessions", sessions);
    return { data: id, error: null };
  }

  if (funcName === "get_patrol_battle_enemy") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const patrol = (client.getStorage("user_patrols") || []).find((entry: any) =>
      entry.id === params.p_patrol_id
      && entry.user_id === userId
      && (entry.status === "CLAIMABLE"
        || (entry.status === "ONGOING" && Date.parse(entry.expires_at) <= Date.now()))
      && entry.has_battle_event
      && !entry.battle_resolved
    );
    const encounter = patrol?.encounter_snapshot ?? null;
    if (!patrol || !encounter) {
      return { data: null, error: { message: "eligible patrol encounter not found", code: "P0002" } };
    }
    return {
      data: {
        id: encounter.encounterId ?? patrol.id,
        quest_id: patrol.course_id ?? patrol.quest_id,
        npc_name: "Canonical NPC Party",
        npc_level: encounter.members[0]?.level ?? 1,
        encounter_rate: 1,
        enemy_data: encounter,
      },
      error: null,
    };
  }

  if (funcName === "create_patrol_battle_replay") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const patrols = client.getStorage("user_patrols") || [];
    const patrol = patrols.find((entry: any) => entry.id === params.p_patrol_id && entry.user_id === userId);
    const isServerComplete = patrol?.status === "CLAIMABLE"
      || (patrol?.status === "ONGOING" && new Date(patrol.expires_at).getTime() <= Date.now());
    if (!patrol || !isServerComplete || !patrol.has_battle_event || patrol.battle_resolved) {
      return { data: null, error: { message: "eligible patrol encounter not found", code: "P0002" } };
    }
    patrol.status = "CLAIMABLE";
    client.setStorage("user_patrols", patrols);
    const owned = client.getStorage("user_characters") || [];
    const decks = client.getStorage("pvp_defense_decks") || [];
    const deck = decks.find((entry: any) => entry.user_id === userId);
    const deckIds = deck ? [deck.character_1_id, deck.character_2_id, deck.character_3_id, deck.character_4_id, deck.character_5_id].filter(Boolean) : [];
    const roster = deckIds.length
      ? deckIds.map((id: string) => owned.find((entry: any) => entry.id === id && entry.user_id === userId)).filter(Boolean)
      : owned.filter((entry: any) => entry.user_id === userId && entry.character_id === patrol.character_id).slice(0, 1);
    if (!roster.length) return { data: null, error: { message: "battle formation has no supported owned character", code: "23514" } };
    const equipments = client.getStorage("user_equipments") || [];
    const equippedSkills = client.getStorage("user_skills") || [];
    const playerSnapshot = roster.map((character: any) => {
      const characterMaster = CANONICAL_CHARACTERS.find((entry) => entry.character_id === character.character_id);
      const equipmentLoadout = equipments
        .filter((owned: any) => owned.user_id === userId && owned.equipped_character_id === character.id)
        .map((owned: any) => ({ owned, master: CANONICAL_EQUIPMENTS.find((master) => master.equipment_id === (owned.equipment_id || owned.equipment_master_id)) }))
        .filter(({ master }: any) => master && (!master.exclusive_character_id || master.exclusive_character_id === character.character_id));
      const equipmentStats = equipmentLoadout.reduce((total: any, { owned, master }: any) => {
        const level = Math.max(1, Math.min(100, Number(owned.level || 1)));
        const plusValue = Math.max(0, Math.min(10, Number(owned.plus_val || 0)));
        total.hp += canonicalEquipmentFlatStat(master.base_stats.hp, level, plusValue);
        total.atk += canonicalEquipmentFlatStat(master.base_stats.atk, level, plusValue);
        total.def += canonicalEquipmentFlatStat(master.base_stats.def, level, plusValue);
        total.spd += canonicalEquipmentFlatStat(master.base_stats.spd, level, plusValue);
        total.luk += canonicalEquipmentFlatStat(master.base_stats.luk, level, plusValue);
        return total;
      }, { hp: 0, atk: 0, def: 0, spd: 0, luk: 0 });
      const characterStats = characterMaster ? canonicalCharacterStats(characterMaster.lv1, characterMaster.lv100, Math.max(1, Math.min(100, Number(character.level || 1))), Math.max(0, Math.min(5, Number(character.awakening_level || 0)))) : { hp: 1, atk: 0, def: 0, spd: 0, luk: 0 };
      const skillRefs = equippedSkills
        .filter((owned: any) => owned.user_id === userId && owned.equipped_character_id === character.id
          && Number(owned.slot_index) >= 0 && Number(owned.slot_index) < canonicalSkillSlotCount(Math.max(0, Math.min(5, Number(character.awakening_level || 0)))))
        .sort((a: any, b: any) => Number(a.slot_index || 0) - Number(b.slot_index || 0))
        .map((owned: any) => {
          const master = CANONICAL_SKILLS.find((entry) => entry.skill_id === owned.skill_card_id
            && (!entry.exclusive_character_id || entry.exclusive_character_id === character.character_id));
          if (!master) return null;
          const plusValue = Math.max(0, Math.min(Number(owned.plus_val || 0), 10));
          return {
            id: master.skill_id,
            name: master.name,
            kind: master.kind,
            target: master.target,
            activationType: master.activation_type,
            cooldown: master.cooldown,
            availableFromRound: master.available_from_round,
            effects: master.effects,
            exclusiveCharacterId: master.exclusive_character_id,
            skillId: master.skill_id, slotIndex: owned.slot_index, plusValue,
          };
        })
        .filter(Boolean);
      return {
        id: `ally_${character.character_id}`,
        // Mirror the production snapshot's display-name contract. UUIDs are
        // identifiers, not player-facing battle labels.
        name: character.display_name || character.name || characterMaster?.name || "メンバー",
        team: "PLAYER",
        alignment: characterMaster?.attribute || "ORDER",
        characterId: character.character_id,
        level: Math.max(1, Number(character.level || 1)),
        awakeningLevel: Math.max(0, Number(character.awakening_level || 0)),
        rarity: characterMaster?.rarity || "N",
        stats: {
          hp: characterStats.hp + equipmentStats.hp,
          atk: characterStats.atk + equipmentStats.atk,
          def: characterStats.def + equipmentStats.def,
          spd: characterStats.spd + equipmentStats.spd,
          luk: characterStats.luk + equipmentStats.luk,
        },
        equipment: equipmentLoadout.map(({ owned, master }: any) => ({ instanceId: owned.id, equipmentId: master.equipment_id, slotIndex: owned.slot_index, level: owned.level || 1, plusValue: owned.plus_val || 0 })),
        equippedSkillRefs: skillRefs,
        // The battle engine supplies the canonical basic attack as fallback.
        skills: skillRefs,
      };
    });
    const canonicalEnemySnapshot = canonicalQuestEnemySnapshot(patrol.course_id, patrol.encounter_snapshot);
    // Non-Production mock fixtures may still exercise historical arbitrary
    // quest IDs. Every Canonical Quest takes the shared Character snapshot path.
    const enemySnapshot = canonicalEnemySnapshot || (() => {
      const npcs = client.getStorage("patrol_npcs") || [];
      const npc = npcs.find((entry: any) => entry.quest_id === patrol.course_id);
      const enemy = npc?.enemy_data || { hp: 900, atk: 55, def: 35, spd: 75, luk: 3 };
      const isPresentationFixture = (client.getStorage("tutorial_progress") || [])
        .some((entry: any) => entry.user_id === userId && entry.step_id === "TUTORIAL_BATTLE");
      const presentationHp = isPresentationFixture
        ? playerSnapshot.reduce((total: number, unit: any) => total + Number(unit.stats?.atk || 0), 0) * 4
        : 0;
      return [{
        id: `enemy_${npc?.id || patrol.course_id}`,
        name: npc?.npc_name || "Mock Enemy",
        team: "ENEMY",
        alignment: "CHAOS",
        stats: { hp: Math.max(Number(enemy.hp || 900), presentationHp), atk: Number(enemy.atk || 55), def: Number(enemy.def || 35), spd: Number(enemy.spd || 75), luk: Number(enemy.luk || 3) },
        skills: [],
      }];
    })();
    const sessions = client.getStorage("battle_replay_sessions") || [];
    const id = `replay_${Date.now()}`;
    const encounter = patrol.encounter_snapshot;
    sessions.push({ id, requester_user_id: userId, battle_mode: "QUEST", tactic_id: params.p_tactic_id, enemy_tactic_id: encounter?.enemyTactic ?? null, random_seed: Date.now(), source_reference_id: patrol.id, resolution_authority: "PATROL_SERVER", status: "PENDING", player_snapshot: playerSnapshot, enemy_snapshot: enemySnapshot });
    client.setStorage("battle_replay_sessions", sessions);
    return { data: { replay_session_id: id, player_snapshot: playerSnapshot, enemy_snapshot: enemySnapshot, enemy_tactic: encounter?.enemyTactic ?? null }, error: null };
  }

  if (funcName === "resolve_gvg_attack") {
    const gvgState = (client.getStorage("feature_operating_states") || []).find((entry: any) => entry.feature_key === "GVG")?.state || "CLOSED";
    if (gvgState !== "OPEN") return { data: null, error: { message: "GvG is closed", code: "P0001" } };
    const attacks = client.getStorage("gvg_attack_logs") || [];
    const replays = client.getStorage("battle_replay_sessions") || [];
    const attack = attacks.find((entry: any) => entry.id === params.p_attack_id && entry.battle_result === "PENDING");
    const replay = replays.find((entry: any) => entry.id === params.p_battle_replay_session_id && entry.status === "RESOLVED" && entry.source_reference_id === params.p_attack_id);
    if (!attack || !replay) return { data: null, error: { message: "公式GvG結果を確定できません。" } };
    const rawDamage = Number(replay.result?.playerRawDamage || 0);
    const isVictory = replay.result?.winner === "PLAYER";
    attack.battle_result = isVictory ? "VICTORY" : "DEFEAT";
    attack.raw_damage = rawDamage;
    attack.applied_damage = Math.floor(rawDamage * (isVictory ? 1.5 : 1));
    attack.battle_replay_session_id = replay.id;
    client.setStorage("gvg_attack_logs", attacks);
    return { data: { raw_damage: rawDamage, applied_damage: attack.applied_damage }, error: null };
  }

  if (funcName === "get_user_setup_status") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const users = client.getStorage("users") || [];
    // The browser demo is a QA environment, not the production onboarding.
    // Give each persisted demo identity a baseline profile on first use so a
    // refresh never sends a reviewer back to player registration.
    if (userId && !users.some((user: any) => user.id === userId)) {
      const shortId = userId.slice(-4);
      const seeded = await executeMockRpc(client, "initialize_new_user", {
        p_user_id: userId,
        p_username: `検証${shortId}`,
        p_character_id: "char_reiji_01",
        p_area_id: "shinjuku",
        p_gift_code: null,
      });
      if (seeded.error) return seeded;
    }
    const currentUsers = client.getStorage("users") || [];
    return { data: !!userId && currentUsers.some((user: any) => user.id === userId), error: null };
  }

  if (funcName === "get_current_onboarding_state") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "Authentication is required" } };
    if (localStorage.getItem("mock_onboarding_state_error") === "true") {
      return { data: null, error: { message: "Could not find the function public.get_current_onboarding_state", code: "PGRST202" } };
    }
    const users = client.getStorage("users") || [];
    const progress = (client.getStorage("tutorial_progress") || []).find((entry: any) => entry.user_id === userId);
    const method = (client.getStorage("user_account_auth_methods") || []).find((entry: any) => entry.user_id === userId);
    const authMode = localStorage.getItem("mock_auth_mode") || "ANONYMOUS";
    const isAnonymous = authMode === "ANONYMOUS";
    const overriddenProviders = JSON.parse(localStorage.getItem("mock_session_identity_providers") || "null") as string[] | null;
    const supportedProviders = new Set((overriddenProviders || (isAnonymous ? [] : [authMode.toLowerCase()]))
      .filter((provider) => provider === "email" || provider === "google"));
    const identityProvider = supportedProviders.size === 1 ? [...supportedProviders][0] : null;
    const identityIntegrityValid = (isAnonymous && supportedProviders.size === 0 && !method)
      || (!isAnonymous && supportedProviders.size === 1
        && (!method || method.auth_method.toLowerCase() === identityProvider));
    const hasProfile = users.some((user: any) => user.id === userId);
    const isLegacyAuthenticated = identityIntegrityValid && hasProfile && !method && (!progress?.step_id || progress.step_id === "AUTHENTICATION");
    return {
      data: {
        user_id: userId,
        is_anonymous: isAnonymous,
        has_profile: hasProfile,
        tutorial_step: progress?.step_id || null,
        authentication_pending: Boolean(progress?.authentication_pending),
        auth_method: method?.auth_method || (identityProvider ? identityProvider.toUpperCase() : null),
        is_legacy_authenticated: isLegacyAuthenticated,
        identity_integrity_valid: identityIntegrityValid,
        gameplay_authorized: hasProfile && identityIntegrityValid && (
          (isAnonymous && progress?.step_id === "COMPLETE" && progress?.authentication_pending === true)
          || (!isAnonymous && method && progress?.step_id === "AUTHENTICATION")
          || isLegacyAuthenticated
        ),
      },
      error: null,
    };
  }

  if (funcName === "get_public_profiles") {
    const userIds = params.p_user_ids || [];
    const users = client.getStorage("users") || [];
    const members = client.getStorage("guild_members") || [];
    const guilds = client.getStorage("guilds") || [];
    const powers = client.getStorage("user_power_rankings") || [];
    const formations = client.getStorage("user_main_formations") || [];
    const ownedCharacters = client.getStorage("user_characters") || [];
    return {
      data: users.filter((user: any) => userIds.includes(user.id)).map((user: any) => {
        const membership = members.find((member: any) => member.user_id === user.id);
        const guild = guilds.find((entry: any) => entry.id === membership?.guild_id);
        user.total_power = Number(powers.find((power: any) => power.user_id === user.id)?.total_power || 0);
        user.main_formation_character_ids = formations.filter((row: any) => row.user_id === user.id)
          .sort((left: any, right: any) => left.slot - right.slot)
          .map((row: any) => ownedCharacters.find((character: any) => character.id === row.user_character_id)?.character_id)
          .filter(Boolean);
        return { ...user, user_id: user.id, title_name: user.title_equipped || "称号なし", guild_id: membership?.guild_id || null, guild_name: guild?.name || null };
      }),
      error: null
    };
  }

  if (funcName === "start_tutorial_progress") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "Authentication is required" } };
    const progress = client.getStorage("tutorial_progress") || [];
    if (!progress.some((entry: any) => entry.user_id === userId)) {
      progress.push({ user_id: userId, step_id: "WORLD_INTRO" });
      client.setStorage("tutorial_progress", progress);
    }
    return { data: "WORLD_INTRO", error: null };
  }

  if (funcName === "advance_tutorial_progress") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const progress = client.getStorage("tutorial_progress") || [];
    const entry = progress.find((value: any) => value.user_id === userId);
    if (!entry || entry.step_id !== params.p_expected_step) return { data: null, error: { message: "Unexpected tutorial step" } };
    entry.step_id = params.p_next_step;
    if (params.p_next_step === "COMPLETE") entry.authentication_pending = false;
    client.setStorage("tutorial_progress", progress);
    return { data: entry.step_id, error: null };
  }

  if (funcName === "prepare_current_tutorial_growth") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const progress = client.getStorage("tutorial_progress") || [];
    const entry = progress.find((value: any) => value.user_id === userId);
    if (!entry) return { data: null, error: { message: "tutorial progress not found", code: "P0002" } };
    const advancedSteps = ["DISPATCH", "FREE_INSTANT", "TUTORIAL_BATTLE", "RULE_GUIDE", "COMPLETE", "AUTHENTICATION"];
    if (advancedSteps.includes(entry.step_id)) {
      return { data: { status: "already_advanced", tutorial_step: entry.step_id, granted_quantity: 0 }, error: null };
    }
    if (entry.step_id !== "AUTO_FORMATION") {
      return { data: null, error: { message: "tutorial formation is not active", code: "23514" } };
    }
    const tutorialHistory = (client.getStorage("gacha_execution_history") || [])
      .filter((row: any) => row.user_id === userId && row.result_payload?.tutorial)
      .slice(-1)[0];
    const targetCharacterId = tutorialHistory?.result_payload?.results
      ?.find((result: any) => Number(result.tutorial_slot) === 10)?.character_id;
    const target = (client.getStorage("user_characters") || [])
      .find((row: any) => row.user_id === userId && row.character_id === targetCharacterId);
    if (!target) return { data: null, error: { message: "guaranteed tutorial Character is required", code: "23514" } };
    const requiredLevel = 7;
    const requiredQuantity = Math.max(requiredLevel - Number(target.level || 1), 0);
    const items = client.getStorage("user_items") || [];
    let item = items.find((value: any) => value.user_id === userId && value.item_id === "CHAR_EXP_S");
    const before = Number(item?.quantity || 0);
    if (!item) {
      item = { user_id: userId, item_id: "CHAR_EXP_S", quantity: requiredQuantity };
      items.push(item);
    } else if (before < requiredQuantity) {
      item.quantity = requiredQuantity;
    }
    client.setStorage("user_items", items);
    return {
      data: {
        status: Number(target.level || 1) >= requiredLevel ? "growth_complete" : "ready",
        tutorial_step: entry.step_id,
        target_character_id: targetCharacterId,
        target_user_character_id: target.id,
        current_level: Number(target.level || 1),
        required_level: requiredLevel,
        required_quantity: requiredQuantity,
        quantity: Number(item.quantity),
        granted_quantity: Math.max(Number(item.quantity) - before, 0),
        cash_cost: requiredQuantity * 100,
      },
      error: null,
    };
  }

  if (funcName === "advance_current_tutorial_after_growth") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const progress = client.getStorage("tutorial_progress") || [];
    const entry = progress.find((value: any) => value.user_id === userId);
    if (!entry) return { data: null, error: { message: "tutorial progress not found", code: "P0002" } };
    const advancedSteps = ["DISPATCH", "FREE_INSTANT", "TUTORIAL_BATTLE", "RULE_GUIDE", "COMPLETE", "AUTHENTICATION"];
    if (advancedSteps.includes(entry.step_id)) {
      return { data: { status: "already_advanced", tutorial_step: entry.step_id }, error: null };
    }
    if (entry.step_id !== "AUTO_FORMATION") {
      return { data: null, error: { message: "tutorial growth is not active", code: "23514" } };
    }
    const hasGrowth = (client.getStorage("user_funnel_milestones") || []).some((value: any) =>
      value.user_id === userId && value.milestone === "first_growth"
    );
    if (!hasGrowth) return { data: null, error: { message: "character growth is required", code: "23514" } };
    const tutorialHistory = (client.getStorage("gacha_execution_history") || [])
      .filter((row: any) => row.user_id === userId && row.result_payload?.tutorial)
      .slice(-1)[0];
    const targetCharacterId = tutorialHistory?.result_payload?.results
      ?.find((result: any) => Number(result.tutorial_slot) === 10)?.character_id;
    const target = (client.getStorage("user_characters") || [])
      .find((row: any) => row.user_id === userId && row.character_id === targetCharacterId);
    if (Number(target?.level || 0) < 7) return { data: null, error: { message: "tutorial Character must reach level 7", code: "23514" } };
    return { data: { status: "ready_for_formation", tutorial_step: "AUTO_FORMATION", target_character_id: targetCharacterId, level: Number(target.level) }, error: null };
  }

  if (funcName === "complete_current_tutorial_formation") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const progress = client.getStorage("tutorial_progress") || [];
    const entry = progress.find((value: any) => value.user_id === userId);
    if (!userId || !entry) return { data: null, error: { message: "tutorial progress not found", code: "P0002" } };
    if (["DISPATCH", "FREE_INSTANT", "TUTORIAL_BATTLE", "RULE_GUIDE", "COMPLETE", "AUTHENTICATION"].includes(entry.step_id)) {
      return { data: { status: "already_advanced", tutorial_step: entry.step_id }, error: null };
    }
    if (entry.step_id !== "AUTO_FORMATION") return { data: null, error: { message: "tutorial formation is unavailable" } };
    const allOwned = (client.getStorage("user_characters") || []).filter((row: any) => row.user_id === userId);
    const tutorialHistory = (client.getStorage("gacha_execution_history") || [])
      .filter((row: any) => row.user_id === userId && row.gacha_id === "CHAR_NORMAL" && row.pull_count === 10 && row.result_payload?.tutorial)
      .slice(-1)[0];
    const guaranteedMasterId = tutorialHistory?.result_payload?.results
      ?.find((result: any) => Number(result.tutorial_slot) === 10)?.character_id;
    const guaranteedOwned = allOwned.find((row: any) => row.character_id === guaranteedMasterId);
    const hasGrowth = (client.getStorage("user_funnel_milestones") || []).some((value: any) => value.user_id === userId && value.milestone === "first_growth");
    if (!hasGrowth) return { data: null, error: { message: "character growth is required before formation", code: "23514" } };
    if (Number(guaranteedOwned?.level || 0) < 7) return { data: null, error: { message: "tutorial Character must reach level 7 before formation", code: "23514" } };
    const owned = [
      ...(guaranteedOwned ? [guaranteedOwned] : []),
      ...allOwned.filter((row: any) => row !== guaranteedOwned).slice().reverse(),
    ].slice(0, 5);
    if (!owned.length) return { data: null, error: { message: "owned character required" } };
    const formations = (client.getStorage("user_main_formations") || []).filter((row: any) => row.user_id !== userId);
    owned.forEach((row: any, index: number) => formations.push({ user_id: userId, slot: index + 1, user_character_id: row.id }));
    client.setStorage("user_main_formations", formations);
    const defenseDecks = (client.getStorage("pvp_defense_decks") || []).filter((row: any) => row.user_id !== userId);
    defenseDecks.push({
      user_id: userId,
      character_1_id: owned[0]?.id || null,
      character_2_id: owned[1]?.id || null,
      character_3_id: owned[2]?.id || null,
      character_4_id: owned[3]?.id || null,
      character_5_id: owned[4]?.id || null,
      tactic: "ATTACK_PRIORITY",
      updated_at: new Date().toISOString(),
    });
    client.setStorage("pvp_defense_decks", defenseDecks);
    const skills = client.getStorage("user_skills") || [];
    const eligibleOwned = skills
      .filter((skill: any) => skill.user_id === userId)
      .map((skill: any) => ({
        owned: skill,
        master: CANONICAL_SKILLS.find((master) => master.skill_id === skill.skill_card_id
          && (!master.exclusive_character_id || master.exclusive_character_id === owned[0].character_id)),
      }))
      .filter((skill: any) => skill.master)
      .sort((left: any, right: any) => {
        const highestDamage = (master: any) => Math.max(0, ...parseCanonicalEffects(master.effects).map((effect) => Number(effect.powerBp || 0)));
        return highestDamage(right.master) - highestDamage(left.master) || left.master.skill_id.localeCompare(right.master.skill_id);
      });
    let recommended = eligibleOwned[0];
    let starterGranted = false;
    if (!recommended) {
      const starterMaster = CANONICAL_SKILLS.find((master) => master.skill_id === "SKILL_001" && !master.exclusive_character_id);
      if (!starterMaster) return { data: null, error: { message: "canonical starter skill missing", code: "P0002" } };
      let starterOwned = skills.find((skill: any) => skill.user_id === userId && skill.skill_card_id === starterMaster.skill_id);
      if (!starterOwned) {
        starterOwned = { id: `tutorial_skill_${userId}`, user_id: userId, skill_card_id: starterMaster.skill_id, plus_val: 0, equipped_character_id: null, slot_index: null, created_at: new Date().toISOString() };
        skills.push(starterOwned);
        starterGranted = true;
      }
      recommended = { owned: starterOwned, master: starterMaster };
    }
    skills.forEach((skill: any) => {
      if (skill.user_id === userId && skill.equipped_character_id === owned[0].id && Number(skill.slot_index) === 0) {
        skill.equipped_character_id = null;
        skill.slot_index = null;
      }
      if (skill === recommended.owned) {
        skill.equipped_character_id = owned[0].id;
        skill.slot_index = 0;
      }
    });
    client.setStorage("user_skills", skills);
    const users = client.getStorage("users") || [];
    const user = users.find((row: any) => row.id === userId);
    if (user) user.favorite_character_id = owned[0].character_id;
    client.setStorage("users", users);
    entry.step_id = "DISPATCH";
    client.setStorage("tutorial_progress", progress);
    return {
      data: {
        status: "advanced",
        tutorial_step: "DISPATCH",
        formation: { status: "success", character_ids: owned.map((row: any) => row.character_id) },
        leader_character_id: owned[0].character_id,
        leader_user_character_id: owned[0].id,
        skill_equipped: true,
        skill_id: recommended.master.skill_id,
        skill_name: recommended.master.name,
        starter_skill_granted: starterGranted,
      },
      error: null,
    };
  }

  if (funcName === "complete_tutorial_authentication") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const progress = client.getStorage("tutorial_progress") || [];
    const entry = progress.find((value: any) => value.user_id === userId);
    const authMode = typeof window === "undefined" ? null : localStorage.getItem("mock_auth_mode");
    const requestedMethod = String(params.p_auth_method || "").toUpperCase();
    const overriddenProviders = typeof window === "undefined" ? null : JSON.parse(localStorage.getItem("mock_session_identity_providers") || "null") as string[] | null;
    const supportedProviders = new Set((overriddenProviders || (authMode === "ANONYMOUS" || !authMode ? [] : [authMode.toLowerCase()]))
      .filter((provider) => provider === "email" || provider === "google"));
    const requestedProvider = requestedMethod.toLowerCase();
    if (!userId || authMode === "ANONYMOUS") {
      return { data: null, error: { message: "Verified authentication identity is required" } };
    }
    if (supportedProviders.size !== 1) return { data: null, error: { message: "Exactly one authentication identity is required" } };
    if ((requestedProvider !== "email" && requestedProvider !== "google") || !supportedProviders.has(requestedProvider)) {
      return { data: null, error: { message: "Requested authentication identity is not linked" } };
    }
    const methods = client.getStorage("user_account_auth_methods") || [];
    const existingMethod = methods.find((value: any) => value.user_id === userId);
    if (existingMethod?.auth_method === requestedMethod && entry?.step_id === "AUTHENTICATION") {
      return { data: "AUTHENTICATION", error: null };
    }
    if (!entry || entry.step_id !== "COMPLETE") return { data: null, error: { message: "Tutorial completion is required" } };
    if (existingMethod && existingMethod.auth_method !== requestedMethod) return { data: null, error: { message: "A different authentication method is already linked" } };
    if (!existingMethod) methods.push({ user_id: userId, auth_method: requestedMethod });
    entry.step_id = "AUTHENTICATION";
    entry.authentication_pending = false;
    client.setStorage("tutorial_progress", progress);
    client.setStorage("user_account_auth_methods", methods);
    return { data: "AUTHENTICATION", error: null };
  }

  if (funcName === "defer_tutorial_authentication") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const authMode = typeof window === "undefined" ? null : localStorage.getItem("mock_auth_mode");
    const progress = client.getStorage("tutorial_progress") || [];
    const entry = progress.find((value: any) => value.user_id === userId);
    const methods = client.getStorage("user_account_auth_methods") || [];
    const identities = client.getStorage("auth_identities") || [];
    if (!userId || authMode !== "ANONYMOUS") return { data: null, error: { message: "Only the current anonymous account can defer authentication" } };
    if (!entry || entry.step_id !== "COMPLETE") return { data: null, error: { message: "Tutorial completion is required" } };
    if (methods.some((value: any) => value.user_id === userId)
      || identities.some((value: any) => value.user_id === userId && value.provider !== "anonymous")) {
      return { data: null, error: { message: "A connected identity cannot defer authentication" } };
    }
    entry.authentication_pending = true;
    entry.completed_at ||= new Date().toISOString();
    client.setStorage("tutorial_progress", progress);
    return { data: "COMPLETE", error: null };
  }

  if (funcName === "discard_current_anonymous_account_for_switch") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const authMode = typeof window === "undefined" ? null : localStorage.getItem("mock_auth_mode");
    if (!userId || authMode !== "ANONYMOUS") return { data: null, error: { message: "Only the current anonymous account can be discarded" } };
    const protectedRows = [
      ["payment_transactions", "user_id"], ["user_monthly_passes", "user_id"], ["guild_members", "user_id"],
      ["raid_damage_logs", "user_id"], ["pvp_defense_logs", "user_id"], ["gvg_attack_logs", "attacker_user_id"],
    ];
    if (protectedRows.some(([table, column]) => (client.getStorage(table) || []).some((row: any) => row[column] === userId))) {
      return { data: null, error: { message: "Anonymous account has protected history and cannot be discarded" } };
    }
    const userScopedTables = [
      "users", "tutorial_progress", "user_characters", "user_skills", "user_equipments", "user_items",
      "user_formations", "user_main_formations", "user_missions", "user_patrols", "user_funnel_milestones",
      "gacha_execution_history", "user_account_auth_methods",
    ];
    for (const table of userScopedTables) {
      client.setStorage(table, (client.getStorage(table) || []).filter((row: any) => row.user_id !== userId && row.id !== userId));
    }
    const identities = (client.getStorage("auth_identities") || []).filter((row: any) => row.user_id !== userId);
    client.setStorage("auth_identities", identities);
    localStorage.setItem("mock_discarded_anonymous_user_id", userId);
    localStorage.removeItem("tribe_demo_uuid");
    return { data: { status: "DISCARDED", discardedUserId: userId, gameplayMerged: false }, error: null };
  }

  if (funcName === "send_direct_message") {
    const { p_recipient_id, p_message } = params;
    const senderId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const users = client.getStorage("users") || [];
    const recipientExists = users.some((user: any) => user.id === p_recipient_id);
    if (!senderId || !p_recipient_id || p_recipient_id === senderId || typeof p_message !== "string" || !p_message.trim() || p_message.length > 140 || !recipientExists) {
      return { data: null, error: { message: "Invalid direct-message recipient" } };
    }
    const messages = client.getStorage("direct_messages") || [];
    const message = { id: `dm_${Date.now()}`, sender_id: senderId, recipient_id: p_recipient_id, message: p_message.trim(), created_at: new Date().toISOString() };
    messages.push(message);
    client.setStorage("direct_messages", messages);
    return { data: message, error: null };
  }

  if (funcName === "mark_direct_message_read") {
    const recipientId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const messages = client.getStorage("direct_messages") || [];
    const message = messages.find((entry: any) => entry.id === params.p_message_id && entry.recipient_id === recipientId);
    if (!message) {
      return { data: null, error: { message: "Direct message was not found" } };
    }
    message.is_read = true;
    client.setStorage("direct_messages", messages);
    return { data: null, error: null };
  }

  if (funcName === "get_direct_message_unread_counts") {
    const recipientId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!recipientId) return { data: null, error: { message: "Authentication required" } };
    const messages = client.getStorage("direct_messages") || [];
    const users = client.getStorage("users") || [];
    const bySender = new Map<string, { sender_id: string; sender_name: string; unread_count: number }>();
    for (const message of messages) {
      if (message.recipient_id !== recipientId || message.is_read) continue;
      const existing = bySender.get(message.sender_id);
      if (existing) existing.unread_count += 1;
      else bySender.set(message.sender_id, {
        sender_id: message.sender_id,
        sender_name: users.find((user: any) => user.id === message.sender_id)?.username || "ユーザー",
        unread_count: 1
      });
    }
    return { data: [...bySender.values()], error: null };
  }

  if (funcName === "send_chat_message") {
    const { p_target_type, p_content, p_reply_to_message_id } = params;
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === userId);
    const members = client.getStorage("guild_members") || [];
    const membership = members.find((entry: any) => entry.user_id === userId);
    if (!user || !["GLOBAL", "GUILD"].includes(p_target_type) || !p_content?.trim() || p_content.trim().length > 140 || (p_target_type === "GUILD" && !membership)) {
      return { data: null, error: { message: "Invalid chat message" } };
    }
    const posts = client.getStorage("board_posts") || [];
    const cooldownMs = p_target_type === "GUILD" ? 3_000 : 10_000;
    const lastPost = [...posts].reverse().find((entry: any) => (
      (entry.user_id === userId || entry.author_id === userId)
      && entry.target_type === p_target_type
      && (p_target_type === "GLOBAL" || entry.target_id === membership?.guild_id)
    ));
    if (lastPost && Date.now() - new Date(lastPost.created_at).getTime() < cooldownMs) {
      return { data: null, error: { message: "Chat cooldown is active" } };
    }
    const reply = p_reply_to_message_id ? posts.find((entry: any) => entry.id === p_reply_to_message_id) : null;
    if (p_reply_to_message_id && (!reply || reply.target_type !== p_target_type || reply.target_id !== (p_target_type === "GUILD" ? membership.guild_id : null))) {
      return { data: null, error: { message: "reply target is unavailable" } };
    }
    const post = { id: `chat_${Date.now()}`, title: "", user_id: userId, author_id: userId, author_name: user.username || "Player", author_avatar_url: user.avatar_url, content: p_content.trim(), target_type: p_target_type, target_id: p_target_type === "GUILD" ? membership.guild_id : null, reply_to_message_id: p_reply_to_message_id || null, is_system: false, created_at: new Date().toISOString() };
    posts.push(post);
    client.setStorage("board_posts", posts);
    if (p_target_type === "GUILD" && userId) evaluateMockMissionProgress(client, userId, "GUILD_CHAT", 1);
    return { data: post, error: null };
  }

  if (funcName === "mark_chat_channel_read") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const members = client.getStorage("guild_members") || [];
    const membership = members.find((entry: any) => entry.user_id === userId);
    if (!userId || !["GLOBAL", "GUILD"].includes(params.p_target_type) || (params.p_target_type === "GUILD" && !membership)) {
      return { data: null, error: { message: "Invalid chat channel" } };
    }
    const states = client.getStorage("chat_read_states") || [];
    const targetId = params.p_target_type === "GUILD" ? membership.guild_id : "GLOBAL";
    const existing = states.find((entry: any) => entry.user_id === userId && entry.target_type === params.p_target_type && entry.target_id === targetId);
    if (existing) existing.last_read_at = new Date().toISOString();
    else states.push({ user_id: userId, target_type: params.p_target_type, target_id: targetId, last_read_at: new Date().toISOString() });
    client.setStorage("chat_read_states", states);
    return { data: null, error: null };
  }

  if (funcName === "get_chat_unread_counts") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "Authentication required" } };
    const members = client.getStorage("guild_members") || [];
    const membership = members.find((entry: any) => entry.user_id === userId);
    const posts = client.getStorage("board_posts") || [];
    const states = client.getStorage("chat_read_states") || [];
    const ensureState = (targetType: "GLOBAL" | "GUILD", targetId: string) => {
      let state = states.find((entry: any) => entry.user_id === userId && entry.target_type === targetType && entry.target_id === targetId);
      if (!state) {
        state = { user_id: userId, target_type: targetType, target_id: targetId, last_read_at: new Date().toISOString() };
        states.push(state);
      }
      return state;
    };
    const globalState = ensureState("GLOBAL", "GLOBAL");
    const guildState = membership ? ensureState("GUILD", membership.guild_id) : null;
    client.setStorage("chat_read_states", states);
    const isOtherUser = (entry: any) => (entry.user_id || entry.author_id) !== userId;
    return {
      data: {
        GLOBAL: posts.filter((entry: any) => entry.target_type === "GLOBAL" && isOtherUser(entry) && entry.created_at > globalState.last_read_at).length,
        GUILD: guildState ? posts.filter((entry: any) => entry.target_type === "GUILD" && entry.target_id === membership.guild_id && isOtherUser(entry) && entry.created_at > guildState.last_read_at).length : 0
      },
      error: null
    };
  }

  if (funcName === "mark_bbs_thread_read") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const threads = client.getStorage("bbs_threads") || [];
    if (!userId || !threads.some((thread: any) => thread.id === params.p_thread_id)) {
      return { data: null, error: { message: "Invalid BBS thread" } };
    }
    const states = client.getStorage("bbs_read_states") || [];
    const existing = states.find((entry: any) => entry.user_id === userId && entry.thread_id === params.p_thread_id);
    if (existing) existing.last_read_at = new Date().toISOString();
    else states.push({ user_id: userId, thread_id: params.p_thread_id, last_read_at: new Date().toISOString() });
    client.setStorage("bbs_read_states", states);
    return { data: null, error: null };
  }

  if (funcName === "get_bbs_unread_counts") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const user = (client.getStorage("users") || []).find((entry: any) => entry.id === userId);
    if (!userId || !user) return { data: null, error: { message: "Authentication required" } };
    const threads = client.getStorage("bbs_threads") || [];
    const posts = client.getStorage("bbs_posts") || [];
    const states = client.getStorage("bbs_read_states") || [];
    const baseline = user.created_at || new Date().toISOString();
    const counts = threads.flatMap((thread: any) => {
      const readState = states.find((entry: any) => entry.user_id === userId && entry.thread_id === thread.id);
      const readAt = readState?.last_read_at || baseline;
      const activityCount = (thread.user_id !== userId && thread.created_at > readAt ? 1 : 0)
        + posts.filter((post: any) => post.thread_id === thread.id && post.user_id !== userId && post.created_at > readAt).length;
      return activityCount > 0 ? [{ thread_id: thread.id, unread_count: activityCount }] : [];
    });
    return { data: counts, error: null };
  }

  if (funcName === "create_bbs_thread") {
    const { p_category, p_title, p_content } = params;
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const user = (client.getStorage("users") || []).find((entry: any) => entry.id === userId);
    if (!userId || !user || !["RECRUIT", "STRATEGY_CHAT"].includes(p_category) || !p_title?.trim() || p_title.trim().length > 50 || !p_content?.trim() || p_content.trim().length > 200) {
      return { data: null, error: { message: "Invalid BBS thread" } };
    }
    const threads = client.getStorage("bbs_threads") || [];
    const thread = { id: `bbs_thread_${Date.now()}`, category: p_category, title: p_title.trim(), content: p_content.trim(), user_id: userId, author_name: user.username || "Player", author_avatar_url: user.avatar_url, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    threads.unshift(thread);
    client.setStorage("bbs_threads", threads);
    return { data: thread, error: null };
  }

  if (funcName === "create_bbs_post") {
    const { p_thread_id, p_content } = params;
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const user = (client.getStorage("users") || []).find((entry: any) => entry.id === userId);
    const threads = client.getStorage("bbs_threads") || [];
    if (!userId || !user || !threads.some((thread: any) => thread.id === p_thread_id) || !p_content?.trim() || p_content.trim().length > 200) {
      return { data: null, error: { message: "Invalid BBS post" } };
    }
    const posts = client.getStorage("bbs_posts") || [];
    const post = { id: `bbs_post_${Date.now()}`, thread_id: p_thread_id, user_id: userId, author_name: user.username || "Player", author_avatar_url: user.avatar_url, content: p_content.trim(), created_at: new Date().toISOString() };
    posts.push(post);
    const thread = threads.find((entry: any) => entry.id === p_thread_id);
    if (thread) thread.updated_at = post.created_at;
    client.setStorage("bbs_posts", posts);
    client.setStorage("bbs_threads", threads);
    return { data: post, error: null };
  }

  if (funcName === "generate_user_gift_code" || funcName === "generate_current_user_invite_code") {
    const p_user_id = params.p_user_id || (typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid"));
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) {
      return { error: { message: "ユーザーが存在しません。" } };
    }
    if (user.gift_code) {
      return { data: user.gift_code, error: null };
    }

    let code = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let isUnique = false;
    while (!isUnique) {
      code = "";
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      isUnique = !users.some((u: any) => u.gift_code === code);
    }

    user.gift_code = code;
    client.setStorage("users", users);
    return { data: code, error: null };
  }

  if (funcName === "search_user_by_name") {
    const { p_username } = params;
    const users = client.getStorage("users") || [];
    const results = users.filter((u: any) => u.username.includes(p_username)).map((u: any) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url,
      level: u.level
    }));
    return { data: results, error: null };
  }

  if (funcName === "send_friend_request") {
    const p_sender_id = params.p_sender_id || (typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid"));
    const { p_receiver_id } = params;
    if (p_sender_id === p_receiver_id) return { data: null, error: { message: "自分自身には申請できません。" } };
    
    // §26: 友達は最大30人
    const friends = client.getStorage("user_friends") || [];
    const myFriendsCount = friends.filter((f: any) => f.user_id === p_sender_id && f.status === "ACCEPTED").length;
    if (myFriendsCount >= 30) return { data: null, error: { message: "友達の最大数(30人)に達しています。" } };
    
    const requests = client.getStorage("friend_requests") || [];
    if (requests.find((r: any) => r.sender_id === p_sender_id && r.receiver_id === p_receiver_id && r.status === "PENDING")) {
      return { data: null, error: { message: "既に申請済みです。" } };
    }

    requests.push({
      id: "req_" + Date.now(),
      sender_id: p_sender_id,
      receiver_id: p_receiver_id,
      status: "PENDING",
      created_at: new Date().toISOString()
    });
    
    client.setStorage("friend_requests", requests);
    return { data: { success: true }, error: null };
  }

  if (funcName === "accept_friend_request") {
    const { p_request_id } = params;
    const requests = client.getStorage("friend_requests") || [];
    const req = requests.find((r: any) => r.id === p_request_id);
    
    if (req) {
      req.status = "ACCEPTED";
      client.setStorage("friend_requests", requests);
      
      const friends = client.getStorage("user_friends") || [];
      const createdAt = new Date().toISOString();
      friends.push(
        { id: "friendship_a_" + Date.now(), user_id: req.sender_id, friend_id: req.receiver_id, status: "ACCEPTED", created_at: createdAt },
        { id: "friendship_b_" + Date.now(), user_id: req.receiver_id, friend_id: req.sender_id, status: "ACCEPTED", created_at: createdAt }
      );
      client.setStorage("user_friends", friends);
    }
    
    return { data: { success: true }, error: null };
  }

  if (funcName === "reject_friend_request") {
    const { p_request_id } = params;
    const requests = client.getStorage("friend_requests") || [];
    const req = requests.find((r: any) => r.id === p_request_id);
    
    if (req) {
      req.status = "REJECTED";
      client.setStorage("friend_requests", requests);
    }
    
    return { data: { success: true }, error: null };
  }

  if (funcName === "remove_friend") {
    const p_user_id = params.p_user_id || (typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid"));
    const { p_friend_id } = params;
    let friends = client.getStorage("user_friends") || [];
    
    friends = friends.filter((f: any) => !(f.user_id === p_user_id && f.friend_id === p_friend_id) && !(f.user_id === p_friend_id && f.friend_id === p_user_id));
    
    client.setStorage("user_friends", friends);
    return { data: { success: true }, error: null };
  }

  if (funcName === "get_current_raid_attempt_state") {
    const currentUserId = typeof window === "undefined" ? params.p_user_id : localStorage.getItem("tribe_demo_uuid");
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === currentUserId);
    if (!user) return { data: null, error: { message: "User not found" } };
    const now = Date.now();
    const recovered = recoverCanonicalResource(Number(user.raid_points ?? 5), new Date(user.raid_points_last_recovered_at ?? now).getTime(), now, "RAID_POINT");
    user.raid_points = recovered.value;
    user.raid_points_last_recovered_at = new Date(recovered.lastRecoveredAtMs).toISOString();
    client.setStorage("users", users);
    return { data: {
      raidPoints: recovered.value,
      maxRaidPoints: 5,
      firstEntryFree: !Boolean(user.raid_free_entry_consumed),
      recoveryIntervalSeconds: 7200,
    }, error: null };
  }

  if (funcName === "sync_and_recover_vitality_and_pvp_points") {
    const currentUserId = params.p_user_id || (typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid"));
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === currentUserId);
    if (!user) return { data: null, error: { message: "User not found" } };
    const now = Date.now();
    const vitality = recoverCanonicalResource(Number(user.vitality ?? 100), new Date(user.vitality_last_recovered_at ?? now).getTime(), now, "VITALITY");
    const pvp = recoverCanonicalResource(Number(user.pvp_points ?? 5), new Date(user.pvp_points_last_recovered_at ?? now).getTime(), now, "PVP_POINT");
    const raid = recoverCanonicalResource(Number(user.raid_points ?? 5), new Date(user.raid_points_last_recovered_at ?? now).getTime(), now, "RAID_POINT");
    user.vitality = vitality.value;
    user.pvp_points = pvp.value;
    user.raid_points = raid.value;
    user.vitality_last_recovered_at = new Date(vitality.lastRecoveredAtMs).toISOString();
    user.pvp_points_last_recovered_at = new Date(pvp.lastRecoveredAtMs).toISOString();
    user.raid_points_last_recovered_at = new Date(raid.lastRecoveredAtMs).toISOString();
    client.setStorage("users", users);
    return { data: {
      out_vitality: vitality.value,
      out_pvp_points: pvp.value,
      out_raid_points: raid.value,
      out_cash: Number(user.cash || 0),
      out_diamonds: Number(user.neon_diamonds || user.diamonds || 0),
      raid_first_entry_free: !Boolean(user.raid_free_entry_consumed),
      vitality_next_recovery_at: vitality.value < 100 ? new Date(vitality.lastRecoveredAtMs + 360_000).toISOString() : null,
      pvp_next_recovery_at: pvp.value < 5 ? new Date(pvp.lastRecoveredAtMs + 7_200_000).toISOString() : null,
      raid_next_recovery_at: raid.value < 5 ? new Date(raid.lastRecoveredAtMs + 7_200_000).toISOString() : null,
    }, error: null };
  }

  if (funcName === "process_daily_reset") {
    const { p_user_id } = params;
    const users = client.getStorage("users") || [];
    const userIdx = users.findIndex((u: any) => u.id === p_user_id);
    if (userIdx !== -1) {
      const today = jstCycleDate();
      const user = users[userIdx];
      
      if (user.last_login_date !== today) {
        user.last_login_date = today;
        client.setStorage("users", users);
      }
    }
    await executeMockRpc(client, "sync_current_missions", {});
    return { data: { success: true }, error: null };
  }

  if (funcName === "process_stripe_shop_purchase") {
    const { p_user_id, p_product_id } = params;
    // mock behavior
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (user) {
      if (p_product_id.includes("diamond")) {
        user.diamonds = (user.diamonds || 0) + 1000;
      }
      client.setStorage("users", users);
    }
    return { data: { success: true }, error: null };
  }

  if (funcName === "gvg_season_reset") {
    // mock behavior: reset gvg data
    client.setStorage("user_gvg_ranks", []);
    client.setStorage("gvg_season_status", [{ id: 1, current_day: 1 }]);
    const controls = client.getStorage("guild_base_controls") || [];
    controls.forEach((c: any) => {
      c.daily_points = 0;
      c.total_seasonal_days = 0;
      c.is_controlling = false;
    });
    client.setStorage("guild_base_controls", controls);
    return { data: { success: true }, error: null };
  }

  if (funcName === "pvp_season_reset") {
    const ranks = client.getStorage("pvp_ranks") || [];
    ranks.forEach((r: any) => {
      if (r.user_id !== "00000000-0000-0000-0000-000000000099") {
        r.rank_points = 1000;
        r.daily_wins = 0;
        r.season_wins = 0;
      }
    });
    client.setStorage("pvp_ranks", ranks);
    return { data: { success: true }, error: null };
  }

  if (funcName === "raid_boss_defeat") {
    client.setStorage("raid_damage_logs", []);
    return { data: { success: true }, error: null };
  }

  if (funcName === "raid_season_reset") {
    client.setStorage("raid_damage_logs", []);
    client.setStorage("user_raid_claimed_rewards", []);
    return { data: { success: true }, error: null };
  }
  if (funcName === "purchase_monthly_pass") {
    const { p_user_id } = params;
    const passes = client.getStorage("user_monthly_passes") || [];
    const activePass = passes.find((p: any) => p.user_id === p_user_id && p.is_active);
    
    if (activePass) {
      // Extend 30 days
      const currentExpires = new Date(activePass.expires_at);
      currentExpires.setDate(currentExpires.getDate() + 30);
      activePass.expires_at = currentExpires.toISOString();
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      passes.push({
        id: "mock_pass_" + Date.now(),
        user_id: p_user_id,
        purchased_at: new Date().toISOString(),
        expires_at: d.toISOString(),
        daily_claimed_at: null,
        is_active: true
      });
    }
    client.setStorage("user_monthly_passes", passes);
    return { data: { success: true }, error: null };
  }

  if (funcName === "claim_daily_pass_reward") {
    const { p_user_id } = params;
    const passes = client.getStorage("user_monthly_passes") || [];
    const activePass = passes.find((p: any) => p.user_id === p_user_id && p.is_active && new Date(p.expires_at) > new Date());
    
    if (!activePass) {
      return { data: null, error: { message: "有効な月額パスがありません。" } };
    }
    
    const today = new Date().toISOString().split("T")[0];
    if (activePass.daily_claimed_at === today) {
      return { data: null, error: { message: "本日の報酬は既に受け取り済みです。" } };
    }
    
    activePass.daily_claimed_at = today;
    client.setStorage("user_monthly_passes", passes);
    
    const users = client.getStorage("users") || [];
    const uIdx = users.findIndex((u: any) => u.id === p_user_id);
    if (uIdx !== -1) {
      users[uIdx].diamonds = (users[uIdx].diamonds || 0) + 100;
      client.setStorage("users", users);
    }
    
    return { data: { success: true }, error: null };
  }
  if (funcName === "consume_raid_attempt") {
    const { p_user_id } = params;
    const users = client.getStorage("users") || [];
    const idx = users.findIndex((u: any) => u.id === p_user_id);
    if (idx !== -1) {
      if (!users[idx].raid_free_entry_consumed) {
        users[idx].raid_free_entry_consumed = true;
      } else {
        if (Number(users[idx].raid_points || 0) < 1) return { data: null, error: { message: "レイドポイントが不足しています。" } };
        users[idx].raid_points -= 1;
      }
      client.setStorage("users", users);
      return { data: { success: true, remaining_raid_points: Number(users[idx].raid_points || 0) }, error: null };
    }
    return { data: null, error: { message: "ユーザーが見つかりません。" } };
  }
  if (funcName === "consume_vitality_for_gvg") {
    const { p_user_id, p_cost } = params;
    const users = client.getStorage("users") || [];
    const idx = users.findIndex((u: any) => u.id === p_user_id);
    if (idx !== -1 && users[idx].vitality >= p_cost) {
      users[idx].vitality -= p_cost;
      client.setStorage("users", users);
      return { data: { success: true }, error: null };
    }
    return { data: null, error: { message: "行動力が不足しています。" } };
  }
    if (funcName === "distribute_ranking_rewards") {
    // In mock, just return success
    return { data: { success: true }, error: null };
  }
  if (funcName === "add_user_xp") {
    const { p_user_id, p_xp_amount } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) {
      return { error: { message: "ユーザーが存在しません。" } };
    }

    const { level, xp, leveledUp } = applyFrozenUserXp(Number(user.level || 1), Number(user.xp || 0), Number(p_xp_amount || 0));
    user.level = level;
    user.xp = xp;
    client.setStorage("users", users);

    if (leveledUp) {
      executeMockRpc(client, "evaluate_mission_progress", {
        p_user_id,
        p_trigger_type: "USER_LEVEL_UP",
        p_progress_increment: level
      });
    }

    return {
      data: {
        leveled_up: leveledUp,
        level: level,
        xp: xp
      },
      error: null
    };
  }

  if (funcName === "initialize_new_user") {
    const {
      p_user_id,
      p_username,
      p_character_id,
      p_area_id,
      p_gift_code,
    } = params;

    const users = client.getStorage("users");
    if (users.some((u: any) => u.id === p_user_id)) {
      return { error: { message: "すでに初期セットアップが完了しています。" } };
    }
    if (users.some((u: any) => u.username === p_username)) {
      return { error: { message: "このユーザー名は既に使用されています。" } };
    }

    let inviterId: string | null = null;
    if (p_gift_code && p_gift_code.trim() !== "") {
      const giftCodeTrimmed = p_gift_code.trim();
      const inviter = users.find((u: any) => u.gift_code === giftCodeTrimmed);
      if (!inviter) {
        return { error: { message: "無効なギフトコードです。" } };
      }
      if (inviter.id === p_user_id) {
        return { error: { message: "自分のギフトコードは使用できません。" } };
      }

      const invitations = client.getStorage("user_invitations") || [];
      const inviteCount = invitations.filter((i: any) => i.inviter_id === inviter.id).length;
      if (inviteCount >= 10) {
        return { error: { message: "このギフトコードは10人使用済です。" } };
      }
      inviterId = inviter.id;
    }

    users.push({
      id: p_user_id,
      username: p_username,
      gift_code: null,
      bio: "歌舞伎町の覇権を握るため立ち上がる。",
      avatar_url: p_character_id === "char_reiji_01" ? "/characters/reiji_transparent_asset.png" : p_character_id === "char_rui_01" ? "/characters/rui_transparent_asset.png" : p_character_id === "char_chang_01" ? "/characters/chang_transparent_asset.png" : "/characters/reiji_transparent_asset.png",
      cash: 2600,
      neon_diamonds: 200,
      vitality: 100,
      pvp_points: 5,
      sound_settings: { bgm: true, se: true },
      current_base_id: p_area_id === "shinjuku" ? "shinjuku" : p_area_id,
      last_tribute_claimed_at: null,
      favorite_character_id: p_character_id || null,
      title_equipped: "title_none",
      equipped_background: "bg_default",
      equipped_front_effect: "effect_none",
      last_active_at: new Date().toISOString(),
      level: 1,
      xp: 0
    });
    client.setStorage("users", users);

    if (p_character_id) {
      const chars = client.getStorage("user_characters");
      chars.push({ id: `c_${p_character_id}`, user_id: p_user_id, character_id: p_character_id, level: 1, awakening_level: 0 });
      client.setStorage("user_characters", chars);
    }

    if (inviterId) {
      const invitations = client.getStorage("user_invitations") || [];
      invitations.push({
        id: `inv_${Date.now()}`,
        inviter_id: inviterId,
        invitee_id: p_user_id,
        created_at: new Date().toISOString()
      });
      client.setStorage("user_invitations", invitations);

      executeMockRpc(client, "evaluate_mission_progress", {
        p_user_id: inviterId,
        p_trigger_type: "USER_INVITE",
        p_progress_increment: 1
      });

      const presents = client.getStorage("presents") || [];
      presents.push({
        id: `pres_inv_${Date.now()}`,
        user_id: p_user_id,
        item_id: "DIAMOND",
        quantity: 100,
        message: "組織設立 招待コード入力報酬",
        status: "UNCLAIMED",
        sent_at: new Date().toISOString(),
        expire_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
      client.setStorage("presents", presents);
    }

    return { data: { status: "success" }, error: null };
  }

  if (funcName === "evaluate_mission_progress") {
    const { p_user_id, p_trigger_type, p_progress_increment } = params;
    evaluateMockMissionProgress(client, p_user_id, p_trigger_type, Number(p_progress_increment || 0));
    return { data: { status: "success" }, error: null };
  }
  if (funcName === "use_action_resource_ticket") {
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const itemId = params.p_item_id;
    if (!currentUserId) return { data: null, error: { message: "authentication required" } };
    if (itemId !== "PVP_POINT_TICKET" && itemId !== "RAID_POINT_TICKET") {
      return { data: null, error: { message: "unsupported action resource ticket" } };
    }
    await executeMockRpc(client, "sync_and_recover_vitality_and_pvp_points", { p_user_id: currentUserId });
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === currentUserId);
    if (!user) return { data: null, error: { message: "player profile is not initialized" } };
    const pointKey = itemId === "PVP_POINT_TICKET" ? "pvp_points" : "raid_points";
    if (Number(user[pointKey] ?? 5) >= 5) return { data: null, error: { message: "action resource is already at maximum" } };
    const items = client.getStorage("user_items") || [];
    const item = items.find((entry: any) => entry.user_id === currentUserId && entry.item_id === itemId);
    if (!item || Number(item.quantity) < 1) return { data: null, error: { message: "action resource ticket is not available" } };
    item.quantity -= 1;
    user[pointKey] = Number(user[pointKey] ?? 0) + 1;
    client.setStorage("users", users);
    client.setStorage("user_items", items);
    return { data: { status: "success", item_id: itemId, quantity: item.quantity, points: user[pointKey] }, error: null };
  }

  if (funcName === "donate_to_guild") {
    const { p_user_id, p_guild_id, p_amount } = params;
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const members = client.getStorage("guild_members") || [];
    const member = members.find((entry: any) => entry.guild_id === p_guild_id && entry.user_id === p_user_id);
    if (currentUserId !== p_user_id || p_amount !== 5000 || !member) {
      return { data: null, error: { message: "Invalid guild donation" } };
    }
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || (user.cash || 0) < p_amount) {
      return { error: { message: "キャッシュが不足しています。" } };
    }

    const guilds = client.getStorage("guilds");
    const guild = guilds.find((g: any) => g.id === p_guild_id);
    if (!guild) {
      return { error: { message: "ギルドが存在しません。" } };
    }

    const jstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    const ledger = client.getStorage("guild_exp_daily_ledger") || [];
    if (ledger.some((entry: any) => entry.guild_id === p_guild_id && entry.user_id === p_user_id && entry.source === "DONATION" && entry.jst_date === jstDate)) {
      return { data: null, error: { message: "Guild donation already completed today" } };
    }
    ledger.push({ guild_id: p_guild_id, user_id: p_user_id, source: "DONATION", jst_date: jstDate, exp_granted: 20 });

    user.cash = (user.cash || 0) - p_amount;
    guild.funds = Number(guild.funds || 0) + p_amount;
    guild.xp = Number(guild.xp || 0) + 20;
    const curve = [1000, 2500, 6000, 12000];
    while (Number(guild.level || 1) < 5 && guild.xp >= curve[Number(guild.level || 1) - 1]) {
      guild.xp -= curve[Number(guild.level || 1) - 1];
      guild.level = Number(guild.level || 1) + 1;
    }

    client.setStorage("users", users);
    client.setStorage("guilds", guilds);
    client.setStorage("guild_members", members);
    client.setStorage("guild_exp_daily_ledger", ledger);
    return { data: { status: "success", next_cash: user.cash, next_funds: guild.funds, xp_gained: 20 }, error: null };
  }

  if (funcName === "record_current_guild_login") {
    return { data: { status: "recorded" }, error: null };
  }

  if (funcName === "initialize_current_player") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const authMode = typeof window === "undefined" ? null : localStorage.getItem("mock_auth_mode");
    const username = typeof params.p_username === "string" ? params.p_username.trim() : "";
    if (!userId) return { data: null, error: { message: "Authentication is required", code: "42501" } };
    if (authMode !== "ANONYMOUS") return { data: null, error: { message: "Anonymous onboarding session is required", code: "42501" } };
    if (Array.from(username).length < 1 || Array.from(username).length > 8) {
      return { data: null, error: { message: "Username must contain 1 to 8 characters", code: "23514" } };
    }

    const users = client.getStorage("users") || [];
    const existing = users.find((user: any) => user.id === userId);
    if (existing) {
      const allProgress = client.getStorage("tutorial_progress") || [];
      let progress = allProgress.find((entry: any) => entry.user_id === userId);
      if (!progress) {
        progress = { user_id: userId, step_id: "WORLD_INTRO" };
        allProgress.push(progress);
        client.setStorage("tutorial_progress", allProgress);
      }
      return { data: { status: "already_initialized", tutorial_step: progress.step_id }, error: null };
    }
    if (users.some((user: any) => String(user.username || "").trim().toLocaleLowerCase() === username.toLocaleLowerCase())) {
      return { data: null, error: { message: "Username is already in use", code: "23505" } };
    }

    users.push({
      id: userId,
      username,
      bio: "歌舞伎町の覇権を握るため立ち上がる。",
      avatar_url: "/characters/reiji_transparent_asset.png",
      cash: 2600,
      neon_diamonds: 200,
      vitality: 100,
      pvp_points: 5,
      current_base_id: "shinjuku",
      favorite_character_id: null,
      level: 1,
      xp: 0,
      sound_settings: { bgm: true, se: true },
    });
    client.setStorage("users", users);

    const progress = client.getStorage("tutorial_progress") || [];
    if (!progress.some((entry: any) => entry.user_id === userId)) {
      progress.push({ user_id: userId, step_id: "WORLD_INTRO" });
      client.setStorage("tutorial_progress", progress);
    }
    return { data: { status: "success", tutorial_step: "WORLD_INTRO" }, error: null };
  }

  if (funcName === "buy_normal_shop_product") {
    const { p_user_id, p_product_id, p_currency_type, p_price, p_items, p_product_title } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) return { error: { message: "ユーザーが存在しません。" } };

    if (p_currency_type === "DIAMOND") {
      if ((user.neon_diamonds || 0) < p_price) return { error: { message: "ダイヤが不足しています。" } };
      user.neon_diamonds = (user.neon_diamonds || 0) - p_price;
    } else {
      if ((user.cash || 0) < p_price) return { error: { message: "キャッシュが不足しています。" } };
      user.cash = (user.cash || 0) - p_price;
    }

    const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const presents = client.getStorage("presents") || [];
    if (p_items && p_items.length > 0) {
      for (const it of p_items) {
        presents.push({
          id: `pres_${Date.now()}_${Math.random()}`,
          user_id: p_user_id,
          item_id: it.itemId,
          quantity: it.quantity,
          message: `ショップ購入: ${p_product_title}`,
          status: "UNCLAIMED",
          expire_at: expireAt,
          sent_at: new Date().toISOString()
        });
      }
    }

    const purchases = client.getStorage("user_shop_purchases") || [];
    const purchaseRecord = purchases.find((p: any) => p.user_id === p_user_id && p.product_id === p_product_id);
    if (purchaseRecord) {
      purchaseRecord.purchase_count = (purchaseRecord.purchase_count || 0) + 1;
      purchaseRecord.last_purchased_at = new Date().toISOString();
    } else {
      purchases.push({
        id: `p_${Date.now()}`,
        user_id: p_user_id,
        product_id: p_product_id,
        purchase_count: 1,
        last_purchased_at: new Date().toISOString()
      });
    }

    client.setStorage("users", users);
    client.setStorage("user_shop_purchases", purchases);
    client.setStorage("presents", presents);
    return { data: { status: "success", user }, error: null };
  }

  if (funcName === "process_stripe_shop_purchase") {
    const { p_user_id, p_stripe_session_id, p_product_id, p_amount_jpy, p_items, p_product_title, p_is_beginner, p_purchase_limit } = params;
    
    const txs = client.getStorage("payment_transactions") || [];
    const existTx = txs.find((t: any) => t.stripe_session_id === p_stripe_session_id);
    if (existTx) {
      return { data: { duplicate: true }, error: null };
    }

    txs.push({
      id: `tx_${Date.now()}`,
      user_id: p_user_id,
      stripe_session_id: p_stripe_session_id,
      amount: p_amount_jpy,
      currency: "jpy",
      diamonds_added: 0,
      status: "COMPLETED",
      created_at: new Date().toISOString()
    });

    const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const presents = client.getStorage("presents") || [];
    if (p_items && p_items.length > 0) {
      for (const it of p_items) {
        presents.push({
          id: `pres_${Date.now()}_${Math.random()}`,
          user_id: p_user_id,
          item_id: it.itemId,
          quantity: it.quantity,
          message: `購入特典: ${p_product_title}`,
          status: "UNCLAIMED",
          expire_at: expireAt,
          sent_at: new Date().toISOString()
        });
      }
    }

    const purchases = client.getStorage("user_shop_purchases") || [];
    const purchaseRecord = purchases.find((p: any) => p.user_id === p_user_id && p.product_id === p_product_id);
    if (purchaseRecord) {
      purchaseRecord.purchase_count = (purchaseRecord.purchase_count || 0) + 1;
      purchaseRecord.last_purchased_at = new Date().toISOString();
    } else {
      purchases.push({
        id: `p_${Date.now()}`,
        user_id: p_user_id,
        product_id: p_product_id,
        purchase_count: 1,
        last_purchased_at: new Date().toISOString()
      });
    }

    client.setStorage("payment_transactions", txs);
    client.setStorage("presents", presents);
    client.setStorage("user_shop_purchases", purchases);
    
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "get_pvp_opponents" || funcName === "get_pvp_opponents_page") {
    const { p_user_id, p_my_points } = params;
    const users = client.getStorage("users") || [];
    const ranks = client.getStorage("pvp_ranks") || [];
    const milestones = client.getStorage("user_funnel_milestones") || [];
    const firstPvpPending = !milestones.some((entry: any) => entry.user_id === p_user_id && entry.milestone === "first_pvp");
    const myPower = Number(users.find((entry: any) => entry.id === p_user_id)?.total_power || 0);
    const candidates = users
      .filter((u: any) => u.id !== p_user_id)
      .sort((left: any, right: any) => {
        if (!firstPvpPending || myPower <= 0) return 0;
        const leftPower = Number(left.total_power || 0);
        const rightPower = Number(right.total_power || 0);
        const leftTier = leftPower < myPower ? 0 : 1;
        const rightTier = rightPower < myPower ? 0 : 1;
        return leftTier - rightTier || Math.abs(myPower - leftPower) - Math.abs(myPower - rightPower);
      })
      .slice(Number(params?.p_offset || 0), Number(params?.p_offset || 0) + 5)
      .map((u: any, idx: number) => {
        const defenseIds = ["char_reiji_01", "char_rui_01", "char_chang_01"];
        return ({
        opponent_user_id: u.id,
        opponent_username: u.username || `Player ${idx + 1}`,
        opponent_guild_name: "No Guild",
        opponent_points: ranks.find((rank: any) => rank.user_id === u.id)?.rank_points ?? 1000,
        opponent_power: Number(u.total_power || 15000 + idx * 2500),
        opponent_class: Number(u.total_power || 15000 + idx * 2500) < myPower ? "WEAKER" : Number(u.total_power || 15000 + idx * 2500) > myPower ? "STRONGER" : "EQUAL",
        opponent_rank: idx + 1,
        opponent_guild_id: null,
        tactic: "BALANCED",
        opponent_guild_main_alignment: "NEUTRAL",
        opponent_guild_sub_alignment: "NEUTRAL",
        id: u.id,
        username: u.username || `対戦者_${idx + 1}`,
        avatar_url: u.avatar_url || "/characters/reiji_transparent_asset.png",
        title_equipped: u.title_equipped || "title_none",
        pvp_points: u.pvp_points ?? 5,
        total_power: 15000 + idx * 2500,
        defense_character_ids: defenseIds,
        defense_characters: defenseIds.map((id, slot) => {
          const master = CANONICAL_CHARACTERS.find((entry) => entry.character_id === id) || CANONICAL_CHARACTERS[slot];
          const asset = master.character_id.replace(/^char_/, "").replace(/_01$/, "");
          return { slot: slot + 1, character_master_id: master.character_id, display_name: master.name, rarity: master.rarity, level: 10 + idx, asset_identifier: `/characters/${asset}_transparent_asset.png` };
        })
      });
      });

    if (funcName === "get_pvp_opponents_page") {
      const total = users.filter((u: any) => u.id !== p_user_id).length;
      const offset = Number(params?.p_offset || 0);
      return { data: { items: candidates, total_count: total, offset, next_offset: offset + 5 >= total ? 0 : offset + 5 }, error: null };
    }
    return { data: candidates, error: null };
  }

  if (funcName === "get_public_battle_roster") {
    const targetUserId = params?.p_target_user_id;
    const owned = (client.getStorage("user_characters") || []).filter((entry: any) => entry.user_id === targetUserId);
    const formation = (client.getStorage("user_main_formations") || [])
      .filter((entry: any) => entry.user_id === targetUserId)
      .sort((left: any, right: any) => Number(left.slot || 0) - Number(right.slot || 0));
    const ordered = formation.map((slot: any) => owned.find((entry: any) => entry.id === slot.user_character_id)).filter(Boolean);
    const characters = (ordered.length > 0 ? ordered : owned.slice(0, 5)).map((character: any) => ({
      ...character,
      equipments: [],
      skills: (client.getStorage("user_skills") || []).filter((skill: any) => skill.equipped_character_id === character.id),
    }));
    return { data: { characters }, error: null };
  }

  if (funcName === "process_pvp_match_result") {
    const { p_user_id, p_target_user_id, p_is_win, p_point_diff, p_cash_reward } = params;
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) return { error: { message: "ユーザーが存在しません。" } };

    user.pvp_points = user.pvp_points ?? 5;
    user.cash = (user.cash || 0) + (p_cash_reward || 0);

    const ranks = client.getStorage("pvp_ranks") || [];
    const rank = ranks.find((r: any) => r.user_id === p_user_id);
    if (rank) {
      rank.rank_points = Math.max(0, (rank.rank_points ?? 1000) + (p_point_diff || 0));
      if (p_is_win) {
        rank.daily_wins = (rank.daily_wins || 0) + 1;
        rank.season_wins = (rank.season_wins || 0) + 1;
      }
    } else {
      ranks.push({
        id: `pr_${Date.now()}`,
        user_id: p_user_id,
        rank_points: Math.max(0, 1000 + (p_point_diff || 0)),
        daily_wins: p_is_win ? 1 : 0,
        season_wins: p_is_win ? 1 : 0
      });
    }

    client.setStorage("users", users);
    client.setStorage("pvp_ranks", ranks);
    return { data: { status: "success", rank_points: rank?.rank_points ?? Math.max(0, 1000 + (p_point_diff || 0)) }, error: null };
  }

  if (funcName === "claim_gvg_base") {
    const { p_guild_id, p_base_id } = params;
    const bases = client.getStorage("gvg_bases") || [];
    let base = bases.find((b: any) => b.id === p_base_id);
    if (!base) {
      base = { id: p_base_id, occupied_guild_id: p_guild_id, updated_at: new Date().toISOString() };
      bases.push(base);
    } else {
      base.occupied_guild_id = p_guild_id;
      base.updated_at = new Date().toISOString();
    }
    client.setStorage("gvg_bases", bases);
    return { data: { status: "success", base }, error: null };
  }

  if (funcName === "record_raid_boss_damage") {
    const { p_user_id, p_guild_id, p_boss_id, p_damage } = params;
    const logs = client.getStorage("raid_damage_logs") || [];
    logs.push({
      id: `raid_${Date.now()}`,
      user_id: p_user_id,
      guild_id: p_guild_id,
      boss_id: p_boss_id,
      damage: p_damage,
      created_at: new Date().toISOString()
    });
    client.setStorage("raid_damage_logs", logs);
    return { data: { status: "success", total_damage: p_damage }, error: null };
  }

  
  if (funcName === "record_raid_boss_damage_v2") {
    const { p_user_id, p_boss_id, p_damage } = params;
    const bosses = client.getStorage("raid_bosses") || [];
    const boss = bosses.find((b: any) => b.id === p_boss_id);
    if (!boss) return { error: { message: "ボスが存在しません" } };

    const nextHp = Math.max(0, boss.current_hp - p_damage);
    const isDefeated = nextHp === 0;
    
    if (isDefeated && boss.current_hp > 0) {
      boss.current_hp = boss.max_hp; // Reset for mock
      
      const presents = client.getStorage("presents") || [];
      const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      presents.push({
        id: `pres_${Date.now()}_${Math.random()}`,
        user_id: p_user_id,
        item_id: "raid_medal",
        quantity: 50,
        message: "レイドボス討伐貢献報酬",
        status: "UNCLAIMED",
        expire_at: expireAt,
        sent_at: new Date().toISOString()
      });
      client.setStorage("presents", presents);
    } else {
      boss.current_hp = nextHp;
    }
    client.setStorage("raid_bosses", bosses);
    return { data: { status: "success", current_hp: boss.current_hp, is_defeated: isDefeated }, error: null };
  }

  if (funcName === "process_gvg_battle_result") {
    const { p_user_id, p_guild_id, p_base_id, p_is_practice, p_is_win } = params;
    
    const baseControls = client.getStorage("guild_base_controls") || [];
    let baseCtrl = baseControls.find((b: any) => b.base_id === p_base_id && b.guild_id === p_guild_id);
    if (!baseCtrl) {
      baseCtrl = { id: `gbc_${Date.now()}`, base_id: p_base_id, guild_id: p_guild_id, daily_points: 0 };
      baseControls.push(baseCtrl);
    }

    const matches = client.getStorage("gvg_matches") || [];
    const myMatch = matches.find((m: any) => m.status === "ONGOING" && (m.guild_a_id === p_guild_id || m.guild_b_id === p_guild_id));

    let addedBasePoints = 0;
    let addedMatchPoints = 0;
    let addedPersonalPoints = 0;

    if (p_is_practice) {
      if (p_is_win) {
        addedBasePoints = 100;
        addedMatchPoints = 100;
      }
    } else {
      if (p_is_win) {
        addedBasePoints = 250;
        addedMatchPoints = 250;
        addedPersonalPoints = 250;
      } else {
        addedBasePoints = -100;
        addedMatchPoints = -100;
        addedPersonalPoints = -100;
      }
    }

    baseCtrl.daily_points = Math.max(0, (baseCtrl.daily_points || 0) + addedBasePoints);

    if (myMatch) {
      if (myMatch.guild_a_id === p_guild_id) {
        myMatch.guild_a_points = Math.max(0, (myMatch.guild_a_points || 0) + addedMatchPoints);
        if (!p_is_win && !p_is_practice) myMatch.guild_b_points = (myMatch.guild_b_points || 0) + 100;
      } else {
        myMatch.guild_b_points = Math.max(0, (myMatch.guild_b_points || 0) + addedMatchPoints);
        if (!p_is_win && !p_is_practice) myMatch.guild_a_points = (myMatch.guild_a_points || 0) + 100;
      }
    }

    if (!p_is_practice) {
      const gvgRanks = client.getStorage("user_gvg_ranks") || [];
      let rank = gvgRanks.find((r: any) => r.user_id === p_user_id);
      if (!rank) {
        rank = { id: `ugr_${Date.now()}`, user_id: p_user_id, season_points: 0 };
        gvgRanks.push(rank);
      }
      rank.season_points = Math.max(0, (rank.season_points || 0) + addedPersonalPoints);
      client.setStorage("user_gvg_ranks", gvgRanks);
    }

    client.setStorage("guild_base_controls", baseControls);
    client.setStorage("gvg_matches", matches);

    return { data: { status: "success", added_base_points: addedBasePoints }, error: null };
  }


  if (funcName === "character_level_up") {
    const { p_user_id, p_character_id, p_exp_item_id, p_count, p_cash_cost } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || user.cash < p_cash_cost) return { error: { message: "キャッシュが不足しています。" } };
    
    const items = client.getStorage("user_items");
    const expItem = items.find((i: any) => i.user_id === p_user_id && i.item_id === p_exp_item_id);
    if (!expItem || expItem.quantity < p_count) return { error: { message: "経験の書が不足しています。" } };
    
    const chars = client.getStorage("user_characters");
    const char = chars.find((c: any) => c.user_id === p_user_id && c.character_id === p_character_id);
    if (!char) return { error: { message: "キャラクターが存在しません。" } };
    
    user.cash -= p_cash_cost;
    expItem.quantity -= p_count;
    char.level = Math.min(100, (char.level || 1) + p_count);
    
    client.setStorage("users", users);
    client.setStorage("user_items", items);
    client.setStorage("user_characters", chars);
    
    executeMockRpc(client, "evaluate_mission_progress", { p_user_id, p_trigger_type: "CHAR_LEVEL_UP", p_progress_increment: p_count });
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "upgrade_gear") {
    const { p_user_id, p_equipment_id, p_exp_item_id, p_count, p_cash_cost } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || user.cash < p_cash_cost) return { error: { message: "キャッシュが不足しています。" } };
    
    const items = client.getStorage("user_items");
    const expItem = items.find((i: any) => i.user_id === p_user_id && i.item_id === p_exp_item_id);
    if (!expItem || expItem.quantity < p_count) return { error: { message: "強化素材が不足しています。" } };
    
    const equips = client.getStorage("user_equipments");
    const equip = equips.find((e: any) => e.id === p_equipment_id && e.user_id === p_user_id);
    if (!equip) return { error: { message: "装備が存在しません。" } };
    
    user.cash -= p_cash_cost;
    expItem.quantity -= p_count;
    equip.level = Math.min(100, (equip.level || 1) + p_count);
    
    client.setStorage("users", users);
    client.setStorage("user_items", items);
    client.setStorage("user_equipments", equips);
    
    executeMockRpc(client, "evaluate_mission_progress", { p_user_id, p_trigger_type: "GEAR_UPGRADE", p_progress_increment: p_count });
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "limit_break_gear") {
    const { p_user_id, p_equipment_id, p_cash_cost, p_hammer_cost } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || user.cash < p_cash_cost) return { error: { message: "キャッシュが不足しています。" } };
    
    const items = client.getStorage("user_items");
    const hammerItem = items.find((i: any) => i.user_id === p_user_id && i.item_id === "EQUIP_LB_PART");
    if (!hammerItem || hammerItem.quantity < p_hammer_cost) return { error: { message: "限界突破ハンマーが不足しています。" } };
    
    const equips = client.getStorage("user_equipments");
    const equip = equips.find((e: any) => e.id === p_equipment_id && e.user_id === p_user_id);
    if (!equip) return { error: { message: "装備が存在しません。" } };
    
    user.cash -= p_cash_cost;
    hammerItem.quantity -= p_hammer_cost;
    equip.plus_val = (equip.plus_val || 0) + 1;
    
    client.setStorage("users", users);
    client.setStorage("user_items", items);
    client.setStorage("user_equipments", equips);
    
    executeMockRpc(client, "evaluate_mission_progress", { p_user_id, p_trigger_type: "GEAR_LIMIT_BREAK", p_progress_increment: 1 });
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "limit_break_skill") {
    const { p_user_id, p_skill_id, p_cash_cost, p_book_cost } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || user.cash < p_cash_cost) return { error: { message: "キャッシュが不足しています。" } };
    
    const items = client.getStorage("user_items");
    const bookItem = items.find((i: any) => i.user_id === p_user_id && i.item_id === "SKILL_MANUAL");
    if (!bookItem || bookItem.quantity < p_book_cost) return { error: { message: "奥義書が不足しています。" } };
    
    const skills = client.getStorage("user_skills");
    const skill = skills.find((s: any) => s.id === p_skill_id && s.user_id === p_user_id);
    if (!skill) return { error: { message: "スキルが存在しません。" } };
    
    user.cash -= p_cash_cost;
    bookItem.quantity -= p_book_cost;
    skill.plus_val = (skill.plus_val || 0) + 1;
    
    client.setStorage("users", users);
    client.setStorage("user_items", items);
    client.setStorage("user_skills", skills);
    
    executeMockRpc(client, "evaluate_mission_progress", { p_user_id, p_trigger_type: "SKILL_LIMIT_BREAK", p_progress_increment: 1 });
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "create_guild") {
    const { p_user_id, p_guild_name, p_guild_description, p_guild_logo, p_guild_color, p_creation_cost } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || Number(user.level || 1) < 5 || p_creation_cost !== 500 || user.cash < 500) return { error: { message: "ギルド設立条件を満たしていません。" } };
    
    const guilds = client.getStorage("guilds") || [];
    const newGuildId = "guild_" + Date.now();
    const newGuild = {
      id: newGuildId,
      name: p_guild_name,
      description: p_guild_description || "",
      logo_icon: p_guild_logo || "guild_icon_default.png",
      color_theme: p_guild_color || "red",
      level: 1,
      xp: 0,
      cash: 0,
      approval_required: false,
      auto_kick_days: 7,
      created_at: new Date().toISOString()
    };
    guilds.push(newGuild);
    
    const members = client.getStorage("guild_members") || [];
    members.push({
      id: "gm_" + Date.now(),
      guild_id: newGuildId,
      user_id: p_user_id,
      role: "MASTER",
      joined_at: new Date().toISOString()
    });
    
    user.cash -= p_creation_cost;
    user.guild_id = newGuildId;
    
    client.setStorage("users", users);
    client.setStorage("guilds", guilds);
    client.setStorage("guild_members", members);
    
    executeMockRpc(client, "evaluate_mission_progress", { p_user_id, p_trigger_type: "GUILD_JOIN", p_progress_increment: 1 });
    return { data: { guild_id: newGuildId }, error: null };
  }

  if (funcName === "buy_guild_decoration") {
    const { p_user_id, p_guild_id, p_decoration_id, p_cost } = params;
    const guilds = client.getStorage("guilds") || [];
    const guild = guilds.find((g: any) => g.id === p_guild_id);
    if (!guild || (guild.cash || 0) < p_cost) return { error: { message: "ギルド資金が不足しています。" } };
    
    const decorations = client.getStorage("guild_decorations") || [];
    decorations.push({
      id: "gdec_" + Date.now(),
      guild_id: p_guild_id,
      decoration_id: p_decoration_id,
      unlocked_at: new Date().toISOString()
    });
    
    guild.cash -= p_cost;
    
    client.setStorage("guilds", guilds);
    client.setStorage("guild_decorations", decorations);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "use_inventory_item") {
    const { p_user_id, p_item_id, p_quantity, p_vitality_gain } = params;
    const items = client.getStorage("user_items");
    const item = items.find((i: any) => i.user_id === p_user_id && i.item_id === p_item_id);
    if (!item || item.quantity < p_quantity) return { error: { message: "アイテムが不足しています。" } };
    
    if (p_vitality_gain > 0) {
      const users = client.getStorage("users");
      const user = users.find((u: any) => u.id === p_user_id);
      if (user) {
        if (Number(user.vitality || 0) + p_vitality_gain > 500) return { error: { message: "スタミナ上限を超えるため使用できません。" } };
        user.vitality = Number(user.vitality || 0) + p_vitality_gain;
        client.setStorage("users", users);
      }
    }
    item.quantity -= p_quantity;
    client.setStorage("user_items", items);
    
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "complete_patrol_instantly") {
    const { p_user_id, p_patrol_id, p_use_currency } = params;
    const patrols = client.getStorage("user_patrols") || [];
    const patrol = patrols.find((entry: any) => entry.id === p_patrol_id && entry.user_id === p_user_id);
    if (!patrol) return { data: null, error: { message: "Patrol not found" } };
    if (patrol.status !== "ONGOING") return { data: null, error: { message: "Patrol is not eligible for instant completion" } };
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === p_user_id);
    if (!user) return { data: null, error: { message: "User not found" } };
    if (p_use_currency === "FREE_TUTORIAL") {
      const tutorialProgress = client.getStorage("tutorial_progress") || [];
      const progress = tutorialProgress.find((entry: any) => entry.user_id === p_user_id);
      if (progress?.step_id !== "FREE_INSTANT") return { data: null, error: { message: "Free completion is unavailable" } };
      progress.step_id = "TUTORIAL_BATTLE";
      client.setStorage("tutorial_progress", tutorialProgress);
    } else if (p_use_currency === "FREE_PREOPEN" || p_use_currency === "FREE") {
      const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (user.quest_skips_reset_date !== todayJst) { user.quest_free_skips_count = 0; user.quest_paid_skips_count = 0; }
      if (Number(user.quest_free_skips_count || 0) >= 5) return { data: null, error: { message: "Daily free instant completion limit reached" } };
      user.quest_free_skips_count = Number(user.quest_free_skips_count || 0) + 1;
      user.quest_skips_reset_date = todayJst;
    } else if (p_use_currency === "DIAMOND") {
      const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (user.quest_skips_reset_date !== todayJst) { user.quest_free_skips_count = 0; user.quest_paid_skips_count = 0; }
      if (Number(user.quest_paid_skips_count || 0) >= 10) return { data: null, error: { message: "Daily paid instant completion limit reached" } };
      if ((user.neon_diamonds || 0) < 30) return { data: null, error: { message: "Diamond insufficient" } };
      user.neon_diamonds -= 30;
      user.quest_paid_skips_count = Number(user.quest_paid_skips_count || 0) + 1;
      user.quest_skips_reset_date = todayJst;
    } else {
      return { data: null, error: { message: "Invalid patrol instant completion currency" } };
    }
    patrol.status = "CLAIMABLE";
    patrol.expires_at = new Date().toISOString();
    client.setStorage("user_patrols", patrols);
    client.setStorage("users", users);
    return {
      data: {
        status: "success",
        currency: p_use_currency,
        free_skips_remaining: p_use_currency === "FREE_PREOPEN" || p_use_currency === "FREE" ? 5 - Number(user.quest_free_skips_count || 0) : null,
        paid_skips_remaining: p_use_currency === "DIAMOND" ? 10 - Number(user.quest_paid_skips_count || 0) : null,
        tutorial_step: p_use_currency === "FREE_TUTORIAL" ? "TUTORIAL_BATTLE" : null,
      },
      error: null,
    };
  }

  if (funcName === "move_current_user_base") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const nextBaseId = String(params.p_base_id || "");
    const canonicalBaseIds = ["shinjuku", "shibuya", "ikebukuro", "roppongi", "akihabara", "kawasaki", "yokohama"];
    if (!userId) return { data: null, error: { message: "Player authentication required", code: "42501" } };
    if (!canonicalBaseIds.includes(nextBaseId)) return { data: null, error: { message: "Invalid base id", code: "22023" } };
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === userId);
    if (!user) return { data: null, error: { message: "Player was not found", code: "P0002" } };
    const previousBaseId = user.current_base_id;
    user.current_base_id = nextBaseId;
    client.setStorage("users", users);
    return { data: { status: "success", previous_base_id: previousBaseId, current_base_id: nextBaseId }, error: null };
  }

  if (funcName === "claim_patrol_rewards") {
    const { p_patrol_id } = params;
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: null, error: { message: "authentication required", code: "42501" } };
    const patrols = client.getStorage("user_patrols") || [];
    const patrol = patrols.find((entry: any) => entry.id === p_patrol_id && entry.user_id === userId);
    if (!patrol) return { data: null, error: { message: "Patrol not found" } };
    if (patrol.status === "COMPLETED") return { data: null, error: { message: "Patrol rewards already claimed" } };
    if (patrol.status !== "CLAIMABLE" && new Date(patrol.expires_at).getTime() > Date.now()) {
      return { data: null, error: { message: "Patrol is not complete" } };
    }
    if (patrol.has_battle_event && !patrol.battle_resolved) {
      return { data: null, error: { message: "Patrol battle must be resolved before claiming rewards" } };
    }
    const quests = client.getStorage("quests") || [];
    const quest = quests.find((entry: any) => entry.id === (patrol.course_id || patrol.quest_id));
    if (!quest) return { data: null, error: { message: "Quest master not found" } };

    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === userId);
    if (!user) return { data: null, error: { message: "User not found" } };
    const canonicalQuest = canonicalQuestById(quest.id);
    const firstClears = client.getStorage("user_quest_first_clears") || [];
    const isFirstClear = Boolean(canonicalQuest) && !firstClears.some((entry: any) => entry.user_id === userId && entry.quest_id === quest.id);
    const rewardXp = canonicalQuest
      ? canonicalQuest.userExp + (isFirstClear ? canonicalQuest.firstClearUserExp : 0)
      : Math.max(0, Number(quest.exp_reward || 0));
    const cashReward = canonicalQuest ? canonicalQuest.cashReward : Math.max(0, Number(quest.cash_reward || 0));
    const dailyClaims = client.getStorage("canonical_daily_activity_claims") || [];
    const gameDay = jstCycleDate();
    const hardDailyCash = canonicalQuest?.difficulty === "HARD" && !dailyClaims.some((entry: any) => entry.user_id === userId && entry.game_day === gameDay && entry.source_key === "QUEST_HARD_FIRST") ? 20 : 0;
    const awardedItems = canonicalQuest
      ? [...rollCanonicalQuestItems(canonicalQuest.rewardPoolId), ...(isFirstClear && canonicalQuest.firstClearRewardPoolId ? rollCanonicalQuestItems(canonicalQuest.firstClearRewardPoolId) : [])]
      : [];
    user.level = user.level || 1;
    const progression = applyFrozenUserXp(user.level, Math.max(0, Number(user.xp || 0)), rewardXp);
    user.level = progression.level;
    user.xp = progression.xp;

    const presents = client.getStorage("presents") || [];
    if (cashReward > 0) presents.push({
      id: `patrol_reward_${p_patrol_id}`,
      user_id: userId,
      item_id: "CASH",
      quantity: cashReward,
      message: `クエスト報酬: ${quest.name}`,
      status: "UNCLAIMED",
      sent_at: new Date().toISOString(),
      expire_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    for (const item of awardedItems) {
      presents.push({
        id: `patrol_item_${p_patrol_id}_${presents.length}`,
        user_id: userId,
        item_id: item.item_id,
        quantity: item.quantity,
        message: `クエストドロップ: ${quest.name}`,
        status: "UNCLAIMED",
        sent_at: new Date().toISOString(),
        expire_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }
    if (hardDailyCash > 0) {
      dailyClaims.push({ game_day: gameDay, user_id: userId, source_key: "QUEST_HARD_FIRST", source_ref: p_patrol_id, reward_payload: [{ itemId: "CASH", quantity: 20 }] });
      presents.push({ id:`quest_hard_daily_${userId}_${gameDay}`,user_id:userId,item_id:"CASH",quantity:20,message:"HARDクエスト本日初回報酬",status:"UNCLAIMED",sent_at:new Date().toISOString() });
      client.setStorage("canonical_daily_activity_claims",dailyClaims);
    }
    if (isFirstClear) {
      firstClears.push({ user_id: userId, quest_id: quest.id, cleared_at: new Date().toISOString() });
      client.setStorage("user_quest_first_clears", firstClears);
    }
    patrol.status = "COMPLETED";
    patrol.has_battle_event = false;
    patrol.battle_resolved = true;
    patrol.rewards_accrued = { course_name: quest.name, cash: cashReward, daily_cash: hardDailyCash, xp: rewardXp, items: awardedItems, first_clear: isFirstClear };
    client.setStorage("users", users);
    client.setStorage("presents", presents);
    client.setStorage("user_patrols", patrols);
    evaluateMockMissionProgress(client, userId, "PATROL_CLEAR", 1);
    recordMockFunnelMilestone(client, userId, "first_battle", { source: "patrol" });
    return {
      data: {
        status: "success",
        patrol_id: p_patrol_id,
        course_name: quest.name,
        cash: cashReward,
        daily_cash: hardDailyCash,
        xp: rewardXp,
        items: awardedItems,
        first_clear: isFirstClear,
        level: user.level,
        current_xp: user.xp,
        leveled_up: progression.leveledUp,
      },
      error: null,
    };
  }

  if (funcName === "complete_patrol_instant") {
    const { p_user_id, p_patrol_id, p_diamond_cost } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || user.neon_diamonds < p_diamond_cost) return { error: { message: "ダイヤが不足しています。" } };
    
    const patrols = client.getStorage("user_patrols") || [];
    const patrolIndex = patrols.findIndex((p: any) => p.id === p_patrol_id && p.user_id === p_user_id);
    if (patrolIndex === -1) return { error: { message: "クエストが存在しません。" } };
    
    user.neon_diamonds -= p_diamond_cost;
    patrols.splice(patrolIndex, 1);
    
    client.setStorage("users", users);
    client.setStorage("user_patrols", patrols);
    
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "claim_battle_rewards") {
    const { p_user_id, p_cash_amount, p_exp_amount, p_item_rewards } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) return { error: { message: "ユーザーが存在しません。" } };
    
    user.cash = (user.cash || 0) + p_cash_amount;
    client.setStorage("users", users);
    
    if (p_exp_amount > 0) {
      executeMockRpc(client, "add_user_xp", { p_user_id, p_xp_amount: p_exp_amount });
    }
    
    const items = client.getStorage("user_items") || [];
    if (p_item_rewards && p_item_rewards.length > 0) {
      for (const reward of p_item_rewards) {
        const existing = items.find((i: any) => i.user_id === p_user_id && i.item_id === reward.item_id);
        if (existing) {
          existing.quantity += reward.quantity;
        } else {
          items.push({
            id: `ui_${Date.now()}_${Math.random()}`,
            user_id: p_user_id,
            item_id: reward.item_id,
            quantity: reward.quantity
          });
        }
      }
      client.setStorage("user_items", items);
    }
    
    return { data: { status: "success" }, error: null };
  }
  
  if (funcName === "check_current_gameplay_reset_eligibility") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId) return { data: { eligible: false, reason: "AUTHENTICATION" }, error: null };
    const hasPaidAuthority = ["payment_transactions", "user_shop_purchases", "user_monthly_passes"]
      .some((table) => (client.getStorage(table) || []).some((row: any) => row.user_id === userId));
    if (hasPaidAuthority) return { data: { eligible: false, reason: "PAYMENT" }, error: null };
    const isGuildMember = (client.getStorage("guild_members") || []).some((row: any) => row.user_id === userId)
      || (client.getStorage("guilds") || []).some((row: any) => row.leader_id === userId);
    if (isGuildMember) return { data: { eligible: false, reason: "GUILD" }, error: null };
    const hasActiveGameplay = (client.getStorage("user_patrols") || []).some((row: any) => row.user_id === userId && row.status !== "COMPLETED")
      || (client.getStorage("battle_replay_sessions") || []).some((row: any) => row.requester_user_id === userId && (row.status === "PENDING" || row.finalization_status === "PENDING"));
    if (hasActiveGameplay) return { data: { eligible: false, reason: "ACTIVE_GAMEPLAY" }, error: null };
    const hasGrant = (client.getStorage("user_lifetime_onboarding_grants") || []).some((row: any) => row.user_id === userId);
    return { data: { eligible: hasGrant, reason: hasGrant ? null : "UNSUPPORTED" }, error: null };
  }

  if (funcName === "reset_current_gameplay") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!userId || params.p_acknowledged !== true || !params.p_request_id) return { data: null, error: { message: "invalid gameplay reset request" } };
    const requests = client.getStorage("gameplay_reset_requests") || [];
    const prior = requests.find((row: any) => row.request_id === params.p_request_id);
    if (prior) return prior.user_id === userId ? { data: prior.result, error: null } : { data: null, error: { message: "request_id belongs to another user" } };
    const hasPaidAuthority = ["payment_transactions", "user_shop_purchases", "user_monthly_passes"]
      .some((table) => (client.getStorage(table) || []).some((row: any) => row.user_id === userId));
    const isGuildMember = (client.getStorage("guild_members") || []).some((row: any) => row.user_id === userId)
      || (client.getStorage("guilds") || []).some((row: any) => row.leader_id === userId);
    const hasActiveGameplay = (client.getStorage("user_patrols") || []).some((row: any) => row.user_id === userId && row.status !== "COMPLETED")
      || (client.getStorage("battle_replay_sessions") || []).some((row: any) => row.requester_user_id === userId && (row.status === "PENDING" || row.finalization_status === "PENDING"));
    const hasGrant = (client.getStorage("user_lifetime_onboarding_grants") || []).some((row: any) => row.user_id === userId);
    const denialReason = hasPaidAuthority ? "PAYMENT" : isGuildMember ? "GUILD" : hasActiveGameplay ? "ACTIVE_GAMEPLAY" : !hasGrant ? "UNSUPPORTED" : null;
    if (denialReason) return { data: { status: "not_resettable", reason: denialReason }, error: null };
    const ownedTables = ["user_main_formations", "pvp_defense_decks", "gvg_defense_decks", "user_skills", "user_equipments", "user_characters", "user_items", "user_power_rankings"];
    for (const table of ownedTables) client.setStorage(table, (client.getStorage(table) || []).filter((row: any) => row.user_id !== userId));
    const missions = client.getStorage("user_missions") || [];
    for (const mission of missions) if (mission.user_id === userId && mission.status === "PROGRESS") mission.current_progress = 0;
    client.setStorage("user_missions", missions);
    const users = client.getStorage("users") || [];
    const user = users.find((row: any) => row.id === userId);
    if (user) Object.assign(user, { level: 1, xp: 0, cash: 2600, neon_diamonds: 200, diamonds: 0, vitality: 100, pvp_points: 5, raid_points: 5, favorite_character_id: null, current_base_id: "shinjuku" });
    client.setStorage("users", users);
    const progressRows = client.getStorage("tutorial_progress") || [];
    const progress = progressRows.find((row: any) => row.user_id === userId);
    if (progress) Object.assign(progress, { step_id: "WORLD_INTRO", completed_at: null });
    else progressRows.push({ user_id: userId, step_id: "WORLD_INTRO" });
    client.setStorage("tutorial_progress", progressRows);
    const result = { status: "success", tutorial_step: "WORLD_INTRO", request_id: params.p_request_id };
    requests.push({ request_id: params.p_request_id, user_id: userId, status: "COMPLETED", result });
    client.setStorage("gameplay_reset_requests", requests);
    return { data: result, error: null };
  }

  if (funcName === "execute_tutorial_character_gacha") {
    if (typeof window !== "undefined" && localStorage.getItem("mock_tutorial_gacha_error") === "true") {
      return { data: null, error: { message: "mock tutorial gacha unavailable", code: "P0001" } };
    }
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const progress = (client.getStorage("tutorial_progress") || []).find((row: any) => row.user_id === userId);
    if (!userId || progress?.step_id !== "FREE_GACHA") return { data: null, error: { message: "tutorial gacha is unavailable", code: "42501" } };
    const histories = client.getStorage("gacha_execution_history") || [];
    const prior = histories.find((row: any) => row.user_id === userId && row.request_id === params.p_request_id);
    if (prior?.result_payload) return { data: prior.result_payload, error: null };
    const pool = client.getStorage("gacha_items_master") || [];
    const canonicalById = new Map(CANONICAL_CHARACTERS.map((character) => [character.character_id, character]));
    const normal = pool.filter((row: any) => row.gacha_id === "CHAR_NORMAL" && canonicalById.has(row.item_id));
    const ssr = pool.filter((row: any) => row.gacha_id === "CHAR_SPECIAL"
      && canonicalById.get(row.item_id)?.rarity === "SSR");
    const lifetimeGrant = (client.getStorage("user_lifetime_onboarding_grants") || []).find((row: any) => row.user_id === userId);
    const lifetimeResults = lifetimeGrant?.canonical_payload?.gacha_results;
    if (!normal.length || !ssr.length) return { data: null, error: { message: "canonical tutorial gacha bucket is empty" } };
    const claims = client.getStorage("user_daily_gacha_claims") || [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const existingClaim = claims.find((entry: any) => entry.user_id === userId && entry.gacha_type === "CHARACTER");
    if (existingClaim?.last_claimed_date === today) {
      return { data: null, error: { message: "daily free gacha already claimed", code: "23505" } };
    }
    if (existingClaim) existingClaim.last_claimed_date = today;
    else claims.push({ user_id: userId, gacha_type: "CHARACTER", last_claimed_date: today });
    const characters = client.getStorage("user_characters") || [];
    const results = Array.from({ length: 10 }, (_, index) => {
      // Stable tutorial fixture order keeps N/R/SR visual contract assertions
      // deterministic while preserving the production RPC response shape.
      const lifetimeCharacterId = Array.isArray(lifetimeResults) ? lifetimeResults[index]?.character_id : null;
      const picked = lifetimeCharacterId ? { item_id: lifetimeCharacterId } : index === 9 ? ssr[0] : normal[index % normal.length];
      const canonicalCharacter = canonicalById.get(picked.item_id)!;
      const existing = characters.find((row: any) => row.user_id === userId && row.character_id === picked.item_id);
      if (!existing) {
        characters.push({ id: `mock_character_${Date.now()}_${index}`, user_id: userId, character_id: picked.item_id, level: 1, awakening_level: 0, awakening_progress: 0, created_at: new Date().toISOString() });
        return { type: "CHARACTER", character_id: picked.item_id, rarity: canonicalCharacter.rarity, outcome: "new", tutorial_slot: index + 1 };
      }
      if (Number(existing.awakening_level || 0) >= 5) {
        const inventory = client.getStorage("user_items") || [];
        const book = inventory.find((row: any) => row.user_id === userId && row.item_id === "AWAKENING_BOOK");
        if (book) book.quantity = Number(book.quantity || 0) + 1;
        else inventory.push({ user_id: userId, item_id: "AWAKENING_BOOK", quantity: 1 });
        client.setStorage("user_items", inventory);
        return { type: "CHARACTER", character_id: picked.item_id, rarity: canonicalCharacter.rarity, outcome: "converted", converted_item_id: "AWAKENING_BOOK", converted_quantity: 1, tutorial_slot: index + 1 };
      }
      return { type: "CHARACTER", character_id: picked.item_id, rarity: canonicalCharacter.rarity, ...applyMockCharacterAwakeningEquivalent(existing), tutorial_slot: index + 1 };
    });
    const response = { status: "success", request_id: params.p_request_id, results, tutorial: true, guaranteed_ssr_slot: 10 };
    histories.push({ user_id: userId, request_id: params.p_request_id, gacha_id: "CHAR_NORMAL", payment_source: "free", pull_count: 10, status: "COMPLETED", result_payload: response });
    client.setStorage("gacha_execution_history", histories);
    client.setStorage("user_daily_gacha_claims", claims);
    client.setStorage("user_characters", characters);
    evaluateMockMissionProgress(client, userId, "GACHA_PULL", 1);
    return { data: response, error: null };
  }

  if (funcName === "execute_character_gacha") {
    const { p_user_id, p_gacha_id, p_pull_count, p_currency_type, p_request_id } = params;
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!currentUserId || currentUserId !== p_user_id) return { data: null, error: { message: "not authorized", code: "42501" } };
    if (!p_request_id) return { data: null, error: { message: "request_id is required", code: "22023" } };
    if (!Number.isInteger(p_pull_count) || p_pull_count < 1 || p_pull_count > 10) return { data: null, error: { message: "invalid pull count", code: "22023" } };
    if (p_currency_type === "free" && (p_gacha_id !== "CHAR_NORMAL" || p_pull_count !== 10)) return { data: null, error: { message: "daily free is only available as a normal ten-pull", code: "22023" } };
    const isSpecial = p_gacha_id === "CHAR_SPECIAL";
    const specialState = (client.getStorage("feature_operating_states") || []).find((entry: any) => entry.feature_key === "SPECIAL_GACHA")?.state || "CLOSED";
    if (isSpecial && specialState !== "OPEN") return { data: null, error: { message: "special gacha is closed", code: "P0001" } };
    const histories = client.getStorage("gacha_execution_history") || [];
    const prior = histories.find((entry: any) => entry.user_id === p_user_id && entry.request_id === p_request_id);
    if (prior) {
      if (prior.gacha_id !== p_gacha_id || prior.payment_source !== p_currency_type || prior.pull_count !== p_pull_count) return { data: null, error: { message: "request_id was already used for a different gacha request", code: "23505" } };
      return prior.result_payload ? { data: prior.result_payload, error: null } : { data: null, error: { message: "gacha request is already in progress", code: "55000" } };
    }
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === p_user_id);
    const gacha = (client.getStorage("gacha_masters") || []).find((entry: any) => entry.id === p_gacha_id && entry.gacha_type === "CHARACTER");
    const pool = (client.getStorage("gacha_items_master") || []).filter((entry: any) => entry.gacha_id === p_gacha_id && entry.item_id);
    if (!user || !gacha || pool.length === 0) return { data: null, error: { message: "character gacha not found", code: "P0002" } };

    const claims = client.getStorage("user_daily_gacha_claims") || [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    if (p_currency_type === "free") {
      const existingClaim = claims.find((entry: any) => entry.user_id === p_user_id && entry.gacha_type === "CHARACTER");
      if (existingClaim?.last_claimed_date === today) return { data: null, error: { message: "daily free gacha already claimed", code: "23505" } };
      if (existingClaim) existingClaim.last_claimed_date = today;
      else claims.push({ user_id: p_user_id, gacha_type: "CHARACTER", last_claimed_date: today });
    } else if (p_currency_type === "cash" || p_currency_type === "diamonds") {
      const field = p_currency_type === "cash" ? "cash" : "neon_diamonds";
      const unitCost = Number(p_currency_type === "cash" ? gacha.cost_cash : gacha.cost_diamond);
      const cost = unitCost * p_pull_count;
      if (!Number.isFinite(unitCost) || Number(user[field] || 0) < cost) return { data: null, error: { message: "insufficient gacha currency", code: "23514" } };
      user[field] = Number(user[field] || 0) - cost;
    } else if (p_currency_type === "ticket") {
      const items = client.getStorage("user_items") || [];
      const ticketItemId = isSpecial ? "SPECIAL_TICKET_CHARACTER" : "NORMAL_GACHA_TICKET_CHARACTER";
      const ticket = items.find((entry: any) => entry.user_id === p_user_id && entry.item_id === ticketItemId);
      if (!ticket || Number(ticket.quantity || 0) < p_pull_count) return { data: null, error: { message: "insufficient gacha tickets", code: "23514" } };
      ticket.quantity -= p_pull_count;
      client.setStorage("user_items", items);
    } else return { data: null, error: { message: "invalid currency type", code: "22023" } };

    const characters = client.getStorage("user_characters") || [];
    const inventory = client.getStorage("user_items") || [];
    const rates = isSpecial ? [{ rarity: "R", weight: 60 }, { rarity: "SR", weight: 35 }, { rarity: "SSR", weight: 5 }] : [{ rarity: "N", weight: 50 }, { rarity: "R", weight: 40 }, { rarity: "SR", weight: 10 }];
    const pickRarity = () => {
      let roll = Math.random() * 100;
      return (rates.find(entry => (roll -= entry.weight) <= 0) || rates[rates.length - 1]).rarity;
    };
    const results: Array<Record<string, unknown> & { type: "CHARACTER"; character_id: string; rarity: string; outcome: string }> = [];
    for (let index = 0; index < p_pull_count; index += 1) {
      const rarity = pickRarity();
      const bucket = pool.filter((entry: any) => entry.rarity === rarity);
      if (bucket.length === 0) return { data: null, error: { message: "gacha bucket is empty", code: "P0002" } };
      const picked = bucket[Math.floor(Math.random() * bucket.length)].item_id;
      const existing = characters.find((entry: any) => entry.user_id === p_user_id && entry.character_id === picked);
      if (!existing) {
        characters.push({ id: `mock_character_${Date.now()}_${index}`, user_id: p_user_id, character_id: picked, level: 1, awakening_level: 0, awakening_progress: 0, created_at: new Date().toISOString() });
        results.push({ type: "CHARACTER", character_id: picked, rarity, outcome: "new" });
      } else if (Number(existing.awakening_level || 0) < 5) {
        results.push({ type: "CHARACTER", character_id: picked, rarity, ...applyMockCharacterAwakeningEquivalent(existing) });
      } else {
        const material = inventory.find((entry: any) => entry.user_id === p_user_id && entry.item_id === "AWAKENING_BOOK");
        if (material) material.quantity = Number(material.quantity || 0) + 1;
        else inventory.push({ user_id: p_user_id, item_id: "AWAKENING_BOOK", quantity: 1 });
        results.push({ type: "CHARACTER", character_id: picked, rarity, outcome: "converted", converted_item_id: "AWAKENING_BOOK", converted_quantity: 1 });
      }
    }
    recordMockFunnelMilestone(client, p_user_id, "first_gacha", { source: "character_gacha" });
    client.setStorage("users", users);
    client.setStorage("user_daily_gacha_claims", claims);
    client.setStorage("user_characters", characters);
    client.setStorage("user_items", inventory);
    const response = { status: "success", request_id: p_request_id, results, cash: user.cash, diamonds: user.neon_diamonds };
    histories.push({ user_id: p_user_id, request_id: p_request_id, gacha_id: p_gacha_id, payment_source: p_currency_type, pull_count: p_pull_count, status: "COMPLETED", result_payload: response });
    client.setStorage("gacha_execution_history", histories);
    if (p_currency_type === "free" && p_gacha_id === "CHAR_NORMAL" && p_pull_count === 10) {
      evaluateMockMissionProgress(client, p_user_id, "GACHA_PULL", 1);
    }
    return { data: response, error: null };
  }

  if (funcName === "execute_asset_gacha") {
    const { p_user_id, p_gacha_id, p_pull_count, p_currency_type, p_request_id } = params;
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!currentUserId || currentUserId !== p_user_id) return { data: null, error: { message: "認証が必要です。" } };
    if (!p_request_id) return { data: null, error: { message: "request_id is required" } };
    if (!Number.isInteger(p_pull_count) || p_pull_count < 1 || p_pull_count > 10) return { data: null, error: { message: "ガチャ回数が不正です。" } };
    if (p_currency_type === "free" && p_pull_count !== 10) return { data: null, error: { message: "無料ガチャは10連のみです。" } };
    if (p_currency_type === "free" && !["SKILL_NORMAL", "EQUIP_NORMAL"].includes(p_gacha_id)) {
      return { data: null, error: { message: "毎日無料10連はノーマルガチャのみです。" } };
    }
    const isSpecial = p_gacha_id.endsWith("_SPECIAL");
    const specialState = (client.getStorage("feature_operating_states") || []).find((entry: any) => entry.feature_key === "SPECIAL_GACHA")?.state || "CLOSED";
    if (isSpecial && specialState !== "OPEN") return { data: null, error: { message: "special gacha is closed" } };
    const histories = client.getStorage("gacha_execution_history") || [];
    const prior = histories.find((entry: any) => entry.user_id === p_user_id && entry.request_id === p_request_id);
    if (prior) {
      if (prior.gacha_id !== p_gacha_id || prior.payment_source !== p_currency_type || prior.pull_count !== p_pull_count) return { data: null, error: { message: "request_id was already used for a different gacha request" } };
      return prior.result_payload ? { data: prior.result_payload, error: null } : { data: null, error: { message: "gacha request is already in progress" } };
    }

    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === p_user_id);
    const gachas = client.getStorage("gacha_masters") || [];
    const gacha = gachas.find((entry: any) => entry.id === p_gacha_id && (entry.gacha_type === "SKILL" || entry.gacha_type === "EQUIPMENT"));
    const pool = (client.getStorage("gacha_items_master") || []).filter((entry: any) => entry.gacha_id === p_gacha_id && entry.item_id);
    if (!user || !gacha || pool.length === 0) return { data: null, error: { message: "ガチャ設定が見つかりません。" } };

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const claims = client.getStorage("user_daily_gacha_claims") || [];
    if (p_currency_type === "free") {
      const claim = claims.find((entry: any) => entry.user_id === p_user_id && entry.gacha_type === gacha.gacha_type);
      if (claim?.last_claimed_date === today) return { data: null, error: { message: "本日の無料ガチャは受取済みです。" } };
      if (claim) claim.last_claimed_date = today;
      else claims.push({ user_id: p_user_id, gacha_type: gacha.gacha_type, last_claimed_date: today });
    } else if (p_currency_type === "cash" || p_currency_type === "diamonds") {
      const field = p_currency_type === "cash" ? "cash" : "neon_diamonds";
      const unitCost = Number(p_currency_type === "cash" ? gacha.cost_cash : gacha.cost_diamond);
      const cost = unitCost * p_pull_count;
      if (!Number.isFinite(unitCost) || unitCost < 0 || Number(user[field] || 0) < cost) return { data: null, error: { message: "ガチャ通貨が不足しています。" } };
      user[field] = Number(user[field] || 0) - cost;
    } else if (p_currency_type === "ticket") {
      const items = client.getStorage("user_items") || [];
      const ticketItemId = gacha.gacha_type === "SKILL"
        ? (isSpecial ? "SPECIAL_TICKET_SKILL" : "NORMAL_GACHA_TICKET_SKILL")
        : (isSpecial ? "SPECIAL_TICKET_EQUIPMENT" : "NORMAL_GACHA_TICKET_EQUIPMENT");
      const ticket = items.find((entry: any) => entry.user_id === p_user_id && entry.item_id === ticketItemId);
      if (!ticket || Number(ticket.quantity || 0) < p_pull_count) return { data: null, error: { message: "ガチャチケットが不足しています。" } };
      ticket.quantity -= p_pull_count;
      client.setStorage("user_items", items);
    } else {
      return { data: null, error: { message: "通貨種別が不正です。" } };
    }

    const rates = isSpecial ? [{ rarity: "R", weight: 60 }, { rarity: "SR", weight: 35 }, { rarity: "SSR", weight: 5 }] : [{ rarity: "N", weight: 50 }, { rarity: "R", weight: 40 }, { rarity: "SR", weight: 10 }];
    const pickRarity = () => {
      let roll = Math.random() * 100;
      return (rates.find(entry => (roll -= entry.weight) <= 0) || rates[rates.length - 1]).rarity;
    };
    const results: { type: "SKILL" | "EQUIPMENT"; item_id: string; rarity: string; outcome: "new" | "limit_break" | "converted" }[] = [];
    const skills = client.getStorage("user_skills") || [];
    const equipments = client.getStorage("user_equipments") || [];
    const items = client.getStorage("user_items") || [];
    for (let index = 0; index < p_pull_count; index += 1) {
      const rarity = pickRarity();
      const bucket = pool.filter((entry: any) => entry.rarity === rarity);
      if (bucket.length === 0) return { data: null, error: { message: "gacha bucket is empty" } };
      const picked = bucket[Math.floor(Math.random() * bucket.length)];
      if (gacha.gacha_type === "SKILL") {
        const existing = skills.find((entry: any) => entry.user_id === p_user_id && entry.skill_card_id === picked.item_id);
        if (!existing) {
          skills.push({ id: `mock_skill_${Date.now()}_${index}`, user_id: p_user_id, skill_card_id: picked.item_id, plus_val: 0 });
          results.push({ type: "SKILL", item_id: picked.item_id, rarity, outcome: "new" });
        } else if (Number(existing.plus_val || 0) < 10) {
          existing.plus_val = Number(existing.plus_val || 0) + 1;
          results.push({ type: "SKILL", item_id: picked.item_id, rarity, outcome: "limit_break" });
        } else {
          const manual = items.find((entry: any) => entry.user_id === p_user_id && entry.item_id === "SKILL_MANUAL");
          if (manual) manual.quantity = Number(manual.quantity || 0) + 2;
          else items.push({ user_id: p_user_id, item_id: "SKILL_MANUAL", quantity: 2 });
          results.push({ type: "SKILL", item_id: picked.item_id, rarity, outcome: "converted" });
        }
      } else {
        equipments.push({ id: `mock_equipment_${Date.now()}_${index}`, user_id: p_user_id, equipment_id: picked.item_id, level: 1, plus_val: 0, random_options: [] });
        results.push({ type: "EQUIPMENT", item_id: picked.item_id, rarity, outcome: "new" });
      }
    }
    client.setStorage("users", users);
    client.setStorage("user_daily_gacha_claims", claims);
    client.setStorage("user_skills", skills);
    client.setStorage("user_equipments", equipments);
    recordMockFunnelMilestone(client, p_user_id, "first_gacha", { source: gacha.gacha_type === "SKILL" ? "skill_gacha" : "equipment_gacha" });
    const tutorialComplete = (client.getStorage("tutorial_progress") || [])
      .some((entry: any) => entry.user_id === p_user_id && (
        entry.step_id === "AUTHENTICATION"
        || (entry.step_id === "COMPLETE" && entry.authentication_pending === true)
      ));
    if (tutorialComplete && p_currency_type === "free" && p_pull_count === 10) {
      if (p_gacha_id === "SKILL_NORMAL") {
        recordMockLifetimeMilestone(client, p_user_id, "first_free_skill_ten_pull", { gachaId: p_gacha_id, requestId: p_request_id, pullCount: 10 });
      } else if (p_gacha_id === "EQUIP_NORMAL") {
        recordMockLifetimeMilestone(client, p_user_id, "first_free_equipment_ten_pull", { gachaId: p_gacha_id, requestId: p_request_id, pullCount: 10 });
      }
    }
    if (p_currency_type !== "free" && (p_gacha_id === "SKILL_SPECIAL" || p_gacha_id === "EQUIP_SPECIAL")) {
      const pityPoints = client.getStorage("user_gacha_pity_points") || [];
      const pity = pityPoints.find((entry: any) => entry.user_id === p_user_id && entry.pity_master_id === "pity_special_common");
      if (pity) pity.current_points = Number(pity.current_points || 0) + p_pull_count;
      else pityPoints.push({ user_id: p_user_id, pity_master_id: "pity_special_common", current_points: p_pull_count });
      client.setStorage("user_gacha_pity_points", pityPoints);
    }
    const response = { status: "success", request_id: p_request_id, results, cash: user.cash, diamonds: user.neon_diamonds };
    histories.push({ user_id: p_user_id, request_id: p_request_id, gacha_id: p_gacha_id, payment_source: p_currency_type, pull_count: p_pull_count, status: "COMPLETED", result_payload: response });
    client.setStorage("gacha_execution_history", histories);
    if (p_currency_type === "free" && ["SKILL_NORMAL", "EQUIP_NORMAL"].includes(p_gacha_id) && p_pull_count === 10) {
      evaluateMockMissionProgress(client, p_user_id, "GACHA_PULL", 1);
    }
    return { data: response, error: null };
  }

  if (funcName === "execute_gacha") {
    const { p_user_id, p_currency_type, p_currency_cost, p_results } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) return { error: { message: "ユーザーが存在しません。" } };
    
    if (p_currency_type === "cash") {
      if (user.cash < p_currency_cost) return { error: { message: "キャッシュが不足しています。" } };
      user.cash -= p_currency_cost;
    } else if (p_currency_type === "diamonds") {
      if (user.neon_diamonds < p_currency_cost) return { error: { message: "ダイヤが不足しています。" } };
      user.neon_diamonds -= p_currency_cost;
    } else if (p_currency_type === "free") {
      // do nothing
    } else if (p_currency_type === "ticket") {
      const items = client.getStorage("user_items") || [];
      const ticket = items.find((i: any) => i.user_id === p_user_id && i.item_id === "NORMAL_GACHA_TICKET_CHARACTER");
      if (!ticket || ticket.quantity < p_currency_cost) return { error: { message: "ガチャチケットが不足しています。" } };
      ticket.quantity -= p_currency_cost;
      client.setStorage("user_items", items);
    } else {
      return { error: { message: "不正な通貨タイプです。" } };
    }
    
    if (p_currency_type !== "free") {
       user.special_pity_points = (user.special_pity_points || 0) + p_results.length;
    }
    
    client.setStorage("users", users);
    
    const items = client.getStorage("user_items") || [];
    const characters = client.getStorage("user_characters") || [];
    
    for (const res of p_results) {
      if (res.type === "character") {
        const existingChar = characters.find((c: any) => c.user_id === p_user_id && c.character_id === res.character_id);
        if (existingChar) {
          const dupItemId = "CHAR_EXP_M";
          const existingItem = items.find((i: any) => i.user_id === p_user_id && i.item_id === dupItemId);
          if (existingItem) {
             existingItem.quantity += 5;
          } else {
             items.push({ id: `ui_${Date.now()}_${Math.random()}`, user_id: p_user_id, item_id: dupItemId, quantity: 5 });
          }
        } else {
          characters.push({
            id: `uc_${Date.now()}_${Math.random()}`,
            user_id: p_user_id,
            character_id: res.character_id,
            level: 1,
            awakening_level: 0
          });
        }
      } else if (res.type === "item") {
         const existingItem = items.find((i: any) => i.user_id === p_user_id && i.item_id === res.item_id);
         if (existingItem) {
            existingItem.quantity += res.quantity;
         } else {
            items.push({ id: `ui_${Date.now()}_${Math.random()}`, user_id: p_user_id, item_id: res.item_id, quantity: res.quantity });
         }
      }
    }
    
    client.setStorage("user_items", items);
    client.setStorage("user_characters", characters);
    
    return { data: { status: "success" }, error: null };
  }


  if (funcName === "create_guild_v2") {
    const { p_user_id, p_guild_name, p_creation_cost } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    const cleanName = String(p_guild_name || "").trim();
    const members = client.getStorage("guild_members") || [];
    if (!user || Number(user.level || 1) < 5 || user.cash < p_creation_cost || p_creation_cost !== 500 || Array.from(cleanName).length < 1 || Array.from(cleanName).length > 12) return { error: { message: "Guild creation requirements are not met" } };
    if (user.guild_id || members.some((member: any) => member.user_id === p_user_id)) return { error: { message: "Leave the current guild before creating another guild" } };
    
    const guilds = client.getStorage("guilds") || [];
    if (guilds.some((g: any) => !g.is_disbanded && String(g.name).trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
       return { error: { message: "このギルド名は既に登録されています。" } };
    }
    
    const newGuildId = "guild_" + Date.now();
    const newGuild = {
      id: newGuildId,
      name: cleanName,
      leader_id: p_user_id,
      level: 1,
      xp: 0,
      funds: 0,
      recruitment_mode: "OPEN_JOIN",
      approval_required: false,
      created_at: new Date().toISOString()
    };
    guilds.push(newGuild);
    
    members.push({
      id: "gm_" + Date.now(),
      guild_id: newGuildId,
      user_id: p_user_id,
      role: "MASTER",
      joined_at: new Date().toISOString()
    });
    
    user.cash -= p_creation_cost;
    user.guild_id = newGuildId;
    
    client.setStorage("users", users);
    client.setStorage("guilds", guilds);
    client.setStorage("guild_members", members);
    
    executeMockRpc(client, "evaluate_mission_progress", { p_user_id, p_trigger_type: "GUILD_JOIN", p_progress_increment: 1 });
    return { data: { status: "success", guild_id: newGuildId }, error: null };
  }

  if (funcName === "join_guild") {
    const { p_guild_id } = params;
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === currentUserId);
    const guilds = client.getStorage("guilds") || [];
    const guild = guilds.find((entry: any) => entry.id === p_guild_id);
    const members = client.getStorage("guild_members") || [];
    const memberLimit = guild?.member_limit || (guild?.level >= 5 ? 20 : guild?.level === 4 ? 17 : guild?.level === 3 ? 14 : guild?.level === 2 ? 12 : 10);
    const leftAt = user?.last_guild_left_at ? new Date(user.last_guild_left_at).getTime() : 0;
    if (leftAt > 0 && Date.now() - leftAt < 24 * 60 * 60 * 1000) {
      return { data: null, error: { code: "P0001", details: "GUILD_JOIN_COOLDOWN_ACTIVE", message: "Guild rejoin cooldown is active" } };
    }
    if (!user || user.level < 3 || !guild || guild.is_disbanded || (guild.recruitment_mode || (guild.approval_required ? "APPLICATION_REQUIRED" : "OPEN_JOIN")) !== "OPEN_JOIN" || members.some((entry: any) => entry.user_id === currentUserId)
      || members.filter((entry: any) => entry.guild_id === p_guild_id).length >= memberLimit) {
      return { data: null, error: { message: "Guild joining requirements are not met" } };
    }
    members.push({ id: `gm_${Date.now()}`, guild_id: p_guild_id, user_id: currentUserId, role: "MEMBER", weekly_contribution: 0, total_contribution: 0 });
    user.guild_id = p_guild_id;
    client.setStorage("guild_members", members);
    client.setStorage("users", users);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "limit_break_gear_v2") {
    const { p_user_id, p_equipment_id, p_cash_cost, p_use_wildcard, p_dupe_id, p_new_options } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || user.cash < p_cash_cost) return { error: { message: "キャッシュが不足しています。" } };
    
    if (p_use_wildcard) {
      const items = client.getStorage("user_items");
      const hammerItem = items.find((i: any) => i.user_id === p_user_id && i.item_id === "EQUIP_LB_PART");
      if (!hammerItem || hammerItem.quantity < 1) return { error: { message: "万能カスタムツールが不足しています。" } };
      hammerItem.quantity -= 1;
      client.setStorage("user_items", items);
    } else {
      const equips = client.getStorage("user_equipments");
      const dupeIdx = equips.findIndex((e: any) => e.id === p_dupe_id && e.user_id === p_user_id);
      if (dupeIdx === -1) return { error: { message: "同名の予備装備品が見つかりません。" } };
      equips.splice(dupeIdx, 1);
      client.setStorage("user_equipments", equips);
    }
    
    const equips = client.getStorage("user_equipments");
    const equip = equips.find((e: any) => e.id === p_equipment_id && e.user_id === p_user_id);
    if (!equip) return { error: { message: "対象装備が存在しません。" } };
    
    user.cash -= p_cash_cost;
    equip.plus_val = (equip.plus_val || 0) + 1;
    if (p_new_options) equip.random_options = p_new_options;
    
    client.setStorage("users", users);
    client.setStorage("user_equipments", equips);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "limit_break_skill_v2") {
    const { p_user_id, p_skill_id, p_cash_cost, p_use_wildcard, p_dupe_id, p_wildcard_item_id } = params;
    const users = client.getStorage("users");
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || user.cash < p_cash_cost) return { error: { message: "キャッシュが不足しています。" } };
    
    if (p_use_wildcard) {
      const items = client.getStorage("user_items");
      const bookItem = items.find((i: any) => i.user_id === p_user_id && i.item_id === p_wildcard_item_id);
      if (!bookItem || bookItem.quantity < 1) return { error: { message: "限界突破の書が不足しています。" } };
      bookItem.quantity -= 1;
      client.setStorage("user_items", items);
    } else {
      const skills = client.getStorage("user_skills");
      const dupeIdx = skills.findIndex((s: any) => s.id === p_dupe_id && s.user_id === p_user_id);
      if (dupeIdx === -1) return { error: { message: "同名の予備スキルカードが見つかりません。" } };
      skills.splice(dupeIdx, 1);
      client.setStorage("user_skills", skills);
    }
    
    const skills = client.getStorage("user_skills");
    const skill = skills.find((s: any) => s.id === p_skill_id && s.user_id === p_user_id);
    if (!skill) return { error: { message: "対象スキルが存在しません。" } };
    
    user.cash -= p_cash_cost;
    skill.plus_val = (skill.plus_val || 0) + 1;
    
    client.setStorage("users", users);
    client.setStorage("user_skills", skills);
    return { data: { status: "success" }, error: null };
  }


  if (funcName === "update_guild_alignment") {
    const { p_guild_id, p_main, p_sub } = params;
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const members = client.getStorage("guild_members") || [];
    const membership = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === currentUserId);
    if (!["MASTER", "SUB_MASTER", "SUBMASTER"].includes(membership?.role) || !["JUSTICE", "EVIL", "ORDER", "CHAOS"].includes(p_main) || !["JUSTICE", "EVIL", "ORDER", "CHAOS"].includes(p_sub)) {
      return { data: null, error: { message: "Invalid guild alignment" } };
    }
    const guilds = client.getStorage("guilds") || [];
    const g = guilds.find((x: any) => x.id === p_guild_id);
    if (g) {
      g.main_alignment = p_main;
      g.sub_alignment = p_sub;
      client.setStorage("guilds", guilds);
    }
    return { data: { status: "success" }, error: null };
  }
  if (funcName === "leave_guild") {
    const { p_user_id, p_guild_id, p_is_master, p_has_others } = params;
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const members = client.getStorage("guild_members") || [];
    const membership = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === currentUserId);
    const hasOtherMembers = members.some((member: any) => member.guild_id === p_guild_id && member.user_id !== currentUserId);
    if (p_user_id !== currentUserId || !membership || (membership.role === "MASTER" && hasOtherMembers)) {
      return { data: null, error: { message: "Invalid guild leave" } };
    }
    if (membership.role === "MASTER") {
      const guilds = client.getStorage("guilds") || [];
      client.setStorage("guilds", guilds.filter((g: any) => g.id !== p_guild_id));
    } else {
      client.setStorage("guild_members", members.filter((member: any) => member.user_id !== p_user_id || member.guild_id !== p_guild_id));
    }
    const users = client.getStorage("users") || [];
    const u = users.find((x: any) => x.id === p_user_id);
    if (u) {
      u.last_guild_left_at = new Date().toISOString();
      u.guild_id = null;
      client.setStorage("users", users);
    }
    return { data: { status: "success" }, error: null };
  }
  if (funcName === "transfer_guild_leader") {
    const { p_guild_id, p_old_id, p_new_id } = params;
    const members = client.getStorage("guild_members") || [];
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const oldM = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === p_old_id);
    const newM = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === p_new_id);
    if (currentUserId !== p_old_id || p_old_id === p_new_id || oldM?.role !== "MASTER" || !newM) {
      return { data: null, error: { message: "Invalid guild leadership transfer" } };
    }
    if (oldM) oldM.role = "SUB_MASTER";
    if (newM) newM.role = "MASTER";
    client.setStorage("guild_members", members);
    
    const guilds = client.getStorage("guilds") || [];
    const g = guilds.find((x: any) => x.id === p_guild_id);
    if (g) {
      g.leader_id = p_new_id;
      client.setStorage("guilds", guilds);
    }
    return { data: { status: "success" }, error: null };
  }
  if (funcName === "set_guild_member_role") {
    const { p_guild_id, p_target_user_id, p_new_role } = params;
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const members = client.getStorage("guild_members") || [];
    const actor = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === currentUserId);
    const target = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === p_target_user_id);
    if (actor?.role !== "MASTER" || !target || target.role === "MASTER" || p_target_user_id === currentUserId || !["MEMBER", "SUB_MASTER"].includes(p_new_role)) {
      return { data: null, error: { message: "Invalid guild role change" } };
    }
    target.role = p_new_role;
    client.setStorage("guild_members", members);
    return { data: { status: "success" }, error: null };
  }
  if (funcName === "kick_guild_member") {
    const { p_guild_id, p_user_id } = params;
    const members = client.getStorage("guild_members") || [];
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const actor = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === currentUserId);
    const target = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === p_user_id);
    const isAllowed = (actor?.role === "MASTER" && ["SUB_MASTER", "MEMBER"].includes(target?.role))
      || (actor?.role === "SUB_MASTER" && target?.role === "MEMBER");
    if (!isAllowed || p_user_id === currentUserId) {
      return { data: null, error: { message: "Insufficient guild member removal permission" } };
    }
    client.setStorage("guild_members", members.filter((m: any) => m.user_id !== p_user_id || m.guild_id !== p_guild_id));
    
    const users = client.getStorage("users") || [];
    const u = users.find((x: any) => x.id === p_user_id);
    if (u) {
      u.last_guild_left_at = new Date().toISOString();
      u.guild_id = null;
      client.setStorage("users", users);
    }
    return { data: { status: "success" }, error: null };
  }
  if (funcName === "update_guild_settings") {
    const { p_guild_id, p_desc, p_approval, p_kick_days } = params;
    const guilds = client.getStorage("guilds") || [];
    const g = guilds.find((x: any) => x.id === p_guild_id);
    if (g) {
      g.description = p_desc;
      g.approval_required = p_approval;
      g.auto_kick_days = p_kick_days;
      client.setStorage("guilds", guilds);
    }
    return { data: { status: "success" }, error: null };
  }
  if (funcName === "update_guild_recruitment") {
    const { p_guild_id, p_description, p_mode } = params;
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const members = client.getStorage("guild_members") || [];
    const actor = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === currentUserId);
    if (!actor || !["MASTER", "SUB_MASTER"].includes(actor.role) || !["OPEN_JOIN", "APPLICATION_REQUIRED", "CLOSED"].includes(p_mode)) {
      return { data: null, error: { message: "Guild setting permission required" } };
    }
    const guilds = client.getStorage("guilds") || [];
    const guild = guilds.find((entry: any) => entry.id === p_guild_id);
    if (!guild) return { data: null, error: { message: "Guild not found" } };
    guild.description = String(p_description || "").trim();
    guild.recruitment_mode = p_mode;
    guild.approval_required = p_mode === "APPLICATION_REQUIRED";
    client.setStorage("guilds", guilds);
    return { data: { status: "success", mode: p_mode }, error: null };
  }
  if (funcName === "equip_guild_decoration") {
    const { p_guild_id, p_type, p_item_id } = params;
    const guilds = client.getStorage("guilds") || [];
    const members = client.getStorage("guild_members") || [];
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const membership = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === currentUserId);
    if (membership?.role !== "MASTER") {
      return { data: null, error: { message: "Only the guild master can change guild page items" } };
    }
    const g = guilds.find((x: any) => x.id === p_guild_id);
    if (g) {
      const ownedItems = p_type === "DECORATION" ? g.unlocked_decorations : g.unlocked_banners;
      if (p_type !== "DECORATION" && p_type !== "BANNER") {
        return { data: null, error: { message: "Invalid guild item type" } };
      }
      if (p_item_id !== null && !(Array.isArray(ownedItems) && ownedItems.includes(p_item_id))) {
        return { data: null, error: { message: "Guild item is not owned" } };
      }
      if (p_type === "DECORATION") g.equipped_decoration = p_item_id;
      else g.equipped_banner = p_item_id;
      client.setStorage("guilds", guilds);
    }
    return { data: { status: "success" }, error: null };
  }


  if (funcName === "buy_guild_decoration_v2") {
    const { p_guild_id, p_type, p_item_id, p_cost } = params;
    const guildShopPrices: Record<string, number> = {
      bg_neon_kabukicho: 5000,
      bg_industrial_docks: 10000,
      banner_neon_reign: 3000,
      banner_kabukicho_king: 8000
    };
    const guilds = client.getStorage("guilds") || [];
    const members = client.getStorage("guild_members") || [];
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const membership = members.find((member: any) => member.guild_id === p_guild_id && member.user_id === currentUserId);
    if (membership?.role !== "MASTER" && membership?.role !== "SUB_MASTER") {
      return { data: null, error: { message: "Only guild masters and submasters can purchase guild items" } };
    }
    const expectedCost = guildShopPrices[p_item_id];
    const isValidType = (p_type === "DECORATION" && ["bg_neon_kabukicho", "bg_industrial_docks"].includes(p_item_id))
      || (p_type === "BANNER" && ["banner_neon_reign", "banner_kabukicho_king"].includes(p_item_id));
    if (!isValidType || typeof p_cost !== "number" || p_cost !== expectedCost) {
      return { data: null, error: { message: "Invalid guild item purchase" } };
    }
    const g = guilds.find((x: any) => x.id === p_guild_id);
    if (!g || (g.funds || 0) < p_cost) return { error: { message: "ギルド資金が不足しています。" } };
    
    if (p_type === "DECORATION") {
      const list = Array.isArray(g.unlocked_decorations) ? g.unlocked_decorations : [];
      if (list.includes(p_item_id)) return { error: { message: "このアイテムは既に購入済みです。" } };
      g.unlocked_decorations = [...list, p_item_id];
    } else {
      const list = Array.isArray(g.unlocked_banners) ? g.unlocked_banners : [];
      if (list.includes(p_item_id)) return { error: { message: "このアイテムは既に購入済みです。" } };
      g.unlocked_banners = [...list, p_item_id];
    }
    g.funds -= p_cost;
    client.setStorage("guilds", guilds);
    return { data: { status: "success" }, error: null };
  }


  if (funcName === "use_energy_drink") {
    const p_user_id = params.p_user_id || (typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid"));
    const items = client.getStorage("user_items") || [];
    const drink = items.find((i: any) => i.user_id === p_user_id && i.item_id === "ENERGY_DRINK");
    if (!drink || drink.quantity < 1) return { error: { message: "エナジードリンクを所持していません。" } };
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) return { error: { message: "ユーザーが存在しません。" } };
    if (!canUseEnergyDrink(Number(user.vitality || 0))) return { error: { message: "スタミナ上限を超えるため使用できません。" } };
    drink.quantity -= 1;
    user.vitality = Number(user.vitality || 0) + 50;
    
    client.setStorage("user_items", items);
    client.setStorage("users", users);
    return { data: { status: "success", quantity: drink.quantity, vitality: user.vitality }, error: null };
  }

  if (funcName === "add_test_diamonds") {
    const { p_user_id, p_amount } = params;
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (user) user.neon_diamonds = (user.neon_diamonds || 0) + (p_amount || 50);
    client.setStorage("users", users);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "claim_present") {
    const { p_present_id } = params;
    const p_user_id = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const presents = client.getStorage("presents") || [];
    const p = presents.find((x: any) => x.id === p_present_id && x.user_id === p_user_id && x.status === "UNCLAIMED");
    if (!p) return { error: { message: "プレゼントが見つからないか、既に受け取り済みです。" } };
    
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) return { error: { message: "User not found" } };
    
    if (p.item_id === "CASH") user.cash = (user.cash || 0) + p.quantity;
    else if (p.item_id === "DIA" || p.item_id === "DIAMOND") user.neon_diamonds = (user.neon_diamonds || 0) + p.quantity;
    else if (CANONICAL_EQUIPMENTS.some((master) => master.equipment_id === p.item_id)) {
      const equips = client.getStorage("user_equipments") || [];
      equips.push({
        id: "equip_" + Date.now(),
        user_id: p_user_id,
        equipment_master_id: p.item_id,
        level: 1,
        plus_val: 0
      });
      client.setStorage("user_equipments", equips);
    } else {
      const items = client.getStorage("user_items") || [];
      const ex = items.find((i: any) => i.user_id === p_user_id && i.item_id === p.item_id);
      if (ex) ex.quantity += p.quantity;
      else items.push({ id: "itm_" + Date.now(), user_id: p_user_id, item_id: p.item_id, quantity: p.quantity });
      client.setStorage("user_items", items);
    }
    
    p.status = "CLAIMED";
    p.claimed_at = new Date().toISOString();
    
    client.setStorage("users", users);
    client.setStorage("presents", presents);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "claim_all_presents") {
    const p_user_id = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const presents = client.getStorage("presents") || [];
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) return { error: { message: "User not found" } };
    let claimed = 0;
    presents.filter((x: any) => x.user_id === p_user_id && x.status === "UNCLAIMED").forEach((p: any) => {
      if (p.item_id === "CASH") user.cash = (user.cash || 0) + p.quantity;
      else if (p.item_id === "DIA" || p.item_id === "DIAMOND") user.neon_diamonds = (user.neon_diamonds || 0) + p.quantity;
      else if (CANONICAL_EQUIPMENTS.some((master) => master.equipment_id === p.item_id)) {
        const equips = client.getStorage("user_equipments") || [];
        equips.push({
          id: "equip_" + Date.now() + Math.random(),
          user_id: p_user_id,
          equipment_master_id: p.item_id,
          level: 1,
          plus_val: 0
        });
        client.setStorage("user_equipments", equips);
      } else {
        const items = client.getStorage("user_items") || [];
        const ex = items.find((i: any) => i.user_id === p_user_id && i.item_id === p.item_id);
        if (ex) ex.quantity += p.quantity;
        else items.push({ id: "itm_" + Date.now() + Math.random(), user_id: p_user_id, item_id: p.item_id, quantity: p.quantity });
        client.setStorage("user_items", items);
      }
      p.status = "CLAIMED";
      p.claimed_at = new Date().toISOString();
      claimed++;
    });
    client.setStorage("users", users);
    client.setStorage("presents", presents);
    return { data: { status: "success", claimed_count: claimed }, error: null };
  }

  if (funcName === "claim_mission_reward") {
    const { p_mission_id } = params;
    const p_user_id = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!p_user_id) return { data: null, error: { message: "authentication required", code: "42501" } };
    const userMissions = client.getStorage("user_missions") || [];
    const master = CANONICAL_MISSIONS.find((mission) => mission.id === p_mission_id && mission.isEnabled && mission.preopen);
    const um = userMissions.find((m: any) => m.user_id === p_user_id && m.mission_id === p_mission_id && m.status === "CLEAR");
    if (!um) return { error: { message: "ミッションが見つからないか未達成です。" } };
    if (!master) return { error: { message: "Canonical Mission Masterが見つかりません。" } };
    if (master.prerequisiteMissionId && !userMissions.some((row: any) => row.user_id === p_user_id && row.mission_id === master.prerequisiteMissionId && row.status === "CLAIMED")) {
      return { error: { message: "前提ミッションが未受取です。" } };
    }
    const claimKey = missionClaimKey(p_user_id, p_mission_id, um.cycle_date);
    const ledger = client.getStorage("mission_reward_delivery_ledger") || [];
    if (ledger.some((entry: any) => entry.claim_key === claimKey)) return { error: { message: "Mission reward was already delivered." } };
    const resolvedItemId = resolveCanonicalRewardItem(master.rewardItemId);
    const rewards = [
      ...(resolvedItemId && master.rewardQuantity > 0 ? [{ item_id: resolvedItemId, quantity: master.rewardQuantity }] : []),
      ...(master.cashReward > 0 ? [{ item_id: "CASH", quantity: master.cashReward }] : []),
    ];
    rewards.forEach((reward) => grantMockMissionReward(client, p_user_id, reward.item_id, reward.quantity));
    const deliveredAt = new Date().toISOString();
    um.status = "CLAIMED";
    um.claimed_at = deliveredAt;
    um.updated_at = deliveredAt;
    ledger.push({
      claim_key: claimKey,
      user_mission_id: um.id,
      user_id: p_user_id,
      mission_id: p_mission_id,
      cycle_date: um.cycle_date || null,
      resolved_item_id: resolvedItemId,
      item_quantity: master.rewardQuantity,
      cash_quantity: master.cashReward,
      delivery_status: "DELIVERED",
      delivered_at: deliveredAt,
    });
    unlockClaimedMissionChildren(canonicalMissionRows(), userMissions, p_user_id, p_mission_id, achievedFunnelTriggers(client, p_user_id));
    client.setStorage("user_missions", userMissions);
    client.setStorage("mission_reward_delivery_ledger", ledger);
    return { data: { status: "success", claimed: true, mission_id: p_mission_id, delivery: "DIRECT", rewards }, error: null };
  }

  if (funcName === "claim_all_mission_rewards") {
    const { p_mission_ids } = params;
    const p_user_id = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    if (!p_user_id) return { data: null, error: { message: "authentication required", code: "42501" } };
    const userMissions = client.getStorage("user_missions") || [];
    const candidates = userMissions.filter((um: any) => um.user_id === p_user_id && p_mission_ids.includes(um.mission_id) && um.status === "CLEAR");
    if (candidates.some((um: any) => !CANONICAL_MISSIONS.some((mission) => mission.id === um.mission_id && mission.isEnabled && mission.preopen))) {
      return { error: { message: "Canonical Mission Masterが見つかりません。" } };
    }
    const ledger = client.getStorage("mission_reward_delivery_ledger") || [];
    const duplicateClaim = candidates.find((um: any) => ledger.some((entry: any) => entry.claim_key === missionClaimKey(p_user_id, um.mission_id, um.cycle_date)));
    if (duplicateClaim) return { error: { message: "Mission reward was already delivered." } };
    let count = 0;
    const rewards: Array<{ mission_id: string; item_id: string; quantity: number }> = [];
    candidates.forEach((um: any) => {
        const master = CANONICAL_MISSIONS.find((mission) => mission.id === um.mission_id)!;
        if (master.prerequisiteMissionId && !userMissions.some((row: any) => row.user_id === p_user_id && row.mission_id === master.prerequisiteMissionId && row.status === "CLAIMED")) return;
        const resolvedItemId = resolveCanonicalRewardItem(master.rewardItemId);
        const missionRewards = [
          ...(resolvedItemId && master.rewardQuantity > 0 ? [{ mission_id: um.mission_id, item_id: resolvedItemId, quantity: master.rewardQuantity }] : []),
          ...(master.cashReward > 0 ? [{ mission_id: um.mission_id, item_id: "CASH", quantity: master.cashReward }] : []),
        ];
        missionRewards.forEach((reward) => grantMockMissionReward(client, p_user_id, reward.item_id, reward.quantity));
        rewards.push(...missionRewards);
        const deliveredAt = new Date().toISOString();
        um.status = "CLAIMED";
        um.claimed_at = deliveredAt;
        um.updated_at = deliveredAt;
        ledger.push({
          claim_key: missionClaimKey(p_user_id, um.mission_id, um.cycle_date),
          user_mission_id: um.id,
          user_id: p_user_id,
          mission_id: um.mission_id,
          cycle_date: um.cycle_date || null,
          resolved_item_id: resolvedItemId,
          item_quantity: master.rewardQuantity,
          cash_quantity: master.cashReward,
          delivery_status: "DELIVERED",
          delivered_at: deliveredAt,
        });
        unlockClaimedMissionChildren(canonicalMissionRows(), userMissions, p_user_id, um.mission_id, achievedFunnelTriggers(client, p_user_id));
        count++;
    });
    client.setStorage("user_missions", userMissions);
    client.setStorage("mission_reward_delivery_ledger", ledger);
    return { data: { status: "success", claimed_count: count, delivery: "DIRECT", rewards }, error: null };
  }

  if (funcName === "admin_reset_daily_missions") {
    const { p_user_id, p_mission_ids } = params;
    const userMissions = client.getStorage("user_missions") || [];
    userMissions.forEach((um: any) => {
      if (um.user_id === p_user_id && p_mission_ids.includes(um.mission_id)) {
        um.status = "PROGRESS";
        um.current_progress = 0;
        um.updated_at = new Date().toISOString();
      }
    });
    client.setStorage("user_missions", userMissions);
    return { data: { status: "success" }, error: null };
  }


  if (funcName === "get_canonical_quest_progression") {
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const firstClears = client.getStorage("user_quest_first_clears") || [];
    return { data: CANONICAL_QUESTS.map((quest) => {
      const encounter = generateCanonicalQuestEncounter(quest.questId, () => 0.37);
      const condition = quest.unlockCondition;
      const prerequisite = condition.type === "FIRST_CLEAR" ? condition.questId : null;
      const memberCharacters = encounter.members.map((member) => CANONICAL_CHARACTERS.find((entry) => entry.character_id === member.characterId)!);
      const recommendedPower = encounter.members.reduce((total,member,index) => { const stats=canonicalCharacterStats(memberCharacters[index].lv1,memberCharacters[index].lv100,member.level,member.awakening); return total+stats.hp+stats.atk+stats.def; },0);
      return { quest_id:encounter.questId, unlock_condition:condition.type === "OPEN" ? "OPEN" : `FIRST_CLEAR:${prerequisite}`, is_unlocked:condition.type === "OPEN" || firstClears.some((entry:any)=>entry.user_id===userId&&entry.quest_id===prerequisite), is_first_cleared:firstClears.some((entry:any)=>entry.user_id===userId&&entry.quest_id===encounter.questId), enemy_tactic:encounter.enemyTactic, enemy_member_count:encounter.members.length, enemy_members:[], enemy_attributes:[...new Set(memberCharacters.map((entry)=>entry.attribute))], recommended_level:encounter.members[0]?.level ?? null, recommended_power:recommendedPower };
    }), error:null };
  }

  if (funcName === "start_patrol") {
    const { p_course_id, p_character_id } = params;
    const currentUserId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === currentUserId);
    const ownedCharacters = client.getStorage("user_characters") || [];
    const owned = ownedCharacters.find((entry: any) => entry.user_id === currentUserId && (entry.id === p_character_id || entry.character_id === p_character_id));
    if (!user || !owned) return { data: null, error: { message: "所持していないキャラクターです。", code: "23503" } };

    const quests = client.getStorage("quests") || [];
    const quest = quests.find((entry: any) => entry.id === p_course_id);
    const canonicalQuest = canonicalQuestById(p_course_id);
    const firstClears = client.getStorage("user_quest_first_clears") || [];
    if (canonicalQuest?.unlockCondition.type === "FIRST_CLEAR" && !firstClears.some((entry: any) => entry.user_id === currentUserId && entry.quest_id === canonicalQuest.unlockCondition.questId)) return { data:null, error:{ message:"Quest is locked", code:"23514" } };
    const durationSeconds = Number(canonicalQuest?.durationSec ?? quest?.duration_seconds ?? 300);
    const costVitality = Number(canonicalQuest?.vitalityCost ?? quest?.cost_vitality ?? 3);
    if (user.vitality < costVitality) return { data: null, error: { message: "スタミナが不足しています。", code: "23514" } };

    const patrols = client.getStorage("user_patrols") || [];
    if (patrols.filter((entry: any) => entry.user_id === currentUserId && entry.status !== "COMPLETED").length >= 5) {
      return { data: null, error: { message: "派遣枠が埋まっています。", code: "23514" } };
    }
    const characterMasterId = owned.character_id;
    if (patrols.some((entry: any) => entry.user_id === currentUserId && entry.character_id === characterMasterId && entry.status !== "COMPLETED")) {
      return { data: null, error: { message: "このキャラクターは出撃中です。", code: "23505" } };
    }

    const hasBattle = true;
    const newId = `patrol_${Date.now()}`;
    const previous = [...patrols].reverse().find((entry: any) => entry.user_id === currentUserId && entry.course_id === p_course_id)?.encounter_snapshot?.partySignature ?? null;
    const encounterSnapshot = canonicalQuest ? generateCanonicalQuestEncounter(p_course_id, Math.random, previous) : null;
    patrols.push({
      id: newId,
      user_id: currentUserId,
      course_id: p_course_id,
      character_id: characterMasterId,
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + durationSeconds * 1000).toISOString(),
      status: "ONGOING",
      has_battle_event: hasBattle,
      battle_resolved: false,
      encounter_snapshot: encounterSnapshot,
    });
    user.vitality -= costVitality;
    client.setStorage("users", users);
    client.setStorage("user_patrols", patrols);
    return {
      data: {
        status: "success",
        patrol_id: newId,
        has_battle: hasBattle,
        duration_seconds: durationSeconds,
        cost_vitality: costVitality,
        remaining_vitality: user.vitality,
      },
      error: null,
    };
  }

  if (funcName === "start_patrol_v2") {
    const { p_user_id, p_course_id, p_character_id, p_duration_seconds, p_cost_vitality, p_battle_chance } = params;
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || user.vitality < p_cost_vitality) return { error: { message: "スタミナが不足しています。" } };
    
    const tutorialProgress = (client.getStorage("tutorial_progress") || []).find((entry: any) => entry.user_id === p_user_id);
    const has_battle = tutorialProgress?.step_id === "DISPATCH" || Math.random() <= (p_battle_chance || 0.2);
    const newId = "patrol_" + Date.now();
    const patrols = client.getStorage("user_patrols") || [];
    
    patrols.push({
      id: newId,
      user_id: p_user_id,
      course_id: p_course_id,
      character_id: p_character_id,
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + p_duration_seconds * 1000).toISOString(),
      status: "ONGOING",
      has_battle_event: has_battle,
      battle_resolved: false
    });
    
    user.vitality -= p_cost_vitality;
    client.setStorage("users", users);
    client.setStorage("user_patrols", patrols);
    return { data: { status: "success", patrol_id: newId, has_battle }, error: null };
  }

  if (funcName === "complete_patrol_v2") {
    const { p_user_id, p_patrol_id, p_cash, p_xp, p_course_name, p_reward_item_id, p_reward_qty, p_gear_dropped, p_is_victory, p_battle_reward_item_id, p_battle_reward_qty } = params;
    const patrols = client.getStorage("user_patrols") || [];
    const p = patrols.find((x: any) => x.id === p_patrol_id && x.user_id === p_user_id);
    if (p) p.status = "COMPLETED";
    
    const presents = client.getStorage("presents") || [];
    presents.push({
      id: Date.now(),
      user_id: p_user_id,
      item_id: "CASH",
      quantity: p_cash,
      message: `クエスト完了報酬 (${p_course_name}${p_is_victory ? '・バトル勝利' : ''})`,
      status: "UNCLAIMED"
    });
    
    if (p_reward_item_id && p_reward_qty > 0) {
      presents.push({
        id: Date.now() + 1,
        user_id: p_user_id,
        item_id: p_reward_item_id,
        quantity: p_reward_qty,
        message: `クエストドロップ報酬 (${p_course_name})`,
        status: "UNCLAIMED"
      });
    }
    
    if (p_gear_dropped) {
      presents.push({
        id: Date.now() + 2,
        user_id: p_user_id,
        item_id: "WEAPON_001",
        quantity: 1,
        message: `クエスト追加ドロップ装備 (${p_course_name})`,
        status: "UNCLAIMED"
      });
    }

    if (p_battle_reward_item_id && p_battle_reward_qty > 0) {
      presents.push({
        id: Date.now() + 3,
        user_id: p_user_id,
        item_id: p_battle_reward_item_id,
        quantity: p_battle_reward_qty,
        message: `クエストバトル勝利追加報酬 (${p_course_name})`,
        status: "UNCLAIMED"
      });
    }

    
    client.setStorage("user_patrols", patrols);
    client.setStorage("presents", presents);
    return { data: { status: "success" }, error: null };
  }


  if (funcName === "consume_pvp_point") {
    const { p_user_id } = params;
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user || user.pvp_points < 1) return { error: { message: "PvPポイントが不足しています。" } };
    
    if (user.pvp_points === 5) user.pvp_points_last_recovered_at = new Date().toISOString();
    user.pvp_points -= 1;
    client.setStorage("users", users);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "process_pvp_match_result_v2") {
    const { p_user_id, p_is_win, p_point_diff, p_cash_reward } = params;
    const ranks = client.getStorage("pvp_ranks") || [];
    let r = ranks.find((x: any) => x.user_id === p_user_id);
    if (!r) {
      r = { user_id: p_user_id, rank_points: 1000, daily_wins: 0, season_wins: 0 };
      ranks.push(r);
    }
    r.rank_points = Math.max(0, r.rank_points + p_point_diff);
    if (p_is_win) {
      r.daily_wins += 1;
      r.season_wins += 1;
    }
    client.setStorage("pvp_ranks", ranks);
    
    if (p_cash_reward > 0) {
      const users = client.getStorage("users") || [];
      const u = users.find((x: any) => x.id === p_user_id);
      if (u) {
        u.cash = (u.cash || 0) + p_cash_reward;
        client.setStorage("users", users);
      }
    }
    return { data: { status: "success" }, error: null };
  }

  // Duplicate record_raid_boss_damage_v2 handler removed (handled at L593)


  if (funcName === "process_gvg_battle_result_v2") {
    const { p_user_id, p_guild_id, p_base_id, p_is_practice, p_is_win } = params;
    if (p_is_practice) return { data: { status: "success", practice: true }, error: null };
    
    const seasonStatus = client.getStorage("gvg_season_status") || [{ id: 1, current_day: 1 }];
    const currentDay = seasonStatus[0].current_day;
    const isFinals = currentDay === 7;
    
    const matches = client.getStorage("gvg_matches") || [];
    const myMatch = matches.find((m: any) => m.status === "ONGOING" && m.is_finals === isFinals && (m.guild_a_id === p_guild_id || m.guild_b_id === p_guild_id));
    
    if (p_is_win) {
      if (myMatch) {
        if (myMatch.guild_a_id === p_guild_id) myMatch.guild_a_points = (myMatch.guild_a_points || 0) + 250;
        else myMatch.guild_b_points = (myMatch.guild_b_points || 0) + 250;
        client.setStorage("gvg_matches", matches);
      }
      
      const ranks = client.getStorage("user_gvg_ranks") || [];
      let r = ranks.find((x: any) => x.user_id === p_user_id);
      if (!r) { r = { user_id: p_user_id, season_points: 0 }; ranks.push(r); }
      r.season_points += 250;
      client.setStorage("user_gvg_ranks", ranks);
      
      const controls = client.getStorage("guild_base_controls") || [];
      let c = controls.find((x: any) => x.base_id === p_base_id && x.guild_id === p_guild_id);
      if (!c) { c = { base_id: p_base_id, guild_id: p_guild_id, daily_points: 0 }; controls.push(c); }
      c.daily_points += 250;
      client.setStorage("guild_base_controls", controls);
    } else {
      if (myMatch) {
        if (myMatch.guild_a_id === p_guild_id) {
          myMatch.guild_a_points = Math.max(0, (myMatch.guild_a_points || 0) - 100);
          myMatch.guild_b_points = (myMatch.guild_b_points || 0) + 100;
        } else {
          myMatch.guild_b_points = Math.max(0, (myMatch.guild_b_points || 0) - 100);
          myMatch.guild_a_points = (myMatch.guild_a_points || 0) + 100;
        }
        client.setStorage("gvg_matches", matches);
      }
      
      const ranks = client.getStorage("user_gvg_ranks") || [];
      let r = ranks.find((x: any) => x.user_id === p_user_id);
      if (!r) { r = { user_id: p_user_id, season_points: 0 }; ranks.push(r); }
      r.season_points = Math.max(0, r.season_points - 100);
      client.setStorage("user_gvg_ranks", ranks);
      
      const controls = client.getStorage("guild_base_controls") || [];
      let c = controls.find((x: any) => x.base_id === p_base_id && x.guild_id === p_guild_id);
      if (!c) { c = { base_id: p_base_id, guild_id: p_guild_id, daily_points: 0 }; controls.push(c); }
      c.daily_points = Math.max(0, c.daily_points - 100);
      client.setStorage("guild_base_controls", controls);
    }
    
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "process_gvg_battle_result_old") {
    const { p_guild_id, p_battle_id, p_points, p_is_guild_a } = params;
    const battles = client.getStorage("gvg_battles") || [];
    const b = battles.find((x: any) => x.id === p_battle_id);
    if (b) {
      if (p_is_guild_a) b.guild_a_points = (b.guild_a_points || 0) + p_points;
      else b.guild_b_points = (b.guild_b_points || 0) + p_points;
      client.setStorage("gvg_battles", battles);
    }
    return { data: { status: "success" }, error: null };
  }


  if (funcName === "admin_respawn_raid_boss") {
    const { p_boss_id, p_max_hp, p_base_id } = params;
    const bosses = client.getStorage("raid_bosses") || [];
    const b = bosses.find((x: any) => x.id === p_boss_id);
    if (b) {
      b.current_hp = p_max_hp;
      b.base_id = p_base_id;
      b.status = "ACTIVE";
      b.spawned_at = new Date().toISOString();
      b.expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      client.setStorage("raid_bosses", bosses);
    }
    client.setStorage("raid_damage_logs", []);
    client.setStorage("user_raid_claimed_rewards", []);
    return { data: { status: "success" }, error: null };
  }

  // --- Phase 3-B: Additional Mock Stubs ---

  if (funcName === "add_test_cash") {
    const { p_user_id, p_amount } = params;
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (user) user.cash = (user.cash || 0) + (p_amount || 10000);
    client.setStorage("users", users);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "add_user_vitality") {
    const { p_user_id, p_amount } = params;
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (user) user.vitality = Math.min((user.vitality || 0) + (p_amount || 100), 500);
    client.setStorage("users", users);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "update_favorite_character") {
    const { p_user_id, p_character_id } = params;
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (user) user.favorite_character_id = p_character_id;
    client.setStorage("users", users);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "buy_avatar_part") {
    const { p_user_id, p_currency_type, p_price } = params;
    const users = client.getStorage("users") || [];
    const user = users.find((u: any) => u.id === p_user_id);
    if (!user) return { error: { message: "User not found" } };
    if (p_currency_type === "CASH") {
      if (user.cash < p_price) return { error: { message: "キャッシュが不足しています。" } };
      user.cash -= p_price;
    } else {
      if ((user.neon_diamonds || 0) < p_price) return { error: { message: "ダイヤが不足しています。" } };
      user.neon_diamonds -= p_price;
    }
    client.setStorage("users", users);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "admin_update_guild") {
    const { p_guild_id, p_funds, p_level, p_xp } = params;
    const guilds = client.getStorage("guilds") || [];
    const guild = guilds.find((g: any) => g.id === p_guild_id);
    if (guild) {
      guild.funds = p_funds;
      guild.level = p_level;
      guild.xp = p_xp;
    }
    client.setStorage("guilds", guilds);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "admin_add_guild_funds") {
    const { p_guild_id, p_amount } = params;
    const guilds = client.getStorage("guilds") || [];
    const guild = guilds.find((g: any) => g.id === p_guild_id);
    if (guild) guild.funds = (guild.funds || 0) + p_amount;
    client.setStorage("guilds", guilds);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "admin_update_guild_finals") {
    const { p_guild_id, p_funds_add, p_decorations } = params;
    const guilds = client.getStorage("guilds") || [];
    const guild = guilds.find((g: any) => g.id === p_guild_id);
    if (guild) {
      guild.funds = (guild.funds || 0) + p_funds_add;
      guild.unlocked_decorations = p_decorations;
    }
    client.setStorage("guilds", guilds);
    return { data: { status: "success" }, error: null };
  }

  if (funcName === "sell_owned_equipment") {
    const { p_equipment_ids = [] } = params;
    const requestedIds = Array.from(new Set(p_equipment_ids));
    if (requestedIds.length === 0 || requestedIds.length !== p_equipment_ids.length) {
      return { data: null, error: { message: "invalid equipment selection" } };
    }
    const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
    const equipments = client.getStorage("user_equipments") || [];
    const sellable = equipments.filter((equipment: any) =>
      equipment.user_id === userId
      && requestedIds.includes(equipment.id)
      && !equipment.equipped_character_id
    );
    if (sellable.length !== requestedIds.length) {
      return { data: null, error: { message: "equipment is not owned or is currently equipped" } };
    }
    const soldIds = new Set(sellable.map((equipment: any) => equipment.id));
    client.setStorage("user_equipments", equipments.filter((equipment: any) => !soldIds.has(equipment.id)));
    const users = client.getStorage("users") || [];
    const user = users.find((entry: any) => entry.id === userId);
    const earnedCash = sellable.length * 500;
    if (user) user.cash = Number(user.cash || 0) + earnedCash;
    client.setStorage("users", users);
    return { data: { status: "success", sold_count: sellable.length, earned_cash: earnedCash, cash: user?.cash }, error: null };
  }

  if (funcName === "reset_daily_power_rankings") return { data: { status: "success" }, error: null };
  if (funcName === "reset_seasonal_power_rankings") return { data: { status: "success" }, error: null };

  console.warn(`[Mock RPC] Unhandled RPC call: ${funcName}`);
  return { data: null, error: null };
}

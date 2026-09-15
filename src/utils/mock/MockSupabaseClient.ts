"use client";

import { executeMockRpc } from "./mockRpc.ts";
import { resolveBattle, type Tactic } from "../../../supabase/functions/resolve-battle/engine.ts";
import { CANONICAL_MISSIONS } from "../../domain/gameplay/canonical/masters.ts";
import { DEFAULT_LOGIN_BONUS_MASTERS } from "../login_bonus_master_data.ts";

const isTactic = (value: unknown): value is Tactic => value === "ATTACK_PRIORITY" || value === "HEAL_PRIORITY" || value === "SKILL_PRIORITY" || value === "BALANCED" || value === "WEAKNESS_FOCUS";

export class MockSupabaseClient {
  private authSubscribers = new Set<(event: string, session: any) => void>();

  public getStorage(key: string, defaultVal: any = []) {
    if (typeof window === "undefined") return defaultVal;
    const data = localStorage.getItem(`mock_db_${key}`);
    if (data) return JSON.parse(data);
    if (key === "missions" || key === "mission_master") {
      return CANONICAL_MISSIONS.map((mission) => ({
        id: mission.id,
        category: mission.category,
        trigger_type: mission.triggerType,
        title: mission.title,
        description: mission.description,
        target_value: mission.targetValue,
        condition_params: { ...mission.conditionParams },
        reward_item_id: mission.rewardItemId,
        reward_quantity: mission.rewardQuantity,
        prerequisite_mission_id: mission.prerequisiteMissionId,
        display_order: mission.displayOrder,
        is_enabled: mission.isEnabled,
        is_repeatable: mission.isRepeatable,
        is_provisional: mission.isProvisional,
      }));
    }
    if (key === "login_bonus_master") return DEFAULT_LOGIN_BONUS_MASTERS.map((master) => ({ ...master }));
    return defaultVal;
  }

  public setStorage(key: string, val: any) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`mock_db_${key}`, JSON.stringify(val));
  }

  channel(name: string) {
    console.log(`[Mock DB Realtime] Creating channel: ${name}`);
    class MockChannelBuilder {
      on(event: string, filter: any, callback: any) {
        return this;
      }
      subscribe() {
        console.log(`[Mock DB Realtime] Subscribed to channel: ${name}`);
        return this;
      }
    }
    return new MockChannelBuilder();
  }

  removeChannel(channel: any) {
    console.log("[Mock DB Realtime] Removing channel");
    return { error: null };
  }

  auth = {
    getSession: async () => {
      if (typeof window === "undefined") return { data: { session: null } };
      const demoId = localStorage.getItem("tribe_demo_uuid");
      if (demoId) {
        const authMode = localStorage.getItem("mock_auth_mode") || "ANONYMOUS";
        const pendingEmail = localStorage.getItem("mock_pending_email");
        const overriddenProviders = JSON.parse(localStorage.getItem("mock_session_identity_providers") || "null") as string[] | null;
        const identityProviders = overriddenProviders || (authMode === "ANONYMOUS" ? [] : [authMode.toLowerCase()]);
        return {
          data: {
            session: {
              access_token: `mock:${demoId}:${authMode}`,
              refresh_token: `mock:${demoId}:${authMode}`,
              user: {
                id: demoId,
                email: `demo-${demoId.substring(0, 8)}@example.com`,
                is_anonymous: authMode === "ANONYMOUS",
                identities: identityProviders.map((provider) => ({ provider })),
                new_email: pendingEmail || undefined,
              }
            }
          }
        };
      }
      return { data: { session: null } };
    },
    onAuthStateChange: (callback: any) => {
      this.authSubscribers.add(callback);
      const initialSessionTimer = setTimeout(async () => {
        const { data } = await this.auth.getSession();
        if (this.authSubscribers.has(callback)) callback("INITIAL_SESSION", data.session);
      }, 50);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              clearTimeout(initialSessionTimer);
              this.authSubscribers.delete(callback);
            }
          }
        }
      };
    },
    signOut: async () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("tribe_demo_uuid");
      }
      return { error: null };
    },
    signInAnonymously: async () => {
      if (typeof window === "undefined") return { data: { session: null }, error: { message: "Browser storage is unavailable" } };
      let demoId = localStorage.getItem("tribe_demo_uuid");
      if (!demoId) {
        demoId = "00000000-0000-4000-8000-" + Math.floor(100000000000 + Math.random() * 900000000000).toString();
        localStorage.setItem("tribe_demo_uuid", demoId);
      }
      localStorage.setItem("mock_auth_mode", "ANONYMOUS");
      return {
        data: { session: { user: { id: demoId, is_anonymous: true, identities: [] } } },
        error: null
      };
    },
    signInWithPassword: async ({ email }: any) => {
      if (typeof window !== "undefined") {
        const identities = this.getStorage("auth_identities") || [];
        let demoId = identities.find((row: any) => row.provider === "email" && row.email?.toLowerCase() === email?.toLowerCase())?.user_id
          || localStorage.getItem("tribe_demo_uuid");
        if (!demoId) {
          demoId = "00000000-0000-4000-8000-" + Math.floor(100000000000 + Math.random() * 900000000000).toString();
        }
        localStorage.setItem("tribe_demo_uuid", demoId);
        localStorage.setItem("mock_auth_mode", "EMAIL");
      }
      const { data } = await this.auth.getSession();
      if (data.session) {
        for (const callback of this.authSubscribers) callback("SIGNED_IN", data.session);
      }
      return { data: { user: data.session?.user || {}, session: data.session }, error: null };
    },
    signInWithOAuth: async ({ options }: any = {}) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("mock_last_oauth_redirect_to", String(options?.redirectTo || ""));
        localStorage.setItem("mock_last_oauth_query_params", JSON.stringify(options?.queryParams || {}));
        const existingId = localStorage.getItem("mock_existing_google_user_id");
        const switchIntent = JSON.parse(localStorage.getItem("tribe_existing_google_login_intent") || "null");
        if (existingId && switchIntent?.method === "GOOGLE_SWITCH") {
          localStorage.setItem("mock_oauth_callback_user_id", existingId);
        } else {
          if (existingId) localStorage.setItem("tribe_demo_uuid", existingId);
          localStorage.setItem("mock_auth_mode", "GOOGLE");
        }
      }
      return { data: { provider: "google" }, error: null };
    },
    setSession: async ({ access_token }: any) => {
      if (typeof window === "undefined") return { data: { session: null }, error: { message: "Browser storage is unavailable" } };
      const tokenParts = String(access_token || "").replace(/^mock:/, "").split(":");
      const userId = tokenParts[0];
      const authMode = tokenParts[1] || "EMAIL";
      if (!userId) return { data: { session: null }, error: { message: "Invalid session" } };
      if (localStorage.getItem("mock_set_session_failure_user_id") === userId) {
        return { data: { session: null }, error: { message: "Mock session switch failed" } };
      }
      localStorage.setItem("tribe_demo_uuid", userId);
      localStorage.setItem("mock_auth_mode", authMode);
      const { data } = await this.auth.getSession();
      return { data, error: null };
    },
    signUp: async () => {
      return { data: { user: {} }, error: null };
    },
    updateUser: async ({ email, password }: any) => {
      if (typeof window === "undefined") return { data: { user: null }, error: { message: "Browser storage is unavailable" } };
      const userId = localStorage.getItem("tribe_demo_uuid");
      if (!email && password) {
        if ((localStorage.getItem("mock_auth_mode") || "ANONYMOUS") !== "EMAIL") {
          return { data: { user: null }, error: { message: "A verified email identity is required" } };
        }
        localStorage.setItem("mock_email_password_set", "true");
        const { data } = await this.auth.getSession();
        return { data: { user: data.session?.user || null }, error: null };
      }
      const identities = this.getStorage("auth_identities") || [];
      if (identities.some((identity: any) => identity.email?.toLowerCase() === email.toLowerCase() && identity.user_id !== userId)) {
        return { data: { user: null }, error: { message: "A user with this email address has already been registered", code: "email_exists" } };
      }
      if (localStorage.getItem("mock_email_confirmation_required") === "true") {
        localStorage.setItem("mock_pending_email", email);
        return { data: { user: { id: userId, email: null, new_email: email, is_anonymous: true, identities: [] } }, error: null };
      }
      const linkedUserId = localStorage.getItem("mock_email_link_user_id");
      if (linkedUserId && linkedUserId !== userId) {
        localStorage.setItem("tribe_demo_uuid", linkedUserId);
        localStorage.setItem("mock_auth_mode", "EMAIL");
        return { data: { user: { id: linkedUserId, email, is_anonymous: false, identities: [{ provider: "email", email }] } }, error: null };
      }
      localStorage.setItem("mock_auth_mode", "EMAIL");
      localStorage.removeItem("mock_pending_email");
      if (!identities.some((identity: any) => identity.user_id === userId && identity.provider === "email")) {
        identities.push({ user_id: userId, provider: "email", email });
        this.setStorage("auth_identities", identities);
      }
      return { data: { user: { id: userId, email, is_anonymous: false, identities: [{ provider: "email", email }] } }, error: null };
    },
    refreshSession: async () => this.auth.getSession(),
    exchangeCodeForSession: async () => {
      if (typeof window !== "undefined") {
        const delayMs = Number(localStorage.getItem("mock_oauth_exchange_delay_ms") || 0);
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        const callbackUserId = localStorage.getItem("mock_oauth_callback_user_id");
        if (callbackUserId) {
          localStorage.setItem("tribe_demo_uuid", callbackUserId);
          localStorage.setItem("mock_auth_mode", "GOOGLE");
        }
      }
      const { data } = await this.auth.getSession();
      return { data: { session: data.session, user: data.session?.user || null }, error: null };
    },
    linkIdentity: async ({ options }: any = {}) => {
      if (typeof window === "undefined") return { data: { provider: "google", url: null }, error: { message: "Browser storage is unavailable" } };
      localStorage.setItem("mock_last_oauth_redirect_to", String(options?.redirectTo || ""));
      if (localStorage.getItem("mock_manual_linking_disabled") === "true") {
        return { data: { provider: "google", url: null }, error: { message: "Manual linking is disabled", code: "manual_linking_disabled" } };
      }
      const userId = localStorage.getItem("tribe_demo_uuid");
      const identities = this.getStorage("auth_identities") || [];
      if (localStorage.getItem("mock_google_identity_collision") === "true" || identities.some((identity: any) => identity.provider === "google" && identity.user_id !== userId)) {
        return { data: { provider: "google", url: null }, error: { message: "Identity is already linked to another user", code: "identity_already_exists" } };
      }
      if (localStorage.getItem("mock_google_redirect_required") === "true") {
        return { data: { provider: "google", url: "https://accounts.google.test/oauth" }, error: null };
      }
      localStorage.setItem("mock_auth_mode", "GOOGLE");
      if (!identities.some((identity: any) => identity.user_id === userId && identity.provider === "google")) {
        identities.push({ user_id: userId, provider: "google" });
        this.setStorage("auth_identities", identities);
      }
      return { data: { provider: "google", url: null }, error: null };
    }
  };

  // Edge Function はローカル画面確認では外部呼び出しを行わない。
  // 本番相当の結果確定は Supabase Functions 側で実行する。
  functions = {
    invoke: async (functionName: string, options?: { body?: { replaySessionId?: string } }) => {
      if (functionName !== "resolve-battle" || !options?.body?.replaySessionId) return { data: null, error: null };
      const userId = typeof window === "undefined" ? null : localStorage.getItem("tribe_demo_uuid");
      const sessions = this.getStorage("battle_replay_sessions") || [];
      const session = sessions.find((entry: any) => entry.id === options.body?.replaySessionId);
      if (!session) return { data: null, error: { message: "Replay session was not found" } };
      if (!userId || session.requester_user_id !== userId) return { data: null, error: { message: "Replay session was not found" } };
      const finalizeMockPatrol = (winner: "PLAYER" | "ENEMY") => {
        if (session.battle_mode !== "QUEST" || !session.source_reference_id) return;
        const patrols = this.getStorage("user_patrols") || [];
        const patrol = patrols.find((entry: any) => entry.id === session.source_reference_id && entry.user_id === userId);
        if (!patrol) return;
        const progress = (this.getStorage("tutorial_progress") || []).find((entry: any) => entry.user_id === userId);
        if (winner === "ENEMY" && patrol.course_id === "q_shinjuku_1" && progress?.step_id === "TUTORIAL_BATTLE") return;
        patrol.battle_resolved = true;
        patrol.battle_result = winner === "PLAYER" ? "VICTORY" : "DEFEAT";
        this.setStorage("user_patrols", patrols);
      };
      if (session.status === "RESOLVED") {
        if (session.result?.winner === "PLAYER" || session.result?.winner === "ENEMY") finalizeMockPatrol(session.result.winner);
        return { data: session.result, error: null };
      }
      const isOfficialGvg = session.battle_mode === "GVG" && Boolean(session.source_reference_id);
      const isOfficialPatrol = session.battle_mode === "QUEST" && session.resolution_authority === "PATROL_SERVER" && Boolean(session.source_reference_id);
      if ((!isOfficialGvg && !isOfficialPatrol) || session.status !== "PENDING") {
        return { data: null, error: { message: "Only a pending official GvG or patrol replay can be resolved" } };
      }
      if (isOfficialGvg) {
        const attacks = this.getStorage("gvg_attack_logs") || [];
        const attack = attacks.find((entry: any) => entry.id === session.source_reference_id && entry.attacker_user_id === userId && entry.battle_result === "PENDING");
        if (!attack) return { data: null, error: { message: "The official GvG attack is not resolvable" } };
      }
      if (!isTactic(session.tactic_id) || !Array.isArray(session.player_snapshot) || !Array.isArray(session.enemy_snapshot)) {
        return { data: null, error: { message: "Replay session is not resolvable" } };
      }
      const result = resolveBattle(Number(session.random_seed) || 1, session.tactic_id, isOfficialGvg ? 20 : 15, session.player_snapshot, session.enemy_snapshot, session.enemy_tactic_id ?? undefined);
      session.status = "RESOLVED";
      session.result = result;
      this.setStorage("battle_replay_sessions", sessions);
      if (isOfficialPatrol) finalizeMockPatrol(result.winner);
      return { data: result, error: null };
    }
  };

  async rpc(funcName: string, params: any) {
    return executeMockRpc(this, funcName, params);
  }

  from(tableName: string) {
    const getStorage = this.getStorage.bind(this);
    const setStorage = this.setStorage.bind(this);

    class QueryBuilder {
      private filters: any[] = [];
      private selects: string = "*";
      private singleMode: boolean = false;
      private maybeSingleMode: boolean = false;
      private insertData: any = null;
      private updateData: any = null;
      private isDelete: boolean = false;
      private limitVal: number | null = null;
      private orderField: string | null = null;
      private orderAsc: boolean = true;
      private orFilters: string[] = [];

      select(fields: string = "*") {
        this.selects = fields;
        return this;
      }

      eq(field: string, val: any) {
        this.filters.push({ type: "eq", field, val });
        return this;
      }

      gte(field: string, val: any) {
        this.filters.push({ type: "gte", field, val });
        return this;
      }

      neq(field: string, val: any) {
        this.filters.push({ type: "neq", field, val });
        return this;
      }

      in(field: string, vals: any[]) {
        this.filters.push({ type: "in", field, vals });
        return this;
      }

      like(field: string, pattern: string) {
        this.filters.push({ type: "like", field, pattern });
        return this;
      }

      or(expression: string) {
        this.orFilters.push(expression);
        return this;
      }

      order(field: string, { ascending = true }: any = {}) {
        this.orderField = field;
        this.orderAsc = ascending;
        return this;
      }

      limit(n: number) {
        this.limitVal = n;
        return this;
      }

      single() {
        this.singleMode = true;
        return this;
      }

      maybeSingle() {
        this.maybeSingleMode = true;
        return this;
      }

      insert(data: any) {
        this.insertData = data;
        return this;
      }

      update(data: any) {
        this.updateData = data;
        return this;
      }

      upsert(data: any, options?: any) {
        this.insertData = data;
        return this;
      }

      delete() {
        this.isDelete = true;
        return this;
      }

      async then(resolve: any) {
        const table = getStorage(tableName);

        if (this.insertData) {
          const items = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
          const created = items.map((item: any) => ({
            id: item.id || `mock_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            created_at: new Date().toISOString(),
            ...item
          }));

          const updatedTable = [...table, ...created];
          setStorage(tableName, updatedTable);

          if (this.singleMode) {
            return resolve({ data: created[0], error: null });
          }
          return resolve({ data: Array.isArray(this.insertData) ? created : created[0], error: null });
        }

        if (this.updateData) {
          let updatedCount = 0;
          const updatedTable = table.map((row: any) => {
            let matches = true;
            for (const f of this.filters) {
              if (f.type === "eq" && row[f.field] !== f.val) matches = false;
              if (f.type === "neq" && row[f.field] === f.val) matches = false;
              if (f.type === "gte" && row[f.field] < f.val) matches = false;
            }
            if (matches) {
              updatedCount++;
              return { ...row, ...this.updateData, updated_at: new Date().toISOString() };
            }
            return row;
          });

          setStorage(tableName, updatedTable);
          return resolve({ data: updatedCount, error: null });
        }

        if (this.isDelete) {
          const updatedTable = table.filter((row: any) => {
            for (const f of this.filters) {
              if (f.type === "eq" && row[f.field] === f.val) return false;
              if (f.type === "neq" && row[f.field] !== f.val) return false;
              if (f.type === "gte" && row[f.field] < f.val) return false;
            }
            return true;
          });

          setStorage(tableName, updatedTable);
          return resolve({ data: null, error: null });
        }

        let filtered = table.filter((row: any) => {
          for (const f of this.filters) {
            if (f.type === "eq" && row[f.field] !== f.val) return false;
            if (f.type === "neq" && row[f.field] === f.val) return false;
            if (f.type === "gte" && row[f.field] < f.val) return false;
            if (f.type === "in" && !f.vals.includes(row[f.field])) return false;
            if (f.type === "like") {
              const expression = String(f.pattern)
                .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                .replace(/%/g, ".*")
                .replace(/_/g, ".");
              if (!new RegExp(`^${expression}$`).test(String(row[f.field] ?? ""))) return false;
            }
          }
          for (const expression of this.orFilters) {
            const groups = [...expression.matchAll(/and\(([^)]+)\)/g)];
            const matchesAnyGroup = groups.some((group) => group[1].split(",").every((condition) => {
              const [field, operator, ...valueParts] = condition.split(".");
              const value = valueParts.join(".");
              return operator === "eq" && String(row[field]) === value;
            }));
            if (!matchesAnyGroup) return false;
          }
          return true;
        });

        if (this.orderField) {
          filtered.sort((a: any, b: any) => {
            if (a[this.orderField!] < b[this.orderField!]) return this.orderAsc ? -1 : 1;
            if (a[this.orderField!] > b[this.orderField!]) return this.orderAsc ? 1 : -1;
            return 0;
          });
        }

        if (this.limitVal !== null) {
          filtered = filtered.slice(0, this.limitVal);
        }

        if (this.singleMode) {
          return resolve({ data: filtered[0] || null, error: filtered[0] ? null : { message: "No rows found" } });
        }

        if (this.maybeSingleMode) {
          return resolve({ data: filtered[0] || null, error: null });
        }

        return resolve({ data: filtered, error: null });
      }
    }

    return new QueryBuilder();
  }
}

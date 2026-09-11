"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase, usingMockSupabase } from "@/utils/supabase";
import {
  projectDirectMessageIdentities,
  type DirectMessageProfileRow,
  type DirectMessageRow,
} from "./directMessageConversations";

const GUILD_CHAT_REFRESH_TIMEOUT_MS = 12_000;

function getChatSendErrorMessage(error: unknown) {
  const message = String((error as { message?: unknown })?.message || "").toLowerCase();
  if (message.includes("reply target is unavailable")) {
    return "返信先が現在のチャンネルで利用できないため、返信を解除して送信してください。";
  }
  if (message.includes("chat cooldown is active")) {
    return "送信間隔が短すぎます。少し待ってからもう一度お試しください。";
  }
  if (message.includes("guild membership required")) {
    return "ギルドメンバーのみギルドチャットへ送信できます。";
  }
  if (message.includes("invalid chat message")) {
    return "メッセージは1〜140文字で入力してください。";
  }
  if (message.includes("jwt") || message.includes("session") || message.includes("auth")) {
    return "セッションを確認できませんでした。画面を更新して、もう一度お試しください。";
  }
  return "メッセージを送信できませんでした。入力内容を確認して、もう一度お試しください。";
}

export function useChat(
  session: any,
  username: string,
  userGuildMember: any,
  showTribeChatPanel: boolean,
  playCyberSe: (type: string) => void,
  setErrorMessage: (message: string) => void,
  refreshAfterGuildChat: (userId: string) => Promise<void>
) {
  const currentUserId = session?.user?.id as string | undefined;
  const [guildChats, setGuildChats] = useState<any[]>([]);
  const [chatChannel, setChatChannel] = useState<"GLOBAL" | "GUILD" | "DM">("GLOBAL");
  const [chatInput, setChatInput] = useState<string>("");
  const [chatReplyTo, setChatReplyTo] = useState<any | null>(null);
  const [chatSending, setChatSending] = useState<boolean>(false);
  const [chatCooldown, setChatCooldown] = useState<number>(0);
  const [activeUsersCount, setActiveUsersCount] = useState<number>(1);

  const [directMessages, setDirectMessages] = useState<any[]>([]);
  const [dmRecipientId, setDmRecipientId] = useState<string | null>(null);
  const [dmUnreadConversations, setDmUnreadConversations] = useState<Array<{ sender_id: string; sender_name: string; unread_count: number }>>([]);
  const [chatUnreadCounts, setChatUnreadCounts] = useState({ GLOBAL: 0, GUILD: 0 });

  const [bbsThreads, setBbsThreads] = useState<any[]>([]);
  const [bbsActiveThread, setBbsActiveThread] = useState<any | null>(null);
  const [bbsPosts, setBbsPosts] = useState<any[]>([]);
  const [bbsLoading, setBbsLoading] = useState<boolean>(false);
  const [bbsUnreadCounts, setBbsUnreadCounts] = useState<Record<string, number>>({});

  const refreshBbsUnreadCounts = useCallback(async () => {
    if (!session?.user?.id) {
      setBbsUnreadCounts({});
      return;
    }
    const { data, error } = await supabase.rpc("get_bbs_unread_counts");
    if (error) {
      console.warn("BBS unread count error:", error.message);
      return;
    }
    const nextCounts: Record<string, number> = {};
    for (const row of data || []) {
      nextCounts[row.thread_id] = Number(row.unread_count || 0);
    }
    setBbsUnreadCounts(nextCounts);
  }, [session?.user?.id]);

  const markBbsThreadRead = useCallback(async (threadId: string) => {
    if (!session?.user?.id || !threadId) return;
    const { error } = await supabase.rpc("mark_bbs_thread_read", { p_thread_id: threadId });
    if (error) {
      console.warn("BBS read update error:", error.message);
      return;
    }
    setBbsUnreadCounts((previous) => {
      if (!previous[threadId]) return previous;
      const next = { ...previous };
      delete next[threadId];
      return next;
    });
  }, [session?.user?.id]);

  useEffect(() => {
    void refreshBbsUnreadCounts();
  }, [refreshBbsUnreadCounts]);

  const refreshChatUnreadCounts = useCallback(async () => {
    if (!session?.user?.id) {
      setChatUnreadCounts({ GLOBAL: 0, GUILD: 0 });
      return;
    }
    const { data, error } = await supabase.rpc("get_chat_unread_counts");
    if (error) {
      console.warn("chat unread count error:", error.message);
      return;
    }
    const counts = (data || {}) as { GLOBAL?: number; GUILD?: number };
    setChatUnreadCounts({
      GLOBAL: Number(counts.GLOBAL || 0),
      GUILD: Number(counts.GUILD || 0)
    });
  }, [session?.user?.id, userGuildMember?.guild_id]);

  const markChatChannelRead = useCallback(async (targetType: "GLOBAL" | "GUILD") => {
    if (!session?.user?.id || (targetType === "GUILD" && !userGuildMember?.guild_id)) return;
    const { error } = await supabase.rpc("mark_chat_channel_read", {
      p_target_type: targetType
    });
    if (error) {
      console.warn("chat read update error:", error.message);
      return;
    }
    setChatUnreadCounts((previous) => ({ ...previous, [targetType]: 0 }));
  }, [session?.user?.id, userGuildMember?.guild_id]);

  useEffect(() => {
    void refreshChatUnreadCounts();
  }, [refreshChatUnreadCounts]);

  // The visible chat feed owns its Realtime subscription outside this hook.
  // While DM is selected that feed intentionally unsubscribes, so keep Guild
  // unread notification authority live without fetching or exposing messages.
  useEffect(() => {
    if (!currentUserId || !userGuildMember?.guild_id || chatChannel !== "DM") return;

    const channel = supabase
      .channel(`guild_chat_unread_${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "board_posts", filter: "target_type=eq.GUILD" },
        () => { void refreshChatUnreadCounts(); }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshChatUnreadCounts();
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshChatUnreadCounts();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [chatChannel, currentUserId, refreshChatUnreadCounts, userGuildMember?.guild_id]);

  useEffect(() => {
    if (!showTribeChatPanel || chatChannel === "DM") return;
    void markChatChannelRead(chatChannel);
  }, [showTribeChatPanel, chatChannel, guildChats.length, markChatChannelRead]);

  const refreshDirectMessageUnreadCounts = useCallback(async () => {
    if (!session?.user?.id) {
      setDmUnreadConversations([]);
      return;
    }
    const { data, error } = await supabase.rpc("get_direct_message_unread_counts");
    if (error) {
      console.warn("direct message unread count error:", error.message);
      return;
    }
    setDmUnreadConversations((data || []).map((row: any) => ({
      sender_id: row.sender_id,
      sender_name: row.sender_name || "ユーザー",
      unread_count: Number(row.unread_count || 0)
    })));
  }, [session?.user?.id]);

  const markDirectMessagesRead = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) return;

    const results = await Promise.all(messageIds.map(async (messageId) => {
      const { error } = await supabase.rpc("mark_direct_message_read", {
        p_message_id: messageId
      });
      if (error) {
        console.warn("direct message read update error:", error.message);
        return null;
      }
      return messageId;
    }));
    const markedIds = new Set(results.filter((messageId): messageId is string => messageId !== null));
    if (markedIds.size > 0) {
      setDirectMessages((previous) => previous.map((message) => (
        markedIds.has(message.id) ? { ...message, is_read: true } : message
      )));
      void refreshDirectMessageUnreadCounts();
    }
  }, [refreshDirectMessageUnreadCounts]);

  useEffect(() => {
    void refreshDirectMessageUnreadCounts();
  }, [refreshDirectMessageUnreadCounts]);

  useEffect(() => {
    if (chatCooldown <= 0) return;
    const timer = setTimeout(() => {
      setChatCooldown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [chatCooldown]);

  const hydrateDirectMessage = useCallback(async (message: DirectMessageRow) => {
    if (!currentUserId) return;
    const { data: participants, error } = await supabase.rpc("get_public_profiles", {
      p_user_ids: [...new Set([message.sender_id, message.recipient_id])]
    });
    if (error) console.warn("direct message participant fetch error:", error.message);
    const [hydratedMessage] = projectDirectMessageIdentities(
      [message],
      currentUserId,
      (Array.isArray(participants) ? participants : []) as DirectMessageProfileRow[]
    );
    setDirectMessages((previous) => previous.some((entry) => entry.id === message.id)
      ? previous.map((entry) => entry.id === message.id
        ? {
            ...entry,
            ...hydratedMessage,
            sender_name: hydratedMessage.sender_name || entry.sender_name || null,
            recipient_name: hydratedMessage.recipient_name || entry.recipient_name || null,
            participant_name: hydratedMessage.participant_name || entry.participant_name || "ユーザー",
          }
        : entry)
      : [...previous, hydratedMessage]);
  }, [currentUserId]);

  const fetchDirectMessages = useCallback(async () => {
    if (!currentUserId) {
      setDirectMessages([]);
      return;
    }
    if (!showTribeChatPanel || chatChannel !== "DM") return;

    const pageSize = 500;
    const rawMessages: DirectMessageRow[] = [];
    let page = 0;
    while (true) {
      let query = supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${currentUserId}),and(recipient_id.eq.${currentUserId})`)
        .order("created_at", { ascending: false });
      query = usingMockSupabase
        ? query.limit(pageSize)
        : query.range(page * pageSize, (page + 1) * pageSize - 1);
      const { data, error } = await query;
      if (error) {
        console.warn("direct_messages fetch error:", error.message);
        return;
      }
      const rows = (data || []) as DirectMessageRow[];
      rawMessages.push(...rows);
      if (usingMockSupabase || rows.length < pageSize) break;
      page += 1;
    }
    const actorIds = [...new Set(rawMessages.flatMap((message) => (
      [message.sender_id, message.recipient_id]
    )).filter(Boolean))];
    const actorProfiles: DirectMessageProfileRow[] = [];
    for (let start = 0; start < actorIds.length; start += 100) {
      const actorChunk = actorIds.slice(start, start + 100);
      const { data: participants, error: participantError } = await supabase.rpc("get_public_profiles", {
        p_user_ids: actorChunk
      });
      if (participantError) {
        console.warn("direct message participants fetch error:", participantError.message);
      } else {
        actorProfiles.push(...(Array.isArray(participants) ? participants : []));
      }
    }
    const messages = projectDirectMessageIdentities(rawMessages, currentUserId, actorProfiles)
      .sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
    setDirectMessages(messages);
    if (showTribeChatPanel && chatChannel === "DM" && dmRecipientId) {
      void markDirectMessagesRead(messages
        .filter((message) => message.sender_id === dmRecipientId && message.recipient_id === currentUserId && !message.is_read)
        .map((message) => message.id));
    }
  }, [currentUserId, dmRecipientId, showTribeChatPanel, chatChannel, markDirectMessagesRead]);

  useEffect(() => {
    void fetchDirectMessages();
  }, [fetchDirectMessages]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const currentUserId = session.user.id;
    const channel = supabase
      .channel(`direct_messages_${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const message = payload.new as any;
          const isConversationMessage = (message.sender_id === currentUserId && message.recipient_id === dmRecipientId)
            || (message.sender_id === dmRecipientId && message.recipient_id === currentUserId);
          if (isConversationMessage) {
            void hydrateDirectMessage(message);
            if (showTribeChatPanel && chatChannel === "DM" && message.recipient_id === currentUserId && !message.is_read) {
              void markDirectMessagesRead([message.id]);
            } else {
              void refreshDirectMessageUnreadCounts();
            }
          } else if (message.recipient_id === currentUserId || message.sender_id === currentUserId) {
            void hydrateDirectMessage(message);
            void refreshDirectMessageUnreadCounts();
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (dmRecipientId) void fetchDirectMessages();
          void refreshDirectMessageUnreadCounts();
        }
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (dmRecipientId) void fetchDirectMessages();
        void refreshDirectMessageUnreadCounts();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, dmRecipientId, showTribeChatPanel, chatChannel, fetchDirectMessages, hydrateDirectMessage, markDirectMessagesRead, refreshDirectMessageUnreadCounts]);

  const handleSendChat = async () => {
    if (!session || !chatInput.trim() || chatCooldown > 0 || chatSending) return;
    setChatSending(true);
    playCyberSe("click");

    const content = chatInput.trim();
    const temporaryMessageId = "temp_" + Date.now();
    try {
      const targetId = chatChannel === "GUILD" 
        ? (userGuildMember?.guild_id || null) 
        : null;

      const newPost = {
        id: temporaryMessageId,
        user_id: session.user.id,
        author_name: username,
        author_avatar_url: null,
        content,
        target_type: chatChannel,
        target_id: targetId,
        is_system: false,
        created_at: new Date().toISOString()
      };
      setGuildChats(prev => [...prev, newPost]);

      const { data, error } = await supabase.rpc("send_chat_message", {
        p_target_type: chatChannel,
        p_content: content,
        p_reply_to_message_id: chatReplyTo?.id || null
      });
      if (error) throw error;
      if (data) {
        setGuildChats((previous) => previous.map((message) => message.id === temporaryMessageId ? data : message));
      }
      setChatInput("");
      setChatReplyTo(null);
      setChatCooldown(chatChannel === "GUILD" ? 3 : 10);
      if (chatChannel === "GUILD") {
        // The chat RPC has already committed at this point. Keep the send UI
        // independent from the broader bootstrap refresh, which may be slow or
        // remain pending because it serves unrelated projections.
        const refreshTimeout = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error("guild chat post-send refresh timed out")), GUILD_CHAT_REFRESH_TIMEOUT_MS);
        });
        void Promise.race([refreshAfterGuildChat(session.user.id), refreshTimeout]).catch((refreshError) => {
          // A refresh failure must not roll back a message that was already sent.
          console.warn("Guild chat post-send refresh failed:", refreshError);
        });
      }
    } catch (err: any) {
      setGuildChats((previous) => previous.filter((message) => message.id !== temporaryMessageId));
      console.warn(err.message);
      setErrorMessage(getChatSendErrorMessage(err));
    } finally {
      setChatSending(false);
    }
  };

  const handleSendDirectMessage = async (recipientId: string, text: string) => {
    if (!session?.user?.id || !recipientId || !text.trim()) return false;
    if (chatSending) return false;
    setChatSending(true);
    playCyberSe("click");
    try {
      const { data, error } = await supabase.rpc("send_direct_message", {
        p_recipient_id: recipientId,
        p_message: text.trim()
      });
      if (error) throw error;
      const sentMessage = {
        ...(data || {}),
        id: data?.id || `dm_${Date.now()}`,
        sender_id: session.user.id,
        sender_name: username,
        recipient_id: recipientId,
        message: data?.message || text.trim(),
        created_at: data?.created_at || new Date().toISOString()
      };
      await hydrateDirectMessage(sentMessage);
      return true;
    } catch (err: any) {
      console.warn("direct message send error:", err.message);
      setErrorMessage(err.message || "DMの送信に失敗しました。");
      return false;
    } finally {
      setChatSending(false);
    }
  };

  const fetchBbsThreads = async (category: "RECRUIT" | "STRATEGY_CHAT") => {
    setBbsLoading(true);
    try {
      const { data, error } = await supabase
        .from("bbs_threads")
        .select("*")
        .eq("category", category)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setBbsThreads(data || []);
    } catch (err: any) {
      console.warn("fetchBbsThreads error:", err.message);
      setErrorMessage(err.message || "スレッドの取得に失敗しました。");
    } finally {
      setBbsLoading(false);
    }
  };

  const fetchBbsPosts = async (threadId: string) => {
    try {
      const { data, error } = await supabase
        .from("bbs_posts")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setBbsPosts(data || []);
    } catch (err: any) {
      console.warn("fetchBbsPosts error:", err.message);
      setErrorMessage(err.message || "返信の取得に失敗しました。");
    }
  };

  const createBbsThread = async (category: "RECRUIT" | "STRATEGY_CHAT", title: string, content: string) => {
    if (!session) return;
    try {
      const { data, error } = await supabase.rpc("create_bbs_thread", {
        p_category: category,
        p_title: title,
        p_content: content
      });
      if (error) throw error;

      if (data) {
        setBbsThreads(prev => [data, ...prev]);
        setBbsActiveThread(data);
        await fetchBbsPosts(data.id);
      }
    } catch (err: any) {
      console.warn("createBbsThread error:", err.message);
      setErrorMessage(err.message || "スレッドの作成に失敗しました。");
      throw err;
    }
  };

  const createBbsPost = async (threadId: string, content: string) => {
    if (!session) return;
    try {
      const { data, error } = await supabase.rpc("create_bbs_post", {
        p_thread_id: threadId,
        p_content: content
      });
      if (error) throw error;

      if (data) {
        setBbsPosts(prev => prev.some((post) => post.id === data.id) ? prev : [...prev, data]);
      }
    } catch (err: any) {
      console.warn("createBbsPost error:", err.message);
      setErrorMessage(err.message || "返信の送信に失敗しました。");
      throw err;
    }
  };

  return {
    guildChats, setGuildChats,
    chatChannel, setChatChannel,
    chatInput, setChatInput,
    chatReplyTo, setChatReplyTo,
    chatSending, setChatSending,
    chatCooldown, setChatCooldown,
    activeUsersCount, setActiveUsersCount,
    directMessages, setDirectMessages,
    dmRecipientId, setDmRecipientId,
    dmUnreadConversations,
    dmUnreadTotal: dmUnreadConversations.reduce((sum, conversation) => sum + conversation.unread_count, 0),
    refreshDirectMessageUnreadCounts,
    chatUnreadCounts,
    refreshChatUnreadCounts,
    markChatChannelRead,
    bbsThreads, setBbsThreads,
    bbsActiveThread, setBbsActiveThread,
    bbsPosts, setBbsPosts,
    bbsLoading, setBbsLoading,
    bbsUnreadCounts,
    bbsUnreadTotal: Object.values(bbsUnreadCounts).reduce((sum, count) => sum + count, 0),
    refreshBbsUnreadCounts,
    markBbsThreadRead,
    handleSendChat,
    handleSendDirectMessage,
    fetchBbsThreads,
    fetchBbsPosts,
    createBbsThread,
    createBbsPost
  };
}

export interface DirectMessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  message?: string | null;
  content?: string | null;
  created_at?: string | null;
  is_read?: boolean | null;
  participant_name?: string | null;
  sender_name?: string | null;
  recipient_name?: string | null;
}

export interface DirectMessageProfileRow {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
}

export interface DirectMessageConversation {
  userId: string;
  userName: string;
  latestMessage: string;
  latestAt: string;
  unreadCount: number;
}

export function normalizeDirectMessagePlayerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || ["null", "undefined"].includes(normalized.toLowerCase())) return null;
  return normalized;
}

export function projectDirectMessageIdentities(
  messages: DirectMessageRow[],
  currentUserId: string,
  profiles: DirectMessageProfileRow[]
): DirectMessageRow[] {
  const namesByUserId = new Map<string, string>();
  for (const profile of profiles) {
    const userId = profile.user_id || profile.id;
    const playerName = normalizeDirectMessagePlayerName(profile.username);
    if (userId && playerName) namesByUserId.set(userId, playerName);
  }

  return messages.map((message) => {
    const senderName = namesByUserId.get(message.sender_id)
      || normalizeDirectMessagePlayerName(message.sender_name);
    const recipientName = namesByUserId.get(message.recipient_id)
      || normalizeDirectMessagePlayerName(message.recipient_name);
    const participantName = message.sender_id === currentUserId ? recipientName : senderName;
    return {
      ...message,
      sender_name: senderName || null,
      recipient_name: recipientName || null,
      participant_name: participantName
        || normalizeDirectMessagePlayerName(message.participant_name)
        || "ユーザー",
    };
  });
}

export function buildDirectMessageConversations(
  messages: DirectMessageRow[],
  currentUserId: string,
  unreadNames: Array<{ sender_id: string; sender_name: string; unread_count: number }> = []
): DirectMessageConversation[] {
  const unreadBySender = new Map(unreadNames.map((entry) => [entry.sender_id, entry]));
  const conversations = new Map<string, DirectMessageConversation>();

  for (const message of messages) {
    const otherUserId = message.sender_id === currentUserId ? message.recipient_id : message.sender_id;
    if (!otherUserId || otherUserId === currentUserId) continue;

    const createdAt = message.created_at || "";
    const unread = message.recipient_id === currentUserId && !message.is_read ? 1 : 0;
    const unreadName = normalizeDirectMessagePlayerName(unreadBySender.get(otherUserId)?.sender_name);
    const projectedName = message.sender_id === currentUserId
      ? message.recipient_name
      : message.sender_name;
    const userName = normalizeDirectMessagePlayerName(message.participant_name)
      || normalizeDirectMessagePlayerName(projectedName)
      || unreadName
      || "ユーザー";
    const existing = conversations.get(otherUserId);

    if (!existing) {
      conversations.set(otherUserId, {
        userId: otherUserId,
        userName,
        latestMessage: message.message || message.content || "",
        latestAt: createdAt,
        unreadCount: unread,
      });
      continue;
    }

    existing.unreadCount += unread;
    if (existing.userName === "ユーザー" && userName !== "ユーザー") existing.userName = userName;
    if (createdAt >= existing.latestAt) {
      existing.latestAt = createdAt;
      existing.latestMessage = message.message || message.content || "";
    }
  }

  return [...conversations.values()].sort((left, right) => right.latestAt.localeCompare(left.latestAt));
}

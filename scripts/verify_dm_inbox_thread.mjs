import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildDirectMessageConversations,
  normalizeDirectMessagePlayerName,
  projectDirectMessageIdentities,
} from "../src/app/context/hooks/directMessageConversations.ts";

const currentUserId = "user-current";
const messages = [
  {
    id: "dm-1",
    sender_id: "user-a",
    recipient_id: currentUserId,
    message: "最初のメッセージ",
    created_at: "2026-09-01T10:00:00.000Z",
    is_read: true,
    participant_name: "アキラ",
  },
  {
    id: "dm-2",
    sender_id: currentUserId,
    recipient_id: "user-a",
    message: "返信しました",
    created_at: "2026-09-01T10:05:00.000Z",
    is_read: true,
    participant_name: "アキラ",
  },
  {
    id: "dm-3",
    sender_id: "user-b",
    recipient_id: currentUserId,
    message: "新着です",
    created_at: "2026-09-01T11:00:00.000Z",
    is_read: false,
    participant_name: "ミナト",
  },
  {
    id: "dm-4",
    sender_id: "user-b",
    recipient_id: currentUserId,
    message: "もう一件",
    created_at: "2026-09-01T11:01:00.000Z",
    is_read: false,
    participant_name: "ミナト",
  },
];

const conversations = buildDirectMessageConversations(messages, currentUserId);
assert.deepEqual(conversations.map((conversation) => conversation.userId), ["user-b", "user-a"]);
assert.equal(conversations[0].userName, "ミナト");
assert.equal(conversations[0].latestMessage, "もう一件");
assert.equal(conversations[0].unreadCount, 2);
assert.equal(conversations[1].latestMessage, "返信しました");
assert.equal(conversations[1].unreadCount, 0);

const projectedMessages = projectDirectMessageIdentities([
  {
    id: "dm-outgoing-only",
    sender_id: currentUserId,
    recipient_id: "user-c",
    message: "初回送信",
    created_at: "2026-09-01T12:00:00.000Z",
    sender_name: "null",
    participant_name: "null",
  },
  {
    id: "dm-incoming-only",
    sender_id: "user-c",
    recipient_id: currentUserId,
    message: "返信",
    created_at: "2026-09-01T12:01:00.000Z",
  },
], currentUserId, [
  { user_id: currentUserId, username: "検証ユーザー" },
  { id: "user-c", username: "レイ" },
]);
assert.equal(projectedMessages[0].sender_name, "検証ユーザー");
assert.equal(projectedMessages[0].recipient_name, "レイ");
assert.equal(projectedMessages[0].participant_name, "レイ");
assert.equal(projectedMessages[1].sender_name, "レイ");
assert.equal(projectedMessages[1].recipient_name, "検証ユーザー");
assert.equal(projectedMessages[1].participant_name, "レイ");
assert.equal(buildDirectMessageConversations(projectedMessages, currentUserId)[0].userName, "レイ");
assert.equal(normalizeDirectMessagePlayerName(" null "), null);
assert.equal(normalizeDirectMessagePlayerName(" undefined "), null);

const [modalSource, chatHookSource] = await Promise.all([
  readFile(new URL("../src/app/components/TribeChatModal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/context/hooks/useChat.ts", import.meta.url), "utf8"),
]);

assert.match(modalSource, /aria-label="DM一覧"/);
assert.match(modalSource, /との会話を開く/);
assert.match(modalSource, /DM一覧に戻る/);
assert.match(modalSource, /activeDirectMessages\.map/);
assert.doesNotMatch(modalSource, /<select[\s>]/);
assert.match(chatHookSource, /\.from\("direct_messages"\)[\s\S]*\.or\(`/);
assert.match(chatHookSource, /start < actorIds\.length; start \+= 100/);
assert.match(chatHookSource, /p_user_ids: actorChunk/);
assert.match(chatHookSource, /projectDirectMessageIdentities\(rawMessages, currentUserId, actorProfiles\)/);
assert.doesNotMatch(chatHookSource, /\.from\("users"\)/);
assert.match(chatHookSource, /if \(!showTribeChatPanel \|\| chatChannel !== "DM"\) return/);
assert.match(chatHookSource, /query\.range\(page \* pageSize/);
assert.match(chatHookSource, /hydrateDirectMessage\(message\)/);
assert.match(chatHookSource, /send_direct_message/);
assert.match(chatHookSource, /mark_direct_message_read/);
assert.match(chatHookSource, /sender_name: hydratedMessage\.sender_name \|\| entry\.sender_name/);
assert.match(chatHookSource, /recipient_name: hydratedMessage\.recipient_name \|\| entry\.recipient_name/);

const mockStorage = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: (key) => mockStorage.has(key) ? mockStorage.get(key) : null,
  setItem: (key, value) => mockStorage.set(key, String(value)),
  removeItem: (key) => mockStorage.delete(key),
};
const { executeMockRpc } = await import("../src/utils/mock/mockRpc.ts");
const mockClient = {
  getStorage: (key) => mockStorage.has(key) ? JSON.parse(mockStorage.get(key)) : [],
  setStorage: (key, value) => mockStorage.set(key, JSON.stringify(value)),
};
mockClient.setStorage("users", [
  { id: currentUserId, username: "検証ユーザー" },
  { id: "user-c", username: "レイ" },
]);
const mockProfiles = await executeMockRpc(mockClient, "get_public_profiles", {
  p_user_ids: [currentUserId, "user-c"],
});
assert.equal(mockProfiles.error, null);
assert.deepEqual(
  mockProfiles.data.map(({ user_id, username }) => ({ user_id, username })),
  [
    { user_id: currentUserId, username: "検証ユーザー" },
    { user_id: "user-c", username: "レイ" },
  ]
);

const publicProfileMigrationSource = await readFile(
  new URL("../supabase/migrations/20260817000154_ranking_power_p0_foundation.sql", import.meta.url),
  "utf8"
);
assert.match(publicProfileMigrationSource, /player\.id,player\.id user_id,player\.username/);

console.log("TN-07 DM Inbox/Thread verification: PASS");

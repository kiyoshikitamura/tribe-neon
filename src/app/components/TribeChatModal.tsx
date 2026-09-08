import RaidRescueLink from './raid/RaidRescueLink';
import React, { useState, useRef, useEffect } from "react";
import { useGame } from "../context/GameContext";
import FullScreenPanel from "./ui/FullScreenPanel";
import SubTabNav from "./ui/SubTabNav";
import OutlawButton from "./ui/OutlawButton";
import UserIdentityRow from "./profile/UserIdentityRow";
import { buildDirectMessageConversations } from "../context/hooks/directMessageConversations";
import "./TribeChatModal.css";

export default function TribeChatModal() {
  const {
    showTribeChatPanel,
    setShowTribeChatPanel,
    session,
    userGuild,
    guildMembersList,
    chatChannel,
    setChatChannel,
    chatUnreadCounts,
    guildChats,
    chatInput,
    setChatInput,
    chatReplyTo,
    setChatReplyTo,
    chatCooldown,
    chatSending,
    handleSendChat,
    dmRecipientId,
    setDmRecipientId,
    directMessages,
    dmUnreadConversations,
    dmUnreadTotal,
    handleSendDirectMessage,
    fetchPlayerDetail,
    navigateTab,
  } = useGame();

  const [localDmText, setLocalDmText] = useState("");
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const safeDirectMessages = directMessages || [];
  const safeGuildChats = guildChats || [];
  const dmConversations = buildDirectMessageConversations(
    safeDirectMessages,
    session?.user?.id || "",
    dmUnreadConversations || []
  );
  const activeDmConversation = dmConversations.find((conversation) => conversation.userId === dmRecipientId);
  const activeDmName = activeDmConversation?.userName
    || dmUnreadConversations?.find((conversation: any) => conversation.sender_id === dmRecipientId)?.sender_name
    || guildMembersList?.find((member: any) => member.user_id === dmRecipientId)?.users?.username
    || "ユーザー";
  const activeDirectMessages = safeDirectMessages.filter((message: any) => (
    dmRecipientId && (
      (message.sender_id === session?.user?.id && message.recipient_id === dmRecipientId)
      || (message.sender_id === dmRecipientId && message.recipient_id === session?.user?.id)
    )
  ));

  useEffect(() => {
    if (showTribeChatPanel && chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [guildChats, directMessages, dmRecipientId, showTribeChatPanel, chatChannel]);

  if (!showTribeChatPanel) return null;

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !chatSending && chatCooldown === 0) {
      if (chatChannel === "DM") {
        if (localDmText.trim() && dmRecipientId) {
          const sent = await handleSendDirectMessage(dmRecipientId, localDmText);
          if (sent) setLocalDmText("");
        }
      } else {
        if (chatInput.trim()) {
          handleSendChat();
        }
      }
    }
  };

  const handleSend = async () => {
    if (chatChannel === "DM") {
      if (localDmText.trim() && dmRecipientId) {
        const sent = await handleSendDirectMessage(dmRecipientId, localDmText);
        if (sent) setLocalDmText("");
      }
    } else {
      if (chatInput.trim()) {
        handleSendChat();
      }
    }
  };

  const handleClose = () => {
    if (chatChannel === "DM") {
      setDmRecipientId(null);
      setLocalDmText("");
    }
    setShowTribeChatPanel(false);
  };

  return (
    <FullScreenPanel title={chatChannel === "GUILD" ? `${userGuild?.name || "ギルド"} チャット` : "チャット"} onClose={handleClose} className="tribe-chat-panel">
      <div className="tribe-modal-container-inner flex-col">
        {/* チャンネルタブ (全体 / ギルド / DM) */}
        <SubTabNav
          tabs={[
            { id: "GLOBAL", label: `全体${chatUnreadCounts?.GLOBAL ? ` (${chatUnreadCounts.GLOBAL})` : ""}` },
            { id: "GUILD", label: `ギルド${chatUnreadCounts?.GUILD ? ` (${chatUnreadCounts.GUILD})` : ""}`, disabled: !userGuild },
            { id: "DM", label: `個人(DM)${dmUnreadTotal ? ` (${dmUnreadTotal})` : ""}` }
          ]}
          activeTabId={chatChannel}
          onSelect={(id) => {
            if (id === "DM") {
              setDmRecipientId(null);
              setLocalDmText("");
            }
            setChatChannel(id as any);
          }}
          className="mb-3"
        />
        <div className="tribe-community-secondary-nav">
          <OutlawButton
            variant="ghost"
            className="tribe-bbs-link"
            onClick={() => {
              setDmRecipientId(null);
              setLocalDmText("");
              setShowTribeChatPanel(false);
              navigateTab("bbs");
            }}
          >
            BBSを開く
          </OutlawButton>
        </div>

        {chatChannel === "DM" && dmRecipientId && (
          <div className="tribe-dm-thread-header">
            <OutlawButton variant="ghost" className="tribe-dm-back" onClick={() => {
              setDmRecipientId(null);
              setLocalDmText("");
            }} aria-label="DM一覧に戻る">
              一覧
            </OutlawButton>
            <strong>{activeDmName}</strong>
          </div>
        )}

        {/* チャットメッセージログ表示領域 */}
        <div className="tribe-modal-body custom-scrollbar flex-1 mb-3" ref={chatBodyRef}>
          {chatChannel === "DM" ? (
            !dmRecipientId ? (
              dmConversations.length === 0 ? (
                <div className="tribe-modal-empty">DMのやり取りはありません</div>
              ) : (
                <div className="tribe-dm-conversation-list" aria-label="DM一覧">
                  {dmConversations.map((conversation) => {
                    const latestTime = conversation.latestAt
                      ? new Date(conversation.latestAt).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "";
                    return (
                      <button
                        type="button"
                        key={conversation.userId}
                        className="tribe-dm-conversation active-scale-effect"
                        onClick={() => {
                          setDmRecipientId(conversation.userId);
                          setLocalDmText("");
                        }}
                        aria-label={`${conversation.userName}との会話を開く`}
                      >
                        <span className="tribe-dm-conversation-main">
                          <strong>{conversation.userName}</strong>
                          <span>{conversation.latestMessage}</span>
                        </span>
                        <span className="tribe-dm-conversation-meta">
                          {latestTime && <time>{latestTime}</time>}
                          {conversation.unreadCount > 0 && <b aria-label={`未読${conversation.unreadCount}件`}>{conversation.unreadCount}</b>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )
            ) : activeDirectMessages.length === 0 ? (
              <div className="tribe-modal-empty">このユーザーとのDMはありません</div>
            ) : (
              activeDirectMessages.map((msg: any) => {
                const isSelf = msg.sender_id === session?.user?.id;
                const timeStr = msg?.created_at
                  ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "";
                return (
                  <div key={msg.id} className={`tribe-msg-row ${isSelf ? "self" : "other"}`}>
                    <div className="tribe-msg-header">
                      <button
                        type="button"
                        className="tribe-msg-author"
                        onClick={() => {
                          const profileUserId = isSelf ? msg.recipient_id : msg.sender_id;
                          if (profileUserId) fetchPlayerDetail(profileUserId);
                        }}
                      >
                        {isSelf ? "自分" : activeDmName}
                      </button>
                      {timeStr && <span className="tribe-msg-time">{timeStr}</span>}
                    </div>
                    <div className="tribe-msg-bubble">{msg.message || msg.content || ""}</div>
                  </div>
                );
              })
            )
          ) : (
            safeGuildChats.length === 0 ? (
              <div className="tribe-modal-empty">メッセージログはありません</div>
            ) : (
              safeGuildChats.map((msg: any, idx: number) => {
                const isSelf = msg.user_id === session?.user?.id;
                const member = guildMembersList?.find((entry: any) => entry.user_id === (msg.user_id || msg.author_id));
                const leaderCharacterId = member?.users?.favorite_character_id || null;
                const timeStr = msg?.created_at
                  ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "";
                return (
                  <div key={idx} className={`tribe-msg-row ${isSelf ? "self" : "other"}`}>
                    <div className="tribe-msg-header">
                      <div className="tribe-msg-identity"><UserIdentityRow
                        userName={member?.users?.username || msg.author_name || "ユーザー"}
                        guildName={userGuild?.name || null}
                        leaderCharacterId={leaderCharacterId}
                        onOpen={msg.user_id ? () => fetchPlayerDetail(msg.user_id) : undefined}
                        variant="compact"
                      /></div>
                      {timeStr && <span className="tribe-msg-time">{timeStr}</span>}
                    </div>
                    {msg.reply_to_message_id && (
                      <div className="tribe-msg-reply-source">返信先のメッセージ</div>
                    )}
                    <div className="tribe-msg-bubble">{msg.content || ""}<RaidRescueLink rescueId={msg.raid_rescue_id} /></div>
                    {!msg.is_system && (
                      <button type="button" className="tribe-msg-reply" onClick={() => setChatReplyTo(msg)}>返信</button>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>

        {/* メッセージ入力エリア */}
        {(chatChannel !== "DM" || dmRecipientId) && <div className="tribe-modal-footer">
          {chatChannel !== "DM" && chatReplyTo && (
            <div className="tribe-reply-composer">
              <div><b>{chatReplyTo.author_name}</b><span>{chatReplyTo.content}</span></div>
              <button type="button" onClick={() => setChatReplyTo(null)} aria-label="返信を解除">×</button>
            </div>
          )}
          <div className="tribe-modal-composer-row">
            <input
              type="text"
              placeholder={
                chatCooldown > 0
                  ? `送信制限中 (${chatCooldown}秒)`
                  : chatChannel === "DM"
                  ? "暗号DMを入力..."
                  : `${chatChannel === "GLOBAL" ? "全体" : "ギルド"}へ送信...`
              }
              value={chatChannel === "DM" ? localDmText : chatInput}
              onChange={(e) => {
                if (chatChannel === "DM") {
                  setLocalDmText(e.target.value);
                } else {
                  setChatInput(e.target.value);
                }
              }}
              onKeyDown={handleKeyDown}
              maxLength={140}
              disabled={chatCooldown > 0 || chatSending}
              aria-describedby="tribe-chat-action-status"
              className="tribe-modal-input form-input"
            />
            <OutlawButton
              variant="primary"
              onClick={handleSend}
              isLoading={chatSending}
              loadingLabel="送信中…"
              disabled={
                chatSending ||
                chatCooldown > 0 ||
                (chatChannel === "DM" ? !localDmText.trim() || !dmRecipientId : !chatInput.trim())
              }
              className="tribe-modal-send"
            >
              送信
            </OutlawButton>
          </div>
          <span id="tribe-chat-action-status" className="tribe-chat-action-status" role="status" aria-live="polite">
            {chatSending ? "メッセージを送信しています" : chatCooldown > 0 ? `次の送信まで${chatCooldown}秒` : ""}
          </span>
        </div>}
      </div>
    </FullScreenPanel>
  );
}

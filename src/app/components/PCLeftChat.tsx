"use client";

import RaidRescueLink from './raid/RaidRescueLink';
import { useRaidRescueCards } from './raid/useRaidRescueCards';
import React from "react";
import { useGame } from "../context/GameContext";
import "./PCLeftChat.css";

export default function PCLeftChat() {
  const {
    userGuild,
    userGuildMember,
    chatChannel,
    setChatChannel,
    activeUsersCount,
    guildChats,
    chatInput,
    setChatInput,
    chatCooldown,
    chatSending,
    handleSendChat,
    playCyberSe
  } = useGame();

  const rescueCards = useRaidRescueCards((guildChats || []).map((msg: { raid_rescue_id?: string }) => msg.raid_rescue_id), true);
  const chatMessagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [guildChats]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && chatInput.trim() && chatCooldown === 0 && !chatSending) {
      handleSendChat();
    }
  };

  return (
    <div className="pc-left-chat-container">
      <div className="pc-chat-header">
        <span className="pc-chat-title-tag">SECURE NETWORK</span>
        <h3 className="pc-chat-main-title">暗号通信アプリ『トライブ』</h3>
        <div className="pc-online-badge">
          <span className="online-indicator"></span>
          ONLINE: {activeUsersCount}
        </div>
      </div>

      <div className="pc-chat-tabs">
        {["GLOBAL", "GUILD"].map((ch, idx) => {
          const isGuildCh = ch === "GUILD";
          const isSelected = chatChannel === ch;
          const labels = ["全体", "ギルド"];
          return (
            <button
              key={ch}
              onClick={() => {
                setChatChannel(ch as any);
                playCyberSe("click");
              }}
              className={`pc-chat-tab-btn ${isSelected ? "active" : ""}`}
              disabled={isGuildCh && !userGuild}
              style={{ opacity: isGuildCh && !userGuild ? 0.35 : 1 }}
            >
              {labels[idx]}
            </button>
          );
        })}
      </div>

      <div className="pc-chat-body scroll-container">
        {guildChats.length === 0 ? (
          <div className="pc-chat-empty">ログなし</div>
        ) : (
          guildChats.map((msg: any, idx: number) => {
            const isSelf = msg.user_id === userGuildMember?.user_id;
            return (
              <div key={idx} className="pc-chat-msg-row">
                <span className={`pc-msg-sender ${isSelf ? "self" : "other"}`}>
                  [{msg.author_name}]:
                </span>
                <div className="pc-msg-text">{msg.content}<RaidRescueLink rescueId={msg.raid_rescue_id} entry={rescueCards.byId.get(msg.raid_rescue_id)} status={rescueCards.statusFor(msg.raid_rescue_id)} source={chatChannel === "GUILD" ? "guild_chat" : "activity"} /></div>
              </div>
            );
          })
        )}
        <div ref={chatMessagesEndRef} />
      </div>

      <div className="pc-chat-input-area">
        <input
          type="text"
          placeholder={
            chatCooldown > 0
              ? `制限中 (${chatCooldown}秒)`
              : `${
                  chatChannel === "GLOBAL"
                    ? "全体"
                    : "ギルド"
                }へ送信...`
          }
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={140}
          disabled={chatCooldown > 0}
          className="pc-chat-input"
        />
        <button
          onClick={handleSendChat}
          disabled={chatSending || !chatInput.trim() || chatCooldown > 0}
          className="pc-chat-send-btn active-scale-effect"
        >
          {chatSending ? <div className="spinner" /> : "送信"}
        </button>
      </div>
    </div>
  );
}

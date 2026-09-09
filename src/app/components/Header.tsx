"use client";

import React from "react";
import { useGame } from "../context/GameContext";
import { VITALITY_MAX, RAID_POINT_MAX } from "@/utils/game_constants";
import { CANONICAL_USER_LEVEL_PROGRESSION } from "@/domain/gameplay/canonical/action_resources";
import UserIdentityRow from "./profile/UserIdentityRow";
import "./Header.css";

export default function Header() {
  const {
    username,
    userLevel,
    userXp,
    cash,
    diamonds,
    vitality,
    raidPoints,
    vitalityNextRecoveryAt,
    userGuild,
    userTitle,
    session,
    identityLeaderCharacterId,
    identityLeaderAuthorityReady,
    fetchPlayerDetail,
    totalPower,
    totalPowerLoading,
    unclaimedPresentsCount,
    setShowSettingsPanel,
    setShowInboxPanel,
    setShowLoginBonusModal,
    setInboxPanelTab,
    navigateTab,
    playCyberSe,
  } = useGame();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!vitalityNextRecoveryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [vitalityNextRecoveryAt]);
  const levelRow = CANONICAL_USER_LEVEL_PROGRESSION.levels.find((row) => row.level === userLevel);
  const recoverySeconds = vitalityNextRecoveryAt
    ? Math.max(0, Math.ceil((new Date(vitalityNextRecoveryAt).getTime() - now) / 1000))
    : null;
  const visibleTitle = userTitle && !["称号なし", "No Title", "title_none", "半グレの首領"].includes(userTitle)
    ? userTitle
    : null;
  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
    playCyberSe("click");
  };

  return (
    <header className="header-mobile">
      {/* Identity / progression / utility menu */}
      <div className="header-mobile-row1">
        <div className="header-mobile-user">
          <UserIdentityRow
            variant="compact"
            userName={username || "プレイヤー名"}
            guildName={userGuild?.name}
            title={visibleTitle}
            leaderCharacterId={identityLeaderCharacterId || null}
            identityReady={identityLeaderAuthorityReady}
            onOpen={session?.user?.id ? () => void fetchPlayerDetail(session.user.id) : undefined}
          />
        </div>
        <div className="header-mobile-progression" aria-label="プレイヤー進行状況">
          <span className="header-mobile-level-badge">Lv.{userLevel || 1} · EXP {userXp || 0}{levelRow?.requiredExp ? `/${levelRow.requiredExp}` : ""}</span>
          <span className="header-mobile-power"><small>総合力</small><strong>{totalPowerLoading ? "—" : Number(totalPower || 0).toLocaleString()}</strong></span>
        </div>
        <button
          type="button"
          className="header-mobile-menu-button active-scale-effect"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen(true); playCyberSe("click"); }}
        >
          <span>MENU</span><i aria-hidden="true">☰</i>
          {unclaimedPresentsCount > 0 && <b className="header-mobile-menu-badge" aria-label={`${unclaimedPresentsCount}件の未受取`}>{unclaimedPresentsCount}</b>}
        </button>
      </div>

      {/* Shared resource balances */}
      <div className="header-mobile-row2">
        {/* 所持キャッシュ */}
        <div className="header-mobile-stat">
          <img src="/ui/icon_cash.png" alt="Cash" className="header-stat-icon" />
          <span className="header-mobile-stat-val header-mobile-stat-cash">
            {(cash || 0).toLocaleString()}
          </span>
        </div>

        {/* 所持ダイヤ */}
        <div className="header-mobile-stat">
          <img src="/ui/icon_dia.png" alt="Dia" className="header-stat-icon" />
          <span className="header-mobile-stat-val header-mobile-stat-diamond">
            {(diamonds || 0).toLocaleString()}
          </span>
        </div>

        {/* Canonical Quest resource: Vitality */}
        <div className="header-mobile-stat">
          <span className="header-mobile-stat-label" aria-label="Vitality">⚡</span>
          <span className={`header-mobile-stat-val header-mobile-stat-energy ${vitality > VITALITY_MAX ? 'header-mobile-stat-overflow' : ''}`}>
            {vitality || 0}/{VITALITY_MAX}
          </span>
          {vitality < VITALITY_MAX && recoverySeconds !== null && (
            <span className="header-mobile-stat-recovery">+1 {Math.floor(recoverySeconds / 60)}:{String(recoverySeconds % 60).padStart(2, "0")}</span>
          )}
        </div>
        <div className="header-mobile-stat header-mobile-stat-raid" aria-label={`レイドポイント ${raidPoints}/${RAID_POINT_MAX}`} title="レイドポイント">
          <span className="header-mobile-stat-label">RP</span>
          <span className="header-mobile-stat-val">{raidPoints}/{RAID_POINT_MAX}</span>
        </div>
      </div>

      {menuOpen && <div className="header-utility-overlay" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setMenuOpen(false);
      }}>
        <section className="header-utility-menu" role="dialog" aria-modal="true" aria-label="ホームメニュー">
          <header><strong>MENU</strong><button type="button" aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)}>×</button></header>
          <nav aria-label="ユーティリティ">
            <button type="button" onClick={() => runMenuAction(() => setShowSettingsPanel(true))}><img src="/ui/icon_settings.png" alt="" /><span>設定</span></button>
            <button type="button" onClick={() => runMenuAction(() => { setShowInboxPanel(true); setInboxPanelTab("news"); })}><img src="/ui/icon_news.png" alt="" /><span>お知らせ</span></button>
            <button type="button" aria-label="プレゼント" onClick={() => runMenuAction(() => { setShowInboxPanel(true); setInboxPanelTab("presents"); })}><img src="/ui/icon_present.png" alt="" /><span>プレゼント</span>{unclaimedPresentsCount > 0 && <b aria-hidden="true">{unclaimedPresentsCount}</b>}</button>
            <button type="button" onClick={() => runMenuAction(() => setShowLoginBonusModal(true))}><img src="/ui/icon_present.png" alt="" /><span>ログインボーナス</span></button>
            <button type="button" onClick={() => runMenuAction(() => navigateTab("bag"))}><img src="/ui/icon_bag.png" alt="" /><span>バッグ</span></button>
          </nav>
        </section>
      </div>}
    </header>
  );
}

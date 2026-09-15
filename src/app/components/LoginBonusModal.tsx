"use client";

import React, { useMemo, useState } from "react";
import "./LoginBonusModal.css";
import { LoginBonusMaster, LoginBonusClaimResult } from "../../utils/login_bonus_master_data";
import CanonicalItemIcon from "./ui/CanonicalItemIcon";
import { loginBonusCellState, nextLoginBonusDay } from "@/domain/presentation/loginBonusPresentation";

interface LoginBonusModalProps {
  masters: LoginBonusMaster[];
  currentStep: number;
  claimResult: LoginBonusClaimResult | null;
  onClose: () => void;
  onOpenPresents: () => void;
  onOpenBag?: () => void;
}

export const LoginBonusModal: React.FC<LoginBonusModalProps> = ({
  masters,
  currentStep,
  claimResult,
  onClose,
  onOpenPresents,
  onOpenBag,
}) => {
  const orderedMasters = useMemo(() => [...masters].sort((left, right) => left.day_number - right.day_number), [masters]);
  const masterDays = useMemo(() => orderedMasters.map((master) => master.day_number), [orderedMasters]);
  const isClaimedToday = Boolean(claimResult?.claimed || claimResult?.already_claimed);
  const rewardInfo = claimResult?.reward ?? orderedMasters.find((master) => master.day_number === currentStep);
  const nextDay = nextLoginBonusDay(currentStep, masterDays);
  const nextReward = orderedMasters.find((master) => master.day_number === nextDay);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const selectedReward = orderedMasters.find((master) => master.day_number === selectedDay);
  const cycleLength = orderedMasters.length;
  const nextCycle = cycleLength > 0 && currentStep === orderedMasters[cycleLength - 1]?.day_number;

  return (
    <div className="login-bonus-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="login-bonus-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-bonus-title"
      >
        {/* ヘッダー */}
        <div className="login-bonus-modal-header">
          <h2 id="login-bonus-title" className="login-bonus-title">ログインボーナス</h2>
          <div className="login-bonus-subtitle">
            毎日ログインして報酬を獲得（{cycleLength}日で1周）
          </div>
        </div>

        {/* ボディ */}
        <div className="login-bonus-modal-body">
          {/* 本日獲得報酬のアナウンスバナー */}
          {isClaimedToday && rewardInfo && (
            <div className="login-bonus-reward-banner">
              <span className="login-bonus-banner-badge">本日のログインボーナス</span>
              <div className="login-bonus-reward-visual">
                <CanonicalItemIcon itemId={rewardInfo.item_id} alt="" className="login-bonus-reward-art" />
                <div>
                  <div className="login-bonus-reward-name">{rewardInfo.item_name}</div>
                  <div className="login-bonus-reward-qty">× {rewardInfo.quantity.toLocaleString("ja-JP")}</div>
                </div>
              </div>
              <div className="login-bonus-reward-desc">
                {claimResult?.delivery === 'DIRECT' ? '獲得しました' : 'プレゼントBOXに保存されました'}
              </div>
            </div>
          )}

          {/* 30日分グリッド */}
          <div className="login-bonus-next-summary" role="status">
            <span>{nextCycle ? "次のサイクル" : "明日"}</span>
            <strong>DAY {nextReward?.day_number}</strong>
            {nextReward && <><CanonicalItemIcon itemId={nextReward.item_id} alt="" className="login-bonus-next-art" /><b>× {nextReward.quantity.toLocaleString("ja-JP")}</b></>}
          </div>

          <div className="login-bonus-grid" aria-label={`${cycleLength}日ログインボーナスカレンダー`}>
            {orderedMasters.map((m) => {
              const state = loginBonusCellState(m.day_number, currentStep, isClaimedToday, masterDays);
              const stateLabel = state === "RECEIVED" ? "受取済" : state === "TODAY" ? "今日" : state === "NEXT" ? "明日" : "予定";

              return (
                <button
                  type="button"
                  key={m.day_number}
                  className={`login-bonus-cell ${m.is_featured ? "featured" : ""} state-${state.toLowerCase()} ${selectedDay === m.day_number ? "selected" : ""}`}
                  onClick={() => setSelectedDay((current) => current === m.day_number ? null : m.day_number)}
                  aria-label={`DAY ${m.day_number} ${m.item_name} × ${m.quantity} ${stateLabel}`}
                >
                  {m.is_featured && (
                    <span className="login-bonus-cell-featured-label">
                      注目
                    </span>
                  )}

                  <div className="login-bonus-cell-day">DAY {m.day_number}</div>

                  <div className="login-bonus-cell-icon">
                    <CanonicalItemIcon itemId={m.item_id} alt="" className="login-bonus-item-art" />
                  </div>

                  <div className="login-bonus-cell-qty">
                    × {m.quantity.toLocaleString("ja-JP")}
                  </div>
                  <span className="login-bonus-cell-state">{state === "RECEIVED" ? "✓ 済" : state === "TODAY" ? "TODAY" : state === "NEXT" ? "NEXT" : "予定"}</span>
                </button>
              );
            })}
          </div>
          {selectedReward && <div className="login-bonus-mini-detail" role="status">
            <CanonicalItemIcon itemId={selectedReward.item_id} alt="" className="login-bonus-mini-art" />
            <span><small>DAY {selectedReward.day_number}</small><strong>{selectedReward.item_name}</strong></span>
            <b>× {selectedReward.quantity.toLocaleString("ja-JP")}</b>
          </div>}
          <p className="login-bonus-cycle-note">DAY {cycleLength} の次は、新しいサイクルの DAY {orderedMasters[0]?.day_number} へ続きます。</p>
        </div>

        {/* フッター */}
        <div className="login-bonus-modal-footer">
          <button
            className="login-bonus-btn login-bonus-btn-secondary"
            onClick={onClose}
          >
            閉じる
          </button>
          <button
            className="login-bonus-btn login-bonus-btn-primary"
            onClick={() => {
              onClose();
              if (claimResult?.delivery === 'DIRECT') onOpenBag?.();
              else onOpenPresents();
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 5 12" />
            </svg>
            {claimResult?.delivery === 'DIRECT' ? 'マイバッグへ' : 'プレゼントBOXへ'}
          </button>
        </div>
      </div>
    </div>
  );
};

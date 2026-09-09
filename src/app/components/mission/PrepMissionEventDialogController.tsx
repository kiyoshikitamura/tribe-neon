"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "../../context/GameContext";
import { resolvePresentableAssetUrl } from "@/utils/assetPresentation";
import { supabase } from "@/utils/supabase";
import { getJstDateString } from "@/utils/jst_date";
import CanonicalDialog from "../ui/CanonicalDialog";
import "./PrepMissionEventDialogController.css";

type PendingEventDialog = {
  eventId: string;
  jstDate: string;
  displayName: string;
  imageUrl: string | null;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
};

function parsePendingDialog(value: unknown): PendingEventDialog | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const eventId = String(row.event_id || "");
  const jstDate = String(row.jst_date || "");
  if (!eventId || !jstDate) return null;
  return {
    eventId,
    jstDate,
    displayName: String(row.display_name || "ギルドバトル準備ミッション"),
    imageUrl: resolvePresentableAssetUrl(row.dialog_image_url) || (eventId === "GVG_PREP_20260904" ? "/promotion/gvg_preopen_mission_keyvisual.webp?v=20260905" : null),
    body: String(row.dialog_body || "正式オープンに備えて戦力を強化しよう！\nミッションを達成して報酬を獲得！"),
    primaryLabel: String(row.primary_cta_label || "準備ミッションを見る"),
    secondaryLabel: String(row.secondary_cta_label || "あとで"),
  };
}

export default function PrepMissionEventDialogController() {
  const {
    activeTab,
    session,
    loginBonusCheckComplete,
    showLoginBonusModal,
    showAccountAuthenticationModal,
    confirmDialogConfig,
    showPrepMissionDialog,
    setShowPrepMissionDialog,
    setPrepMissionDialogCheckComplete,
    setMissionTab,
    setShowMissionPanel,
  } = useGame();
  const [pending, setPending] = useState<PendingEventDialog | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const requestedKeyRef = useRef("");
  const presentedKeyRef = useRef("");

  useEffect(() => {
    const userId = session?.user?.id || "";
    if (!userId) {
      requestedKeyRef.current = "";
      presentedKeyRef.current = "";
      return;
    }
    if (activeTab !== "home") {
      requestedKeyRef.current = "";
      setPrepMissionDialogCheckComplete(false);
      return;
    }
    const requestKey = `${userId}:${getJstDateString()}`;
    if (requestedKeyRef.current === requestKey) return;
    requestedKeyRef.current = requestKey;
    setPrepMissionDialogCheckComplete(false);
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("get_pending_mission_event_dialog");
      if (cancelled) return;
      if (error) {
        console.warn("Failed to load preparation mission dialog", error);
        setPrepMissionDialogCheckComplete(true);
        return;
      }
      const parsed = parsePendingDialog(data);
      setPending(parsed);
      setImageReady(!parsed?.imageUrl);
      setImageFailed(false);
      if (!parsed) setPrepMissionDialogCheckComplete(true);
    })();
    return () => { cancelled = true; };
  }, [activeTab, session?.user?.id, setPrepMissionDialogCheckComplete]);

  useEffect(() => {
    if (!pending
      || activeTab !== "home"
      || !loginBonusCheckComplete
      || showLoginBonusModal
      || showAccountAuthenticationModal
      || confirmDialogConfig
      || showPrepMissionDialog) return;
    setShowPrepMissionDialog(true);
  }, [activeTab, confirmDialogConfig, loginBonusCheckComplete, pending, setShowPrepMissionDialog, showAccountAuthenticationModal, showLoginBonusModal, showPrepMissionDialog]);

  useEffect(() => {
    if (!showPrepMissionDialog || !pending || !imageReady) return;
    const presentationKey = `${pending.eventId}:${pending.jstDate}`;
    if (presentedKeyRef.current === presentationKey) return;
    presentedKeyRef.current = presentationKey;
    const frame = window.requestAnimationFrame(() => {
      void supabase.rpc("mark_mission_event_dialog_viewed", { p_event_id: pending.eventId, p_jst_date: pending.jstDate }).then((viewed) => {
        if (viewed.error) console.warn("Failed to mark preparation mission dialog viewed", viewed.error);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [imageReady, pending, showPrepMissionDialog]);

  if (!showPrepMissionDialog || !pending) return null;

  const dismiss = (openMission: boolean) => {
    if (openMission && !imageReady) return;
    if (!imageReady && !imageFailed) return;
    const cta = openMission ? "view_missions" : "later";
    void supabase.rpc("record_mission_event_telemetry", {
      p_event_id: pending.eventId,
      p_event_name: openMission ? "dialog_primary_cta" : "dialog_later",
      p_source: cta,
      p_mission_id: null,
      p_metadata: { jst_date: pending.jstDate, source: "login" },
    });
    setShowPrepMissionDialog(false);
    setPending(null);
    setPrepMissionDialogCheckComplete(true);
    if (openMission) {
      setMissionTab("SPECIAL");
      setShowMissionPanel(true);
    }
  };

  return <CanonicalDialog
    title={pending.displayName}
    ariaLabel="ギルドバトル準備ミッションのご案内"
    loading={!imageReady && !imageFailed}
    actions={[
      { label: pending.secondaryLabel, semantic: "secondary", disabled: !imageReady && !imageFailed, onClick: () => dismiss(false) },
      { label: pending.primaryLabel, semantic: "primary", disabled: !imageReady, onClick: () => dismiss(true) },
    ]}
  >
    <div className="prep-mission-dialog-content">
      {pending.imageUrl && !imageFailed && <img src={pending.imageUrl} alt="" className="prep-mission-dialog-image" onError={() => setImageFailed(true)} onLoad={(event) => {
        const image = event.currentTarget;
        if (typeof image.decode === "function") void image.decode().catch(() => undefined).finally(() => setImageReady(true));
        else setImageReady(true);
      }} />}
      {imageFailed && <span role="alert">画像を読み込めませんでした。次回の表示で再試行します。</span>}
      <p>{pending.body}</p>
    </div>
  </CanonicalDialog>;
}

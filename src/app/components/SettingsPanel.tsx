import SeasonHonors from "./profile/SeasonHonors";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/utils/supabase";
import { PROFILE_BACKGROUNDS, PROFILE_FRONT_EFFECTS, PROFILE_INTERIORS } from "@/utils/game_constants";
import { useGame } from "../context/GameContext";
import FullScreenPanel from "./ui/FullScreenPanel";
import OutlawButton from "./ui/OutlawButton";
import "./SettingsPanel.css";
import { USER_BIO_MAX_LENGTH } from "@/domain/presentation/userBio";
import EditableSettingSection, { ChoiceGroup } from "./ui/EditableSettingSection";
import { armLegalSettingsReturn } from "@/utils/legalSettingsReturn";

const QA_EMAIL = "izasama39@gmail.com";
const QA_TOOLS_ENABLED = process.env.NEXT_PUBLIC_APP_ENV === "development"
  && process.env.NEXT_PUBLIC_ENABLE_QA_TOOLS === "true";

function getSupabaseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const candidate = error as { message?: unknown; details?: unknown; code?: unknown };
    const message = typeof candidate.message === "string" ? candidate.message : "";
    const details = typeof candidate.details === "string" ? candidate.details : "";
    const code = typeof candidate.code === "string" ? candidate.code : "";
    return [message, details, code].filter(Boolean).join(" / ") || "詳細不明のデータベースエラー";
  }
  return "詳細不明のデータベースエラー";
}

export default function SettingsPanel() {
  const game = useGame();
  const [qaLoading, setQaLoading] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [homeEditing, setHomeEditing] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [backgroundDraft, setBackgroundDraft] = useState("auto");
  const [foregroundDraft, setForegroundDraft] = useState("effect_none");
  const [interiorDraft, setInteriorDraft] = useState("none");
  const isOpen = game.showSettingsPanel;
  const canProvisionQa = QA_TOOLS_ENABLED && game.session?.user?.email === QA_EMAIL;
  // Keep the post-open controls gated until Operations explicitly closes PRE_OPEN.
  const isPreOpen = game.featureOperatingStates?.PRE_OPEN !== "CLOSED";
  const hasSharedCosmetic = (id: string) => game.ownedHomeCosmeticIds === null || game.ownedHomeCosmeticIds.includes(id);
  const availableBackgrounds = PROFILE_BACKGROUNDS.filter((item) => hasSharedCosmetic(item.id));
  const availableFrontEffects = PROFILE_FRONT_EFFECTS.filter((item) => hasSharedCosmetic(item.id));
  const availableInteriors = PROFILE_INTERIORS.filter((item) => hasSharedCosmetic(item.id === "none" ? "interior_none" : item.id));

  const resetDrafts = () => {
    setUsernameDraft(game.username);
    setBioDraft(game.bio);
    setBackgroundDraft(game.selectedBgMode);
    setForegroundDraft(game.equippedFrontEffect);
    setInteriorDraft(game.interiorItem);
  };

  useEffect(() => {
    if (!isOpen) return;
    resetDrafts();
    setProfileEditing(false);
    setHomeEditing(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const close = () => {
    game.setErrorMessage("");
    resetDrafts();
    game.setShowSettingsPanel(false);
  };

  const rememberLegalReturn = () => {
    armLegalSettingsReturn(game.session?.user?.id || "");
  };

  const saveProfile = async () => {
    const saved = await game.handleUpdateProfile({ username: usernameDraft, bio: bioDraft });
    if (saved) setProfileEditing(false);
  };

  const saveHome = async () => {
    const saved = await game.handleUpdateProfile({ background: backgroundDraft, foreground: foregroundDraft, interior: interiorDraft });
    if (saved) setHomeEditing(false);
  };

  const provisionQa = async () => {
    if (!canProvisionQa || !game.session?.user?.id) return;
    setQaLoading(true);
    try {
      const { error } = await supabase.rpc("provision_qa_fixture");
      if (error) throw error;
      const { error: cosmeticError } = await supabase.rpc("provision_qa_cosmetic_fixture");
      if (cosmeticError && cosmeticError.code !== "PGRST202") throw cosmeticError;
      const { error: characterCosmeticError } = await supabase.rpc("provision_qa_character_cosmetic_fixture");
      if (characterCosmeticError && characterCosmeticError.code !== "PGRST202") throw characterCosmeticError;
      const { error: uiReviewError } = await supabase.rpc("provision_qa_ui1_fixture");
      if (uiReviewError && uiReviewError.code !== "PGRST202") throw uiReviewError;
      await game.syncBootstrapData(game.session.user.id);
      game.playCyberSe("click");
    } catch (error) {
      const message = getSupabaseErrorMessage(error);
      game.setErrorMessage(`テストデータ投入エラー（${message}）`);
    } finally {
      setQaLoading(false);
    }
  };

  return (
    <FullScreenPanel title="設定 / プロフィール" onClose={() => { if (!game.profileLoading) close(); }}>
      <div className="settings-panel-container-inner">
        {game.errorMessage && <div className="settings-error-message">{game.errorMessage}</div>}

        <EditableSettingSection title="プロフィール" editing={profileEditing} pending={game.profileLoading} onEdit={() => setProfileEditing(true)} summary={<dl className="settings-summary"><div><dt>プレイヤー名</dt><dd>{game.username}</dd></div><div><dt>自己紹介</dt><dd>{game.bio || "未設定"}</dd></div></dl>}>
          <div className="settings-field"><label htmlFor="profile-name">プレイヤー名</label><input id="profile-name" className="settings-input" value={usernameDraft} maxLength={8} disabled={game.profileLoading} onChange={(event) => setUsernameDraft(event.target.value)} /></div>
          <div className="settings-field settings-bio-field"><label htmlFor="profile-bio">自己紹介</label><textarea id="profile-bio" className="settings-textarea" value={bioDraft} maxLength={USER_BIO_MAX_LENGTH} rows={4} placeholder="自己紹介を入力" disabled={game.profileLoading} onChange={(event) => setBioDraft(event.target.value)} /><span>{Array.from(bioDraft).length} / {USER_BIO_MAX_LENGTH}</span></div>
          <div className="settings-edit-actions"><OutlawButton variant="secondary" disabled={game.profileLoading} onClick={() => { resetDrafts(); setProfileEditing(false); }}>キャンセル</OutlawButton><OutlawButton variant="primary" isLoading={game.profileLoading} loadingLabel="保存中…" disabled={!usernameDraft.trim()} onClick={() => void saveProfile()}>保存</OutlawButton></div>
        </EditableSettingSection>

        <SeasonHonors ownerId={game.session?.user?.id} scope="USER" editable onEquipped={(slot, id) => { if (slot === "PROFILE_TITLE") game.setTitleEquipped(id); }} />
        {!isPreOpen && <EditableSettingSection title="ホーム演出" helper="所持中の装飾を選択できます" editing={homeEditing} pending={game.profileLoading} onEdit={() => setHomeEditing(true)} summary={<dl className="settings-summary"><div><dt>背景</dt><dd>{game.selectedBgMode === "auto" ? "現在地に合わせる" : availableBackgrounds.find((item) => item.id === game.selectedBgMode)?.name || "未設定"}</dd></div><div><dt>前景</dt><dd>{availableFrontEffects.find((item) => item.id === game.equippedFrontEffect)?.name || "なし"}</dd></div><div><dt>内装</dt><dd>{availableInteriors.find((item) => item.id === game.interiorItem)?.name || "なし"}</dd></div></dl>}>
          <ChoiceGroup label="背景" value={backgroundDraft} disabled={game.profileLoading} onChange={setBackgroundDraft} options={[{ value: "auto", label: "現在地に合わせる" }, ...availableBackgrounds.filter((item) => item.id !== "auto").map((item) => ({ value: item.id, label: item.name }))]} />
          <ChoiceGroup label="前景エフェクト" value={foregroundDraft} disabled={game.profileLoading} onChange={setForegroundDraft} options={availableFrontEffects.map((item) => ({ value: item.id, label: item.name }))} />
          <ChoiceGroup label="内装オブジェクト" value={interiorDraft} disabled={game.profileLoading} onChange={setInteriorDraft} options={availableInteriors.map((item) => ({ value: item.id, label: item.name }))} />
          <div className="settings-edit-actions"><OutlawButton variant="secondary" disabled={game.profileLoading} onClick={() => { resetDrafts(); setHomeEditing(false); }}>キャンセル</OutlawButton><OutlawButton variant="primary" isLoading={game.profileLoading} loadingLabel="保存中…" onClick={() => void saveHome()}>保存</OutlawButton></div>
        </EditableSettingSection>}

        {canProvisionQa && <section className="settings-section"><h4 className="settings-section-title">QAテストデータ</h4><p className="settings-help-text">このアカウントのテスト用所持データを再投入します。</p><OutlawButton variant="secondary" fullWidth disabled={qaLoading} onClick={() => void provisionQa()}>{qaLoading ? "投入中..." : "テストデータを投入"}</OutlawButton></section>}
        <section className="settings-section">
          <h4 className="settings-section-title">サウンド設定</h4>
          <div className="settings-audio-row">
            <div className="settings-audio-heading"><label htmlFor="bgm-volume">BGM</label><output>{Math.round(game.bgmVolume * 100)}%</output></div>
            <div className="settings-toggle-group">
              <button className={`settings-toggle-btn ${game.bgmEnabled ? "active" : ""}`} onClick={() => game.setBgmEnabled(true)}>ON</button>
              <button className={`settings-toggle-btn ${!game.bgmEnabled ? "active" : ""}`} onClick={() => game.setBgmEnabled(false)}>OFF</button>
            </div>
            <input id="bgm-volume" className="settings-volume" type="range" min="0" max="1" step="0.05" value={game.bgmVolume} disabled={!game.bgmEnabled} onChange={(event) => game.setBgmVolume(Number(event.target.value))} />
          </div>
          <div className="settings-audio-row">
            <div className="settings-audio-heading"><label htmlFor="se-volume">SE</label><output>{Math.round(game.seVolume * 100)}%</output></div>
            <div className="settings-toggle-group">
              <button className={`settings-toggle-btn ${game.seEnabled ? "active" : ""}`} onClick={() => game.setSeEnabled(true)}>ON</button>
              <button className={`settings-toggle-btn ${!game.seEnabled ? "active" : ""}`} onClick={() => game.setSeEnabled(false)}>OFF</button>
            </div>
            <input id="se-volume" className="settings-volume" type="range" min="0" max="1" step="0.05" value={game.seVolume} disabled={!game.seEnabled} onChange={(event) => game.setSeVolume(Number(event.target.value))} />
          </div>
          <p className="settings-help-text">この端末のブラウザに保存されます。</p>
        </section>
        <section className="settings-section" aria-labelledby="settings-legal-title">
          <h4 id="settings-legal-title" className="settings-section-title">法的情報</h4>
          <nav className="settings-legal-links" aria-label="法的情報">
            <Link href="/legal/terms?from=settings" onClick={rememberLegalReturn}>利用規約</Link>
            <Link href="/legal/privacy?from=settings" onClick={rememberLegalReturn}>プライバシーポリシー</Link>
            <Link href="/legal/tokusho?from=settings" onClick={rememberLegalReturn}>特定商取引法に基づく表記</Link>
          </nav>
        </section>
        <div className="settings-panel-footer">
          <OutlawButton
            variant="danger"
            fullWidth
            className="mt-3"
            onClick={() => {
              game.setShowSettingsPanel(false);
              void game.handleLogout();
            }}
          >
            ログアウト
          </OutlawButton>
        </div>
      </div>
    </FullScreenPanel>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { supabase } from '@/utils/supabase';
import CanonicalDialog from '../ui/CanonicalDialog';
import { hasPresentedDialog, usePresentedDialog } from '../ui/dialogPresence';
import './ShinjukuPromotionDialog.css';

type Presentation = { id: string; promotion_id: 'beginner_pack' | 'tribe_join'; period_key: string; visit: string };
export default function ShinjukuPromotionDialog() {
  const game = useGame();
  const owner = game.session?.user?.id;
  const dialogPresent = usePresentedDialog();
  const [pending, setPending] = useState<Presentation | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const visit = useRef('');
  const attempted = useRef(false);
  const pendingRef = useRef<Presentation | null>(null);
  const viewRequest = useRef<Promise<boolean> | null>(null);
  const alive = useRef(true);
  const blocked = game.activeTab !== 'home' || !game.onboardingState?.gameplay_authorized
    || !game.loginBonusCheckComplete || !game.prepMissionDialogCheckComplete || !game.rankingRewardNotificationCheckComplete
    || game.showLoginBonusModal || game.showPrepMissionDialog || game.showAccountAuthenticationModal
    || game.showAuthenticationReminder || Boolean(game.confirmDialogConfig) || game.globalInteractionBlocking
    || Boolean(game.battleState) || game.showTitleView || game.showPatrolRewardModal
    || game.showMissionPanel || game.showInboxPanel || game.showSettingsPanel;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const rpc = (p: Presentation, operation: string) => supabase.rpc('promotion_dialog', {
    p_operation: operation, p_visit_id: p.visit, p_presentation_id: p.id,
  });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const previous = pendingRef.current;
    if (previous) void rpc(previous, 'release');
    pendingRef.current = null;
    setPending(null);
    setReady(false);
    setFailed(false);
    viewRequest.current = null;
    visit.current = crypto.randomUUID();
    attempted.current = false;
    return () => {
      const current = pendingRef.current;
      if (current) void rpc(current, 'release');
      pendingRef.current = null;
    };
  }, [owner, game.activeTab]);
  useEffect(() => {
    if (!owner || blocked || dialogPresent || attempted.current || pending) return;
    const currentVisit = visit.current;
    // Defer until other entry dialogs have committed their presence.
    const frame = requestAnimationFrame(() => {
      if (blockedRef.current || hasPresentedDialog() || attempted.current) return;
      attempted.current = true;
      void Promise.resolve(supabase.rpc('promotion_dialog', { p_operation: 'claim', p_visit_id: currentVisit })).then(({ data, error }) => {
        if (error || !data?.id || !['beginner_pack', 'tribe_join'].includes(data.promotion_id)) return;
        const next: Presentation = { ...data, visit: currentVisit };
        if (!alive.current || visit.current !== currentVisit || blockedRef.current || hasPresentedDialog()) {
          void rpc(next, 'release');
          return;
        }
        pendingRef.current = next;
        setPending(next);
      }).catch(() => undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [owner, blocked, dialogPresent, pending]);
  useEffect(() => {
    if (!pending || ready || failed) return;
    const timer = setTimeout(() => setFailed(true), 30000);
    return () => clearTimeout(timer);
  }, [pending, ready, failed]);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      void Promise.resolve(rpc(pending, 'renew')).then(({ data, error }) => {
        if (!error && data?.ok !== true && pendingRef.current?.id === pending.id) {
          pendingRef.current = null;
          setPending(null);
        }
      }).catch(() => undefined);
    }, 20000);
    return () => clearInterval(timer);
  }, [pending]);
  useEffect(() => {
    if (!pending || !ready || failed || blocked) return;
    let cancelled = false;
    let frame = 0;
    const record = () => {
      if (document.visibilityState !== 'visible' || viewRequest.current) return;
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        if (cancelled || blockedRef.current || pendingRef.current?.id !== pending.id) return;
        viewRequest.current = Promise.resolve(rpc(pending, 'view')).then(({data,error}) => {
          if (!error && data?.ok !== true && pendingRef.current?.id === pending.id) {
            pendingRef.current = null;
            setPending(null);
          }
          return !error && data?.ok === true;
        }).catch(() => false);
      }); });
    };
    record();
    document.addEventListener('visibilitychange', record);
    return () => { cancelled = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', record); };
  }, [pending, ready, failed, blocked]);
  if (!pending || blocked) return null;
  const pack = pending.promotion_id === 'beginner_pack';
  const close = (primary: boolean) => {
    const current = pending;
    // Schedule telemetry after the view transaction, without making navigation wait for the network.
    const viewed = viewRequest.current || Promise.resolve(false);
    void viewed.then(() => rpc(current, primary ? 'primary_cta' : 'later')).catch(() => undefined);
    pendingRef.current = null;
    setPending(null);
    if (primary) game.navigateTab(pack ? 'shop' : 'guild');
  };
  const loaded = async (img: HTMLImageElement) => {
    const current = pending;
    try {
      await img.decode();
      if (!img.naturalWidth) throw new Error('empty image');
      if (pendingRef.current?.id !== current.id || failed || viewRequest.current) return;
      setReady(true);

    } catch { if (pendingRef.current?.id === current.id) setFailed(true); }
  };
  return <CanonicalDialog title={pack ? 'ビギナーパック' : 'TRIBEへのご案内'} onClose={() => close(false)} actions={[
    { label: 'あとで', semantic: 'secondary', onClick: () => close(false) },
    { label: pack ? 'ショップへ' : 'TRIBEへ', semantic: 'primary', disabled: !ready, onClick: () => close(true) },
  ]}>
    <div className="shinjuku-promotion-content">
      {!failed && <img className="shinjuku-promotion-image" src={`/promotion/${pack ? 'beginner_pack' : 'tribe_join'}_keyvisual.webp`} alt={pack ? '約1,000円相当、約90％OFF、100円（税込）。SPガチャチケット3種入り。お一人様1回限定。' : 'TRIBEの設立、または加入してTRIBE NEONの世界をより楽しもう'} onLoad={e => void loaded(e.currentTarget)} onError={() => setFailed(true)} />}
      {failed && <p role="alert">画像を読み込めませんでした。次回の表示で再試行します。</p>}
      {pack ? <>
        <p>SPキャラチケット・SPスキルチケット・SP装備チケット 各1枚<br />CASH 1,000／レイドチケット3枚</p>
        <p className="promotion-note">通常単品交換価格・1ダイヤ＝1円換算で950円相当。まとめ買い特典を除く</p>
        <p className="promotion-note">画像はイメージです。掲載キャラクターの獲得を保証するものではありません</p>
      </> : <p>TRIBEの設立、または加入して<br />TRIBE NEONの世界をより楽しもう</p>}
    </div>
  </CanonicalDialog>;
}

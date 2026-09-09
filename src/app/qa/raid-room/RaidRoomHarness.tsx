"use client";

import React, { useMemo, useState } from "react";
import { GameContext } from "@/app/context/GameContext";
import RaidRoomBrowser from "@/app/components/raid/RaidRoomBrowser";
import GlobalInteractionBlocker from "@/app/components/ui/GlobalInteractionBlocker";
import CanonicalDialog from "@/app/components/ui/CanonicalDialog";
import { createRaidRoomController, type RaidBattleReference } from "@/domain/raidRoomClient";
import { createRaidRoomQaTransport } from "./raidRoomFixture";
import "./RaidRoomHarness.css";

export default function RaidRoomHarness() {
  const controller = useMemo(() => createRaidRoomController(createRaidRoomQaTransport()), []);
  const [blocking, setBlocking] = useState(false);
  const [battle, setBattle] = useState<RaidBattleReference | null>(null);
  const context = useMemo(() => ({ playCyberSe: () => undefined }), []);
  return <GameContext.Provider value={context}>
    <main className="raid-room-qa">
      <header><h1>レイド</h1><p>開発確認用のサンプルデータです。実戦闘・報酬付与は行いません。</p></header>
      <RaidRoomBrowser controller={controller} setInteractionBlocking={setBlocking}
        onBattleReady={(reference) => setBattle(reference)}
        resolveRewardName={(itemId) => itemId === "QA_REWARD" ? "確認用報酬" : null} />
      <GlobalInteractionBlocker isBlocking={blocking} />
      {battle && <CanonicalDialog title="戦闘への受け渡し確認" onClose={() => { setBattle(null); void controller.refreshRoom(); }}
        actions={[{ label: "Roomへ戻る", onClick: () => { setBattle(null); void controller.refreshRoom(); } }]}>
        <p>参加操作から戦闘参照を受け取りました。この確認画面では戦闘を開始しません。</p>
      </CanonicalDialog>}
    </main>
  </GameContext.Provider>;
}

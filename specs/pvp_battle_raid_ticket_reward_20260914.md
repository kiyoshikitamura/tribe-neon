# GAME03 / TRIBE NEON — PvP Battle Reward 接続仕様FIX

Authority: 2026-09-14 ユーザー確定。Production反映は禁止、Previewまで。

## 報酬

|正式戦の結果|CASH|既存RAID_POINT_TICKET|
|---|---:|---:|
|WIN|200|1枚確定|
|LOSE|50|なし|

3勝では各勝利の合計として3枚。追加3勝Bonusは設けない。
通常BattleからNormal/Specialガチャチケット、キャラ/装備EXP素材、指南書、改造パーツ、覚醒の書は配布しない。
旧毎戦CHAR_EXP_SとPVP_DAILY_3（指南書1＋40 CASH）の新規付与を置換する。過去受給の回収・再付与はしない。

## 目的と維持事項

有限のPvP Pointを消費して勝利した分だけ、レイドへの追加参加権を得る。
PvP → レイドチケット → Raid → 指南書/改造パーツ → 育成 → PvPの循環を作る。
既存PvP Point回復・Fight Ticket、勝敗判定、RATE、Daily/Season Ranking、模擬戦の無報酬を維持。
Fight TicketからRaid Ticketへの直接交換は追加しない。Battle報酬とRanking報酬は両方取得できる。
Quest/Raid/Ranking等の報酬Identityと既存Missionは保持する。

## Server Authority

正式Replayのfinalize内で確定し、Replay ID＋User ID相当でExactly-once。
既存Replay行のFOR UPDATEとFINALIZED時の既存receipt返却、付与ledgerの一意制約を使用。
Clientは勝敗・CASH・数量を指定できず、finalizeはservice_roleのみ。
Retry/duplicate/concurrent finalizeで追加付与しない。CASH・Item・ledger・RATE・finalizeは同一transactionで原子的に確定。
既存最終確定Replayは新報酬へ遡及変換しない。適用時点で未finalizeの正式Replayは、新ルールで確定する。

## UI

- Battle TOPでOpponent選択前に勝利200 CASH＋レイドチケット1、敗北50 CASHを常時表示。
- Resultはサーバーの実付与receiptを表示。勝利チケットを先頭・強調表示。
- 勝利してチケットを受給したResultに任意CTA「レイドに挑戦」。既存の戻る/初回ランキング導線も維持し、強制遷移しない。

## Acceptance

WIN200/1、LOSE50/0、3勝合計3、二重付与なし、RATE・BP・Daily/Season Ranking更新、Inventory、TOP可視性、Result実receipt一致、既存チケット使用によるRaid Point回復。

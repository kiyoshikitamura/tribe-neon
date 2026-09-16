# 第9工程 B — 製品戦闘接続

STATUS: IMPLEMENTED（親統合検証待ち）

- `RaidTab` 内に Room component を接続。`NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true` の明示設定時のみ露出。既定無効。サーバーの作成・出撃フラグは変更していない。
- 出撃準備では本人の briefing を再取得し、参加済みと出撃フラグを確認。Room RPC の HP と既存ボスマスターを表示用に読み、旧 `get_active_raids` 経由で Room を探索しない。準備キャンセル時は開始 RPC を送らず追加消費しない。
- 確認操作で `start_raid_room_battle_v1` を呼ぶ。最初の request ID・編成・tactic を固定。同時タップをまとめ、応答不明の再送は同一 payload、成功 receipt 後は開始 RPC を再実行せず同一 Replay を `resolve-battle` に渡す。
- 応答不明または開始済みの準備はキャンセルによる新規出撃への迂回を拒否。明確な PostgreSQL 拒否応答ならキャンセル可能。
- 開始 receipt の Room・Replay・Snapshot形状、確定応答の Room・winner・Eventsを照合。戦闘と Damage の Authority はサーバー。クライアントは資格を確定しない。
- Room は旧 `get_current_raid_battle_rewards` を呼ばない。報酬は未接続。既存非 Room の API 経路を維持。
- 確定後の `officialRaidResult.roomId` は既存 `battle_sessions.player_state` の保存・復帰対象に含まれる。Result では期限後確定を説明し、旧ギルドランキングへの参加訴求を Room に流用しない。

## 検証

- 出撃 attempt 専用 Node テスト 7 件 PASS（未送信・応答不明・receipt 再利用・同時タップ・不正応答・確定拒否）。
- 全体 Mock build / TypeScript PASS（初回の use client 配置エラーは修正後再実行済み）。最終差分は親統合時に再検証。

## 限界

- 通信未達または未確定段階の request/receipt はフック内保持。ページ再読込をまたぐ回復は未実装。画面内再試行と確定済み battle session 復帰を区別する。
- 実 DB、Edge 配置、実機、Room作成→参加→結果の本番相当 E2E は未検証。報酬/救援、運用切替は未完了。

親指摘反映: 保存 receipt 取得後の再試行は現 Lv / Main / Room / ボスマスター読込をスキップし、当時の player/enemy Snapshot を直接描画正本とする。Room 結果は raw（個人ダメージ）と applied（共有 HP 反映）を別表示。最終差分の全体 Mock build / TypeScript PASS。

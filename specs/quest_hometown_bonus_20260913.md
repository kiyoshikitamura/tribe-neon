# Quest 地元一致ボーナス実装 / 2026-09-13

## 状態
Preview DB実装・RPC差分検証PASS。UI実装・型・build PASS。専用Preview再配信と実画面Acceptanceは未実施。Production保留。

## 仕様との対応
- 既存の `spec_ui_quest_map.md` §2に記載されたCASH +LUK×10、ドロップ率 +LUK×0.1パーセントポイントを接続。
- 同資料の旧時間・報酬配送等は採用せず、現行canonical Quest master (2026-08-30) の基本報酬、XP、Pool、時短、戦闘条件を維持。
- 派遣担当1名のキャラクター本体LUKを `canonical_character_stats` (2026-08-21) から取得。レベル・覚醒を反映。戦闘部隊のLUK、装備・戦闘中のバフは含めない。
- 日本語/英字/大文字/前後空白を7街の同一キーへ変換。不明値同士を一致にしない。
- 派遣開始時に地元一致、LUK、CASH加算、ドロップ加算をサーバーで保存。クライアントから数値を受け取らない。
- ドロップは既存Poolの各有効抽選へ加算し100%で上限。0%の項目は排出対象へ復帰させない。数量・排出対象は変更しない。
- 完了報酬のCASH合計に一度だけ加算。アイテムは既存Present経路。XP/初回クリア記録/ミッション進捗は従来どおり。

## 既存派遣
Preview未受取12件はMigration適用時の能力で保存。開始当時の能力を復元した扱いにはしない。
受取済み派遣への追配や資産変更はなし。
Production適用時にも未受取対象の参照整合を事前確認する。Production適用は未承認・未実施。

## 表示
- 担当選択：地元一致：CASH・ドロップ率UP
- 派遣一覧：サーバー保存が一致の場合「地元ボーナス発生中」
- 派遣中詳細：保存されたCASH加算とドロップ率加算を表示
- Quest結果・Battle Result：CASH合計と、その内数である地元ボーナスを表示
- Reload後もuser_patrolsの保存値で表示

## Preview DB
project: sufvuqdnqohpfzkwxohq
適用済みMigration: 20260913032942_quest_hometown_reward_bonus.sql
再適用不要。共有alias・環境変数・Production変更なし。

## 検証済み
- 実DB transaction/ROLLBACK: レイジ・アゲハそれぞれ一致/不一致のstart→claim、CASH実差分、保存receipt一致。
- Lv1/+0: レイジLUK9→CASH +90、ドロップ +0.9ポイント。アゲハLUK16→CASH +160、ドロップ +1.6ポイント。
- 開始後Lv100/+5へ変更しても保存額を維持。
- 早期受取・戦闘未解決・他所有者・二重受取を拒否。再送でCASH/Present件数が増えない。
- 同キャラ重複派遣拒否。start_patrolのユーザーロックを枠判定前へ移し並行リクエストの判定を直列化。
- 固定乱数による地元加算だけで当選するDrop、0%除外、確定Drop数量維持。
- Typecheck / Quest UI state / Quest Battle Result liveness / Next build PASS。
- 対象の既存owner-read RLS維持。内部snapshot関数はPUBLIC/anon/authenticated実行不可。既存authenticated RPCの所有者チェックを維持。

## 未検証・次工程
- 専用Preview配信後の新規派遣→時短/自然完了→実戦→結果→CASH反映の実画面確認。
- アゲハの担当選択・派遣中詳細の実画面確認を含む。
- 実ブラウザ複数Tab同時送信、実iPhoneの文字収まり。
- DB検証は戦闘解決状態をfixtureで作成しており、実Battle通しのPASSではない。
- 該当差分の実画面AcceptanceまでProduction Gateは保留。

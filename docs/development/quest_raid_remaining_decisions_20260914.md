# Quest / Raid 確定が必要な3点

未承認・未適用。handoffの「未決・未完」1〜3を具体化したレビュー案。Production変更は禁止を維持する。

## 1. Questの地域別21Pool

quest_identity_review_candidate_20260914.md / .jsonの21Pool案。新宿キャラ素材、渋谷Normal Skill Ticket、池袋装備素材、六本木指南書、秋葉原Normal RANDOM、川崎改造パーツ、横浜バランス。各素材の平均・集中最大・地元一致を併記。
初級から特徴を出すため新規の低確率素材/Ticket供給を含む。地元一致で1%→3%となるため、無条件の供給量同等とはしない。RANDOMは新Itemではなく既存の具体Ticket解決トークン。

## 2. 進行中QuestのCASH境界

提案：今後の正式切替では開始時の基礎CASHと地元加算を固定する。切替前開始分は従来600/1200/2000、切替後開始分は300/600/1000。既に受取済みの報酬は遡及再計算しない。
PreviewではすでにMasterを半減したため、実適用20260914174340を境界に開始時刻と報酬履歴を照合し、未受取の対象だけ移行する設計とする。開始時刻が不明な旧行を推測で旧金額に変えない。固定後のSnapshotをclaim/Quest発見Raid追加CASHにも使う。
現在の実装は受取時Master＋保存済み地元加算。提案を採用する場合は追加Migrationと開始済み/新規/受取済みの回帰試験が必要。

## 3. 上級/超級Contribution

提案：撃破前の正式finalize1回以上、同Instanceにおける本人の累積applied damageが、上級は最大共有HPの3%以上、超級は5%以上。境界は>=。late/0 damageは加算しない。Instance最大HPを基準として保存し、現在HPでは割らない。InstanceとDailyで同じ適格条件を使う。
上級3%は旧実測25組中24組が到達。超級5%は暫定候補で、撃破実測1Instanceだけでは妥当性未証明。新28編成で実戦を再測定し調整する。既存の60000/75000や厳密な>比較をそのまま確定値として使わない。
現行は上級/超級enabled=false。採用時にはapplied集計・割合判定・境界/late/再送/Daily回帰を実装してからPreviewのみ有効化する。

## 仕様決定以外の残件

- 固定Previewの実機：Battle TOP→実戦→実receipt→任意Raid CTA→Ticket回復→Raid。Quest新規/進行中/地元・Raid日次表示も確認。
- 独立DB接続による初回finalize同士の実際の同時競合。MCP並列送信はDB上では直列だったため未達。
- Vercel対象team参照403/ローカル認証なし。GitHub配信statusと固定URL・接続DB・実機確認を区別する。

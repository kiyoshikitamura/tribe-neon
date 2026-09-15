# GAME03 First Feedback — 統合実装・Preview配信依頼

## 対象

- Branch: `codex/mission-journey-review-20260913`
- Base: `f692ec7ef957a0a96027304999114e249e0040ef`
- ユーザーの実機指摘と最終補足に基づく統合修正。報酬の新設・増量なし。

## 実装

| 対象 | 統一ルール |
|---|---|
| MyPage | 次の推奨行動だけを1行の「ミッション：…」で表示。未受取報酬CTAは置かず、Missionアイコン・バッジから参照 |
| 達成Dialog | 演出・Result終了後に表示。CTAは「報酬を受け取る」。遷移先表示まで背面操作を遮断 |
| Character | おまかせ編成後はキャラホームを表示。完了情報と本人が押す「報酬を受け取る」をバストアップ下に配置。完了・達成Dialogの連鎖を除去 |
| Quest | 探索一覧→街の縦一覧→街ページで級選択→同ページの敵・報酬→キャラクター選択→探索中 |
| Quest文言 | 「派遣」を「探索」へ。常設文言は「街を探索し、報酬を手に入れろ。」。一覧の地元一致は短いラベルのみ |
| Quest詳細 | バトルと同じ鉄瓶フォントで小さな探索中見出し。時短残数/最大数、ダイア表記。地元ボーナス実加算内訳は維持 |
| Quest Result | 旧「同じクエストへ」を削除 |
| 初回PvP→Ranking | バトルランキングを表示し、当該Missionの「報酬を受け取る」へ。通常のランキング導線は維持 |
| Raid | Raid TOPの日次対象・参加中・救援と同じ開催判定。未参加で戻っても開催中を開催待ちへ誤変換しない。取得失敗はunknown |
| Guild | 未接触ならTRIBE案内。閲覧は接触のみ、加入または設立のORで既存P010達成。加入強制なし |
| Reflow | 報酬未受取で巻き戻さず、未経験機能を案内。Raid未開催時は後続へ進み、Raid入口に開催待ちを表示。再開催時は再提示 |
| リーダー/拠点 | リーダー変更と地元への拠点変更を同時保存。背景も追従。その後の手動移動は保持。Quest選択街は独立 |

## 受取性能とAuthority

- 個別・一括受取RPCが同一トランザクションの残高・XP・所持品・Mission状態を返す。
- 成功応答から直接反映し、全体bootstrap再取得を待たない。
- 応答消失時だけ所有者の最新状態を再照会。付与・ロック・二重受取拒否の既存Authorityを維持。
- Missionを開く際も全体bootstrap待ちを除去。Journeyの重複更新をまとめ、更新中の表示消失を抑制。
- 実機での待ち時間短縮量は未計測。コード上の待機除去を実測PASSと混同しない。

## Preview DB

- Target: `sufvuqdnqohpfzkwxohq`
- 適用済み: `20260913062244_mission_receipt_projection_and_leader_town.sql`
- 受取投影とリーダー拠点同期を追加。再適用禁止。
- DBテストはBEGIN/ROLLBACKで実施し、テスト操作を残さない。
- Production DB・共有alias・環境変数は変更しない。

## 実施済み検証

- Typecheck、変更ファイルESLint（error 0、既存warningあり）、Next.js production build（Preview接続設定）。
- Beginner Mission Journey、receipt/reflow、Raid availability、Quest UI state、Battle Result liveness。
- Preview DB: 個別/一括受取投影、重複付与拒否、リーダー地元保存、同一リーダー再保存後も手動移動維持、未認証拒否。
- ブラウザ実画面・実iPhone Safari・新Previewの差分Acceptanceは未実施。

## Windows Codexへの専用Preview配信依頼

1. 本Branchの本書を含む先端commitを独立checkoutし、HEAD SHAを報告する。
2. 既存のVercel CLI手順で `kiyoshi-kitamura / tribe-neon` の専用Previewへ配信する。
3. Supabase接続先は上記Preview。適用済みMigrationは再実行しない。
4. Production・共有alias・環境変数は変更しない。
5. URL、SHA、Deployment ID、READY/HTTPを報告した後、下記差分を実画面監査する。

## 新Previewの差分Acceptance（配信後）

- Fresh: Free Gacha→Character（バスト下CTA）→Quest→PvP→Ranking報酬→Raid→Guild→Mission。先行達成済み項目の再要求なし。
- 320〜430pxでHome CTAが1行、Character CTAが上部に出ない、地元一致と時短表示が見切れない。
- Questの街/級選び直し、複数探索、無料時短残数、結果帰還。
- 開催中Raidを未参加で戻る→開催中維持、実参加→体験完了後に達成Dialog。
- 未開催→TRIBE案内、加入/設立ORの既存報酬、開催後Raid再案内。
- 個別/一括受取→獲得確認→MyPage、受取時間計測、Reload・再試行・連打で二重付与なし。
- リーダー変更→拠点/背景変更→Reload保持→手動移動保持。
- 差分監査が通るまでユーザーへ実機再確認を依頼しない。最終報告で「ブラウザ実画面」と「実機」を区別する。

専用Previewの配信依頼は可。ユーザー実機確認依頼は現時点では不可。Productionは保留。

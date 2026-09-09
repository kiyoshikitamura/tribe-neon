# 承認トップ構成・共通素材への修正

STATUS: VALIDATED（ローカル）。人によるVisual Acceptanceと実配信確認は未実施。

基準: `065e77a0d610305828d77c323a7eaa31f3fc31ca`（製品修正 `b7e523b7c4651a8682f5e182733604e5e463316d` を保持）。専用branch: `codex/raid-approved-top-20260909`。

承認元「レイド開発 完了通知」の最終構成・文言FIXと今回の指示を照合。人物・数値・ロゴの再生成なし。画面証跡の人物名/数値は明示ローカルQA fixture、製品は既存集約APIのデータを表示する。

## 実装

- A: 参戦中を敵画像・敵名・挑戦者・HP・時間・「続きへ」の短い行へ。救援依頼は挑戦者/所属/敵/戦況/登録人数と「救援に向かう」。今日の強敵は日次2エリアの「この敵に挑む」、開催中を探すは最下部の補助入口。
- 表示文言を挑戦者へ統一。「あなた」は既存owner membershipからのみ表示。救援ID/公開範囲/参加資格、2エリア取得、挑戦確定、戦闘/報酬処理は変更なし。終了済み救援の既存戦況入口も維持。
- B（親）: 共通素材の照合対象は `894bcb6cab5984e59ddd6a52cb41a5dbd19813b3`（Gate2.1）。PublicUserProfile、UserIdentityRow、UserAvatar、CharacterPresentationと関連CSS、確定26PNGを限定採用。Character全面改修/ガチャ後続/共通状態などは取り込んでいない。26PNGはGit blob hash一致を記録。
- User Identityは枠なし、DeckはCharacter枠。レイドトップ・参加者も共通UserAvatarへ接続。未取得人物は推測しない。
- 既存接続 `RaidTab.fetchPlayerDetail → CommonModals.PublicUserProfile.onDm → setDmRecipientId / DM channel / TribeChat` は接続済みで維持。PublicUserProfileで本人情報未取得時もDMを表示しないようにし、自分/他人を検証。DM送信は行っていない。
- プロフィールの往復、選択行focus、参加者スクロール位置の保存・復元を維持。

## 検証

型検証PASS。Mock webpack build PASS。変更対象lint errors0、既存警告23→22、追加0。警告の内訳はvalidation/lint.json（既存img、hook等）。新規UserAvatarのlintも0。全体lintの一括清掃は行っていない。

関連140件PASS: トップ17、詳細/プロフィール19、日次6、Replay/ack27、既存Browser32、資格/RPC31、救援8。日次は一括API、JST境界、認証切替、公開範囲、独自抽選なしを検証。保存された隔離PG返値fixtureを使用したparser/画面結合であり、今回の外部DB実行ではない。

ローカルChromium 390x844/390x600: 0/1/複数、読込/失敗/未知、終了、長い名前、未所属、画像失敗、正規7エリア素材、4入口のcallback/救援ID、戦闘帰還revision、プロフィール往復、報酬末尾・閉じる44px・通常Present入口を確認。自己DM非表示/他者DM引渡し/単一dialogも確認。主要スクリーンショットを親が目視レビュー。物理端末/Safariの受入ではない。

検証中の旧ラベル期待値は今回の承認文言へ追随し、membership値のassertを残した。テスト削除なし。詳細parserテストの保存fixtureを基準worktreeから復元。Turbopackはnode_modules junctionを拒否したため、製品設定を変えずローカルwebpackでbuild/表示確認。

## 画面

- [トップ上部](evidence/raid-approved-top/top-single-390.png)
- [今日の強敵・一覧入口](evidence/raid-approved-top/top-single-lower-390.png)
- [低高さ・複数参戦](evidence/raid-approved-top/top-returned-low.png)
- [プロフィール/DM](evidence/raid-approved-detail/other-profile-dm-600.png)
- [低高さ・報酬末尾](evidence/raid-approved-detail/reward-issued-600-bottom.png)

全画面/機械記録: evidence/raid-approved-top、raid-approved-detail、raid-approved-validation。

## 変更範囲・残件

RaidTop.tsx/css、RaidRoomDialogs、RaidRoomDetail/ListCard/RescuePanel/RescueLinkの表示、共通Profile/Identity/CharacterPresentation、public/ui/rarity26PNG、QA fixture/関連テスト/検証script・本報告。domain/hooks/GameContext/SQL差分なし。既存の日次/資格/Replay/ack/報酬正本を保持。

人による390px/低高さでの見通し・タップ・スクロール受入待ち。共通枠の他ページでの最終受入も別途。今回のローカル結果を実HTTPのPASSへ転記しない。前工程のメール確認/通常再ログイン、自然失効の期限後確認、自然討伐の観測、既存403ユーザー救済未実施は別残件として保持。

外部DB変更・migration追加・Deploy・Production/alias/Cron/フラグ変更・pushは行っていない。今回候補は最新本番同期済みとは扱わない。

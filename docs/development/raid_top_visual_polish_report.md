# レイドトップ・承認モックへのビジュアル調整

TASK ID: RAID-TOP-VISUAL-20260909
OWNER: 親（A/B実装・統合）、visual_review_c（C独立目視）
PRIORITY: P2
STATUS: VALIDATED（ローカル）。人によるビジュアル受入待ち。
BRANCH: codex/raid-top-visual-polish-20260909
BASE: b383e12917f25138d2939e73cf4656c9bad0da4f
COMMIT: この報告を含むcommit（git log -1で取得）

## 範囲・基準

承認元「レイド開発 完了通知」のA/B/Cと、添付72FED8A9-DD6B-49B2-A934-3415464F5924.jpegを参照。参戦2件・救援1件・日次2エリアをQAシナリオapprovedで揃えた。画像は正規素材、名前・HP・期限は明示QAデータ。モックの架空人物・ロゴ・数値は製品へ転記していない。

基準から専用branchを作成。基準後478fd3aは証跡のみのため取り込まず、既存証跡branchに保持。作業中outputs/、scripts/profile-request-live/をcommit対象外とした。

SCOPE: RaidTop.tsx/cssの見た目、QA比較シナリオ、入口ラベルの期待値、今回証跡。
DO NOT TOUCH: DB/API/日次正本/参加資格/プロフィール/DM/Replay/ack/報酬処理、共通ヘッダー・フッター・カード枠・バッジ。
DEPENDENCIES: 受入済みb383e129、現行RaidTopData、正規人物・エリア素材。
ACCEPTANCE: 2列、CTA44px以上、横はみ出しなし、4入口の引渡し保持、比較画像と残差。人の最終見た目承認は別。

## 採用差分

- 参戦中：左バストアップ、中央の敵・挑戦者・HP・残り時間、右の続きへ。既存の難易度を保持。
- 救援：左を依頼者の正規リーダー素材、中央を挑戦者/Guild/対象敵/HP/期限/登録人数/参加者。エリア背景を敷き、CTAを金系に変更。敵の立ち絵を同カードに重ねず、依頼者と敵名を区別。
- 今日の強敵：2列。正規エリア背景と敵の人物を主体にし、CTAをシアン系へ。小さな5体サムネイル列をトップから省き、編成データと既存敵選択・敵情報の導線は保持。
- 下部入口：「開催中のレイドを探す」「ほかの挑戦者に加勢する」。4入口のcallback/救援IDは変更なし。
- 共通素材の画像ファイル、確定枠/バッジ、プロフィール競合修正・DM・位置保持等のコード差分なし。

## 検証

最終コード：型PASS、Mock webpack build PASS、トップ関連17件PASS。
ローカルブラウザ：390×844／390×600 × approved/multiple/empty/long-name/broken-imageの10ケース。横幅、CTA44px以上、2列、最下部入口の到達とフッター非重複、4入口の引渡しPASS。外部HTTPをブロックして実行。

対象lint：エラー0。警告6→6、いずれも既存方式の事前ロードimgに対するno-img-element。既存5箇所を維持、サムネイル用1箇所除去、依頼者素材の1箇所追加。無関係な清掃なし。

親とCがcomparison.png／低高さ画面を目視。人物/文字/CTAの欠落、横はみ出し、フッター重複の指摘なし。これはローカルMockでの表示検証であり、実HTTPや人の実機受入PASSへの転記ではない。受入済みのプロフィール/Replay/報酬/自然失効は再実行していない。

再現: Mock環境でnext dev --webpack -p 3037 → node scripts/raid-visual/verify.mjs。
検証ランナー: RAID_TEST_RUNTIME_DIRを既存隔離test runtimeへ設定 → node tests/raid-room/top-run-tests.mjs。

## 比較画像・残差

[evidence/raid-visual-20260909/comparison.png](evidence/raid-visual-20260909/comparison.png)

モックは390pxへ換算したトップ領域、実装は390px画面内の共通余白を除いた362px。共通ヘッダー・フッターは今回変更対象外なので比較画像から除外。通常/低高さ画面は別PNGに保存。

- 参戦中：モック約70px/行、実装102px/行。難易度と44pxの続きへ、既存フォント・戦況の可読性を保持した分、高い。
- 救援：モック約110px、実装196px。Guild・難易度・開催状態・登録参加者アイコン、44px CTAを保持した分、高い。複数救援は次カードを見せ、狭くなる本文ではCTAを次段にする。
- 強敵：モック約187px、実装204px。2列・人物・背景・シアンCTAを反映。架空ロゴは使用せず、44px CTAを確保。
- 正規人物の衣装・姿勢・切抜き、正規エリア背景、既存フォント、実データの文量はモックと異なる。素材不足なし。
- 見出し下の余白と密度にも残差がある。モック完全一致・人のVisual Acceptance完了とは扱わない。

BLOCKERS: ローカル作業の技術的阻害なし。残る見た目の受入判断は比較画像で依頼。
EXPECTED OUTPUT: 本commit、比較画像、通常/低高さ証跡、verification.json、検証ログ。

Deploy・push・DB変更・Production・共有alias・Cron・フラグ変更なし。既存403ユーザー救済、実Freshの未確認事項、自然討伐観測は今回変更なし。

# PvP対戦開始時のリーダー表示不一致

Base: bde28209150973a8ba934df8e48214a20519d8c8
Branch: codex/mission-journey-review-20260913

## 調査結果
- Homeはfavorite_character_idの公開Identity投影、PvP TOPは同じ保存値を反映するselectedLeaderを使用。
- 出撃準備とVS演出はplayerPartyStates[0]を表示しており、公開Identityと編成slot 1が異なる状態で代表キャラが切り替わる。
- Previewの保存編成62件中11件でfavoriteとslot 1が不一致（うち6件はfavoriteが編成内）。表示参照の違いは実データにも存在する。
- Previewでstart_pvp_battleをBEGIN/ROLLBACK内で実行し、保存編成・favorite・拠点の不変、snapshotの入力順維持を確認。
- start_pvp_battle、snapshot生成、関連triggerを確認。対戦開始でリーダーを保存する呼出しはない。
- ユーザー端末の変更前後データは未取得。保存データが変化したという端末固有の事象まで否定しない。

## 修正
- PvP/模擬戦の出撃準備・VS代表表示をHomeと同じidentityLeaderCharacterIdへ統一。
- 公開Identity未読込時に編成先頭を代理表示しない。
- 代表画像を出撃準備のプリロード対象に追加。
- 戦闘配列・計算・保存編成の並びは変更しない。表示合わせのための戦闘メンバー追加や入替を行わない。
- Quest/Raidの既存snapshot代表表示は維持。
- DB/Migration/Production/共有alias/環境変数の変更なし。

## 検証
- verify_pvp_leader_presentation.mjs: 実CardBattleViewをtranspileして描画分岐を検証。
  非先頭の保存リーダー、準備/VS共通表示、未読込時、配列不変、Quest維持: PASS。
- Typecheck: PASS。
- 変更ファイルESLint: 0 errors。
- Quest Battle Result liveness: PASS。
- PreviewのRPCロールバック検証: PASS。永続データ変更なし。
- Next.js production build（Preview接続設定）: PASS。
- 実画面Acceptance: 未実施。

## 専用Preview配信依頼
本書を含む先端候補をkiyoshi-kitamura / tribe-neonへ専用Preview配信する。
Supabaseはsufvuqdnqohpfzkwxohq。Migrationは不要。
Production、共有alias、環境変数を変更しない。

差分実画面確認:
1. Homeのリーダー、PvP TOP、出撃準備、VS演出で同じ保存キャラを表示。
2. favoriteと編成先頭が異なる既存QA状態でも1が成立。
3. 対戦開始前後・Result帰還・Reloadでfavorite、拠点、保存編成全slotが不変。
4. ユーザー操作でリーダー変更した場合は、新リーダーが上記画面へ反映。
5. ユーザー端末で実際の編成変更が残る場合は、その前後差分を別途記録して追加調査。

専用Preview配信依頼: 可。実機再確認依頼: 差分監査後。Production保留。

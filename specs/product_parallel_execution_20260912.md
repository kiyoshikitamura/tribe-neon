# GAME03 Product改善：並走実装計画

状態：A Quest／B Mission／C Ranking・Navigationの3レーン起動済み。Production変更なし。

## ユーザー受入方針（追加確定）

- 実機確認は全ページを統合した最後の1回でまとめて依頼する。レーンごとの実機確認依頼はしない。
- 品質監査の正本はCustomer Journey / Game Cycle / Motivation Cycle。
- 承認済みモックと既存共通UIに沿って実装する。追加のデザイン修正はユーザーの統合後監査を受けて行う。
- 機能・状態・導線の自動確認を先行し、未確認をユーザー確認済みと扱わない。

## Authority

Customer Journey / Game Cycle / Motivation Cycle、ユーザーが承認したQuest・Mission・Rankingのモックと本会話の修正指示を優先。
MyPageは改修後の構造を維持。追加の構造再設計はしない。
specs/mission_requirements_20260912.md、ranking_requirements_20260912.md、navigation_requirements_20260912.mdを実装要件とする。
モックの仮の数値・報酬・期間・人物を実マスターへ転記しない。

## 同時稼働上限

最大3レーン。今回はProductの5対象を3つに分割する。
課金・Special・ショップ・素材・専用演出は確定済み別バックログとして保持し、この3レーンへ混在させない。空き枠なしに追加レーンを起動しない。

## A：Quest

担当：src/app/components/quest/QuestPresentationV2.tsx / .css、PatrolTab.tsx / .css、context/hooks/usePatrol.ts の必要箇所。
承認モック：/workspace/quest-visual-review.html

- 派遣担当、派遣先、進行状態、受取・戦闘・空き枠が分かる構成を実装。
- 派遣先・難易度・報酬・必要Energy・担当キャラ・既存地元一致を判断できる。
- 重複情報と「戦闘は部隊が対応」等の説明文を削除。
- 現行の派遣担当と戦闘部隊の役割を維持。地元一致の仕組みを新機能として再設計しない。
- 地元一致の表示・実報酬の不一致は機能差分として記録。供給量に影響する式変更をUI修正に混ぜない。
- 推奨戦力・ボーナスの仮値を本実装に使用しない。

受入：空き／派遣中／戦闘待ち／受取可能、開始→完了→受取→再派遣、Reloadで状態保持。既存Tutorialを維持。

## B：Mission

担当：src/app/components/MissionPanel.tsx / .css、context/hooks/useInventory.ts のミッション関連箇所のみ。
承認モック：/workspace/mission-visual-review.html

- 確定テキスト要件に従い日次進捗・節目報酬・行動CTA・受取済み・次段階を実装。
- 初回目標の依存関係緩和について具体的なマスター差分を作成。
- 到達・累積判定は既存実績の取得経路に絞って確認し、修正案と影響件数を分離する。
- Guild在籍30／90日の定義・加算経路は保留事項として解消。特定できなければ推測で仕様FIXしない。
- 直接付与・現在タブのみ一括受取を維持。

受入：個別／一括／再試行、日次3・5件集計、次段階、取得失敗、受取済み、イベント期限。判定修正による追加報酬量を別報告。

## C：Ranking + Navigation

担当：src/app/components/RankingTab.tsx / .css、components/ranking/、domain/ranking/、domain/presentation/homeInitialGuide.ts。
承認モック：/workspace/ranking-visual-review.html

- 自己順位、直上との差、自分周辺、カテゴリ別CTA、期間・取得時刻、報酬帯の強調。
- 既存公開編成5体・報酬ダイアログを維持。
- 上位100件外の自己順位と周辺順位の取得経路を確認し、必要な読取変更を候補化。
- Navigation：Gacha→Character→Quest→Battle→Raid→Mission。Raid未開催時は開催待ちを残してMissionへ進む。参加実績を偽装せず開催後に案内。

受入：3種×2期間、1位・同点・上位外・未所属・エラー、公開詳細、期間と指標一致。Mission案内後・Reload後も未参加Raid再案内。

## MyPageと共有ファイル

- MyPageの構造は変更しない。ナビゲーション接続に必要な差分だけCが提案。
- GameContext.tsx、共通型、共通CSS、共通報酬・マスターは各レーンから変更要求を提出し、担当を1レーンに割り当ててから変更する。
- 共通マスター：Bを所有者とする。他レーンは直接編集しない。
- DB候補はレーンごとに独立した一意ファイルとし、同一RPCの書換えは競合確認後に1レーンへ集約。
- 親は仕様・依存・競合・統合・Gate管理を担当し、機能実装を抱え込まない。

## 実行順

1. A/B/C：所有範囲の必要差分のみ確認。UI実装可能部分を先行。
2. 機能確認：関連File/Table/RPCに限定。過去監査の繰返し禁止。
3. 各候補をレビューし、共有ファイルとDB差分を統合。
4. 接続先と現在のPreview状態を確認して専用Preview候補化。既存配信SHAを推測しない。
5. 必要な型・build・影響範囲の回帰確認と実接続受入。
6. 実機Acceptance後にProduction候補とする。本番適用は明示承認後。

## 完了報告

各レーン：STATUS / CHANGE / FUNCTIONAL FINDINGS / SHARED DIFF / DB IMPACT / VALIDATION / PREVIEW / ACCEPTANCE / BLOCKER。
未確認をPASSにしない。既存の無関係FAILは別管理。

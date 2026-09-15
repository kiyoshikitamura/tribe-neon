# 実Raid専用会話：実行者とSkill cueの一体化

## 基準と修正

基準SHA：`11eba1605e59392fc043673a758986016559e2a0`。
専用会話の実戦FAILを解消する後続候補。DB変更なし。

前回修正ではSkill IDをスキル名から補完したが、表示実行者がtimeline／targetLineから推測されていた。本修正はReplay ACTIONからactorId・skillId・actionKeyを同じcueへ保持する。Streetと旧ViewerはcueのactorIdを使用し、不明な実行者をtimeline先頭で代用しない。resolverは明示Skill IDと戦闘参加者の保存スキルを照合し、actorId不一致も拒否する。発動キーで専用シーケンスを再開始する。

さらに、Presentation Unitが作成できないfallbackでは従来の専用会話待ち時間が加算されていなかった。ACTION直後のイベント待ち時間をUnit生成の成否から分離し、専用会話1100msと既存Cut-in待ち時間を確保する。戦闘結果・ダメージ・報酬計算は変更しない。

## 受入済みの継承

ユーザー報告に基づき、ハーネス自然Result到達、透過素材3件の実画面PASS、Raid報酬／救援／通常完走／期限、Emblem既報PASSを継承する。全面再監査は不要。

## Codex差分Acceptance

新候補をPreview Supabase `sufvuqdnqohpfzkwxohq` / mock=false / Raid Room UI=trueで専用配信。Production・共有alias・Project共通環境変数・Migrationは変更しない。

実Raidのアゲハ／SKILL_055を使用し、次のみ確認：

1. ReplayのactorIdと画面のdata-action-actor-idが一致。
2. 「ついてきて。ここから飛ばすよ。」→専用Cut-in→効果反映→Result。
3. 他キャラのスキル名・汎用台詞が混在しない。
4. 会話とCut-inでPause／Resume、再発動時に会話から再開始。
5. 表示待ち中にHP・Replayが先行せず、会話後は進行が止まらない。

ハーネスPASSを実戦PASSへ代用しない。実戦でcue.actorId、cue.skillId、actionKey、actionPresentation有無と表示実行者の対応を確認する。

Billing available:falseとCheckout未実施、Reduced Motion、Emblem Chat／Activity未再現は別Gateとして継続。Production公開・全体実機確認依頼は、未達Gate解消まで不可。

## ローカル検証結果

- Typecheck・mock環境Build：PASS
- Focused ESLint：0 errors
- 専用コンテンツresolver／cue契約・停止再開テスト：PASS
- 実Viewerの静的描画テスト：10/10 PASS。同名敵味方／古いtimeline・targetLine／不明actor拒否を含む。CSS動画・実サーバー戦闘の確認ではない。
- 実Raid専用会話：新候補では未検証。Codex差分Acceptance待ち。

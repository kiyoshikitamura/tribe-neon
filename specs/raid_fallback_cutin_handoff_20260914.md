# 実Raid fallback専用演出修正・Codex引継ぎ

状態：コード修正・ローカル検証完了。新Preview実戦Acceptance待ち。

## 基準

ユーザー報告の配信 `2f84a5039dac377f342c856014bce2deba70f239` / `dpl_CB272rffbm6jVt15d9PP6UwhkZdy` にて、実Raidの専用会話欠落を確認。
本候補は透過素材修正 `82a546ed31d522792ea890110cc3f2b59d6f4c53` の後続。3件の素材修正も包含する。

## 修正

- StreetBattleViewerのactionPresentationがnullの場合、既存resolveBattleSkillPresentationを使用。戦闘参加者の保存スキルからIDと専用会話を取得する。
- ID付きactionPresentationがある場合は従来のID判定を維持。
- fallbackのSkill IDも希少度判定へ渡す。専用所有者の照合を維持し、スキル未装備・別所有者へ専用会話を出さない。
- QAハーネスのENDING→OUTCOME→RESULTタイマーをReplayタイマーから分離。画面状態に属するeffectが生成・解除するため、ReplayのclearTimersによる消失を防ぐ。
- 戦闘計算・報酬・Raid／Emblem Authority・DBは変更しない。

## ローカル検証

- Typecheck：PASS
- ローカルmock Build：PASS（Vercel実設定Buildではない）
- 専用コンテンツ検証：PASS。実resolverを実行しSKILL_055のid／skill_card_id／skill_id、所有者一致・不一致、スキル欠落、null cueを確認。Streetのresolver接続はコード検証。
- 専用会話シーケンスの停止・再開テスト：PASS
- 実Raid・QAハーネスResultの実画面再確認：未実施

## Codexへ依頼する差分

1. 新SHAの専用Preview配信。Preview Supabase `sufvuqdnqohpfzkwxohq`、mock=false、Raid Room UI=trueを維持。Migration再適用・Production／共有alias変更なし。
2. アゲハ／SKILL_055／LEGS_020の実Raidで、専用会話→Cut-in→効果反映→Resultを確認。HP／Replayの先行なし、再発動・Pause／Resumeも確認。
3. QAハーネス最終イベントからENDING→OUTCOME→RESULTへ到達すること。
4. WEAPON_047／WEAPON_049／HEAD_020は本候補に修正済み。実画面の装備一覧・演出帯で透過を確認。前配信に未包含だった点と、素材自体の修正未完了を混同しない。
5. Reduced Motionは切替可能な検証環境があれば確認。実行できない場合は未検証を維持。

## 継承する報告済みPASS

Raid Clear／Rescue2倍、貢献条件・受取冪等性、通常Raid完走、期限切れ／stale CTA。
Emblem他Guild／無効ID拒否、保存値保持、320／390px、Backdrop、主要表示面。
同ロジックの全面再監査は不要。

## 継続する残件

- Billing available:false。Stripe test secret、Webhook secret、固定Preview return origin等の安全な設定が必要。Checkout以降未実施。
- Emblem Chat／Activity対象Surface未再現。Standardに期限概念がないため期限切れFixtureは対象外として区別する。
- Production公開・全体実機Acceptanceはまだ不可。修正の実戦PASSとBilling Gate達成を別々に報告する。

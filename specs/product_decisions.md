# 企画方針・リリーススコープ決定事項

## レイドランキング廃止（2026-09-08・優先決定）

Product Ownerの訂正と実装継続指示により、レイドの個人/Guild・日次/Seasonランキングおよび順位報酬の新規生成を廃止する。新Roomの貢献を既存ランキングに合算する案は撤回。Room内の参加者・貢献表示、討伐/救援成功報酬は別に扱う。PvP・総合力・Guild総合力等の他ランキングは維持する。

過去の順位履歴・報酬台帳・発行済みPresentは保持する。下記の旧レイドランキング定義と矛盾する場合は本節を優先する。詳細は`raid_room_rescue_v1.md`。実装と実DBへの適用完了は区別する。

## M9-X Cold Start / Social（2026-08-18）

- Tutorial必須工程は`GACHA -> FORMATION -> QUEST -> SPEED_UP -> NPC_BATTLE`。GrowthはTutorial外のMission Hub POWERへ移す。
- Tutorial 10連はDaily Normalと別契約。1〜9枠は通常枠、10枠目は正規SSR 10体からServerが選択する。
- PvP結果はRank Point表記。RateはGvGのみ。
- PRE_OPENかつLv8未満のQuest時短はServer判定で無料。
- 偽Activity/BOTは禁止。Guild WelcomeはSystem Card、挨拶presetは自動送信しない。Chat Replyは1階層のみ。

決定日: 2026-08-03

## Production Specification Reconciliation（2026-08-17）

本節は本書内の2026-08-05以前の記述と矛盾する場合に優先する。詳細なStatusとMismatchは`specification_reconciliation.md`を参照する。

### CONFIRMED + IMPLEMENTED

- Player代表編成は独立Main Formation 1〜5体。PvP Defense等とは分離する。
- Total PowerはMain Formationの`Σ(final HP + final ATK + final DEF)`をServer側で確定する。SPD、LUK、Friend Helper、Skill、Passiveは含めない。
- Daily境界は00:00 JST。04:00およびrolling 24hは廃止する。
- 通常Ranking Seasonは月次とし、初回のみ任意期間を許容する。期間と状態はServer dataを正本とする。
- RankingはPower、Guild Power、PvP、GvG、Raidの5カテゴリとする。
- Character Awakeningは最大+5、Skill Slotは`3/4/5/6/6/6`。同Character重複は+4までCASHなしで即時+1する。
- +5後の重複変換先は汎用素材「覚醒の書」とする。`LAW_OF_STRIFE`はinternal互換IDとして維持できるが、「抗争の掟」はユーザー向け名称として廃止する。
- Daily Free GachaはCharacter、Skill、EquipmentのNormal各10連を毎日1回、正式運営後も恒常提供する。
- Normal TicketとSpecial Ticketは分離する。
- GvGは12:00、20:00、23:00開始、各30分。Guild RankingはSeason rate、Individual RankingはSeason actual damageを使用する。
- Pre-OpenではGvG、Payment、Special Gachaを停止し、Production開放はServer-side operating stateを正本とする。

### PROVISIONAL

- GvG rate式、端数、試合内容・格差補正、C〜S閾値、同率、Ranking Reward、初回Season日時、Season lifecycle運用。
- 60体の`SSR10/SR20/R20/N10`総数構成と個別Rarity割当。60体Roster自体は確定する。
- Character Identity、D0〜D3、専用Skill/Equipmentの割当・内容・Launch数。
- 覚醒の書の変換量、必要冊数、段階Cost、CASH併用。
- Skill duplicate point curve、スキル指南書のID統合・交換率・供給量。
- 装備汎用限界突破素材の正式名称、必要量、供給量。
- Ticket供給量、カテゴリ分割、Pity接続、各Ranking/Economy Rewardの具体値。
- D7/D30/D45〜60/D90の5人編成完成目標と数値KPI。

### DEPRECATED

- PvPの週次タームを固定Production Seasonとして扱う記述。
- GvGの`daily_points` / `season_points`、勝利+250 / 敗北-100、旧拠点支配Point Ranking。
- 具体値が未確定のGvG rate / C〜S閾値 / Rewardを確定値として扱う記述。
- Client計算Total Power、SPD/LUK込みPower、PvP Defenseを代表編成として扱う記述。
- 単一`GACHA_TICKET`をNormal/Special共通契約として扱う設計。

## 1. コアゲームサイクル

PvP・GvG・レイドをゲーム継続の中心コンテンツとする。

```text
日次ログイン / ミッション / クエスト
  -> 通貨・チケット・育成素材の獲得
  -> キャラクター・スキル・装備の収集と育成
  -> デッキ編成
  -> PvP / GvG / レイド参加
  -> ランキング・シーズン・ギルド報酬
  -> 次の育成・編成へ還元
```

## 2. ビジネスモデル

基本無料＋アイテム課金とする。収益の中心は収集補助であり、ガチャを主軸とする。

優先順位:

1. キャラクター・スキル・装備ガチャ（主軸）
2. 育成素材・スタミナ回復・各種パックによる時間短縮（補助）
3. 将来的な限定商品・シーズン商品

課金設計では、対人コンテンツにおける過度な直接的戦力販売を避け、収集・育成の選択肢を広げることを基本方針とする。具体的な排出率、天井、重複変換、購入上限は各仕様書で定義する。

## 3. リリース時のオミット範囲

以下は初回リリースの対象外とする。

- シナリオ／ADVエンジンおよび`flow_nodes`形式のストーリー進行
- アバター作成UI・通常導線
- アバター専用の追加アセット生成

これらはデータ構造や既存コードを残す場合でも、リリース受入条件・主要ゲームサイクルには含めない。再開時は別途企画・実装計画を作成する。

## 4. 初回リリースの必須領域

- キャラクター・スキル・装備の収集／育成
- 通貨・チケット・無料回数・ピティを含むガチャ経済
- 5人デッキ編成とバトル
- PvPランキング／シーズン
- GvGの拠点・貢献・シーズン報酬
- レイドの協力ダメージ・報酬
- 日次ミッション、ログイン、育成ループ
- ギルド・フレンド・ランキングの最低限のソーシャル機能

## 5. 実装優先順位への反映

1. PvP・GvG・レイドのPreview実機検証と不足機能修正
2. ガチャ・育成・報酬経済の受入テスト強化
3. ギルド／フレンド／ランキングの継続利用導線
4. Stripe実決済（収集補助を主軸とした商品設計）
5. シナリオ／ADV／アバターはリリース後候補として保留
## 2026-08-03 priority correction

The final content hierarchy is: **GvG as the main content**, with **raid, PvP, and quests as sub-content**. This supersedes the earlier wording that listed PvP/GvG/raid at the same priority.

## 2026-08-05 social-profile-guild decision

`spec_social_profile_guild_communication.md` is the authoritative specification for user profiles, guild capacity and guild-page decorations, chat, BBS, and DM flows. It supersedes prior conflicting details, including a guild-capacity maximum of 30 and PvP user-XP rewards.

## 2026-08-05 shop-home-performance decision

`spec_shop_home_performance.md` is the authoritative specification for limited and normal shops, the 72-hour beginner pack, the VIP pass route, my-page navigation/background behavior, and cross-content loading optimization. It supersedes prior conflicting details, including a 24-hour beginner-pack limit and direct VIP-pass purchasing from the my page.

## 2026-08-05 character-page decision

`spec_character_page.md` is the authoritative specification for the character-page layout, character-rarity backgrounds, rarity-enhanced equipment and skill icons, and the equipped-skill status display. The supplied reference is a layout benchmark only; its assets and distinctive UI are not reused.

## 2026-08-05 tutorial decision

`spec_tutorial.md` is the authoritative specification for the new-user tutorial. It defines name-only setup, persistent navigation-character guidance, free daily gacha, auto formation, a free dispatch shortcut with a guaranteed tutorial battle, the four-slide rule guide, and mission-led completion.

## 2026-08-05 settings decision

`spec_settings.md` is the authoritative specification for settings. It includes profile and title editing plus separate BGM/SE controls, and excludes browser push-notification settings.

## 2026-08-05 authentication decision

`spec_authentication.md` is the authoritative specification for Google OAuth and email/password authentication. First-time users enter a username and complete the tutorial as a provisional user, then link exactly one unused authentication identity before entering normal gameplay.

## 2026-08-05 battle-system decision

`spec_battle_system.md` is the authoritative specification for quest, PvP, raid, and GvG battles. GvG uses common guild HP as its win condition and actual individual damage as contribution points for rankings and rewards; fixed win/loss points no longer determine GvG outcomes.
## GvG確定仕様（2026-08-05）

- 開催は毎日3回（12:00開始、20:00開始、23:00開始）。各回30分。
- シーズンは月次。毎月の最終金曜・土曜・日曜は通常戦ではなく、上位ギルドのみ参加できる特別戦とする。
- 通常戦、特別戦、日次・月次報酬の内容と数量は報酬マスタで管理する。
- GvGの開催判定、参加資格、集計、報酬配布は上記ルールを単一の基準とする。
## PvP・レイド確定仕様（2026-08-05）

### PvP

- 常時開催とし、日次ランキングを常設する。
- 1週間を1タームとし、週次ランキングを集計する。
- 日次・週次の報酬は報酬マスタで定義する。

### レイド

- 毎日ランダムに2拠点でレイドボスを発生させる。
- 各レイドは発生から24時間開催する。
- レイドランキングを設ける。
- レイドボスはボスマスタで定義する。
- 撃破時・時間切れ／失敗時ともに、報酬は報酬マスタで定義する。
## 原資とゲームサイクル確定（2026-08-05）

### 原資の分離

- クエストとGvGは共通原資の行動力（AP）を消費する。
- PvPはPvPポイントを消費する。PvPポイントは初期・上限5点、1時間ごとに1点回復し、チケット制は採用しない。
- レイドはレイド専用の挑戦回数・コストを消費する。
- PvP・レイドの参加状況が、クエスト／GvG用APを直接奪わないようにする。

### 継続サイクル

GvGはエンドコンテンツだが常時開催ではないため、非開催時間をクエスト・育成・準備に使う。

```text
クエスト（AP消費）
  -> 放置・派遣によるキャッシュ／素材／経験値
  -> キャラクター・スキル・装備育成
  -> ガチャ（収集・重複強化・時短）
  -> GvG開催時間はAPを使ってエンドコンテンツへ参加
  -> 非開催時間はクエストで次回GvGを準備

PvP（専用原資）／レイド（専用原資）は任意参加
  -> 参加報酬で育成が加速
  -> 不参加でもクエストと通常育成で進行可能
```

PvP・レイドは参加した方が育成効率が上がるが、参加しないことで通常進行が停止しない設計とする。
## ミッション・ログインボーナス・ガチャ・フレンド確定仕様（2026-08-05）

### ミッション

- デイリーミッション: 毎日リセットし、繰り返し達成可能。
- 通常ミッション: 繰り返し不可で、1回のみ達成可能。
- ミッション内容・達成条件・報酬はすべてマスタ定義。

### ログインボーナス

- 30回分のシートを埋める形式。
- ログイン1回でシートを1マス進め、対応報酬を獲得。
- 30回完了後は新しい30回シートを開始し、繰り返す。
- シート内容・報酬はマスタ定義。

### ガチャ

- キャラクター・スキル・装備それぞれにノーマル／スペシャルを用意。
- 確率・排出内容・重複処理・ピティ条件はすべてマスタ定義。
- ノーマル: 1回あたりキャッシュ1,000、ダイヤ100、またはノーマルガチャチケット1枚。10倍消費で10連可能。毎日10連1回無料。天井なし。
- スペシャル: 1回あたりキャッシュ3,000、ダイヤ300、またはスペシャルガチャチケット1枚。10倍消費で10連可能。天井あり。
- 期間限定ガチャを追加できるデータ・画面・サーバー構造とする（初期ローンチでは未投入）。

### フレンド

- フレンドのリーダーキャラクターをバトルパーティへ参加させる。
- フレンドポイント等のポイント経済は現状導入しない。

# GAME03 / TRIBE NEON Post-Tutorial改善 判断Authority

状態：ユーザー確定の判断Authority。2026-09-12追加。実装完了を意味しない。

## 目的・優先順位
Customer Journey、Game Cycle、Motivation Cycleを上位Authorityとし、Tutorial突破後に主要機能を理解する前に離脱していないかを設計・評価の基準とする。数字の低いページだけを局所改善しない。数字は設計したCycleが実際に機能したかを検証する観測値。
進行中の改善・監査は止めない。P0は初期Guide、MyPage、Quest、各ページ間の接続。見た目だけでAcceptanceを通さない。既存仕様との矛盾、DB、UI、運営、課金への影響がある場合に限定して別途報告。

## 初心者の学習順序
Tutorial Complete → Login Bonus → MyPage / Activity →「無料ガチャがまだあります」→ Free Skill Gacha → Free Equipment Gacha → Character / おまかせ装備 → Quest / CASH獲得 → Battle / PvP → Raid → Guild → Mission → 自由行動。
初日中の完走は要求しない。24h / 48hで主要機能への接触が積み上がることを重視する。Tutorialのような一本道・利用制限にはしない。

## Motivationの接続
- 無料でまだ引ける → 引きたい。
- Skill / Equipment獲得 → 装備したい。
- 装備して強くなる → 試したい。
- Quest → CASHが増える → また獲得・育成できる。
- 強くなる → PvP / Battleで試したい。
- 育てた戦力 → Raidで使いたい。
- Raidで他ユーザーを認識 → Guildへ入りたい。
- Guild / Mission → 明日も続ける理由を持つ。
獲得 → 育成 → 資源獲得 → 戦闘 → 協力 → Community → 再育成を段階的に理解させる。

## MyPage・Quest
MyPageではLogin Bonus後の無料Skill / Equipment10連を優先。限定Missionの訴求は主要機能をある程度理解した後へ送る。Missionの通常アクセスを閉じる意味ではない。
QuestはCASHを稼ぐ場所。Gacha → Character強化 → Quest → Battle → CASH獲得 → Gacha / Growthの自走Cycleを成立させる。GuideはCharacter → Quest → Battle / PvP。

## Acceptance
|対象|確認する体験|
|---|---|
|初期Guide|無料SkillとEquipmentの残りを認知し、獲得→装備→Quest→PvP→Raid→Guild→Missionの接触を促す。飛ばして遊べることと実績判定を両立|
|MyPage|Login Bonus後に無料獲得の理由が伝わり、Activityで他ユーザーを認知できる。限定Missionが学習導線を先に覆わない|
|Quest|誰をどこへ派遣し何を得るか、現在の状態、CASH獲得後の獲得・育成への戻り先が分かる|
|接続|各機能の成果が次の行動理由になる。待機・未開催・未加入で全体の学習が停止しない|
|Mission|主要機能の文脈に沿った目標・報酬・次の継続理由を提示|
|Ranking|戦力と他者との差を理解し、育成・挑戦へ戻れる|

コード／DB検証、実操作、UI／UX、Cycle整合の証拠を区別する。既存の挙動PASSを新AuthorityのPASSへ自動転用しない。ユーザーの実機確認は全ページ一括、追加デザイン調整はその後。

## 観測
- Tutorial Complete後24h Feature Coverage / 48h Feature Coverage。
- Gacha、Character、Quest、Battle / PvP、Raid、Guild、Missionの接触。
- D1再訪。
- 継続ユーザーと離脱ユーザーの接触機能差。
Guide完走率・前Stepから次Stepへの単純離脱率だけで判定しない。24h/48hはTutorial Complete起点。期間未経過ユーザーを未接触失敗に混ぜない。接触（画面訪問）と実行成功を別に記録・確認し、クリックだけで獲得・参加・加入を達成扱いにしない。
接触イベントの既存定義・利用可能性とD1の集計定義は実装前の計測照合対象。新しい達成目標値、Guild加入の強制条件、既存ユーザーのGuide再開条件は勝手にFIXしない。

## 既存との照合（配信1a814d7と同一コード）
- HomeInitialGuideは無料Skill/Equipment共通CTAを持ち、HomeTabはSkill未完ならSKILL、完了ならEQUIPMENTへ遷移。学習順は既に整合。残り無料をどう訴求するかはUI監査対象。
- Character → Quest → PvPは実装済み。Quest CTAは「クエストでCASHを集めよう」。報酬後のGacha/Growth接続を実画面で確認する。
- Raid → MissionでGuild Guideがない。新順序へ修正が必要。ただしGuild加入をMission到達の強制条件にしない。接触・加入・案内済みを混同しない。
- PrepMissionEventDialogControllerはLogin Bonus終了後に限定Missionを表示し、主要機能の学習状況条件がない。表示優先度・待機条件の修正が必要。待機中を表示済みと記録しない。認証案内の待機条件との整合も対象。
- Raid未開催時のMissionアクセス許可・実参加未達保持・開催後再案内は既存承認を維持。新Guild案内を追加しても未開催で停止させない。
- 24h/48h機能接触の計測対応は未検証。既存イベントと照合して不足だけを追加する。
- 今回はAuthority・仕様・監査指示の更新。DB、商品価格、排出率、Pool、Productionの変更なし。


## Guide × Mission統合の追加Authority

正：`guide_mission_integration_mapping_20260912.md`。初心者Mission = Guide + Achievement + Reward + Reflow。報酬未受取でJourneyをロックせず、先行達成を認識する。旧「受取成功のみで次へ進む」案は撤回。通常Missionの戻り先は維持し、初心者導線経由の受取だけHomeへ帰還する。原則は確定、具体的な既存Mission対応・不足条件の修正は提案段階。報酬追加/増量は未実施。

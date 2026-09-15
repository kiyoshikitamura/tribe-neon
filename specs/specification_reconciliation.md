# 仕様整合台帳

> **2026-09-12更新：** 課金・ショップ・スペシャルガチャ・専用演出・購入分の期限については、[課金公開・統合設計書](monetization_release_20260912.md)を現行仕様とする。本書の該当する旧記述は履歴であり、新規実装の根拠にしない。対象外の仕様は本更新で変更しない。

## M9-X整合（2026-08-18）

| 契約 | 正本 | 状態 |
| --- | --- | --- |
| Tutorial | Gacha、Auto Formation、固定Quest、無料時短、NPC Battle | CONFIRMED + IMPLEMENTED |
| Growth | Tutorial必須外、Mission Hub POWER | CONFIRMED + IMPLEMENTED |
| Tutorial SSR | Daily claim非消費、10枠目を正規SSR 10体からServer選択 | CONFIRMED + IMPLEMENTED |
| PvP表記 | PvP Rank Point。RateはGvGのみ | CONFIRMED + IMPLEMENTED |
| Social | 実SSR獲得・Guild設立・総戦力1位交代のみ | CONFIRMED + IMPLEMENTED |
| NPC PvP Practice | Viewer再利用、公式Replay/消費/戦績/報酬/Ranking更新なし | CONFIRMED + IMPLEMENTED |
| Guild Welcome | MASTERのみ120文字以内で編集、Memberは表示のみ | CONFIRMED + IMPLEMENTED |
| Human Response Journey | Title→Guild加入→明示挨拶→再訪未読→他Member返信 | CONFIRMED + E2E PASS |

最終更新: 2026-08-17

## 2026-08-17 Production Specification Reconciliation

この節は本書の旧監査表および個別仕様書の旧記述に優先する。仕様の優先順位は、`明示的な最新Product Decision` → `Production契約として成立済みの最新実装` → `現行仕様書` → `旧実装・Mock・historical migration` とする。実装が最新Product Decisionと矛盾する場合は、実装へ合わせて仕様を変更せずMismatchとして扱う。

### Status

- **CONFIRMED**: Product Decisionとして確定済み。
- **IMPLEMENTED**: CONFIRMEDかつProduction contractとして実装済み。
- **PROVISIONAL**: 方向性または候補値。Production masterへ確定値として投入禁止。
- **DEPRECATED**: 新規実装・Balance・設計の参照元として使用禁止。

### Production正本マトリクス

| Domain | Contract | Status | Production source / disposition |
| --- | --- | --- | --- |
| Main Formation | 独立した1〜5体の代表編成。PvP Defense等とは分離 | CONFIRMED + IMPLEMENTED | `ranking_power_p0_foundation.md`、migration `00154`〜`00158` |
| Total Power | Main Formationの`Σ(final HP + final ATK + final DEF)`。SPD/LUK/Friend/Skill/Passiveを除外 | CONFIRMED + IMPLEMENTED | Server-authoritative projection。Client計算は禁止 |
| Daily boundary | 全日次集計は00:00 JST境界 | CONFIRMED + IMPLEMENTED | 04:00、rolling 24hはDEPRECATED |
| Guild Power | Seasonは全Member、Dailyは当日Active Memberの現在Total Power合計。人数平均なし | CONFIRMED + IMPLEMENTED | Ranking/Power contract |
| Ranking Season | 通常月次。初回のみ任意期間可。`season_id/starts_at/ends_at/status`をServer正本とする | CONFIRMED + IMPLEMENTED | Clientの暦推測は禁止 |
| Ranking categories | Power / Guild Power / PvP / GvG / Raid | CONFIRMED + IMPLEMENTED | PvP Daily=勝利数、Season=Rank Point。GvG Guild=rate、Individual=actual damage。Raid Daily=instance damage、Season=正規instance累積 |
| GvG schedule | 12:00 / 20:00 / 23:00、各30分 | CONFIRMED | 開催契約。GvG rate式・閾値・報酬とは分離 |
| GvG rate/reward | rate変動式、端数、試合内容・格差補正、C〜S閾値、同率、報酬、初回日時、lifecycle運用 | PROVISIONAL | `spec_battle_system.md`の具体値は設計候補でありProduction固定値ではない |
| Character roster | 60体 | CONFIRMED + IMPLEMENTED | migration `00126`は暫定release masterとして実装 |
| Character rarity | SSR10/SR20/R20/N10の総数構成は候補。個別割当は未確定 | PROVISIONAL | Creative上のHero/Culture/KV分類とRarityを混同しない |
| Character identity | Primary Culture / Tags / Archetype / Culture Anchor / Hero Anchor / KV Cast | PROVISIONAL / MISSING | 60体の正式正本がない。新規Character Production Master MDが必要 |
| Awakening | 最大+5、Slot数は3/4/5/6/6/6 | CONFIRMED + IMPLEMENTED | Rarity別初期Slot差なし |
| Character duplicate | +0〜+4はCASHなしで即時+1。+5後は汎用素材へ変換 | CONFIRMED + IMPLEMENTED | 汎用素材の表示名は「覚醒の書」 |
| 覚醒の書 economy | 変換量、必要冊数、段階Cost、CASH併用 | PROVISIONAL | internal ID `LAW_OF_STRIFE`は互換目的で維持可。「抗争の掟」は表示名としてDEPRECATED |
| Character depth | D0〜D3、人数、Launch時専用品数 | PROVISIONAL | 専用品がBuild Depthを作る方向のみ維持 |
| Exclusive skills | 20行はplaceholder。通常3〜6枠共有が候補 | PROVISIONAL | Character binding / 効果未確定。確定Skillとして使用禁止 |
| Exclusive equipment | Production Ready / Asset / binding / battle effectを個別判定 | PROVISIONAL | 既存候補を一括で確定品扱いしない |
| Skill growth | +10骨格 | CONFIRMED + IMPLEMENTED | Duplicate point curve、段階必要量、MAX変換はPROVISIONAL |
| Skill generic resource | 「スキル指南書」は正式名称候補 | PROVISIONAL | `TRAINING_MANUAL` / `SKILL_LB_BOOK`統合、交換率、供給量は未確定 |
| Equipment growth | Level / +10 LB / 7 Slot | CONFIRMED + IMPLEMENTED | 同一Duplicateだけを完成経路にしない方向 |
| Equipment generic LB | 装備汎用限界突破素材（仮） | PROVISIONAL | `EQUIP_LB_HAMMER`はinternal ID。正式商品名・必要量未確定 |
| Daily free gacha | Character / Skill / EquipmentのNormal各10連を毎日1回 | CONFIRMED + IMPLEMENTED | 正式運営後も恒常。Pre-Open限定ではない |
| Gacha rates | Normal N50/R40/SR10、Special R60/SR35/SSR5 | CONFIRMED | Characterはbucket整合。Skill/Equipment実効row weightはMismatch |
| Ticket split | Normal Ticket / Special Ticketを分離 | CONFIRMED / NOT IMPLEMENTED | 現行`GACHA_TICKET`が双方で使える契約はMismatch。供給・カテゴリ・Pity接続はPROVISIONAL |
| Special Gacha | Pre-Open停止、Production開放はServer-side operating state | CONFIRMED / NOT IMPLEMENTED | UI非表示だけでは停止契約を満たさない |
| Five-person completion | D7/D30/D45〜60/D90目標 | PROVISIONAL | Economy simulationで調整。固定KPIではない |
| Daily progression | 大型Awakening／中期Skill／日次Equipment・Levelという体感設計 | CONFIRMED direction | Active Day等の数値KPIはPROVISIONAL |
| Launch control | Pre-OpenはGvG/Payment/Special Gacha停止。Production開放はServer-side state | CONFIRMED / PARTIAL | Paymentの旧consumer RPCはM8で拒否済み。Special Gachaはclient-callable、GvGはACTIVE match依存で、統一operating stateは未成立 |

### Production mismatch backlog（本監査では未修正）

| Priority | Mismatch | Risk / required next action |
| --- | --- | --- |
| P0 | Special Gacha RPCがServer-side operating stateを強制せず、UI停止に依存 | Pre-Open中の直接RPC実行リスク。Production Master実装前にserver guardが必要 |
| P0 | GvGに明示的なProduction operating stateがなく、ACTIVE matchだけで開始可否を判定 | Pre-Openではmatch生成を止める運用が必要。Production開放前にserver guardを明文化・実装する |
| P1 | PaymentはM8によりauthenticatedからの旧purchase RPCを拒否済みだが、Production開放用のoperating state契約はない | Pre-Open停止は成立。Production決済実装時にservice-role処理とserver-side stateを設計する |
| P0 | Skill / Equipment gachaがrarity bucket抽選ではなくrow weight合算 | 公称率と実効率が不一致。canonical rarityの誤分類も含めmaster再構築が必要 |
| P0 | 1種類の`GACHA_TICKET`がNormal/Special双方で利用可能 | 希少性とPity経済を分離できない。ticket contract/migration設計が必要 |
| P1 | 覚醒素材のinternal ID・一部UI/文書が旧名称 | IDは維持可。ユーザー表示を「覚醒の書」へ統一し、量・CostはBalance確定後に反映 |
| P1 | `TRAINING_MANUAL`と`SKILL_LB_BOOK`が併存 | 一本化方針・移行率・供給量のProduct Decisionが必要 |
| P1 | 60体Identity/Rarity/専用品のProduction master正本が未完成 | Creative identity、rarity、exclusive readinessを分離した新規MDが必要 |
| P1 | GvG rate/rewardの旧具体値が確定仕様のように残存 | 本監査でPROVISIONAL注記。Balance simulation後に正式masterを確定 |

### Gacha effective-rate audit

- Character poolは現行60体暫定master上で、Normal `N500/R400/SR100`、Special `R1200/SR700/SSR100`の集約weightとなり、公称bucket率と一致する。
- Skill seedは行数×row weightとなるため、概算でNormal `N47.62%/R38.10%/SR14.29%`、Special `R50.00%/SR43.75%/SSR6.25%`となり、公称率と一致しない。
- Equipment seedも行数×row weightとなり、概算でNormal `N12.79%/R71.61%/SR15.60%`、Special `R64.98%/SR33.02%/SSR2.01%`となる。canonical equipment masterとの行数・rarity対応にも差がある。
- 上記は監査値であり、新しいProduction rateではない。本Phaseではweight/masterを変更しない。

### Deprecated search inventory

| Pattern | Current disposition |
| --- | --- |
| PvP / Mission 04:00 reset | DEPRECATED。00:00 JSTへ統一。旧計画・監査文書はhistorical evidence |
| rolling 24h Daily Power | DEPRECATED。JST calendar dayのServer activity判定 |
| Client-calculated Total Power / SPD・LUK込み | DEPRECATED。Main FormationのServer projectionのみ |
| PvP Defense = 代表Party | DEPRECATED。Main FormationとPvP Defenseは独立 |
| GvG `daily_points` / `season_points` | DEPRECATED。Guild rate / individual actual damageへ置換 |
| GvG win +250 / loss -100 | DEPRECATED。旧履歴節にのみ残置可 |
| 「抗争の掟」表示名 | DEPRECATED。ユーザー向けは「覚醒の書」。`LAW_OF_STRIFE`はinternal互換ID |
| Daily Free GachaがPre-Open限定 | DEPRECATED。Normal 3カテゴリ各10連/日を恒常運用 |
| 単一`GACHA_TICKET` | Production方針とMismatch。Normal/Special分離がCONFIRMED |

### Document authority

- `product_decisions.md`の2026-08-17追補、本節、`ranking_power_p0_foundation.md`、各機能の最新確定追補をProduction判断に使用する。
- `game_spec.md`、`game_proposal.md`、`development_rules.md`、旧migration、Mock、実装完了メモはhistorical/referenceであり、上記正本を上書きしない。
- 以降の旧表は2026-08-05時点の監査履歴である。「統合済み」「実装改修対象」という表現だけをProduction完成判定に使用しない。

## 2026-08-05 Historical Reconciliation

本書は、過去仕様と2026-08-05以降に確定した優先仕様の差分を管理する。各機能の実装・改修時は、下表の「現行優先仕様」を使用し、旧記述を新規実装の根拠にしない。

| 項目 | 現行優先仕様 | 旧記述・対象文書 | 対応状態 |
| --- | --- | --- | --- |
| 通常バトルの出撃人数 | 所持キャラクター1〜5体＋友達リーダー最大1体、合計最大6体。前衛・後衛なし | `game_spec.md`の5人固定、`spec_battle_deck.md`の5人固定 | 統合済み。実装改修対象 |
| 友達リーダーの利用範囲 | クエストNPC戦・レイドのみ使用可。PvP・GvGは攻防とも使用不可 | 利用範囲の記述なし | 統合済み。実装改修対象 |
| 作戦 | 攻撃優先／回復優先／スキル優先／バランス／弱点集中の5種類。AP温存は廃止 | `game_spec.md`、`spec_battle_deck.md`の6種類 | 統合済み。実装改修対象 |
| 作戦変更 | 攻撃側は開始直前のみ変更可。防衛側は登録・更新時のみ変更可 | 旧SETUP説明 | 統合済み |
| 敵情報 | 属性、各パラメータ、総合力、装備スキルのみ表示 | 旧SETUP説明 | 統合済み |
| おまかせ編成 | 初期実装はバランス編成のみ | 旧文書に詳細なし | 統合済み |
| スキル発動 | 共有APは使用せず、個別スキルのクールダウンで管理。初回使用可、自身の行動開始時に1減少 | `spec_battle_deck.md`の戦闘内共有AP・AP温存 | 統合済み。マスタ・実装改修対象 |
| 状態異常 | 初期実装は毒・暗闇・沈黙・スタン。出血・麻痺・凍結は将来追加候補 | アセット・装備資料に散在する状態異常記述 | 統合済み。マスタ・アセット改修対象 |
| バフ／デバフ | 初期実装はATK・DEF・SPDの上下、シールド、挑発、バフ解除、デバフ解除 | 旧スキル・装備資料に散在する各種効果 | 統合済み。マスタ・アセット改修対象 |
| オート対象選択 | 撃破優先を基本に、回復・強化・妨害・挑発を効果別に選択。5作戦で優先規則を切替 | 旧AIの個別実装 | 統合済み。作戦マスタ・実装改修対象 |
| 属性相性 | 正義→悪→秩序→混沌→正義の循環。有利時のみ与ダメージ+20% | 旧来の補正値のみの記述 | 統合済み。属性・バトルマスタ改修対象 |
| 基本パラメータ・ダメージ | HP／ATK／DEF／SPD／LUK。ATK×倍率とDEF減衰式を基礎に、バフ・属性・会心・乱数を適用 | 旧`power`値、不利属性-15%、会心倍率幅 | 統合済み。バトル・スキルマスタ改修対象 |
| SPD | 各ラウンド内の行動順のみを決定。全生存キャラは1ラウンドに1回行動し、SPDは行動回数・クールダウン回転に影響しない | 旧動的タイムライン解釈 | 統合済み。バトル実装改修対象 |
| 手番処理順 | クールダウン減少→継続ダメージ→開始時パッシブ→行動制限→AI行動→持続ターン減少 | 処理順の記述なし | 統合済み。バトル実装改修対象 |
| ラウンド上限 | クエスト15、PvP・GvG個別戦20、レイド30。PvP・GvG個別戦の上限到達は防衛側勝利 | レイド以外の上限・引き分け規則なし | 統合済み。コンテンツ別バトルマスタ改修対象 |
| バトル間の状態 | 各個別バトルでHP全回復・戦闘不能復帰・クールダウン初期化・戦闘中効果解除。レイドボスHPとGvG共通HPのみ引継ぎ | パーティ状態の引継ぎ規則なし | 統合済み。バトルセッション実装改修対象 |
| 敵編成 | クエスト通常戦は最大5体、クエストボス・レイドは単体。PvP・GvGは登録人数どおり、NPC防衛は最大5体 | コンテンツ別の敵人数記述なし | 統合済み。クエスト・敵・NPCマスタ改修対象 |
| 基本行動 | 常時使用可能な基本行動は通常攻撃のみ。通常防御は初期実装しない | 旧通常防御の記述 | 統合済み。バトルAI・基本スキル改修対象 |
| 戦闘不能・復活 | HP0で以降の行動・対象から除外。戦闘中の復活は初期実装しない。次戦では全回復・復帰 | 復活可否の記述なし | 統合済み。バトル・スキルマスタ改修対象 |
| バトル中断・復帰 | 開始時にコスト・結果をサーバー確定。中断時も返還なし。復帰時は再生再開または結果要約を選択 | 中断時の扱いが未統一 | 統合済み。戦闘記録・復帰実装対象 |
| 命中・回避 | 通常命中100%、回避パラメータなし。暗闇時80%、必中は暗闇無視。外れた攻撃の付随効果は不発 | 命中・回避規則なし | 統合済み。状態異常・スキルマスタ改修対象 |
| 状態異常成功率 | 基礎成功率−対象耐性を5〜95%に制限。毒80%、暗闇75%、沈黙65%、スタン50%。レイドボスは高耐性を設定可 | 成功率・耐性規則なし | 統合済み。状態異常・ボスマスタ改修対象 |
| バフ／デバフ重複 | 同一効果は重複不可・再付与で持続更新。正負補正は合算。シールドは大きい方、挑発は最後の1件 | 重複・上書き規則なし | 統合済み。効果処理・マスタ改修対象 |
| キャラクターロール表示 | アタッカー／ディフェンダー／ヒーラー／サポーター／トリックスターを主ロールとして情報タグで露出。スキル装備は原則自由 | ロール表示の記述なし | 統合済み。実装改修対象 |
| 成長パターン | 主ロールと分離した`growth_pattern_id`で基礎値・レベル成長を決定。標準パターンにHEALER／SUPPORTER／TRICKSTERを追加 | 既存5パターンのみ | 統合済み。マスタ・スキーマ改修対象 |
| おまかせ編成 | PvE・対人共通のバランス編成のみ。アタッカー／ディフェンダー／ヒーラーの分散を優先し、不足時は総合評価上位で補完 | 自動選出基準の記述なし | 統合済み。編成マスタ・実装改修対象 |
| 自動装着 | 7装備枠と解放済みスキル枠を対象に、ロール適性、専用条件、強化値、クールダウン分散で選出。保存前に変更内容を確認 | 自動装着基準の記述なし | 統合済み。自動編成マスタ・実装改修対象 |
| バトル結果画面 | 通常表示は勝敗・総与ダメージ・最大ダメージ・キャラ別与ダメージ・報酬。詳細ログは任意表示。コンテンツ別指標を追加 | 結果画面の情報設計なし | 統合済み。UI・戦闘ログ実装対象 |
| スキル装備枠 | 初期3枠。覚醒1／2／3で4／5／6枠を解放。覚醒4・5で追加解放なし | 最大6枠のみの記述 | 統合済み。現行UI実装と一致 |
| スキル重複装備 | 同一スキルIDの同一キャラクターへの重複装備は禁止。別キャラクターへの装備は許可 | 重複可否の記述なし | 統合済み。装備検証・自動編成改修対象 |
| スキル所持・重複入手 | 初回入手でアカウント恒久解放。重複はスキルID単位の覚醒・限界突破素材。同一パーティ内の別キャラへの装備も許可 | 個別カード消費と装備競合の旧仕様 | 統合済み。スキル所持データ・ガチャ・育成改修対象 |
| スキル進行仕様 | N/R/SR/SSR、スキルID単位で最大+10。上限後の重複は強化素材または交換チケットへ変換。戦闘内共有APは使用しない | `spec_progression.md`・アセット表のカード合成、AP・得意AP表記 | 統合済み。既存マスタ・実装改修対象 |
| スキル指南書 | スキルレベル経験値ではなく、任意の解放済みスキルに使える汎用限界突破素材 | `assets_items.md`の「レベルアップ経験値素材」表記、`SKILL_LB_BOOK`の旧ID | 統合済み。アイテムマスタ・RPC名称改修対象 |
| スキルマスタ | 基本情報、対象・使用条件、効果、状態変化、運用項目を管理。`ap_cost`・得意AP・戦闘内共有APは廃止 | 現行`skills_master_data.ts`のAP中心フィールド | 統合済み。スキルマスタ・バトル実装改修対象 |
| スキル限界突破曲線 | `+10`時点の標準合計効果量は+41%。`+3`／`+6`／`+10`で個別追加強化、クールダウン短縮は原則不可 | 旧「全段階+20%」 | 統合済み。限界突破マスタ・実装改修対象 |
| スキル限界突破節目効果 | `+3`は既存効果の扱いやすさ、`+6`は同一対象テンプレート内の副次効果、`+10`は条件付き固有強化。範囲拡張・全体沈黙／スタン・CD短縮は禁止 | 節目効果の未定義 | 統合済み。限界突破マスタ・実装改修対象 |
| キャラクター固有パッシブ | 全キャラ1つ。獲得時から有効で、覚醒`+1`／`+3`／`+5`で段階強化。装備パッシブとは固有連携と汎用効果で棲み分ける | 固有パッシブの配布・成長・装備効果との境界が未定義 | 統合済み。キャラクター・覚醒マスタ、キャラクター画面改修対象 |
| 固有パッシブの処理 | 常時型と条件発動型に分け、条件発動はイベントごと1回・標準で1バトル最大1回。SPD順で処理し、再帰連鎖は禁止 | 発動回数・重複・同時処理順が未定義 | 統合済み。バトルエンジン・固有パッシブマスタ改修対象 |
| 装備効果・限界突破ボーナス | 装備マスタの固定固有効果は0〜1つ。`+1`ごとに通常成長、`+3`／`+5`／`+10`で最大3つの数値系・装備ID固定の限界突破ボーナスを反映。取得時の抽選・再抽選は行わない。SR・SSRの固定効果のみ限定的な条件発動を許可 | 装備カタログのランダムサブオプション、AP、出血、回避、タイムライン、無制限な発動型効果 | 統合済み。装備マスタ、既存アセット、データ・バトル実装改修対象 |
| 装備固定固有効果の発動 | バトル開始、初回HP条件、初回撃破、初回状態異常、初回の特定スキル使用に限定。原則1回、SSR専用でも最大2回。反復・継続型は初期不採用 | 毎ターン、通常攻撃・会心・吸収などを契機とする旧効果 | 統合済み。装備マスタ・バトル実装改修対象 |
| 上限ダメージ・オーバーキル | 最大成長時の最大瞬間与ダメージは、常時効果のみを反映した同対戦帯の最大成長ディフェンダーの理論最大HPの約1.5倍（DEF減衰後）。戦績・個人貢献は生ダメージ、HP減少は残HP上限で別管理。超過分は他対象へ移さない | オーバーキル・与ダメージ集計の未定義 | 統合済み。レベルデザイン、結果表示、レイド・GvG実装対象 |
| 標準決着ラウンド | クエスト通常3〜6、ボス6〜10、PvP5〜10、レイド20〜30、GvG個別戦5〜10。ラウンド上限とは別のレベルデザイン基準 | コンテンツ別のHP・火力逆算基準なし | 統合済み。敵・ボス・対戦バランスのマスタ設計対象 |
| ロール別成長比率 | 最大成長時のアタッカーを100としたHP／ATK／DEF／SPD／LUKの相対比を定義。SPDは行動順、LUKは会心率のみ | ロール別の数値傾向のみで比較基準なし | 統合済み。成長パターン・キャラクターマスタ設計対象 |
| 最大成長HPの基準値 | 常時効果のみを反映した最大成長ディフェンダーHP100,000を逆算用指標とする。同一レアリティ・同一ロールでも、総合力予算内で基礎値・成長係数・得意ステータスを個別化する | 6桁オーバーキルの絶対HP基準なし、同タイプのステータス均一化 | 統合済み。キャラクター・装備・敵のレベルデザイン対象 |
| 同ロール内の個性差 | 同レアリティ・同ロール・同育成段階では、HP／ATK／DEF合計は基準±3%、SPD／LUKは±10%、固有パッシブ込みの実戦評価は±5%を目安とする | 個性と性能差の許容範囲なし | 統合済み。キャラクター・固有パッシブのレベルデザイン対象 |
| DEF減衰の基準値 | 最大成長ディフェンダーDEF18,000、防御定数27,000で常時軽減約40%。戦闘中の最終軽減率は60%上限 | 防御定数・ロール別の軽減帯が未定義 | 統合済み。キャラクター・装備・バフ・ダメージ計算のマスタ設計対象 |
| ATK・決戦打の基準値 | 最大成長アタッカーATK約20,800、最大単体スキル基礎300%・`+10`後約423%。各補正を重ねてDEF軽減後150,000を目標とする | 6桁ダメージを成立させるATK・倍率の逆算基準なし | 統合済み。キャラクター・スキル・バフ・装備のレベルデザイン対象 |
| 育成要素別の最終ステータス配分 | HP／ATK／DEFの最終値はキャラクターLv45%、覚醒10%、装備Lv30%、装備突破15%を目安に配分 | キャラクター育成と装備育成の寄与割合なし | 統合済み。成長・覚醒・装備マスタ設計対象 |
| キャラクターLv成長カーブ | 初期Lv50・覚醒ごとに上限+10・最大Lv100を維持。Lv成長寄与はLv1で10%、Lv50で60%、Lv100で100%を目安とする | Lv上限のみで成長曲線なし | 統合済み。成長パターン・キャラクターレベルマスタ設計対象 |
| 装備Lv上限 | 初期Lv50。限界突破`+1〜+5`で各+10Lv、`+5`でLv100。`+6〜+10`は上限を増やさず通常成長・節目ボーナスを継続 | 装備Lv上限と限界突破の関係が未定義 | 統合済み。装備レベル・限界突破マスタ改修対象 |
| 装備Lv成長カーブ | 装備Lv成長寄与はLv1で10%、Lv50で60%、Lv100で100%。HP／ATK／DEFを主に成長させ、SPD／LUKは基礎値・固定効果・突破ボーナスで設計 | 装備Lvの成長曲線・成長対象が未定義 | 統合済み。装備レベル・装備マスタ設計対象 |
| 装備部位別のステータス配分 | ATKは武器70%、HPは頭・胴・脚70%、DEFは頭・胴・脚75%、SPD／LUKはアクセサリー60%を目安に7枠へ配分 | 部位ごとのステータス役割が未定義 | 統合済み。装備マスタ・自動装着評価設計対象 |
| SPD・LUKの基準値 | 最大成長アタッカーのSPD／LUKは各100を基準。SPDは行動順のみ、会心率は5%+LUK×0.2%で上限35%、状態異常成功率には使わない | SPD／LUKの絶対値・会心率係数が未定義 | 統合済み。成長・装備・会心計算マスタ設計対象 |
| キャラクターレアリティ予算 | HP／ATK／DEFの総合力予算はSR=100に対しN80、R90、SSR110。同レアリティ内の個性差は別途±3%に収める | レアリティ間の性能差基準なし | 統合済み。キャラクター・成長・ガチャのレベルデザイン対象 |
| 装備レアリティ予算 | 基礎値・Lv成長・突破ボーナスはSR=100に対しN70、R85、SSR115。SSR一式とSR一式の最終差は約7%を目安とする | 装備レアリティ間の性能・固定効果の基準なし | 統合済み。装備・成長・ガチャのレベルデザイン対象 |
| スキルレアリティ性能帯 | 単体攻撃基礎倍率はN100〜140%、R140〜180%、SR180〜240%、SSR240〜300%。N・Rは短CD、SSRは高性能・低回転率 | スキルレアリティごとの倍率・CD帯なし | 統合済み。スキル・クールダウン・ガチャのレベルデザイン対象 |
| 初期バフ・デバフ数値 | ATK／DEF±20%（強力版±25%）、SPD±15%（強力版±20%）、シールド最大HP15%（強力版20%）を標準。通常2行動、挑発1行動 | 効果量・持続の基準なし | 統合済み。スキル・バフ／デバフマスタ設計対象 |
| 回復スキル数値 | 使用者最大HP基準で単体回復20%（強力版30%）、全体回復12%（強力版18%）、シールド15%（強力版20%）。会心・乱数なし | 回復量・全体回復の基準なし | 統合済み。スキル・回復・シールドマスタ設計対象 |
| 毒ダメージ数値 | 付与者ATKの20%を3回、強力版30%を3回。同一毒は重複せず、会心・属性・乱数なし | 毒の倍率・合計ダメージ基準なし | 統合済み。状態異常・スキルマスタ設計対象 |
| 敵・ボスHPの逆算 | プレイヤー総合力への動的追従は行わず、想定パーティDPR×標準ラウンド数から固定マスタで設定。PvPは実編成を使用 | 敵・ボスHPと標準決着ラウンドの接続なし | 統合済み。クエスト・敵・レイド・GvGマスタ設計対象 |
| 全体共有レイドの討伐基準 | 想定参加者の70%が無料3回を消化すれば24時間内に討伐できるHP。4〜10回目の有償挑戦は時短・貢献・ランキング用途であり討伐必須にしない | 共有レイドの想定参加量・有償挑戦の役割なし | 統合済み。レイドHP・参加・報酬マスタ設計対象 |
| スキル対象テンプレート | 敵単体・敵全体攻撃、味方単体・全体回復、味方単体・全体強化、敵単体・全体弱体の8種。ロールによる装備制限は設けない | 対象範囲・ロール制限の未定義 | 統合済み。スキルマスタ・AI改修対象 |
| 全体スキルと強力スキル | 全体攻撃・全体回復は単体同等効果の55〜65%を目安。全体状態異常は毒・暗闇のみ。高性能スキルは倍率・条件・長CD・連携で個別設計する | 全体沈黙・全体スタンを含む無制限な効果設計 | 統合済み。スキルマスタ・レベルデザイン対象 |
| 専用スキル枠 | 追加専用枠は設けず、通常の覚醒解放済み3〜6枠の1つとして装備 | 旧「専用スキル枠」表記 | 統合済み。スキルUI・装備検証改修対象 |
| 総合力 | 友達リーダーを除く、出撃パーティの所持キャラクター1〜5体の最終HP・ATK・DEF合計。SPD・LUKは含めない | `development_rules.md`の3人合算、`spec_ranking.md`の5人合算 | 統合済み。実装改修対象 |
| クエスト派遣 | 通常バトルと完全に分離。1任務につき所持キャラクター1体を派遣し、同時派遣は最大5枠（最大5体） | `game_spec.md`の派遣3名 | 統合済み |
| PvPポイント | 初期・上限5、1時間ごとに1回復。チケット制は廃止 | 旧PvPチケット関連仕様 | 統合済み |
| 称号 | 性能効果なし。通常ミッション・実績、PvP／GvGシーズン順位、イベント、特別配布で取得し、永久所持・1つ装備・変更回数制限なし。課金限定称号は初期不採用 | 称号の入手経路・性能影響が未定義 | 統合済み。称号マスタ・プロフィール実装対象 |
| 全コンテンツ性能目標 | 一般的なスマートフォン・4G回線を基準に、キャッシュ済み遷移0.5秒、未キャッシュ操作可能化P75 2.5秒／P95 4秒、バトル開始準備P75 3秒／P95 5秒を目標とする | 性能方針のみで数値目標なし | 統合済み。計測・性能改善対象 |
| クエスト／GvGのAP | クエストとGvGは同一のユーザー保有APを消費する。GvG専用APは設けず、GvG侵攻は1回20AP、APが続く限り挑戦可能。想定3回は60AP | GvG専用APとも読める「共通AP」表現、GvG侵攻コストの仕様書未記載 | 統合済み。原資・GvG開始条件実装対象 |
| GvG | 2フェーズ（2回陥落で勝利）の共通HPハイブリッド。初期10人ギルドでは想定参加6人×3回の合計18有効挑戦で全2フェーズが決着する耐久値を基準とする。敗北時も実与ダメージ100%、勝利時は実与ダメージの150%を共通HPへ反映し、個人貢献は常に勝利ボーナス前の実与ダメージで記録する。事前マッチング、ランク・報酬は`spec_battle_system.md`準拠 | 旧拠点支配ポイント制、1回HP削り切り勝利 | 統合済み。旧横断記述は改訂対象 |
| GvG防衛枠 | 所属メンバー全員が1人1枠で抽選対象。未登録枠はギルド総合力÷防衛対象人数を基準とする標準NPC防衛デッキで補完し、確定時にスナップショット化する | 登録済みデッキだけを抽選、ギルド全体未登録時のみNPC補完 | 統合済み。GvG防衛選出・NPC生成実装対象 |
| GvG防衛枠の抽選 | 全防衛枠から均等ランダム。ただし、同一攻撃ユーザーには直前に選出された枠を連続選出しない（候補が1枠のみなら許可）。開催全体の選出回数制限・弱体化は設けない | 抽選偏り・連続選出の扱いなし | 統合済み。GvG防衛選出実装対象 |
| GvG開催中のギルド操作 | 30分の開催中は両ギルドの加入・脱退・追放・解散・役職変更・防衛デッキ変更を完全ロック。申請・招待は受付のみ可能で、承認・反映は終了後。初期実装では緊急操作などの例外を設けない | 開催中のメンバー変動・権限操作の扱いなし | 統合済み。ギルド権限・GvG状態管理実装対象 |
| GvG終了境界 | 終了時刻までにサーバー受理された攻撃は有効。開始時に結果を確定し、再生が終了時刻をまたいでも反映する。終了後の開始は不可 | 終了時刻直前の攻撃・再生中攻撃の扱いなし | 統合済み。GvG開始受付・結果確定実装対象 |

## 改訂時の優先順

1. `spec_battle_system.md`（共通バトル・PvP・レイド・GvG）
2. `spec_character_page.md`（編成・キャラクター画面）
3. 機能別仕様書
4. `game_spec.md`および`development_rules.md`の横断・実装履歴

`game_spec.md`および`development_rules.md`には実装履歴を含む旧記述があるため、確定済み仕様を上書きする根拠としては扱わない。実装前には本台帳で対象箇所を確認し、必要に応じて改訂する。

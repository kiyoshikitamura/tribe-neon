# Raid Room生成契約（第6工程）

## 到達範囲

認証付き公開RPCとしてRoom生成とBoss選択肢を実装する。作成追加消費なし。戦闘開始・救援・報酬・公開参加は含まない。既存Raid Lv5解放を維持し、生成時のMain Formation総合力はサーバーの既存`calculate_user_total_power`から取得する。初級制限なし、中級160000、上級200000、超級240000、閾値一致は通過する。

`raid_room_creation_settings`の単一行は初期`enabled=false`。旧`rotate_daily_raids`・`start_raid_battle`・確定・終了・報酬処理がRoomを分離できるまで、共有環境で有効化してはならない。`ROOM:<Instance UUID>`というday keyは日次グループ識別であり、旧writerの遮断ではない。現段階ではローカルSQL fixtureのみで有効化して検証する。

## API

- `list_raid_room_boss_choices_v1()` → `{choices: [{raidVariantId: string, name: string}]}`。認証必須。`canonical_raid_variants.is_production_enabled`のみをID昇順で返す。生成フラグが無効でも選択肢の読み取りは可能。
- `create_raid_room_v1(p_difficulty_id text, p_raid_variant_id text, p_request_id uuid)` → 既存Room DTO。所有者・総合力・HP・期限・開始時刻をclientから受け取らない。

作成者は`auth.uid()`。同じユーザー・request IDの同じpayload再送はRoomを再生成せず最新の既存DTOを返す。別payloadへの使い回しは拒否。異なるユーザーでは同じrequest IDを使用できる。再送台帳はprivate。生成フラグ無効時には再送も拒否し、既存Room参照RPCを使う。

## アトミック処理

READ COMMITTEDのみ許可。設定行をFOR SHAREで保持して有効性を確認するため、運用停止更新は進行中の生成transaction完了を待つ。設定停止が先に確定していれば待機後に無効状態を読み拒否する。ユーザー行ロックで同一ユーザーの生成を直列化し、再送を確認した後、難度ルール行をロックする。待機後に総合力を取得し、現在時刻から24時間の新規Instanceを作成する。`_raid_room_register_v1`で開催数上限・新規Instance・24時間期限を検証し、Roomと所有者の参加台帳を作成する。request台帳まで同一transaction。途中例外時にはInstanceも残らない。RP/Cash/Diamond/所持品を更新しない。

初級以外は空Main Formationを取得不能として拒否し、既存総合力関数の空集合`coalesce(...,0)`を閾値判定に使わない。NULL・負総合力も拒否する。初級は総合力による制限がないため空編成でのRoom作成を許可するが、戦闘可否を意味しない。既存総合力計算式、キャラマスター欠損時の既存計算関数の挙動は変更しない。Main Formationの編集処理との完全な直列化は今回保証せず、生成処理中に取得したサーバー集計値で判定する。戦闘開始時には将来の開始writerで再判定が必要。

有効なcanonical variantのHPを仮引継ぎし、難度別HPの妥当性を承認したものではない。`boss_master_id`は既存`raid_boss_master(id)`、`raid_variant_id`は`canonical_raid_variants(raid_variant_id)`のFKを維持する。マスターを生成・書換えない。開始時刻と期限はDB時刻による。

## エラーと権限

- 42501: 未認証、users欠損、Lv5未満/取得不能、非初級の総合力不足/取得不能。
- 55000 / `room creation disabled`: 生成無効。
- 22023: 入力・難度・variant不正、request payload競合、開催数上限等。
- 25001: READ COMMITTED以外。
- FK違反等のDB例外はそのままtransactionを失敗させる。

両公開RPCはSECURITY DEFINER、固定`search_path=pg_catalog`で全テーブル・内部関数をschema修飾。実行権限はauthenticatedのみ。設定・再送台帳はRLS enabledかつ公開policyなし、PUBLIC/anon/authenticated/service_role権限を剥奪する。既存内部関数の公開範囲は拡大しない。

## 未検証・後続

実DBのAuth/JWT/PostgREST・複数接続競合・実機は親の検証記録で区別する。旧開始/確定/終了/日次報酬/respawn経路をRoom判別分岐してから有効化判断する。生成成功は戦闘・救援・報酬・全体Previewの成功ではない。

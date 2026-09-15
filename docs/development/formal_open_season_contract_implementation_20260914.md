# 正式OPEN Season／準備Mission 実装報告

## 実装済み候補

### 準備Mission・限定Guild報酬

`20260914112059_formal_open_season_claim_contract.sql`

- 期限到達後のイベントを取得対象から除外。CLEAR／CLAIMED等の履歴行は保持。
- 終了後の受取操作を起点として新しいComplete Mission進捗を作らない。
- `close_gvg_preparation_missions_v1(progress_end, claim_anchor)`で操作停止日時と受取起算日時を明示指定。受取期限は起算日時＋30日。時刻NULL・未来・矛盾する再指定は拒否。同一指定の再実行は許容。
- `finalize_preopen_guild_power_season_v2(cosmetic_id)`は既存snapshot／grant／recipient／audit基盤を再利用。既存no-arg関数・cronは変更しない。
- 明示指定する報酬は有効なGuild Emblem、かつ標準扱いではないものに限定。`metadata @> '{"standard":true}'`は既存Emblem公開・装備契約と一致。
- 既存順位Authorityのrank=1だけに付与。全Guildの順位・Member Snapshotは保存し、通知は受賞Guildのみ。再実行で再付与・再通知しない。
- CLOSEDでauditのない履歴は再計算せず拒否。
- MissionPanelは既存useMissionClockで期限到達を再描画し、SPECIALだけ非表示。通常Missionは保持。

親からPreview適用報告あり：実履歴 `20260914112919`。時刻設定・報酬確定操作は未実行。

### PVP予約・自動切替

`20260914112648_formal_open_pvp_scheduled_transition.sql` — **未適用候補**。

- `prepare_formal_open_pvp_season_v1(cutoff)`は9/15 JSTメンテナンスの確定時刻を引数に取る。
- 既存ranking_seasonsのPREPARING行を使用し、新しい設定tableを増やさない。
- 予約期間：9/16 00:00 JST以上、10/1 00:00 JST未満。
- 旧PVPのboundary確認→Snapshot／報酬→reconcile→CLOSEDの順を維持。失敗時は予約・境界変更ごとrollback。
- 今回の日時に一致するPVP予約だけを解釈し、インターバル中は新ACTIVEを作らない。境界到来時に予約行をACTIVE化。
- 月初行のON CONFLICTでCLOSEDをACTIVEに戻す旧経路は拒否へ変更。
- 切替呼出し・予約・cron変更はMigration内で実行しない。

READ ONLYでPreview現定義・権限を照合済み。`advance_ranking_season`の定義MD5は `958bee68162dca7b1449dad53ea2fe2f`、anon/authenticatedのEXECUTEなし、service_roleあり。Migrationに同一確認guardを追加。

既存コードの開始契機は `ranking-pvp-monthly-jst`（毎日15:00 UTC＝JST0時）およびPvP finalizerからのadvance呼出し。今回cronの実行・変更はしない。

## 検証

- PGlite：30日claim設定、同一指定再実行、null／未来拒否、期限境界非表示、CLEAR／CLAIMED／未完了保持、終了後Complete進捗停止、1位限定・全Member Snapshot、限定ID／標準ID拒否、再通知防止、CLOSED＋auditなし拒否 — PASS。
- PGlite：PVP予約・境界変更のrollback、報酬→reconcile順、再実行、インターバル、開始・終了境界、CLOSED復活拒否、POWER／RAID不変 — PASS。時計と報酬内部処理はfixtureであり、ライブ受入の代替ではない。
- Mission期限UI判定2テスト — PASS。
- Typecheck／diff check — PASS。

## 未確定・未実装

1. 限定Emblem ID、実メンテナンスの操作停止時刻・claim起算時刻は未指定。新関数を実行しない。
2. インターバル中のPvPを閉じるか、プレイは許可してSeason集計を対象外にするかは未確定。既存finalizerはadvanceがNULLでもRate／Wins更新を続けるため、**予約候補だけでは正式切替完了にならない**。この論点解決までPVP予約候補の適用・運用実行は保留。
3. 個人POWER／Guild POWERの新Season集計は既存generic advance対象外。旧ACTIVEの一括変更は行っていない。別途仕様と実処理の接続が必要。
4. 本番データ・Season・報酬操作は未実行。

# Guild Emblem：READ ONLY棚卸し・実装提案
2026-09-13 / PROPOSAL・未FIX

## 結論
今回版への条件付き統合候補とする。既存Guild Cosmetic基盤を再利用できるため、専用Tableを3つ新設する必要はない。
初版は無料Standard 8種類、Master/Sub Masterによる選択、公開済みGuild名表示への反映に限定する案を推奨。
課金9/15公開を遅らせない。独立差分として進め、受入未完了ならEmblem差分だけを外す。
本棚卸しでは実装・Migration・配信・DB書込みを行っていない。

## 根拠と範囲
Repository: kiyoshikitamura/tribe-neon
調査作業ツリー: formal-release integration / ローカルc611e7b（リモート63e43b76と同一tree）
Preview DB: sufvuqdnqohpfzkwxohq、BEGIN READ ONLY / ROLLBACK。
Production DBは今回未監査。統合時にスキーマ差分確認が必要。

## 既存DBと再利用案
|既存|確認内容|提案|
|---|---|---|
|cosmetic_master|owner_scope、slot、display_name、asset_key、source_type、metadata、activeあり|GUILD / GUILD_EMBLEMを追加。Standard、default、表示順はmetadataで定義|
|guild_cosmetics|Guild単位の所有、取得元、期限あり|将来の限定Unlockに再利用。Standard所有行は生成しない|
|guild_equipped_cosmetics|guild_id / slot / cosmetic_id / equipped_at|GUILD_EMBLEMの装着を唯一の選択Authorityとする|
|guilds.logo_icon|既存画像参照|互換投影としてのみ利用。装着状態と二重管理しない|
|公開Guild projection|emblem_urlはlogo_iconの別名として返却|装着Emblem→Defaultを解決して返す共通resolverへ統一|
|guild_members.role|DBはMASTER / SUB_MASTER / MEMBER|Serverはこの正規値を使用。UIに残るSUBMASTER互換表記を新正本にしない|

現行Guild Cosmetic masterは8件（背景2、バナー2、ランキング装飾4）。今回用のStandard Emblem 8〜12種は確認できなかった。既存ロゴやバナーをEmblem完成素材として数えない。
既存ランキング装飾はそのまま保持し、無断でEmblemへ置換しない。

## Authority上の差分
equip_guild_cosmetic現行定義：
- MASTER限定。SUB_MASTERは不可。
- v_role <> 'MASTER' の判定は非所属時NULLを拒否できない。
- 所有と期限は確認するが、master.activeの判定がない。
- Standard全Guild共通利用の分岐はない。

提案：set_guild_emblem専用RPCを追加し、既存装着Tableへ書く。
認証、所属、MASTER/SUB_MASTER、非解散Guild、GUILD_EMBLEM slot、active、StandardまたはGuild所有＋有効期限をServerで検証。
Guild/所属の変更と競合しないロック順序を採用。一般Member・他Guild・未所属・不正ID・無効IDを明示拒否。
既存equip_guild_cosmeticが新slotの迂回経路にならないよう、NULL権限拒否・active判定・Emblem slotの委譲/拒否も同時対応する。背景/バナーの権限を副団長へ一括拡張しない。
公開Readは既存公開Guild情報と同じアクセス範囲。Master変更はMember所属確認済みRPC限定。付与RPCは初版には不要。

create_guild_v2が現行UIの呼出先。Lv5、CASH500、名前1〜12文字等をServerで検証している。旧create_guildは別物であり改修入口にしない。
新GuildのDefaultは同トランザクションで装着。既存Guildは選択未登録時Default解決とし、大量のStandard所有行を生成しない。
既存logo_iconに独自表示が存在する場合は移行対象を棚卸しし、消去しない。

## UI棚卸しと初版Scope
|画面|主要ファイル/経路|対応|
|---|---|---|
|Guild検索・おすすめ・所属Guild Header・Member|GuildTab.tsx|GuildIdentity表示、権限者のみ変更CTA|
|Guild詳細・公開Member|CommonModals.tsx|既存emblem_url表示を共通化|
|Home所属/Header|Header.tsx→UserIdentityRow.tsx|名前左にS|
|他User詳細|profile/PublicUserProfile.tsx|所属リンク内にS|
|個人Ranking・Guild Ranking・自分順位|RankingTab.tsx|個人所属S、Guild行M|
|PvP所属情報|PvpTab.tsx・GameContext.tsxの候補projection|Guild ID/Emblemを落とさず表示へ伝搬|
|Raid Guild表示・参加者詳細|RaidTab.tsx、およびRoom UIからPublicUserProfileへの経路|既存のGuild名表示に追加。Guild名のない行に新しい情報行を増設しない|
|Chat・BBS・Activity|TribeChatModal.tsx / BbsTab.tsx / HomeTab.tsx→UserIdentityRow|共通表示と公開identity取得を更新|
|将来GvG|GvgTab.tsx / GvgMatchStatusPanel.tsx|今回は公開しない。共通Component利用可能にして後続|

これは静的検索で確認した表示/データ経路の一覧。動的実画面での全箇所網羅確認は未実施。
実装時にguildName/guild_name/userGuild.name/guild.name等の残存を再検索し、未接続表示を一覧化する。
Guild名称を含む通知本文・履歴文を無差別に画像へ置換しない。現在所属表示と過去イベント本文を分離する。
Guild名だけからEmblemを検索しない。Guild IDで紐付け、一覧は一括projectionで返す。行ごとのRPCは追加しない。
変更後は自身・一覧・プロフィールの該当Guildキャッシュを更新。他Memberには次回取得/画面復帰で反映する初版案。常時Realtime追加は含めない。

## 表示と操作
共通GuildIdentity / GuildEmblem（S/M/L）。仮サイズ20/28/56px、最終値はモバイル実画面で調整。
既存Userリーダーアイコンと混同しない位置に置く。未所属はEmblemなし。素材失敗はDefaultへフォールバック、Guild名を隠さない。
Header→エンブレム変更→8種一覧→選択プレビュー→このエンブレムに変更。
確定前の選択はローカルPreviewのみ。キャンセルは変更なし。送信中は二重送信・背面操作を防止。成功後に共通表示へ反映。
長い説明文や能力値表示を加えない。切替費用なし、能力効果なし。
素材は現代ストリート/ナイト世界観で小サイズでも識別可能な8種類。名称・図案は制作案として別途レビュー。今回棚卸しでは未制作。

## 今回に含めないもの
Guild Shop販売、Guild Currency、Season報酬ルール新設、GvG公開、ユーザー画像アップロード、個人Ownership、課金商品。
既存Cosmetic ownershipを使うため、将来の限定Unlockへは接続可能。

## 検証と投入判断
- Master/Sub Master成功、Member/他Guild/未所属/無効/未所有拒否。
- 旧equip経由のEmblem不正装着も拒否。既存背景/バナー回帰。
- 新Guild/既存GuildのDefault、再選択・Reload・脱退/移籍時のGuild所有保持。
- 全公開表示の同一Emblem、一覧N+1なし、モバイル見切れなし。
- CASH/DIA/総合力/戦闘・課金への変更なし。
- 独立Migrationとコード差分でPreview受入。Vercel配信・検証はCodexへ渡す。
課金公開候補をEmblem待ちにしない。上記受入と素材レビューが間に合う場合のみ統合する。

## 概算
実装手当の目安は6〜10時間、素材作成/調整と差分受入は3〜5時間。合計9〜15作業時間の暫定見積。
既存Cosmetic基盤の再利用を前提とした目安で、9/15納期保証ではない。
主な変動要因は全表示へのGuild ID/Emblem投影、素材レビュー、Productionとの差分。Vercel担当の待ち時間は含まない。
Standard 8種類・上記公開表示Scopeで着手する案。12種類への拡張や限定報酬は後続に分離。

# 初心者Mission統合 実装・検証記録

## 承認範囲
ユーザーがguide_mission_integration_mapping_20260912.mdの提案で進行を承認。
追加報酬なし、無料2カテゴリを一つの獲得学習単位として扱う。P002/P003受取依存解除、先行達成保持、報酬CTA、初心者導線のみHome帰還を実装する。
Questデザイン、回復集計/総合力の表示差、課金商品、POWER次期期間は今回変更しない。

## 共通契約
get_beginner_mission_journey()が永続的な機能経験とMission達成/受取のsnapshotを返す。日次報酬リセットを経験リセットにしない。
MyPageと行動ページは同じsnapshotを利用。画面の戻り先情報は達成Authorityにしない。
Gacha/Battle/Result中の強制遷移をしない。未受取報酬は残し、後続経験済みユーザーを過去Stepへ戻さない。

## Preview影響試算（適用前READ ONLY）
63ユーザーを対象。スキル装備P002の前段未受取61人、実装備等による新規CLEAR候補57人（うち依存解除による早期受取55人）。装備P003の前段未受取63人、新規CLEAR候補39人（早期受取39人）。
新規CLEAR候補の報酬総量はスキル指南書57/CASH5,700、カスタムオイル・中78/CASH3,900。既存一回限り報酬の受取可能時期が変化する。報酬量・上限の増加や自動付与ではない。
Productionの対象人数・供給量は今回未算出。Production変更前に当該環境で再照合する。

## 状態
実装完了。Preview DBに20260912183652_beginner_mission_journey_authorityを適用済み。再適用しない。
実DBのROLLBACK検証PASS：前段受取依存解除、単なる所持では未達、装備実績、既存量の受取/二重付与防止、日次更新後の経験保持、Guild閲覧後終端、Raid未経験保持、未認証拒否。
Plannerと実受取ハンドラーのfocused test、既存Mission UI回復・直接付与検証PASS。Next.js build/TypeScript PASS。実画面の統合受入は新候補配信後に実施する。
Security advisorは対象3関数のauthenticated SECURITY DEFINER公開を通知。意図した本人専用RPCで、auth.uid固定・引数で他人指定不可・search_path固定・anon/PUBLIC実行取消を確認。既存別対象の警告は今回変更外。
Production、共有alias、環境変数変更なし。

## 統合UI
- 無料獲得が残る間はTutorial内Quest報酬より無料ガチャを優先。
- 既存MissionのCLEAR報酬を対象ページで提示。演出やResultの途中に割り込まない。
- 対象Missionへ絞った先頭領域、個別/一括受取、結果確認後Home帰還。通常Mission閲覧からの受取には自動帰還を付けない。
- 先行経験は再操作不要。古い未受取報酬は別導線に残す。
- 通信失敗・連打・ユーザー変更・閉じる後の遅延応答は受取状態を誤復元しない。

## 未検証
新候補の実ブラウザ/UI、実iPhone Safari。無料2カテゴリ→装備→報酬→Homeの体験順、Raid再開催の実画面を配信後に確認する。

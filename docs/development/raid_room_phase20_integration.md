# 第20工程 CI回帰修正・検証中

2026-09-08、開発基準head 58c7f1f45d229424857dd59943eb368ff2af98ab。

## 変更と親レビュー

Phase15で廃止したレイド順位を期待するE2Eが残り、本人貢献RPCもMockに存在しなかった。Bは3つの既存E2Eを現仕様へ更新、CはSQL261に対応するMock参照を追加した。順位を復活させず、本人rawの集計と残存3カテゴリ・報酬・プロフィール・配置検証を維持する。

親はSQL261とMockの本人/RoomInstance/旧日次キー分岐、他ユーザー除外、変更したE2Eの具体的期待を確認した。Raid fixtureの欠落した日次キーを補正。Aはlint OOMを調査し、useBattleのReact Compiler解析で現行4GB/6GBとも失敗、基準b08e396は通常4GBで完走と確認。Room追加経路の構造分割による修復を継続中。製品のlint除外やルール緩和を行っていない。

## 機械検証

- 本人貢献Mock: Node6件PASS（親再実行）。
- 既存順位撤去・他カテゴリ: React5件PASS（親再実行）。
- 全体TypeScript: PASS。
- 対象E2E3ファイル: 18テスト読込PASS。ブラウザ実行のPASSではない。
- git diff --check: PASS。
- ローカルChromium取得: CDN502/timeoutで失敗。実機やブラウザの合格として補完しない。

親はQualityに独立raid-regression jobを追加した。Mock6件と既存3ファイル18ブラウザテストを実行し、広域E2Eが先に打ち切られても本差分を確認できるようにする。Room UIフラグfalseの旧画面における順位廃止/本人貢献の回帰であり、新Room実DBの一連受入とは異なる。既存Quality/Edge/広域E2Eを削除・無効化せず、Release Gateを置き換えない。初回CI結果は後続記録で確認する。

## 状態と残件

RAID-C-20は親レビュー・対象機械検証済み。RAID-B-20はブラウザ検証待ち。Aの診断完了はlint復旧完了を意味しない。第20工程全体はIN_PROGRESS。

実機確認可能Preview・全体開発完了ではない。報酬/成功条件値、独立Preview DB/Edge/UI、実Cron/多接続/実機受入が残る。最新head58c7f1fのGitHub Vercel statusは2026-09-08 16:12:08 JST successだが、実DB接続確認を代替しない。

先行CI run34198126545は合成merge2e8aee2（親314b38f+58c7f1f）を検証しており、head単体や開発基準b08e396とは分ける。失敗はlint OOM、廃止順位期待、基準からあるQA件数/バナー期待、KPI/認証の未確定原因。詳しくはraid_room_phase20_lint.md / raid_room_phase20_e2e.md / raid_room_phase20_mock.md。

実DB操作、手動Deploy、merge、運用フラグ有効化は行っていない。

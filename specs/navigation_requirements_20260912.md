# GAME03 ナビゲーション確定要件

更新日：2026-09-12
状態：ユーザー承認済み。実装・Preview受入・本番変更は未実施。

## 基本順序

Gacha → Character → Quest → Battle → Raid → Mission

既存Tutorial再設計は含めない。既存の初回案内と実行済み判定を活かす。

## Raid未開催時

- 「開催待ち」を表示しつつ、Missionへ進む導線を用意する。
- 開催待ち・Mission遷移をRaid参加実績として記録しない。
- Missionへの案内完了後も、Raid未参加の状態を保持する。
- 開催後、未参加ユーザーへRaid参加導線を表示する。
- 実際の参加完了は既存の正規判定に従う。画面遷移・案内クリックだけで達成にしない。
- 開催状況未取得・取得失敗は「未開催」と同一視しない。

## 実装上の注意

既存 homeInitialGuide.ts は activation_mission_handoff 達成後に案内を終了する。
この早期終了により開催後のRaid案内が消えないよう、Mission案内完了とRaid未参加時の再案内を分ける。
初回案内の未完了判定と、実際のプレイ実績を混同しない。

## 受入

1. Raid開催中：通常順序でRaid→Missionへ進める。
2. Raid未開催：開催待ちを示し、Missionへ進める。
3. 上記遷移でRaid参加実績が増えない。
4. Mission案内完了後にRaidが開催：未参加ユーザーに参加導線が出る。
5. 実参加完了後：初回Raid参加案内が終了する。
6. 再読み込み・再ログイン後も上記状態が保たれる。

Production反映は別途明示承認後のみ。

## Post-Tutorial判断Authority追加（2026-09-12）

正：`specs/post_tutorial_judgment_authority_20260912.md`。
従来のGacha→Character→Quest→Battle→Raid→Missionは旧基本順序。最新学習順は追加Authorityに従う。Skill/Equipment分離は既存実装を再利用し、Guild案内を追加する。Raid未開催の迂回・実参加未達保持・再案内は維持する。
24h/48h Feature Coverage、D1再訪、継続/離脱者の接触機能差を観測し、Guide一本道完走だけで評価しない。

# バトル演出 V3 比較モック

## 状態

確認用モック。Production反映・既存バトルへの組込は未実施。ガチャFIX版のコードは変更しない。本番はバトルの確認完了後、ガチャと同時に反映する。

URL: `/qa/battle-presentation-v3`。既存QAと同じPreview限定ゲートを使用しProductionは404。

## 棚卸しと設計

現行QuestBattleViewerは左右5人の縦並び、下部カットイン、操作部という構図。既存BattleEffectPresentationも存在するため、現状が無演出という意味ではない。今回のモックは構図を維持し、顔・HPバー・数値・スキル帯を独立再構築して比較する。現行のリプレイ／戦闘計算／スキルマスタ／レイド開発には触れない。

ベンチマーク: ユーザー添付の放置少女動画（50.69秒）。定位置の顔・HP、対象上の大きなダメージ、戦況を残した効果表現を参考にした。画像・キャラクターを転載しない。

## 試せる内容

- 通常攻撃、N/R/SR/SSRキャラの同一スキル、回復、撃破、連続再生、MVP。
- 全60キャラ選択。演出tierは選択キャラのマスタ上のレアリティのみを参照。
- N/R: 小型セリフ帯と命中素材。SR: 立ち絵カットイン。SSR: 金の質感、長めの予備動作、追加命中レイヤー。
- 発動→命中・HP減少→数値保持。通常400、スキル1200、回復800、撃破2400は比較用固定値でありゲームバランスの提案ではない。実際の減少分で集計。
- MVPはこの固定デモで与ダメージが最大のキャラ。SKIPは結果表示サンプルへ移動するため、全敵撃破前でもVICTORY画面を確認できる。勝敗判定の実装ではない。
- セリフは全60体の既存ガチャ正本から仮配置。文章の新規FIXや戦闘適性の承認ではない。SEは既存素材、初期OFF。音声セリフはない。
- 1倍/2倍、途中SKIP、繰り返し。全キャラ切替時の遅延防止のため、モックでは60体を先読みする。実装時は参加者だけに限定する。

## 追加素材

組込先: `public/effects/battle-v3/strike-impact.webp` と `cutin-street.webp`。
画像生成スキルの標準生成を使用。立ち絵の描き直しはなし。

生成プロンプト1: Use case: stylized-concept. Asset type: transparent PNG impact sprite for TRIBE NEON mobile browser battle UI. Create ONE premium illustrated physical strike impact burst on a genuinely transparent background, square 1024. Sharp ivory central impact with asymmetrical metallic silver brush shards, restrained amber sparks, charcoal ink streaks, a few tiny fragments. Street brawler comic aesthetic, crisp hand-painted texture. Focused compact center with tapered diagonal trails, edges clean transparent, no rectangular backing. No characters, no hands, no weapons, no text, no logos, no magic circle, no sci-fi hologram, no neon rainbow, no scenery. Designed to overlay a character portrait for 300ms, readable at 160px. Save usable local file for project integration.

生成プロンプト2: Use case: stylized-concept. Asset type: ONE wide horizontal battle skill cut-in background texture for TRIBE NEON street character game, 1536x1024. Opaque deep charcoal black background, premium rough black ink and metallic distressed gold brushwork concentrated on the top and bottom edges, diagonal silver scratch accents on far left, restrained warm amber sparks on far right. Middle 65 percent almost entirely dark black, leave clean negative space for character art and Japanese skill name composited later. Contemporary Japanese street brawler mood, physical brushed and scratched materials, rich tactile game UI asset, not science fiction, not magical, no cyberpunk. No characters, no faces, no words, no symbols, no logos, no checkerboard, no transparency. This is a flat 2D production texture, not a mockup of a device.

鉄瓶ゴシックはモック専用にサブセットし内部名をTNBattle-Tetsubinへ変更。元ライセンス・著作権情報を保持。ライセンスは `public/fonts/gacha-comparison/Apache-2.0.txt`、帰属情報は同ディレクトリNOTICE.md/tetsubin-ReadMe.txtを参照。ガチャ用フォントを上書きしない。

## 未実施・次段階

実機で素材の質感、文字、カットイン占有率、表示時間を確認。支援・弱体化の専用画像、高スキル頻度、敵側の発動カットイン、リプレイとの統合は次段階。現モックは味方側の演出比較であり、実バトル全体の完成版ではない。

## 状態効果モック追加

既存 `src/domain/battle/canonical_effects.ts`、`canonical_runtime.ts`、`src/domain/presentation/battleStatusPresentation.ts` を照合。攻撃・防御・速度・運のUP/DOWN、毒・出血・暗闇・沈黙・スタン・挑発、継続回復・シールド・反撃の17種類を選択可能。解除はREMOVE_STATUS all相当の表示確認（不利な状態だけ除き、強化・シールド・継続回復は保持）。新しい実ゲーム効果やディスペルは追加しない。

- 効果は命中タイミングで対象に付与。強化／回復系は味方先頭、弱体／状態異常は敵側の生存対象。支援行動でダメージは発生させない。
- HP下に独自SVGバッジ3個＋残り件数。色に加え、剣・盾・足取り・星・毒瓶・血滴・目・封じた吹き出しなどの図柄で識別。詳細はネイティブdialogで開き、全件・説明・残量を表示。
- スタン・沈黙は残り行動、それ以外は残りターン。値・シールド480はモック固定値であり実バトルの値ではない。
- 「複数状態」で味方・敵に各6種類を付与。「弱体解除」は味方先頭の不利状態だけを除去。「残り表示−1」は全表示の期限を1減らし0で消す操作であり、実際のターン処理、毒ダメージ、継続回復処理の実装ではない。
- 付与を繰り返した同種効果は1バッジを更新。実ゲームのスタック規則を変更するものではない。
- 全17種に識別図柄を用意。瞬間エフェクトの画像は回復／強化／弱体の3系統を共有し、状態ごとの図柄を重ねる。個々の状態専用イラスト17枚を作ったわけではない。
- キャラのN/R/SR/SSRでカットインと瞬間エフェクトの表示サイズを変更。バッジの意味はレアリティによらず共通。

追加素材は画像生成ツール標準モードで制作し、アルファ保持のWebPへ変換した。
`public/effects/battle-v3/healing-pulse.webp`、`support-rise.webp`、`weaken-fall.webp`。
プロンプト要旨: healing＝emerald/ivory upward ribbons, transparent open center, premium painted street battle effect; support＝metallic amber/silver ascending chevrons and shield outline; weaken＝downward violet/crimson pressure sweep and broken ink fragments。すべて人物・文字・背景・魔法陣・サイバーパンク表現なし、透過背景指定。

検証: Preview設定のproduction build、ESLint成功。Chromiumの390×844で17種、320×568で毒・シールドを再生し対象・HP不変を確認。両画面で回復800、6件の詳細表示、シールド残量480、弱体解除後の正状態維持、期限切れ、SKIP後のタイマー停止を確認。実機Safariはユーザー確認待ち。

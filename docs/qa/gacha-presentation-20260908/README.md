# キャラクターガチャ「合流」演出

2026-09-08。PR #28のカード演出を、ユーザー承認済みのキャラクター主体の合流演出へ更新。

## 今回の変更

- キャラクター画像は既存立ち絵のみ。描き起こし・ポーズ変更なし。
- 人物なしの夜の路地背景を追加。開始は実際の獲得キャラの立ち絵を黒い人影として配置。
- カード裏面・扇状配置・金属フレームを撤去。登場は顔・表情を大きく見せ、名前と確定セリフを重視。
- 一覧上部は獲得した仲間の立ち絵から最大3人を表示（最高レアリティを中央）。下の10件は取得順を保った5列2行の顔一覧。
- タップで演出完了、次タップで次へ、SKIP、人物の再表示、編成CTAは維持。
- 全60体のFIXセリフ、抽選RPC・確率・消費・報酬・サーバー進行に変更なし。

## 読み込み修正

人物だけ・背景だけが先行することを防ぐため、立ち絵・出身地背景・追加背景の先読みとデコードをまとめて待つ。
さらに実際に表示するDOMの画像もデコード完了まで画面を非表示にし、登場・セリフのタイマーを停止する。
これによりブラウザーが先読み画像を再取得する場合も、完成した画面を一括表示する。
12秒で画像準備を打ち切り、画像だけの再読み込みを案内。待機中・取得失敗時も獲得結果を文字で確認できる。再抽選はしない。

## 確認結果

- Next.js preview設定の本番ビルド・TypeScript・実装ESLintエラーなし。
- 既存SSR10体および全60体セリフのマスタチェック成功。
- Playwright 9件成功: キャラ1回／10回、390×844／320×568、取得順、詳細、編成への遷移、再実行、SSR文字送り、SKIP、連打、N/R/SRの連続紹介、reduced motion、キーボード、初回画像遅延、背景取得失敗と再試行・文字結果。
- 画面撮影時のJavaScriptエラー0・欠落画像0。撮影時のみ日本語フォントを追加（アプリ依存関係への追加なし）。
- 実機Safari・実音声・本番抽選はユーザー確認待ち。本番未反映。

QA URLのパス: `/qa/presentation?scenario=gacha-character-v3`
`single=true` / `rarity=N|R|SR|SSR` / `tutorial=false` で単発・レアリティ・通常ガチャを確認可能。
本番では従来どおりQAページは404。

## 追加画像素材

`public/gacha/arrival/tokyo-alley.webp` — 1024×1536、319,076 bytes。
内蔵画像生成で制作し、WebPに変換。人物を含まないため、既存立ち絵と動的に合成できる。

制作プロンプト:
Production background asset for TRIBE NEON modern Tokyo street character meeting animation, portrait 1024x1536. Beautiful premium hand-painted Japanese game background, realistic illustrated environment, nighttime narrow Tokyo side street, warm amber lamps along aged concrete and shopfronts, rain-wet asphalt with soft reflections, subtle atmospheric ground mist at bottom, strong cinematic depth, vanishing point center at 42% height, lower central 65% clear empty space for compositing existing standing characters. Indirect headlights far in background, natural warm rim-light mood with muted blue shadows. Detailed atmospheric art, grounded contemporary Japan, not cyberpunk or science fiction. No humans, no silhouettes, no faces, no vehicles in foreground, no letters, no readable signs, no logos, no 109, no UI, no borders, no frames. Edge shops subdued to allow characters to dominate. Full bleed single background only. No triptych.

![開始](opening.png)
![仲間一覧](summary.png)
![SSR登場](ssr.png)

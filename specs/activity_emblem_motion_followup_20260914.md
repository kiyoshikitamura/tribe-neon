# Activity Emblem／Reduced Motion差分対応

基準：検証資材SHA `2f484f324481cbe98becfe9421e281ebd3650c15`。
Billingは保留継続。Production・DB・Migration・環境変数変更なし。

## Activity最新行

原因：HomeTab.cssが最新行のUserIdentityRow配下のsmallをすべて非表示にしていた。
所属Guild行に専用classを付け、その行だけ表示を復帰。Emblemは16px固定、Guild名は既存の省略表示、狭い幅でもEmblemは縮小しない。称号／未所属の省略は維持。

Codexで新候補を専用Preview配信し、実Guild IDを持つ既存Activity actorで320px／390pxを確認する。
最新行・履歴とも保存値「月 / guild_standard_07」のasset pathと一致、画像表示、Reload保持を確認。
実Guild IDなしの公開Fixtureに出る既定Emblemは実データPASSの根拠にしない。

## Reduced Motion

150秒は前回こちらがテストへ設定した待機上限であり、ユーザーが承認した戦闘時間の仕様ではなかった。この制限によるFAILと、演出フリーズを混同しない。
既報：約3.6分で自然Result、装備帯／会話／Cut-inの表示・停止・再開と動き抑制はPASS。

戦闘計算や演出速度は変更しない。テストを以下へ修正：

- Replay indexまたは画面状態が20秒間変化しなければ停止としてFAIL。
- 自然終了の監視上限300秒、ケース全体360秒。これはテストの有限実行上限であり、製品の戦闘時間仕様ではない。
- SKIPなしResultを確認する。上限延長だけでPASSにせず、新テストの実行結果を報告する。
- 実行方法はmotion_social_acceptance_20260914.mdと同じ。

## Chatデータ不足

全体／Guild Chatに対象Guildの既存投稿0件という報告を保持する。機能FAILとは区別するが、実画面PASSにはしない。
既存の別Guild投稿が利用可能なら、そのGuildの保存Emblemと照合して確認する。月EmblemのGuildに限定する必要はない。
すべての既存投稿で所属データが不足する場合、具体的な不足だけを報告する。新しいメッセージ送信をこの引継ぎだけで実行しない。

## 検証区分

ローカル型検証・テスト検出と、Codexでの実画面Acceptanceを分ける。
Activityの表示修正には新Previewが必要。Billing復帰は残2項目の判定後とする。

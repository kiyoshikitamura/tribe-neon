-- Preview専用。Productionへの実行は別承認。既存お知らせの更新・削除は行わない。
BEGIN;
INSERT INTO public.news(category,title,content,start_at,is_published,release_key)
VALUES ('IMPORTANT','正式リリースのお知らせ',
$news$TRIBE NEONをプレイいただきありがとうございます。
正式リリースにあわせて、クエスト・レイド・バトルと育成機能をアップデートします。

■ クエスト
地域ごとに敵の傾向と獲得できる素材が異なります。欲しい素材にあわせて探索先を選べます。

■ レイド
仲間と協力して強敵に挑戦。撃破報酬のスキル指南書・改造パーツで、スキルや装備を強化できます。難易度ごとの参加・貢献条件を満たすと報酬を獲得できます。

■ バトル
勝利すると200 CASHとレイドチケット1枚、敗北時も50 CASHを獲得できます。レイドチケットでレイドポイントを回復し、追加の挑戦へつなげましょう。

■ 育成・編成
キャラクターの成長、スキルの覚醒、装備の強化・限界突破でパーティを育成できます。専用スキル・専用装備は、名前と詳細から対象キャラクターを確認できます。

今後ともTRIBE NEONをよろしくお願いいたします。$news$,
now(),true,'formal-release-update-20260915')
ON CONFLICT (release_key) DO NOTHING;
COMMIT;

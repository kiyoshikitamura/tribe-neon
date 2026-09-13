# Encounter報酬2倍 Preview実SQL受入

対象：sufvuqdnqohpfzkwxohq。実DBの既存Clear/Rescue issuer・資格判定関数を使用。実画面検証とは区別する。

親が使用中のFresh QAには触れていない。既存完了Room c0835804-56e4-4203-8d42-a1112bb957b4をtransaction内でのみEncounter multiplier=2に関連付け、一時的に受取台帳を除いて既存実績から再評価。設定・関数の変更なし。各検証はROLLBACKで終了。

実rescue資格：2戦、貢献123,663、閾値16,000、succeeded。

|検証|結果|
|---|---|
|Clear初回|3名発行。現行EQUIP_EXP_S base1→grant2→Present2|
|Rescue初回|1名発行。現行CHAR_EXP_S base1→grant2→Present2|
|Clear再呼出し|発行0名|
|Rescue再呼出し|発行0名|
|旧固定追加素材台帳|0件|
|Present source重複を使った配送失敗|unique_violationを実際に発生、失敗後receipt0/grant0|
|外側ROLLBACK後再照合|元Clear3/Rescue1/Present4保持、元数量3/3/3/2保持|
|fixture|Patrol0件、Encounter0件へ復帰|

元受取分の数量は旧時点masterによる。今回検証は現行通常master各1の厳密2倍であり、既受取分の改変・過去分増量はしていない。

残件：実UIからEncounter開催・参加・討伐・報酬受取の一連動作。今回のSQL受入で実機PASSとはしない。

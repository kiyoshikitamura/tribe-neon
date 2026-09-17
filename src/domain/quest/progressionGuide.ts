export type QuestGuideStep = 'QUEST_ENTRY' | 'PLAY' | 'GACHA' | 'LOADOUT' | 'RETRY' | 'DONE';
export type QuestProgressionGuide = { step: QuestGuideStep; seen_story_towns: string[] };
export type QuestGuideAction = 'ENTER_QUEST' | 'OPEN_LOADOUT' | 'APPLY_LOADOUT' | 'RETURN_QUEST';
export type QuestStoryPhase = 'START' | 'CLEAR';
export type QuestTownStoryData = { townId: string; speaker: string; image: string; lines: string[]; phase: QuestStoryPhase };
const story = (townId: string, speaker: string, image: string, start: string[], clear: string[]): QuestTownStoryData[] => [
  { townId, speaker, image, phase: 'START', lines: start }, { townId, speaker, image, phase: 'CLEAR', lines: clear },
];
export const QUEST_TOWN_STORIES: QuestTownStoryData[] = [
  ...story('shinjuku', 'レイジ', '/characters/reiji_transparent_asset.png', ['……見ない顔だな。','ここじゃ、突っ立ってるだけでも目ぇ付けられるぞ。','やる気があるなら止めねえ。','まず新宿で、どこまでやれるか見せてみろ。'], ['……やるじゃねえか。','最初よりは、だいぶマシになったな。','だが、新宿抜けたくらいで強くなった気になるなよ。','次は渋谷だ。あっちはあっちで、面倒なのがいる。']),
  ...story('shibuya', 'アゲハ', '/characters/ageha_transparent_asset.png', ['遅い遅い。もう来ないかと思ったじゃん。','新宿抜けたんでしょ？ じゃ、初心者扱いは今日で終わりね。','渋谷はノリ悪いヤツから置いてかれるよ。','ほら、行こ。考えるのは走りながらでいいって。'], ['やるじゃん！','でもさ、勢いだけで勝てるのって、この辺までかも。','次の池袋、しぶといの多いから。','力押ししてると、たぶん泣くよ？']),
  ...story('ikebukuro', 'コハル', '/characters/koharu_transparent_asset.png', ['あんたが、新宿と渋谷を抜けてきたヤツ？','……ふーん。まあ、悪くなさそうじゃん。','でもここ、勢いだけで突っ込むと普通にやられるから。','焦んなきゃいいよ。ちゃんと見て戦いな。'], ['お、勝ったじゃん。','最後まで崩れなかったし。ちゃんと見てたんだね。','殴るだけがケンカじゃないって、少し分かったでしょ。','次、六本木だっけ？ ……まあ、油断しなきゃ大丈夫。']),
  ...story('roppongi', 'カエデ', '/characters/kaede_transparent_asset.png', ['あなたが噂の人？','……ふふ。そんなに警戒しなくても取って食べたりしないわ。','ただ、ここでは“強いだけ”だと少し退屈かもしれない。','見せてもらえる？ あなたが何を考えて戦ってるのか。'], ['なるほど。ちゃんと考えてるのね。','数字だけ見ていたら、今の相手には勝てなかったでしょう？','覚えておいて。','強さって、見えている数字だけじゃないから。']),
  ...story('akihabara', 'カレン', '/characters/karen_transparent_asset.png', ['……ほんとに来たんだ。','別に、来なくてもよかったのに。','正面から頑張れば報われる、とか……そういうの期待しない方がいいよ。','勝ちたいなら、相手が一番嫌がることすれば。'], ['……勝ったんだ。','ふーん。ちゃんと嫌なことできるじゃん。','いいんじゃない？ 綺麗に勝つ必要なんてないし。','次、川崎でしょ。……あそこは嫌がらせだけじゃ無理かもね。']),
  ...story('kawasaki', 'ゴウ', '/characters/go_transparent_asset.png', ['お前か。','東京の方で随分遊んできたらしいな。','悪いけど、こっちはそんなに器用じゃねえ。','立ってられる方が勝ちだ。来いよ。'], ['……ハッ。いいじゃねえか。','最初は口だけかと思ったけどな。','ここまで来たなら、横浜も見てこい。','ただし――今まで通りで勝てるとは思うなよ。']),
  ...story('yokohama', 'ゴウ', '/characters/go_transparent_asset.png', ['ここから先は、俺も知らねえ。','東京で覚えたことも、川崎で覚えたことも、全部持ってけ。','足りないなら鍛えろ。組み直せ。何度でも来い。','最後は、お前のやり方で勝て。'], ['……終わったな。','新宿でフラついてたヤツと同じとは思えねえ。','けど、これで全部終わりだと思うなよ。','一人で勝つ夜は、ここまでだ。','次は仲間連れて来い。――本番は、そこからだ。']),
];

// 自動生成: docs/character-taxonomy/character_generation_vocab_db.json (2026-07-12) より変換
// [[キャラ記述語彙DB]] 6論点 taxonomy（IP非依存の一般名詞のみ）。
//   app_auto      = 被りやすい語（アプリが自動付与してベースの多様性を作る）
//   user_selectable = 被りにくい語（ユーザーの個性＝将来の明示メニュー候補）
// 出典: PokeAPI 全1025種の公式メタ分析（roster_5axis_analysis）。

export const VOCAB_AXES = ["type", "motif", "texture", "expression", "decoration", "atmosphere"];

export const VOCAB = {
  "type": {
    "app_auto": [
      "みず",
      "ノーマル",
      "くさ",
      "ひこう",
      "エスパー",
      "むし"
    ],
    "user_selectable": [
      "どく",
      "ほのお",
      "じめん",
      "いわ",
      "かくとう",
      "ドラゴン",
      "でんき",
      "あく",
      "はがね",
      "ゴースト",
      "フェアリー",
      "こおり"
    ]
  },
  "motif": {
    "app_auto": [
      "ひとがた",
      "みず・うみ",
      "いわ・つち・こうぶつ",
      "しょくぶつ",
      "スライム・ぶよぶよ",
      "エスパー・ふしぎ"
    ],
    "user_selectable": [
      "むし",
      "けもの・じゅう",
      "は虫類・ドラゴン",
      "どく",
      "ほのお・マグマ",
      "とり・つばさ",
      "でんき",
      "あく・やみ",
      "きんぞく・メカ",
      "ゴースト・れいたい",
      "フェアリー・せいれい",
      "こおり・ゆき"
    ]
  },
  "texture": {
    "app_auto": [
      "ねばねば・ぷにぷに",
      "つるつる・なめらか",
      "ごつごつ・かたい",
      "みずみずしい・うるおい",
      "はっぱ・しょくぶつ質"
    ],
    "user_selectable": [
      "こうかく・つや甲羅",
      "もや・はんとうめい",
      "うろこ",
      "ほのお・ねっき",
      "もこもこ・ふわふわ",
      "おび電・スパーク",
      "きんぞく・メタリック",
      "こおり・つめたい"
    ]
  },
  "expression": {
    "app_auto": [
      "ものしずか・クール",
      "りりしい・するどい"
    ],
    "user_selectable": [
      "にこにこ・あどけない",
      "とぼけた・ユニーク",
      "おだやか・やさしい",
      "どうどう・威厳"
    ]
  },
  "decoration": {
    "app_auto": [
      "ちょくりつのすがた",
      "よつあしのすがた",
      "とげ・こうぶつ結晶",
      "ほうせき・かがやき",
      "てあし・とくちょうてきなかお",
      "みずのしぶき",
      "もや・かげ",
      "はっぱ・はな"
    ],
    "user_selectable": [
      "つばさ・はね",
      "とげ・ぶくぶく",
      "ほのおのかざり",
      "つの・うろこ模様",
      "でんきの模様・ギザギザ",
      "まるいフォルム",
      "たくましいうで",
      "こおりのけっしょう",
      "ひれ",
      "よろい・こうら",
      "ほそながい",
      "あし・つめ",
      "しょくしゅ・ひげ",
      "むしのはね",
      "ふくすうのあたま"
    ]
  },
  "atmosphere": {
    "app_auto": [
      "ミステリアス",
      "かっこいい"
    ],
    "user_selectable": [
      "かわいい",
      "おっとり",
      "そうごん・でんせつ",
      "ゆうかん"
    ]
  }
};

function pick(arr){ return (arr && arr.length) ? arr[Math.floor(Math.random()*arr.length)] : ''; }

/** 指定軸・プールからランダムに1語 */
export function pickVocab(axis, pool){
  const a = VOCAB[axis]; if(!a) return '';
  return pick(a[pool] || []);
}

/** 1体分の語彙選択（user_selectable=個性 / app_auto=ベース flavor）を返す。
 *  overrides で特定軸をユーザー選択値に固定できる（case X 明示メニュー用）。 */
export function makeVocabPicks(overrides){
  const base = {
    motif:      pickVocab('motif','user_selectable'),
    atmosphere: pickVocab('atmosphere','user_selectable'),
    expression: pickVocab('expression','user_selectable'),
    type:       pickVocab('type','app_auto'),
    texture:    pickVocab('texture','app_auto'),
    decoration: pickVocab('decoration','app_auto'),
  };
  if (overrides) {
    for (const k in overrides) { if (overrides[k]) base[k] = overrides[k]; }
  }
  return base;
}

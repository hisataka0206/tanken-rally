// [[archetype taxonomy]]（[[フォルムファースト設計]] 反映版）
//
// キャラ自動生成の「ユーザー変数」= 生き物デザインの汎用記述語彙。
// アイデンティティは「①基本フォルム（骨格）＋②形に出る特徴」で決まり、色・模様は風味。
// 根拠: docs/10-specs/character-form-first-design.md（14フォルム）、docs/30-research/pokemon-character-design-analysis.md（実測）。
// char-lab.html で A/B・sweep 検証済み（H1: フォルムで見分く／H2: 特徴で個体差）。
//
// 使い方:
//   - AXIS_BODY … 基本フォルム（シルエットの骨格＝形に効く軸・14種）
//   - AXIS_FEATURE … 形に出る特徴（耳・尻尾・角・翼など＝シルエットに現れる個体差の軸）
//   - AXIS_IMPRESSION … いんしょう（色・表情・雰囲気に効く軸）
//   - promptHint … NanoBanana Pro へ渡す英語ヒント（画風はブランディング固定部で担保）
//   - hue … モック生成で色替えに使う CSS hue-rotate 角度（実API導入後は不要）

// === 基本フォルム（14）: 「単純だが他と輪郭が明確に違う骨格」。promptHint は"丸ブロブ"ではなく骨格記述。===
export const AXIS_BODY = [
  { id: 'round',     hue:   0, label: { ja: 'まる・ボール',    en: 'Round',     elementary: 'まる' },
    promptHint: 'a single rounded ball-shaped body with only small stubby limbs' },
  { id: 'quadruped', hue:  25, label: { ja: '四足獣',          en: 'Quadruped', elementary: 'よつあし' },
    promptHint: 'a four-legged beast with a horizontal body and a head facing forward' },
  { id: 'upright',   hue:  15, label: { ja: '直立二足',        en: 'Upright',   elementary: 'たっち' },
    promptHint: 'a tall upright body standing on two legs with visible arms' },
  { id: 'squat',     hue:  50, label: { ja: '座り・下ぶくれ',   en: 'Squat',     elementary: 'おすわり' },
    promptHint: 'a bottom-heavy sitting body: a wide round base with a small head resting on top' },
  { id: 'bird',      hue: 120, label: { ja: 'とり・つばさ',     en: 'Bird',      elementary: 'とり' },
    promptHint: 'a round-bodied bird with two side wings and a beak' },
  { id: 'bigwing',   hue: 150, label: { ja: '大翼・飛行',       en: 'Big-wing',  elementary: 'おおつばさ' },
    promptHint: 'a flying creature with large spread wings and a wide dynamic wingspan' },
  { id: 'critter',   hue:  30, label: { ja: '小さな丸い二足',   en: 'Critter',   elementary: 'ちびすけ' },
    promptHint: 'a small round bipedal critter with a big head and short little limbs' },
  { id: 'eared',     hue: 200, label: { ja: '耳付き丸（猫系）', en: 'Eared',     elementary: 'みみつき' },
    promptHint: 'a round-headed cat-like creature with prominent ears and a slim tidy body' },
  { id: 'tailed',    hue: 280, label: { ja: '尻尾つき二足',     en: 'Tailed',    elementary: 'しっぽ' },
    promptHint: 'a slim agile bipedal creature with a prominent noticeable tail' },
  { id: 'dragon',    hue: 300, label: { ja: '竜・トカゲ',       en: 'Dragon',    elementary: 'ドラゴン' },
    promptHint: 'a stout dragon-lizard with a thick body, a neck and a tail, half-standing' },
  { id: 'serpent',   hue: 160, label: { ja: '細長・ヘビ',       en: 'Serpent',   elementary: 'にょろ' },
    promptHint: 'a long legless serpent forming one single long curved line' },
  { id: 'aqua',      hue: 190, label: { ja: '魚・水棲',         en: 'Aquatic',   elementary: 'おさかな' },
    promptHint: 'a spindle-shaped fish-like aquatic creature with clear fins' },
  { id: 'bug',       hue:  90, label: { ja: '虫・分節',         en: 'Bug',       elementary: 'むし' },
    promptHint: 'a segmented insect body with legs and antennae' },
  { id: 'multilimb', hue: 330, label: { ja: '横広・多脚/触手',  en: 'Multi-limb',elementary: 'たくさんあし' },
    promptHint: 'a wide-bodied many-limbed creature (crab or octopus-like) with several appendages spread sideways' },
];

// === 形に出る特徴（シルエットに現れる個体差）。forms=相性の良い基本フォルムID（E3の発見: 相性がある）===
export const AXIS_FEATURE = [
  { id: 'ears_long',  label: { ja: '長い耳',    en: 'Long ears',    elementary: 'ながいみみ' },
    promptHint: 'two long upright ears',                    forms: ['eared','critter','quadruped','tailed','round','squat'] },
  { id: 'ears_round', label: { ja: '丸い耳',    en: 'Round ears',   elementary: 'まるいみみ' },
    promptHint: 'two round ears on top of the head',        forms: ['round','critter','eared','squat'] },
  { id: 'ears_droop', label: { ja: '垂れ耳',    en: 'Droopy ears',  elementary: 'たれみみ' },
    promptHint: 'two large droopy ears',                    forms: ['quadruped','eared','squat','critter'] },
  { id: 'tail_long',  label: { ja: '長い尻尾',  en: 'Long tail',    elementary: 'ながいしっぽ' },
    promptHint: 'one long sweeping tail',                   forms: ['quadruped','tailed','dragon','eared','critter'] },
  { id: 'tail_fluffy',label: { ja: 'ふさふさ尻尾', en: 'Fluffy tail', elementary: 'ふさふさしっぽ' },
    promptHint: 'one big fluffy bushy tail',                forms: ['quadruped','eared','tailed','critter'] },
  { id: 'tail_multi', label: { ja: '複数の尻尾', en: 'Many tails',   elementary: 'たくさんしっぽ' },
    promptHint: 'several tails fanning out',                forms: ['tailed','quadruped','eared'] },
  { id: 'horn_1',     label: { ja: '角1本',     en: 'One horn',     elementary: 'つの1ぽん' },
    promptHint: 'a single horn on the head',                forms: ['dragon','quadruped','upright','squat'] },
  { id: 'horn_2',     label: { ja: '角2本',     en: 'Two horns',    elementary: 'つの2ほん' },
    promptHint: 'two horns on the head',                    forms: ['dragon','quadruped','squat','upright','round'] },
  { id: 'horn_twist', label: { ja: 'ねじれ角',  en: 'Twisted horns',elementary: 'ねじれつの' },
    promptHint: 'a pair of twisted spiral horns',           forms: ['dragon','quadruped','upright'] },
  { id: 'wings',      label: { ja: '翼',        en: 'Wings',        elementary: 'つばさ' },
    promptHint: 'a pair of clear wings on the back',        forms: ['bird','bigwing','dragon','upright'] },
  { id: 'fins',       label: { ja: 'ヒレ',      en: 'Fins',         elementary: 'ひれ' },
    promptHint: 'prominent fins along the body',            forms: ['aqua','serpent'] },
  { id: 'antennae',   label: { ja: '触角',      en: 'Antennae',     elementary: 'しょっかく' },
    promptHint: 'two antennae on the head',                 forms: ['bug','aqua'] },
  { id: 'backfin',    label: { ja: '背びれ',    en: 'Back fin',     elementary: 'せびれ' },
    promptHint: 'a row of spikes forming a back fin along the spine', forms: ['dragon','serpent','aqua','quadruped'] },
  { id: 'crest',      label: { ja: '冠羽',      en: 'Crest',        elementary: 'かんむり' },
    promptHint: 'a tall feather crest on the head',         forms: ['bird','bigwing','dragon'] },
];

export const AXIS_IMPRESSION = [
  { id: 'cute',    label: { ja: 'かわいい',      en: 'Cute',       elementary: 'かわいい' },
    promptHint: 'cute and adorable, big sparkly eyes' },
  { id: 'cool',    label: { ja: 'かっこいい',    en: 'Cool',       elementary: 'かっこいい' },
    promptHint: 'cool and sharp-looking, confident pose' },
  { id: 'brave',   label: { ja: 'ゆうかん',      en: 'Brave',      elementary: 'ゆうかん' },
    promptHint: 'brave and heroic, energetic stance' },
  { id: 'mystic',  label: { ja: 'ミステリアス',  en: 'Mysterious', elementary: 'ミステリアス' },
    promptHint: 'mysterious and calm, dreamy atmosphere' },
  { id: 'calm',    label: { ja: 'おっとり',      en: 'Calm',       elementary: 'おっとり' },
    promptHint: 'gentle and easygoing, soft smile' },
];

// === モチーフ → フォルム＋特徴（課題4: モチーフと生成キャラの乖離をなくす）===
//   「モチーフ＝フォルム＋特徴の組み合わせで表現される」という設計思想を明文化した対応表（v1）。
//   フォルムと特徴をランダムに独立で割り当てると「モチーフ＝急須／フォルム＝四足」のような
//   噛み合わない組み合わせが生まれるため、モチーフから両方を導く。
//   値は [bodyId, featureId|null]。featureId=null は「付属特徴なし」。
//   ※ 特徴軸は動物の付属器官（耳/尻尾/角/翼/ヒレ/触角/背びれ/冠羽）中心のため、
//     モノ・植物・食べ物・天気などの非動物モチーフは中立フォルムに逃がし（下の NEUTRAL_BODY_IDS）、
//     モチーフ自体はプロンプトの motif/decoration 行で表現する（フォルム＋特徴には押し込まない）。
export const MOTIF_ARCHETYPE = {
  // けもの
  'ねこ': ['eared','tail_long'], 'いぬ': ['quadruped','tail_fluffy'], 'こいぬ': ['quadruped','ears_droop'],
  'きつね': ['quadruped','tail_fluffy'], 'たぬき': ['quadruped','tail_fluffy'], 'うさぎ': ['eared','ears_long'],
  'ねずみ': ['critter','tail_long'], 'りす': ['critter','tail_fluffy'], 'くま': ['quadruped','ears_round'],
  'こぐま': ['critter','ears_round'], 'ひつじ': ['quadruped','horn_twist'], 'うし': ['quadruped','horn_2'],
  'うま': ['quadruped','tail_long'], 'いのしし': ['quadruped','horn_1'], 'オオカミ': ['quadruped','tail_fluffy'],
  'カバ': ['quadruped','ears_round'], 'ビーバー': ['quadruped','tail_long'], 'なまけもの': ['quadruped','tail_long'],
  'ラッコ': ['critter','tail_long'], 'あしか': ['aqua','fins'], 'モモンガ': ['critter','wings'],
  'こうもり': ['critter','wings'], 'もぐら': ['critter','ears_round'],
  // とり
  'とり': ['bird','wings'], 'ことり': ['bird','wings'], 'あひる': ['bird','wings'], 'ツバメ': ['bird','wings'],
  'カラス': ['bird','wings'], 'はと': ['bird','wings'], 'ふくろう': ['bird','crest'], 'ペンギン': ['bird','wings'],
  'わし': ['bigwing','wings'],
  // みずのいきもの
  'さかな': ['aqua','fins'], 'きんぎょ': ['aqua','fins'], 'かえる': ['critter',null], 'おたまじゃくし': ['aqua','tail_long'],
  'かめ': ['aqua','backfin'], 'いるか': ['aqua','fins'], 'くじら': ['aqua','fins'],
  'くらげ': ['multilimb','antennae'], 'ひとで': ['multilimb',null], 'さんご': ['multilimb',null],
  'やどかり': ['multilimb',null], 'かに': ['multilimb',null], 'うに': ['round','backfin'], 'なまこ': ['serpent',null],
  // は虫類
  'へび': ['serpent',null], 'コブラ': ['serpent','crest'], 'とかげ': ['dragon','tail_long'], 'ワニ': ['dragon','backfin'],
  // むし
  'ちょうちょ': ['bug','wings'], 'くわがた': ['bug','horn_1'], 'かまきり': ['bug','antennae'], 'こおろぎ': ['bug','wings'],
  'ほたる': ['bug','antennae'], 'とんぼ': ['bug','wings'], 'いもむし': ['serpent','antennae'], 'さなぎ': ['squat',null],
  'はち': ['bug','wings'], 'あり': ['bug','antennae'], 'てんとうむし': ['round','antennae'],
  // ふしぎ系（動物寄り）
  'ドラゴン': ['dragon','wings'], 'ようせい': ['critter','wings'], 'せいれい': ['critter','wings'],
  'おばけ': ['round',null], 'ロボット': ['upright',null],
  // 明確に形のある非動物（中立フォルム）
  'きのこ': ['squat',null], 'サボテン': ['upright',null], 'ぼんさい': ['squat',null],
  'にんぎょう': ['upright',null], 'ぬいぐるみ': ['squat',null], 'たまご': ['round',null],
  'みず・うみ': ['aqua','fins'],
};

// === フォルム → 特徴的な装飾（課題4・データ駆動）===
//   roster分析で decoration_1 は shape の1:1の言い換えだった（upright→ちょくりつ 216/216 等）。
//   ＝ポケモンの世界では「装飾は形から一意に決まる」。よって装飾は独立ランダムで引かず、
//   フォルムから導出する（vocab.js decoration と同じ表記で対応づけ）。
export const BODY_DECORATION = {
  round:     'まるいフォルム',
  squat:     'まるいフォルム',
  quadruped: 'よつあしのすがた',
  upright:   'ちょくりつのすがた',
  critter:   'てあし・とくちょうてきなかお',
  tailed:    'てあし・とくちょうてきなかお',
  eared:     'よつあしのすがた',
  bird:      'つばさ・はね',
  bigwing:   'つばさ・はね',
  bug:       'むしのはね',
  aqua:      'ひれ',
  serpent:   'ほそながい',
  dragon:    'つの・うろこ模様',
  multilimb: 'しょくしゅ・ひげ',
};
/** フォルム → 装飾語（無ければ null）。装飾はフォルムから導く（独立に引かない）。 */
export function decorationForBody(bodyId) { return BODY_DECORATION[bodyId] || null; }

// 非動物・未対応モチーフのための中立フォルム（特定の動物を主張しない汎用体型）。
// これらにはフォルム＋特徴を強制せず、モチーフはプロンプトの motif 行で表現する。
export const NEUTRAL_BODY_IDS = ['round','critter','squat','upright'];

/** モチーフ → { bodyId, featureId } を返す（未対応なら null）。 */
export function archetypeForMotif(motif) {
  const pair = MOTIF_ARCHETYPE[motif];
  if (!pair) return null;
  return { bodyId: pair[0], featureId: pair[1] || null };
}

export function bodyById(id)       { return AXIS_BODY.find(b => b.id === id) || null; }
export function featureById(id)    { return AXIS_FEATURE.find(f => f.id === id) || null; }
export function impressionById(id) { return AXIS_IMPRESSION.find(i => i.id === id) || null; }

/** 基本フォルムに相性の良い「形に出る特徴」一覧（無ければ全特徴）。 */
export function featuresForBody(bodyId) {
  const matched = AXIS_FEATURE.filter(f => (f.forms || []).includes(bodyId));
  return matched.length ? matched : AXIS_FEATURE;
}

/** ラベル取得（lang: 'ja' | 'en' | 'elementary'。無ければ ja） */
export function axisLabel(item, lang) {
  if (!item || !item.label) return '';
  return item.label[lang] || item.label.ja || '';
}

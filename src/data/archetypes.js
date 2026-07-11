// [[archetype taxonomy]]（暫定版・差し替え前提）
//
// キャラ自動生成の「ユーザー変数」= 生き物デザインの汎用記述語彙。
// 本番はポケモン等の大規模ロスターを"言葉で分析"して作った表に差し替える予定。
// ここは実装を先に通すための暫定セット（IP非依存の一般的な形態記述のみ）。
//
// 使い方:
//   - AXIS_BODY … からだのタイプ（シルエット＝形に効く軸）
//   - AXIS_IMPRESSION … いんしょう（色・表情・雰囲気に効く軸）
//   - promptHint … NanoBanana Pro へ渡す英語ヒント（画風はブランディング固定部＋参照画像で担保）
//   - hue … モック生成で色替えに使う CSS hue-rotate 角度（実API導入後は不要）

export const AXIS_BODY = [
  { id: 'beast',    hue:  0,   label: { ja: 'けもの',        en: 'Beast',    elementary: 'けもの' },
    promptHint: 'a small four-legged furry creature' },
  { id: 'bird',     hue: 40,   label: { ja: 'とり・つばさ',   en: 'Bird',     elementary: 'とり' },
    promptHint: 'a round winged bird-like creature' },
  { id: 'dragon',   hue: 300,  label: { ja: 'ドラゴン',      en: 'Dragon',   elementary: 'ドラゴン' },
    promptHint: 'a cute little reptilian dragon creature' },
  { id: 'bug',      hue: 90,   label: { ja: 'むし',          en: 'Bug',      elementary: 'むし' },
    promptHint: 'a friendly rounded insect-like creature' },
  { id: 'aqua',     hue: 190,  label: { ja: 'みずのいきもの', en: 'Aquatic',  elementary: 'みずのいきもの' },
    promptHint: 'a soft aquatic sea creature' },
  { id: 'critter',  hue: 25,   label: { ja: 'ちいさいけもの', en: 'Critter',  elementary: 'ちいさいけもの' },
    promptHint: 'a tiny rodent-like critter' },
  { id: 'humanoid', hue: 15,   label: { ja: 'ひとがた',      en: 'Humanoid', elementary: 'ひとがた' },
    promptHint: 'a small friendly humanoid mascot' },
  { id: 'plant',    hue: 110,  label: { ja: 'しょくぶつ',    en: 'Plant',    elementary: 'しょくぶつ' },
    promptHint: 'a cheerful plant-like sprout creature' },
  { id: 'machine',  hue: 210,  label: { ja: 'きかい・いわ',   en: 'Machine',  elementary: 'きかい・いわ' },
    promptHint: 'a cute round robot or rock creature' },
  { id: 'mystery',  hue: 270,  label: { ja: 'ふしぎ',        en: 'Mystery',  elementary: 'ふしぎ' },
    promptHint: 'a mysterious soft blob or ghost-like creature' },
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

export function bodyById(id)       { return AXIS_BODY.find(b => b.id === id) || null; }
export function impressionById(id) { return AXIS_IMPRESSION.find(i => i.id === id) || null; }

/** ラベル取得（lang: 'ja' | 'en' | 'elementary'。無ければ ja） */
export function axisLabel(item, lang) {
  if (!item || !item.label) return '';
  return item.label[lang] || item.label.ja || '';
}

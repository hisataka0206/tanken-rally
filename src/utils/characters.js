// ARキャラクター定義（カテゴリ別7種 + レア1種 + スタート駅2種）
//
// 画像素材: src/assets/characters/<id>_<pose>.png（透過PNG、img/ の原画シートから切り出し）
// ポーズ: discovery（通常/発見）, get（ゲット！）, bonus（特典発動）, ほか sleep/walk（予備）
// アプリでの使い分け:
//   - AR画面のライブ表示     → discovery
//   - 捕獲写真への合成       → get（"ゲット！"演出）
//   - 図鑑・スコア演出（将来）→ bonus
//
// キャラ⇔カテゴリ対応（2026-07-07 確定）:
//   史跡=lucky / スイーツ=taffy / 自然=oakchap / 玩具=stacky /
//   美術館=arto / 科学館=loupe / 駄菓子屋=tixy /
//   レア（ゴール駅25%）=memry / スタート駅（ランダム）=lookie, colorey

import { LANG } from './i18n.js?v=103';

export const ASSET_BASE = 'src/assets/characters/';

export const RARE_CHARACTER_ID = 'memry';

// レアキャラのゴール駅出現確率（全スポット訪問チェックは P4 で導入予定）
export const RARE_APPEAR_PROBABILITY = 0.25;

// スタート駅に出現するキャラ（セッションごとにランダムで1体）
export const START_CHARACTER_IDS = ['lookie', 'colorey'];

// 性格・ストーリーの設定資料: docs/characters-story.md（変更時は両方を更新すること）
// ⚠️ 表示名は変更してよいが、id はアセットファイル名・図鑑の保存キーなので変更しない。
export const CHARACTERS = [
  { id: 'lucky', category: 'historic', color: '#795548',
    names: { ja: 'ラッキー', en: 'Lucky', elementary: 'ラッキー' },
    personality: {
      ja: '頼りになる・アクロバティック',
      en: 'Dependable and acrobatic',
      elementary: 'たよりになる・アクロバティック',
    },
    story: {
      ja: '誰かの探検の無事を願って買われたものの、カバンから落ちてしまった。実はすごく運動神経が良く、ピンチの時には大ジャンプで助けてくれる。',
      en: 'Bought to wish someone a safe journey, but fell out of their bag. Surprisingly athletic — when you are in a pinch, it leaps in to help with a mighty jump.',
      elementary: 'だれかの探検（たんけん）の無事（ぶじ）をねがって買（か）われたけれど、カバンから落（お）ちてしまった。じつはすごく運動神経（うんどうしんけい）がよくて、ピンチのときには大（おお）ジャンプで助（たす）けてくれる。',
    },
    poses: { normal: 'lucky_discovery.png', found: 'lucky_get.png', captured: 'lucky_bonus.png' } },
  { id: 'taffy', category: 'sweets', color: '#e91e8c',
    names: { ja: 'タフィー', en: 'Taffy', elementary: 'タフィー' },
    personality: {
      ja: '元気いっぱい・気分屋',
      en: 'Full of energy and moody',
      elementary: '元気（げんき）いっぱい・気分屋（きぶんや）',
    },
    story: {
      ja: '子どものポケットから転がり落ちてしまった迷子のお菓子。落ち込まず元気だが、気分によって包み紙（ラッパー）の色がコロコロ変わる。',
      en: 'A lost candy that tumbled out of a child\'s pocket. Never gets down — always cheerful — but its wrapper changes color with its mood.',
      elementary: '子（こ)どものポケットからころがり落（お）ちてしまった迷子（まいご）のお菓子（かし）。落（お）ちこまず元気（げんき）だけど、気分（きぶん）によって包（つつ）み紙（がみ）の色（いろ）がコロコロ変（か）わる。',
    },
    poses: { normal: 'taffy_discovery.png', found: 'taffy_get.png', captured: 'taffy_bonus.png' } },
  { id: 'oakchap', category: 'nature', color: '#2e7d32',
    names: { ja: 'ナッティ', en: 'Nutty', elementary: 'ナッティ' },
    personality: {
      ja: '夢見がち・強がり',
      en: 'A dreamer who acts tough',
      elementary: 'ゆめみがち・強（つよ）がり',
    },
    story: {
      ja: 'ずっと森の外の大冒険を夢見ていた小さな存在。頭に乗せている「木の葉の帽子」をかぶっている間だけは、自分は無敵になれると信じ込んでいる。',
      en: 'A tiny acorn that always dreamed of grand adventures beyond the forest. It firmly believes it becomes invincible while wearing its little leaf hat.',
      elementary: 'ずっと森（もり）の外（そと）の大冒険（だいぼうけん）をゆめ見（み）ていた小（ちい）さな存在（そんざい）。頭（あたま）にのせている「木（こ）の葉（は）のぼうし」をかぶっている間（あいだ）だけは、自分（じぶん）は無敵（むてき）になれると信（しん）じこんでいる。',
    },
    poses: { normal: 'oakchap_discovery.png', found: 'oakchap_get.png', captured: 'oakchap_bonus.png' } },
  { id: 'stacky', category: 'toy', color: '#ff9800',
    names: { ja: 'スタッキー', en: 'Stacky', elementary: 'スタッキー' },
    personality: {
      ja: '無口・協力プレイ',
      en: 'Quiet team players',
      elementary: 'むくち・協力（きょうりょく）プレイ',
    },
    story: {
      ja: 'おもちゃ箱の底に取り残されていた2人組。いつも重なり合って行動している。口数は少なく、側面のアルファベットを組み合わせて静かに会話する。',
      en: 'A duo left behind at the bottom of a toy box. They always move around stacked together. They rarely speak — instead they quietly talk by combining the letters on their sides.',
      elementary: 'おもちゃ箱（ばこ）の底（そこ）に取（と）り残（のこ）されていた2人組（ふたりぐみ）。いつも重（かさ）なり合（あ）って行動（こうどう）している。口数（くちかず）は少（すく）なく、側面（そくめん）のアルファベットを組（く）み合（あ）わせて静（しず）かに会話（かいわ）する。',
    },
    poses: { normal: 'stacky_discovery.png', found: 'stacky_get.png', captured: 'stacky_bonus.png' } },
  { id: 'arto', category: 'museum', color: '#5e35b1',
    names: { ja: 'アルト', en: 'Arto', elementary: 'アルト' },
    personality: {
      ja: 'ロマンチスト・感情豊か',
      en: 'A romantic with big emotions',
      elementary: 'ロマンチスト・感情（かんじょう）ゆたか',
    },
    story: {
      ja: '探検で見つけた綺麗な景色を全部絵に残したいと思っている。体（パレット）の上に乗っている絵の具は、実はその時の自分の感情の起伏を表している。',
      en: 'Wants to paint every beautiful view found on an expedition. The blobs of paint on its palette body actually show the ups and downs of its feelings at that moment.',
      elementary: '探検（たんけん）で見（み）つけたきれいな景色（けしき）をぜんぶ絵（え）に残（のこ）したいと思（おも）っている。体（からだ）のパレットの上（うえ）にのっている絵（え）の具（ぐ）は、じつはそのときの自分（じぶん）の気持（きも）ちを表（あらわ）している。',
    },
    poses: { normal: 'arto_discovery.png', found: 'arto_get.png', captured: 'arto_bonus.png' } },
  { id: 'loupe', category: 'science', color: '#0097a7',
    names: { ja: 'ズーミー', en: 'Zoomy', elementary: 'ズーミー' },
    personality: {
      ja: '自称・名探偵、大げさ',
      en: 'Self-proclaimed master detective, dramatic',
      elementary: '自称（じしょう）・名探偵（めいたんてい）、大（おお）げさ',
    },
    story: {
      ja: '自分のことを「伝説の名探偵」だと思い込んでいる。道端のただの石ころなどを「重要な手がかり」として見つけ、虫眼鏡越しに大げさに驚いてみせる。',
      en: 'Convinced it is a legendary master detective. It picks up ordinary pebbles on the roadside as "crucial clues" and gasps dramatically through its magnifying glass.',
      elementary: '自分（じぶん）のことを「伝説（でんせつ）の名探偵（めいたんてい）」だと思（おも）いこんでいる。道端（みちばた）のただの石（いし）ころなどを「重要（じゅうよう）な手（て）がかり」として見（み）つけ、虫眼鏡（むしめがね）ごしに大（おお）げさにおどろいてみせる。',
    },
    poses: { normal: 'loupe_discovery.png', found: 'loupe_get.png', captured: 'loupe_bonus.png' } },
  { id: 'tixy', category: 'dagashi', color: '#d81b60',
    names: { ja: 'ティクシー', en: 'Tixy', elementary: 'ティクシー' },
    personality: {
      ja: '旅の憧れ・仲間思い',
      en: 'Dreams of travel, cares for friends',
      elementary: '旅（たび）へのあこがれ・仲間思（なかまおも）い',
    },
    story: {
      ja: '改札を通れなかった「未使用の切符」。いつか「最高の思い出に残る旅」に出る日をずっと待っていた。他のキャラクターと出会い、仲間が増えるのが誰よりも嬉しい。',
      en: 'An unused ticket that never made it through the gate. It has long waited for the day it sets off on "the most memorable journey ever." Nothing makes it happier than meeting other characters and making new friends.',
      elementary: '改札（かいさつ）を通（とお）れなかった「未使用（みしよう）の切符（きっぷ）」。いつか「最高（さいこう）の思（おも）い出（で）に残（のこ）る旅（たび）」に出（で）る日（ひ）をずっと待（ま）っていた。ほかのキャラクターと出会（であ）って、仲間（なかま）がふえるのがだれよりもうれしい。',
    },
    poses: { normal: 'tixy_discovery.png', found: 'tixy_get.png', captured: 'tixy_bonus.png' } },
  // レア（ゴール駅）
  { id: RARE_CHARACTER_ID, category: null, color: '#c9a227',
    names: { ja: 'メムリー', en: 'Memry', elementary: 'メムリー' },
    personality: {
      ja: '寂しがりや・思い出好き',
      en: 'Lonely and loves memories',
      elementary: 'さびしがりや・思（おも）い出（で）ずき',
    },
    story: {
      ja: '元々は白紙のページばかりで引き出しの奥で寂しがっていた。探検ラリーでみんなとの写真でページが埋まっていくのが今の最大の生きがい。',
      en: 'Once just blank pages, feeling lonely at the back of a drawer. Now its greatest joy is watching its pages fill up with photos from everyone\'s expeditions.',
      elementary: 'もともとは白紙（はくし）のページばかりで、引（ひ）き出（だ）しのおくでさびしがっていた。たんけんラリーでみんなとの写真（しゃしん）でページがうまっていくのが、いまのいちばんの生（い）きがい。',
    },
    poses: { normal: 'memry_discovery.png', found: 'memry_get.png', captured: 'memry_bonus.png' } },
  // スタート駅（ランダム）
  { id: 'lookie', category: null, color: '#42a5f5',
    names: { ja: 'ルッキー', en: 'Lookie', elementary: 'ルッキー' },
    personality: {
      ja: '観察眼が鋭い・ドジ',
      en: 'Sharp-eyed but clumsy',
      elementary: '観察（かんさつ）が得意（とくい）・ドジ',
    },
    story: {
      ja: '窓辺に置き忘れられ、ずっと渡り鳥を眺めていた。遠くの面白いものを見つけるのは得意だが、足元を見ていないので近くの障害物によくぶつかる。',
      en: 'Left behind on a windowsill, it spent its days watching migrating birds. Great at spotting interesting things far away — but never watches its feet, so it keeps bumping into things nearby.',
      elementary: '窓辺（まどべ）に置（お）き忘（わす）れられて、ずっと渡（わた）り鳥（どり）をながめていた。遠（とお）くの面白（おもしろ）いものを見（み）つけるのは得意（とくい）だけど、足元（あしもと）を見（み）ていないので、近（ちか）くの物（もの）によくぶつかる。',
    },
    poses: { normal: 'lookie_discovery.png', found: 'lookie_get.png', captured: 'lookie_bonus.png' } },
  { id: 'colorey', category: null, color: '#ef6c00',
    names: { ja: 'コロレイ', en: 'Colorey', elementary: 'コロレイ' },
    personality: {
      ja: '集中力が高い・完璧主義',
      en: 'Focused perfectionist',
      elementary: '集中力（しゅうちゅうりょく）が高（たか）い・完璧主義（かんぺきしゅぎ）',
    },
    story: {
      ja: '「世界一長い線を引くこと」を密かに夢見ている。集中力が高まると芯がピンと尖るが、使われて芯が丸くなると「まだ本気を出していない」と少し落ち込む。',
      en: 'Secretly dreams of drawing the longest line in the world. When it concentrates, its tip sharpens to a fine point — but when it gets worn down and rounded, it sulks a little: "I haven\'t shown my true power yet."',
      elementary: '「世界一（せかいいち）長（なが）い線（せん）を引（ひ）くこと」をひそかにゆめ見（み）ている。集中（しゅうちゅう）すると芯（しん）がピンととがるけど、使（つか）われて芯（しん）が丸（まる）くなると「まだ本気（ほんき）を出（だ）していない」と少（すこ）し落（お）ちこむ。',
    },
    poses: { normal: 'colorey_discovery.png', found: 'colorey_get.png', captured: 'colorey_bonus.png' } },
];

const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));
const CATEGORY_CHARACTERS = CHARACTERS.filter(c => c.category);

export function characterById(id) {
  return CHAR_BY_ID[id] || null;
}

/** スポットのカテゴリからキャラを返す。
 *  未知カテゴリ（'other' 等）はスポット名のハッシュでカテゴリ7種から安定的に選ぶ
 *  （同じスポットには常に同じキャラが出る）。 */
export function characterForSpot(spot) {
  const direct = CATEGORY_CHARACTERS.find(c => c.category === spot?.category);
  if (direct) return direct;
  const key = String(spot?.name || spot?.id || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CATEGORY_CHARACTERS[h % CATEGORY_CHARACTERS.length];
}

export function rareCharacter() {
  return CHAR_BY_ID[RARE_CHARACTER_ID];
}

/** スタート駅キャラをランダムに1体返す（呼び出し側でセッション中は結果を保持すること） */
export function pickStartCharacter() {
  const id = START_CHARACTER_IDS[Math.floor(Math.random() * START_CHARACTER_IDS.length)];
  return CHAR_BY_ID[id];
}

/** 現在の言語でのキャラ表示名 */
export function charDisplayName(char) {
  if (!char) return '';
  return char.names[LANG] || char.names.ja;
}

/** 現在の言語での性格・とくちょう */
export function charPersonality(char) {
  if (!char || !char.personality) return '';
  return char.personality[LANG] || char.personality.ja;
}

/** 現在の言語でのストーリー（背景）。図鑑で捕獲済みキャラのみ表示する想定 */
export function charStory(char) {
  if (!char || !char.story) return '';
  return char.story[LANG] || char.story.ja;
}

/** ポーズ画像のURL（無いポーズは normal にフォールバック） */
export function characterImageUrl(char, pose = 'normal') {
  if (!char) return '';
  const file = char.poses[pose] || char.poses.normal;
  return ASSET_BASE + file;
}

// 「get以外」の予備ポーズ（シートに存在したもののみ）。地図PDFのお楽しみ配置などに使う。
const EXTRA_POSES = {
  arto: ['arto_sleep.png'],
  colorey: ['colorey_sleep.png'],
  loupe: ['loupe_sleep.png'],
  lucky: ['lucky_walk.png'],
  oakchap: ['oakchap_walk.png'],
  taffy: ['taffy_walk.png'],
  tixy: ['tixy_walk.png'],
};

/** ランダムなキャラ×ランダムな「get以外」ポーズの画像を返す（地図PDFのお楽しみ用）。
 *  戻り値: { char, url } */
export function randomFunCharacterImage() {
  const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  const pool = [char.poses.normal, char.poses.captured, ...(EXTRA_POSES[char.id] || [])];
  const file = pool[Math.floor(Math.random() * pool.length)];
  return { char, url: ASSET_BASE + file };
}

/** キャラの全ポーズ画像をプリロードし、{ pose: HTMLImageElement } を返す。
 *  読み込み失敗したポーズは含まれない（呼び出し側でフォールバックすること）。 */
export function preloadCharacterImages(char) {
  const poses = ['normal', 'found', 'captured'];
  return Promise.all(poses.map(pose => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve([pose, img]);
    img.onerror = () => resolve([pose, null]);
    img.src = characterImageUrl(char, pose);
  }))).then(entries => Object.fromEntries(entries.filter(([, img]) => img)));
}

/** canvas にキャラ画像＋名前リボンを描画する（捕獲写真の合成用）。
 *  cx/cy は画像の中心、sizePx は長辺サイズ。img が null の場合は色付き円で代替。 */
export function drawCharacterOnCanvas(ctx, char, img, cx, cy, sizePx) {
  ctx.save();
  let bottomY;
  if (img) {
    const scale = sizePx / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    // 白フチ付きの軽いドロップシャドウで背景から浮かせる
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = sizePx * 0.05;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.shadowBlur = 0;
    bottomY = cy + h / 2;
  } else {
    // フォールバック: 色付き円
    ctx.beginPath();
    ctx.arc(cx, cy, sizePx / 2, 0, Math.PI * 2);
    ctx.fillStyle = char.color;
    ctx.fill();
    ctx.lineWidth = Math.max(4, sizePx * 0.04);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    bottomY = cy + sizePx / 2;
  }
  // 名前リボン
  const name = charDisplayName(char);
  const fontPx = Math.max(14, Math.round(sizePx * 0.12));
  ctx.font = `bold ${fontPx}px sans-serif`;
  const tw = ctx.measureText(name).width;
  const pad = fontPx * 0.6;
  const ry = bottomY + fontPx * 1.1;
  roundRect(ctx, cx - tw / 2 - pad, ry - fontPx * 0.8, tw + pad * 2, fontPx * 1.6, fontPx * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, ry);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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

import { LANG } from './i18n.js?v=97';

export const ASSET_BASE = 'src/assets/characters/';

export const RARE_CHARACTER_ID = 'memry';

// レアキャラのゴール駅出現確率（全スポット訪問チェックは P4 で導入予定）
export const RARE_APPEAR_PROBABILITY = 0.25;

// スタート駅に出現するキャラ（セッションごとにランダムで1体）
export const START_CHARACTER_IDS = ['lookie', 'colorey'];

export const CHARACTERS = [
  { id: 'lucky', category: 'historic', color: '#795548',
    names: { ja: 'ラッキー', en: 'Lucky', elementary: 'ラッキー' },
    poses: { normal: 'lucky_discovery.png', found: 'lucky_get.png', captured: 'lucky_bonus.png' } },
  { id: 'taffy', category: 'sweets', color: '#e91e8c',
    names: { ja: 'タフィー', en: 'Taffy', elementary: 'タフィー' },
    poses: { normal: 'taffy_discovery.png', found: 'taffy_get.png', captured: 'taffy_bonus.png' } },
  { id: 'oakchap', category: 'nature', color: '#2e7d32',
    names: { ja: 'オークチャップ', en: 'Oak Chap', elementary: 'オークチャップ' },
    poses: { normal: 'oakchap_discovery.png', found: 'oakchap_get.png', captured: 'oakchap_bonus.png' } },
  { id: 'stacky', category: 'toy', color: '#ff9800',
    names: { ja: 'スタッキー', en: 'Stacky', elementary: 'スタッキー' },
    poses: { normal: 'stacky_discovery.png', found: 'stacky_get.png', captured: 'stacky_bonus.png' } },
  { id: 'arto', category: 'museum', color: '#5e35b1',
    names: { ja: 'アルト', en: 'Arto', elementary: 'アルト' },
    poses: { normal: 'arto_discovery.png', found: 'arto_get.png', captured: 'arto_bonus.png' } },
  { id: 'loupe', category: 'science', color: '#0097a7',
    names: { ja: 'ルーペ', en: 'Loupe', elementary: 'ルーペ' },
    poses: { normal: 'loupe_discovery.png', found: 'loupe_get.png', captured: 'loupe_bonus.png' } },
  { id: 'tixy', category: 'dagashi', color: '#d81b60',
    names: { ja: 'ティクシー', en: 'Tixy', elementary: 'ティクシー' },
    poses: { normal: 'tixy_discovery.png', found: 'tixy_get.png', captured: 'tixy_bonus.png' } },
  // レア（ゴール駅）
  { id: RARE_CHARACTER_ID, category: null, color: '#c9a227',
    names: { ja: 'メムリー', en: 'Memry', elementary: 'メムリー' },
    poses: { normal: 'memry_discovery.png', found: 'memry_get.png', captured: 'memry_bonus.png' } },
  // スタート駅（ランダム）
  { id: 'lookie', category: null, color: '#42a5f5',
    names: { ja: 'ルッキー', en: 'Lookie', elementary: 'ルッキー' },
    poses: { normal: 'lookie_discovery.png', found: 'lookie_get.png', captured: 'lookie_bonus.png' } },
  { id: 'colorey', category: null, color: '#ef6c00',
    names: { ja: 'コロレイ', en: 'Colorey', elementary: 'コロレイ' },
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

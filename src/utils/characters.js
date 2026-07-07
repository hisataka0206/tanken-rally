// ARキャラクター定義（カテゴリ別7種 + レア1種）
//
// ⚠️ キャラクターデザイン・名称は別途検討中のためプレースホルダ。
//    確定後は emoji を透過PNG（src/assets/characters/）に差し替える。
//    体数構成（カテゴリ別7種＋レア1種）は仕様確定済み（docs/ar-character-capture-spec.md）。
//
// 表示は emoji + カテゴリ色の円形バブルで統一。
//   - DOM 表示: main.js が .ar-character-bubble に emoji / 色を流し込む
//   - 写真合成: drawCharacterOnCanvas(ctx, char, ...) で canvas に直接描画

import { LANG } from './i18n.js?v=95';

export const RARE_CHARACTER_ID = 'rare_hakase';

// レアキャラのゴール駅出現確率（全スポット訪問チェックは P4 で導入予定）
export const RARE_APPEAR_PROBABILITY = 0.25;

export const CHARACTERS = [
  { id: 'historic', category: 'historic', emoji: '🥷', color: '#795548',
    names: { ja: 'シロマル', en: 'Shiromaru', elementary: 'シロマル' } },
  { id: 'sweets', category: 'sweets', emoji: '🧁', color: '#e91e8c',
    names: { ja: 'クリィム', en: 'Creamy', elementary: 'クリィム' } },
  { id: 'nature', category: 'nature', emoji: '🍃', color: '#2e7d32',
    names: { ja: 'ハッパン', en: 'Leafy', elementary: 'ハッパン' } },
  { id: 'toy', category: 'toy', emoji: '🤖', color: '#ff9800',
    names: { ja: 'ブロッコ', en: 'Blocko', elementary: 'ブロッコ' } },
  { id: 'museum', category: 'museum', emoji: '🐱', color: '#5e35b1',
    names: { ja: 'パレット', en: 'Palette', elementary: 'パレット' } },
  { id: 'science', category: 'science', emoji: '⚗️', color: '#0097a7',
    names: { ja: 'ラボリン', en: 'Laborin', elementary: 'ラボリン' } },
  { id: 'dagashi', category: 'dagashi', emoji: '👻', color: '#d81b60',
    names: { ja: 'ダガシー', en: 'Dagashee', elementary: 'ダガシー' } },
  { id: RARE_CHARACTER_ID, category: null, emoji: '🎩', color: '#c9a227',
    names: { ja: 'タンケンハカセ', en: 'Dr. Tanken', elementary: 'タンケンハカセ' } },
];

const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));
const REGULAR_CHARACTERS = CHARACTERS.filter(c => c.id !== RARE_CHARACTER_ID);

export function characterById(id) {
  return CHAR_BY_ID[id] || null;
}

/** スポットのカテゴリからキャラを返す。
 *  未知カテゴリ（'other' 等）はスポット名のハッシュで7種から安定的に選ぶ
 *  （同じスポットには常に同じキャラが出る）。 */
export function characterForSpot(spot) {
  const direct = CHAR_BY_ID[spot?.category];
  if (direct && direct.id !== RARE_CHARACTER_ID) return direct;
  const key = String(spot?.name || spot?.id || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return REGULAR_CHARACTERS[h % REGULAR_CHARACTERS.length];
}

export function rareCharacter() {
  return CHAR_BY_ID[RARE_CHARACTER_ID];
}

/** 現在の言語でのキャラ表示名 */
export function charDisplayName(char) {
  if (!char) return '';
  return char.names[LANG] || char.names.ja;
}

/** canvas にキャラ（プレースホルダ：色付きバブル + emoji）を描画する。
 *  捕獲写真の合成に使用。cx/cy はバブル中心、sizePx はバブル直径。 */
export function drawCharacterOnCanvas(ctx, char, cx, cy, sizePx) {
  const r = sizePx / 2;
  ctx.save();
  // 円形バブル（半透明のキャラ色 + 白フチ）
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = hexWithAlpha(char.color, 0.85);
  ctx.fill();
  ctx.lineWidth = Math.max(4, sizePx * 0.04);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // emoji 本体
  ctx.font = `${Math.round(sizePx * 0.58)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char.emoji, cx, cy + sizePx * 0.03);
  // 名前リボン（バブル下）
  const name = charDisplayName(char);
  const fontPx = Math.max(14, Math.round(sizePx * 0.14));
  ctx.font = `bold ${fontPx}px sans-serif`;
  const tw = ctx.measureText(name).width;
  const pad = fontPx * 0.6;
  const ry = cy + r + fontPx * 1.1;
  roundRect(ctx, cx - tw / 2 - pad, ry - fontPx * 0.8, tw + pad * 2, fontPx * 1.6, fontPx * 0.8);
  ctx.fillStyle = hexWithAlpha('#000000', 0.55);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, ry);
  ctx.restore();
}

function hexWithAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
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

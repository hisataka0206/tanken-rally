// 冒険型UIシェル（docs/10-specs/ui-redesign-concept.md Phase A）
//
// 3つの要素で「書類の文法」を「キャラと行く冒険」に置き換える:
//   1. 進捗トレイル（すごろく型・上部固定）… 今どこにいるかを常に見せる
//   2. キャラ吹き出し（画面ごとに進行役が交代）… 見出しと説明文をセリフに置換
//   3. 下部固定CTA … CSS（.step-actions の sticky 化）で実現。本モジュール外
//
// ロジック（main.js）には手を入れず、showStep() から updateShell(stepId) を
// 呼んでもらうだけで動く付け足し型の設計。

import { t } from './i18n.js?v=106';

const CHAR_BASE = 'src/assets/characters/';
const GUIDE_BASE = 'src/assets/characters/guide/';

// トレイルのノード定義（順序 = 冒険の順序）
const TRAIL_STEPS = ['step-station', 'step-spots', 'step-route', 'step-photos', 'step-report'];
const TRAIL_ICONS = ['🚉', '📍', '🗺️', '📷', '📖'];
const TRAIL_LABEL_KEYS = ['trailStation', 'trailSpots', 'trailRoute', 'trailPhotos', 'trailReport'];

// 画面ごとの進行役（キャラ交代制）と吹き出しセリフ
const SPEECH = {
  'step-station': { face: GUIDE_BASE + 'loupe_g1.png',   fallback: CHAR_BASE + 'loupe_discovery.png',   key: 'speechStation' },
  'step-spots':   { face: GUIDE_BASE + 'oakchap_g2.png', fallback: CHAR_BASE + 'oakchap_discovery.png', key: 'speechSpots' },
  'step-route':   { face: GUIDE_BASE + 'loupe_g3.png',   fallback: CHAR_BASE + 'loupe_get.png',         key: 'speechRoute' },
  'step-photos':  { face: GUIDE_BASE + 'taffy_g4.png',   fallback: CHAR_BASE + 'taffy_discovery.png',   key: 'speechPhotos' },
  'step-report':  { face: CHAR_BASE + 'colorey_discovery.png', fallback: CHAR_BASE + 'colorey_get.png', key: 'speechReport' },
};

/** 起動時に1回: トレイルのDOMを構築する（#trail が無ければ何もしない） */
export function initShell() {
  const trail = document.getElementById('trail');
  if (!trail) return;
  trail.innerHTML = TRAIL_STEPS.map((id, i) => `
    <div class="trail-node" data-step="${id}">
      <span class="trail-dot">${TRAIL_ICONS[i]}</span>
      <span class="trail-label">${escapeHtml(t(TRAIL_LABEL_KEYS[i], ''))}</span>
    </div>${i < TRAIL_STEPS.length - 1 ? '<span class="trail-link"></span>' : ''}`).join('');
}

/** showStep() から呼ばれる: トレイルの現在地更新 + 吹き出しの差し替え */
export function updateShell(stepId) {
  // --- トレイル更新 ---
  const trail = document.getElementById('trail');
  if (trail) {
    const currentIdx = TRAIL_STEPS.indexOf(stepId);
    trail.querySelectorAll('.trail-node').forEach((node, i) => {
      node.classList.toggle('done', currentIdx >= 0 && i < currentIdx);
      node.classList.toggle('current', i === currentIdx);
    });
    trail.classList.toggle('hidden', currentIdx < 0);
  }

  // --- キャラ吹き出し（active な step のカード先頭に1回だけマウント） ---
  const def = SPEECH[stepId];
  const section = document.getElementById(stepId);
  const card = section ? section.querySelector('.card') : null;
  if (!def || !card) return;

  let bubble = card.querySelector('.speech-bubble-row');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'speech-bubble-row';
    bubble.innerHTML = `
      <img class="speech-face" alt="" aria-hidden="true" />
      <div class="speech-bubble"><span class="speech-text"></span></div>`;
    const img = bubble.querySelector('.speech-face');
    img.addEventListener('error', () => {
      // ガイド素材が無い場合は既存アセットへフォールバック、それも無ければ顔を消す
      if (img.src.endsWith(def.face.split('/').pop()) && def.fallback) img.src = def.fallback;
      else img.style.display = 'none';
    });
    card.prepend(bubble);
    card.classList.add('has-speech');
  }
  bubble.querySelector('.speech-face').src = def.face;
  bubble.querySelector('.speech-text').textContent = t(def.key, '');
  // 出現アニメを再トリガ
  bubble.classList.remove('speech-pop');
  void bubble.offsetWidth;
  bubble.classList.add('speech-pop');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// UIキャラクター案内役（ガイド）の受け皿
//
// 設計: docs/10-specs/ui-character-guide-spec.md
// 素材: src/assets/characters/guide/<内部ID>_g<画面番号>.png（現在作成中）
//   - 画像が存在しない間は onerror で自動非表示になり、レイアウトに影響しない
//   - PNG をフォルダに置いてデプロイすれば、コード変更なしでガイドが出現する
// 役割: ZOOMY(loupe)=進行役 / TAFFY(taffy)=盛り上げ役 / NUTTY(oakchap)=隅で和ませる

export const GUIDE_BASE = 'src/assets/characters/guide/';

// 画面別マニフェスト（stepId → ガイド定義）
//   cls: 配置スロット（style.css の .g-* を参照）
//   sub: true なら脇役（モバイルでは非表示）
const GUIDE_SETS = {
  // 画面1: 駅を決める
  'step-station': [
    { file: 'loupe_g1.png',   cls: 'g-tr' },                       // 出発の合図（メイン）
    { file: 'taffy_g1.png',   cls: 'g-bl g-anim-bounce', sub: true },  // ワクワクジャンプ
    { file: 'oakchap_g1.png', cls: 'g-br-peek', sub: true },       // ひょっこり覗き見
  ],
  // 画面2: 行く場所を決める
  'step-spots': [
    { file: 'loupe_g2.png',   cls: 'g-tr' },                       // 徹底調査（メイン）
    { file: 'taffy_g2.png',   cls: 'g-mr g-anim-sway', sub: true },    // 目移りキラキラ
    { file: 'oakchap_g2.png', cls: 'g-bl', sub: true },            // キャパオーバー
  ],
  // 画面3: ルートを決める
  'step-route': [
    { file: 'loupe_g3.png',   cls: 'g-tr g-anim-pop' },            // 名推理（メイン）
    { file: 'taffy_g3.png',   cls: 'g-bl g-anim-sway', sub: true },    // 元気に行進
    { file: 'oakchap_g3.png', cls: 'g-mr g-anim-spin-slow', sub: true }, // ルートで目回し
  ],
  // 画面5: レポート入力（画面4はウィザード側で既存アセットを流用）
  'step-report': [
    { file: 'loupe_g5.png',   cls: 'g-tr' },                       // 記録の準備（メイン）
    { file: 'taffy_g5.png',   cls: 'g-mr', sub: true },            // アートなイタズラ
    { file: 'oakchap_g5.png', cls: 'g-bl g-anim-breathe', sub: true }, // スヤスヤ休憩
  ],
};

/** stepId のカードにガイドレイヤーを1回だけマウントする。
 *  マニフェストに無い step は何もしない。 */
export function mountGuides(stepId) {
  const defs = GUIDE_SETS[stepId];
  if (!defs) return;
  const section = document.getElementById(stepId);
  const card = section ? section.querySelector('.card') : null;
  if (!card || card.querySelector('.guide-layer')) return; // マウント済み

  const layer = document.createElement('div');
  layer.className = 'guide-layer';
  layer.setAttribute('aria-hidden', 'true');
  defs.forEach(def => {
    const img = document.createElement('img');
    img.className = `guide-char ${def.cls}${def.sub ? ' g-sub' : ''}`;
    img.alt = '';
    img.loading = 'lazy';
    // 素材未着・読み込み失敗時は静かに消える（レイアウト不変）
    img.addEventListener('error', () => { img.style.display = 'none'; });
    img.src = GUIDE_BASE + def.file.replace(/\.png$/i, '.webp');
    layer.appendChild(img);
  });
  card.appendChild(layer);
}

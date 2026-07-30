/**
 * 画面に「いま実際に見えている文字」を、種類別に数える計測ツール。
 * これが唯一の計測方法。ソース解析や、その場限りの簡易版を作ってはいけない。
 *
 * ■ 使い方
 *   1. 計測したい画面をブラウザで開く（beta 環境で可）
 *   2. DevTools のコンソールにこのファイルの中身をそのまま貼って実行
 *   3. `tekutanMeasure()` を画面ごとに再実行する
 *
 * ■ なぜソース解析をやめたか
 *   index.html / i18n.js を静的に読む方式は次を毎回取りこぼした。
 *     (1) <details> の折りたたみ中身  (2) 自己終了タグでの入れ子判定ミス
 *     (3) 吹き出し表示時に隠れるタイトル (4) JS が実行時に書く文字（約69箇所）
 *     (5) 空欄の placeholder
 *   原因は「ブラウザが知っていることをソースから推測しようとした」こと。実DOMに聞けば消える。
 *
 * ■ 数え方（docs/10-specs/ui-text-minimization-design.md §3-2 準拠）
 *   空白を除いた素の文字数で数え、次の6種類に必ず分類する。
 *   **どれにも入れずに黙って除外してはいけない。** 分母から隠すと改善が数字に出なくなる。
 *
 *     ui       … 指示・ラベル・ボタン（＝削減目標の対象。導線画面は20字以内）
 *     guide    … 道案内（区間ヘッダー・ターン指示など、生成された案内文）
 *     story    … 読み物（駅の由来、キャラのストーリー）
 *     data     … 固有名詞・ユーザーデータ（駅名/スポット名/写真/履歴/スコア数値/アカウント名）
 *     icons    … 絵文字・矢印（読字負荷ではないので個数で数える）
 *     furigana … ルビ（<rt>。読字補助なので別枠）
 */
(function () {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'RP']);
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}]/gu;

  // 分類セレクタ。ここに無いものはすべて ui（＝削減目標の対象）に入る。
  const GUIDE_SEL = ['#map-preview-root', '#route-spots'];
  const STORY_SEL = ['#origin-story', '.zukan-story', '.char-story'];
  const DATA_SEL = [
    '.spot-name', '#home-hello', '#history-account-name', '#zukan-account-name',
    '#score-total', '.score-split-val', '#score-rank-label',
    '#station-chips', '#line-chips', '#history-list', '#zukan-grid', '#ranking-list',
    '#photos-grid', '#report-photos', '.gm-style',
  ];

  const strip = (s) => String(s || '').replace(/\s/g, '');

  function selfHidden(el) {
    if (el.hasAttribute('hidden')) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    const cs = getComputedStyle(el);
    return cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
  }

  function visible(node) {
    let inSummary = false;
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (el.tagName === 'SUMMARY') inSummary = true;
      if (el.tagName === 'DETAILS' && !el.open && !inSummary) return false;
      if (selfHidden(el)) return false;
    }
    return true;
  }

  function categoryOf(node) {
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (!el.matches) continue;
      if (GUIDE_SEL.some((s) => el.matches(s))) return 'guide';
      if (STORY_SEL.some((s) => el.matches(s))) return 'story';
      if (DATA_SEL.some((s) => el.matches(s))) return 'data';
    }
    return 'ui';
  }

  function collect(root) {
    const sum = { ui: 0, guide: 0, story: 0, data: 0, icons: 0, furigana: 0 };
    const uiItems = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!strip(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!visible(n)) continue;
      const s = strip(n.nodeValue);
      if (n.parentElement.tagName === 'RT') { sum.furigana += s.length; continue; }
      sum.icons += (s.match(EMOJI) || []).length;
      const len = s.replace(EMOJI, '').length;
      if (!len) continue;
      const cat = categoryOf(n);
      sum[cat] += len;
      if (cat === 'ui') {
        const o = n.parentElement;
        uiItems.push({
          chars: len,
          text: n.nodeValue.trim().slice(0, 40),
          where: o.id ? '#' + o.id : (o.className ? '.' + String(o.className).split(/\s+/)[0] : o.tagName.toLowerCase()),
        });
      }
    }
    // 空欄の placeholder も画面に見えている指示文
    root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
      if (el.value || selfHidden(el) || !visible(el)) return;
      const s = strip(el.placeholder);
      if (!s) return;
      sum.ui += s.length;
      uiItems.push({ chars: s.length, text: '[placeholder] ' + el.placeholder.slice(0, 30), where: el.id ? '#' + el.id : 'input' });
    });
    return { sum, uiItems: uiItems.sort((a, b) => b.chars - a.chars) };
  }

  window.tekutanMeasure = function tekutanMeasure() {
    const screens = [...document.querySelectorAll('.step, .modal, .login-gate')].filter((el) => {
      if (!el.id || selfHidden(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    });
    if (!screens.length) { console.warn('表示中の画面が見つかりません'); return null; }

    const out = screens.map((el) => {
      const { sum, uiItems } = collect(el);
      return { screen: '#' + el.id, ...sum, uiItems };
    });
    out.forEach((r) => {
      console.group(`${r.screen} — ui ${r.ui}字 / guide ${r.guide} / story ${r.story} / data ${r.data} / icons ${r.icons}個 / ふりがな ${r.furigana}`);
      console.table(r.uiItems.map((i) => ({ 字数: i.chars, 場所: i.where, 文言: i.text })));
      console.groupEnd();
    });
    return out;
  };

  return window.tekutanMeasure();
})();

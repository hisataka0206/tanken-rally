/**
 * 画面に「いま実際に見えている文字」を数える計測ツール（ブラウザのコンソールに貼って実行）。
 *
 * なぜソース解析をやめたか:
 *   index.html / i18n.js を静的に読む方式は、以下を毎回取りこぼした。
 *     1. <details> の折りたたみ中身      2. 自己終了タグでの入れ子判定ミス
 *     3. 吹き出し表示時に隠れるタイトル   4. JS が実行時に innerHTML/textContent で書く文字（約69箇所）
 *   いずれも「ブラウザが正確に知っていることを、ソースから推測で再現しようとした」ことが原因。
 *   実DOMに聞けば推測が不要になり、この種のバグはまとめて消える。
 *
 * 使い方:
 *   1. 計測したい画面をブラウザで開く（beta 環境で可）
 *   2. DevTools のコンソールにこのファイルの中身を貼って実行
 *   3. 表と合計が出る。画面を切り替えるたびに tekutanMeasure() を再実行する
 *
 * 数え方のルール（docs/ui-text-minimization-design.md §3-2 に準拠）:
 *   - 空白は除外し、素の文字数で数える
 *   - ふりがな（<rt>）は読字補助なので分けて集計する
 *   - 非表示（display:none / visibility:hidden / opacity:0 / hidden / aria-hidden / 閉じた<details>）は数えない
 *   - 空の入力欄の placeholder は「見えている文字」なので数える
 *   - ヘッダーとトレイルは全画面共通なので、画面固有の文字と分けて集計する
 */
(function () {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'RP']);
  const strip = (s) => String(s || '').replace(/\s/g, '');

  // 要素そのものが視覚的に隠されているか
  function selfHidden(el) {
    if (el.hasAttribute('hidden')) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return true;
    return false;
  }

  // 祖先をたどって「見えるか」を判定（閉じた <details> の中身は summary 以外は見えない）
  function visible(node) {
    let inSummary = false;
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (el.tagName === 'SUMMARY') inSummary = true;
      if (el.tagName === 'DETAILS' && !el.open && !inSummary) return false;
      if (selfHidden(el)) return false;
    }
    return true;
  }

  // いま表示されている画面（step または modal）を特定する
  function currentScreens() {
    const out = [];
    document.querySelectorAll('.step, .modal, .login-gate').forEach((el) => {
      if (!el.id) return;
      if (selfHidden(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      out.push(el);
    });
    // 入れ子（modal が step の上にある等）は面積が小さい方＝手前を優先して両方返す
    return out;
  }

  function collect(root) {
    const items = [];
    let ruby = 0;
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
      const text = strip(n.nodeValue);
      if (n.parentElement.tagName === 'RT') { ruby += text.length; continue; }  // ふりがなは別枠
      const owner = n.parentElement;
      items.push({
        chars: text.length,
        text: n.nodeValue.trim().slice(0, 40),
        where: owner.id ? '#' + owner.id : owner.tagName.toLowerCase() + (owner.className ? '.' + String(owner.className).split(/\s+/)[0] : ''),
      });
    }
    // 空の入力欄の placeholder も画面に見えている文字
    root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
      if (el.value || selfHidden(el) || !visible(el)) return;
      const text = strip(el.placeholder);
      if (text) items.push({ chars: text.length, text: '[placeholder] ' + el.placeholder.slice(0, 30), where: el.id ? '#' + el.id : 'input' });
    });
    return { items, ruby };
  }

  window.tekutanMeasure = function tekutanMeasure() {
    const screens = currentScreens();
    if (!screens.length) { console.warn('表示中の画面が見つかりません'); return null; }

    // 全画面共通のクロム（ヘッダー・トレイル）は画面固有の数から分離する
    const chromeRoots = [document.querySelector('.header'), document.querySelector('#trail')].filter(Boolean);
    let chromeChars = 0;
    chromeRoots.forEach((r) => { if (!selfHidden(r)) chromeChars += collect(r).items.reduce((a, b) => a + b.chars, 0); });

    const result = [];
    screens.forEach((el) => {
      const { items, ruby } = collect(el);
      const total = items.reduce((a, b) => a + b.chars, 0);
      result.push({ screen: '#' + el.id, chars: total, ruby, items: items.sort((a, b) => b.chars - a.chars) });
    });

    result.forEach((r) => {
      console.group(`${r.screen} — 見えている文字 ${r.chars}字（ふりがな ${r.ruby}字は別枠）`);
      console.table(r.items.map((i) => ({ 字数: i.chars, 場所: i.where, 文言: i.text })));
      console.groupEnd();
    });
    console.log(`共通クロム（ヘッダー＋トレイル）: ${chromeChars}字`);
    console.log('※ この数字には駅名・スポット名などの固有名詞（＝選択肢そのもの）が含まれます。');
    console.log('   目標判定では固有名詞とユーザーの入力内容を除外して数えてください。');
    return { screens: result, chrome: chromeChars };
  };

  return window.tekutanMeasure();
})();

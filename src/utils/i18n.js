// 多言語対応（JA / EN / Elementary[ひらがな]）
//
// 言語の判定方法：
//   1. URL クエリ `?lang=en` `?lang=elementary` `?lang=ja`
//   2. URL ハッシュ `#EN` `#Elementary` （クエリと同等）
//   3. `?lang=` 無指定 → 'ja' (デフォルト)
//
// パス末尾 `/EN` `/Elementary` 形式は GitHub Pages の 404.html で
// 該当する `?lang=` クエリへリダイレクトする運用（404.html 参照）。
//
// HTML側は `data-i18n="appTitle"` のように属性で翻訳キーを指定。
// applyI18n() を画面初期化時に呼ぶと、対象ノードの textContent を差し替える。

const TRANSLATIONS = {
  ja: {
    appTitle: 'たんけんラリー',
    headerSub: '駅から街を探検しよう',

    step1Title: '探検する駅をえらぼう',
    step2Title: '行きたい場所を選ぼう',
    step3Title: '探検マップを確認しよう',
    step4Title: '探検しながら写真を撮ろう',
    step5Title: 'たんけんノートをつくろう',

    btnSearch: 'さがす',
    btnSearchSelect: 'この駅でさがす →',
    btnBackStation: '← 駅を変える',
    btnMakeRoute: 'ルートをつくる →',
    btnBackSpots: '← スポットを変える',
    btnDownloadPdf: '📄 地図PDFをダウンロード',
    btnStartExplore: '探検スタート！ →',
    btnBackRoute: '← マップに戻る',
    btnFinishExplore: '探検おわり！ノートへ →',
    btnBackPhotos: '← 写真にもどる',
    btnReportPdf: '📄 ノートをPDF（B3）で出力',
    btnReportIssue: '🐛 不具合を報告',

    resumeSummary: '🔑 前回のたんけんを開く（パスワード入力）',
    filterSummary: '🔍 詳細絞り込み（任意）',
    filterDate:  '📅 日にち',
    filterStart: '⏰ 開始',
    filterEnd:   '⏰ 終了',
  },

  en: {
    appTitle: 'Tanken Rally',
    headerSub: 'Explore your town from the station',

    step1Title: 'Pick a station to explore',
    step2Title: 'Choose places you want to visit',
    step3Title: 'Check your exploration map',
    step4Title: 'Take photos while exploring',
    step5Title: "Let's make your exploration note",

    btnSearch: 'Search',
    btnSearchSelect: 'Search this station →',
    btnBackStation: '← Change station',
    btnMakeRoute: 'Make route →',
    btnBackSpots: '← Change spots',
    btnDownloadPdf: '📄 Download map PDF',
    btnStartExplore: 'Start exploring! →',
    btnBackRoute: '← Back to map',
    btnFinishExplore: 'Done! → Note',
    btnBackPhotos: '← Back to photos',
    btnReportPdf: '📄 Export note as PDF (B3)',
    btnReportIssue: '🐛 Report an issue',

    resumeSummary: '🔑 Open your previous exploration (password)',
    filterSummary: '🔍 Advanced filter (optional)',
    filterDate:  '📅 Date',
    filterStart: '⏰ Start',
    filterEnd:   '⏰ End',
  },

  elementary: {
    appTitle: 'たんけんらりー',
    headerSub: 'えきから まちを たんけんしよう',

    step1Title: 'たんけんする えきを えらぼう',
    step2Title: 'いきたい ばしょを えらぼう',
    step3Title: 'たんけんまっぷを かくにんしよう',
    step4Title: 'たんけんしながら しゃしんを とろう',
    step5Title: 'たんけんのーとを つくろう',

    btnSearch: 'さがす',
    btnSearchSelect: 'この えきで さがす →',
    btnBackStation: '← えきを かえる',
    btnMakeRoute: 'るーとを つくる →',
    btnBackSpots: '← すぽっとを かえる',
    btnDownloadPdf: '📄 ちずぴーでぃーえふを だうんろーど',
    btnStartExplore: 'たんけん すたーと！ →',
    btnBackRoute: '← まっぷに もどる',
    btnFinishExplore: 'たんけん おわり！ → のーと',
    btnBackPhotos: '← しゃしんに もどる',
    btnReportPdf: '📄 のーとを ぴーでぃーえふ (B3) で だす',
    btnReportIssue: '🐛 ふぐあいを ほうこく',

    resumeSummary: '🔑 まえの たんけんを ひらく（ぱすわーど）',
    filterSummary: '🔍 くわしく しぼりこむ（にんい）',
    filterDate:  '📅 ひにち',
    filterStart: '⏰ はじまり',
    filterEnd:   '⏰ おわり',
  },
};

// クエリ・ハッシュから言語を判定
export function getLangFromUrl() {
  const params = new URLSearchParams(location.search);
  let raw = params.get('lang');
  if (!raw && location.hash) raw = location.hash.replace(/^#/, '');
  const lower = (raw || '').trim().toLowerCase();
  if (lower === 'en' || lower === 'english') return 'en';
  if (lower === 'elementary' || lower === 'kids' || lower === 'easy') return 'elementary';
  return 'ja';
}

export const LANG = getLangFromUrl();

// 翻訳取得：キーが見つからなければ ja → fallback → key の順に降下
export function t(key, fallback) {
  const dict = TRANSLATIONS[LANG] || TRANSLATIONS.ja;
  if (dict[key] !== undefined) return dict[key];
  if (TRANSLATIONS.ja[key] !== undefined) return TRANSLATIONS.ja[key];
  return fallback !== undefined ? fallback : key;
}

// data-i18n 属性のついたノードに翻訳を適用
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const text = t(key);
    if (typeof text === 'string') el.textContent = text;
  });
  // <html lang="..."> も切り替え（'elementary' は CSS では ja 扱い）
  document.documentElement.lang = LANG === 'elementary' ? 'ja' : LANG;
}

// Places / Geocoding API に渡す language コード
//   elementary → ja のまま（地名はGoogleが日本語で返す。UIだけひらがな化）
export function apiLang() {
  return LANG === 'en' ? 'en' : 'ja';
}

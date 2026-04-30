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

  // Elementary 表記ルール：
  //   - 漢字（かんじ）の形式で併記
  //   - 小学2年生までに習う漢字（駅・地・図・前・後・本・行・来・思・話・書・読・聞・教
  //     ・写・場・所・道・寺・神・社・町・市・村・店・家・天・山・川・木・園・公・新・
  //     科・学・電・算・店・公・写  など多数）は併記しない
  //   - G3以上の漢字を含む熟語は単語まるごとに振り仮名を付ける慣例
  elementary: {
    appTitle: 'たんけんラリー',
    headerSub: '駅から街（まち）を探検（たんけん）しよう',

    step1Title: '探検（たんけん）する駅をえらぼう',
    step2Title: '行きたい場所をえらぼう',
    step3Title: '探検（たんけん）マップを確認（かくにん）しよう',
    step4Title: '探検（たんけん）しながら写真（しゃしん）をとろう',
    step5Title: 'たんけんノートをつくろう',

    btnSearch: 'さがす',
    btnSearchSelect: 'この駅でさがす →',
    btnBackStation: '← 駅をかえる',
    btnMakeRoute: 'ルートをつくる →',
    btnBackSpots: '← スポットをかえる',
    btnDownloadPdf: '📄 地図PDFをダウンロード',
    btnStartExplore: '探検（たんけん）スタート！ →',
    btnBackRoute: '← マップにもどる',
    btnFinishExplore: '探検（たんけん）おわり！ノートへ →',
    btnBackPhotos: '← 写真（しゃしん）にもどる',
    btnReportPdf: '📄 ノートをPDF（B3）でだす',
    btnReportIssue: '🐛 不具合（ふぐあい）を報告（ほうこく）',

    resumeSummary: '🔑 前のたんけんを開く（パスワード入力）',
    filterSummary: '🔍 詳（くわ）しくしぼりこむ（任意（にんい））',
    filterDate:  '📅 日にち',
    filterStart: '⏰ 開始（かいし）',
    filterEnd:   '⏰ 終了（しゅうりょう）',
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

// Google Maps / Places / Geocoding / Directions / Static Maps / Street View 全 API
// および OpenAI で使う言語コード。
//   en          → 'en' （結果も全部英語：Tokyo Station, Senso-ji Temple ...）
//   ja          → 'ja'
//   elementary  → 'ja' （振り仮名は UI 側で表記。Google には日本語で返してもらう）
export function apiLang() {
  return LANG === 'en' ? 'en' : 'ja';
}

// 言語別の機能フラグ・数値パラメータ。
// LANG（i18n.js）の値に応じて FEATURES_BY_LANG から1エントリ取り出して FEATURES として export する。
//
// 設計方針:
//   - 文字列差分 → utils/i18n.js
//   - 動作差分（数値・ON/OFF・分岐） → このファイル
//   - 見た目差分 → body.lang-XX クラス + CSS
//
// 新しい機能を追加するときは、まずここに3言語分のフラグを宣言してから実装に取りかかる。
// そうすると言語ごとの差別化が一望できる。
import { LANG } from './utils/i18n.js?v=93';

const FEATURES_BY_LANG = {
  ja: {
    // === 動作 ===
    travelTimeMultiplier: 1.0,           // 移動時間表示の倍率（子供向けで×1.5など）
    showKidsTimeNote: false,             // 「子供の歩く速さで計算」注釈を表示するか

    // === 機能オン/オフ ===
    photoWizardEnabled: true,            // STEP4 撮影ウィザード（駅 → スポット → 駅）
    scoringEnabled: true,                // スコア計算 & 表示
    rankingEnabled: true,                // ランキング送信 & 表示
    showScoreAdvice: true,               // 個別スコアアドバイス（弱点ピックアップ）

    // === 数値パラメータ ===
    spotSearchRadiusM: 800,              // Places 検索半径
    photosPerPageFirst: 4,               // PDFノートの1ページ目の写真数
    photosPerPageNext: 6,                // PDFノートの2ページ目以降の写真数
  },
  elementary: {
    // === 動作 ===
    travelTimeMultiplier: 1.5,
    showKidsTimeNote: true,

    // === 機能オン/オフ ===
    photoWizardEnabled: true,
    scoringEnabled: true,
    rankingEnabled: true,
    showScoreAdvice: true,

    // === 数値パラメータ ===
    spotSearchRadiusM: 800,
    photosPerPageFirst: 4,
    photosPerPageNext: 6,
  },
  en: {
    // === 動作 ===
    travelTimeMultiplier: 1.0,
    showKidsTimeNote: false,

    // === 機能オン/オフ ===
    photoWizardEnabled: true,
    scoringEnabled: false,               // 英語版はスコア機能なし
    rankingEnabled: false,               // 英語版はランキング機能なし
    showScoreAdvice: false,

    // === 数値パラメータ ===
    spotSearchRadiusM: 800,
    photosPerPageFirst: 4,
    photosPerPageNext: 6,
  },
};

// 現在の言語に対応する機能フラグ（読み取り専用想定）
export const FEATURES = FEATURES_BY_LANG[LANG] || FEATURES_BY_LANG.ja;

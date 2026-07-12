// [[キャラ自動生成]] Phase 1（個人生成）オーケストレーション
//
// 仕様: docs/character-auto-generation-spec.md
// この Phase では実 API（NanoBanana Pro）は「差し込み口」だけ用意し、
// 実際の3体候補は既存キャラ絵を色替え/選抜した【モック】で生成する。
// → 実 API 導入時は callNanoBananaPro() を GAS プロキシ経由の実装に差し替えるだけ。
//
// DOM 非依存（純ロジック＋localStorage）。UI は main.js 側。

import { CHARACTERS, characterImageUrl } from './characters.js?v=106';
import { getExplorerId } from './collection.js?v=106';
import { AXIS_BODY, AXIS_IMPRESSION, bodyById, impressionById, axisLabel } from '../data/archetypes.js?v=106';
import { makeVocabPicks, VOCAB } from '../data/vocab.js?v=106';

// case X 明示メニュー用: ユーザーが選べる語彙（被りにくい user_selectable プール）。
// 子供向けに軸を絞る＝モチーフ（タイプ的な"なに"）＋ふんいき（"どんな感じ"）。
export function getUserVocabChoices() {
  return {
    motif:      (VOCAB.motif && VOCAB.motif.user_selectable) || [],
    atmosphere: (VOCAB.atmosphere && VOCAB.atmosphere.user_selectable) || [],
  };
}

// ===== しきい値（暫定・要決定 / docs 参照）=====
export const GEN_MIN_EXEC        = 250;   // 実行点の下限
export const GEN_MIN_SPOTS       = 2;     // 写真付きで訪れたスポット数の下限
export const GEN_MIN_DISTANCE_KM = 0.3;   // 実移動距離の下限（km）

// シルエット表示用の CSS filter（透過を保ったまま真っ黒→半透明のグレー影に）
export const SILHOUETTE_FILTER = 'brightness(0) opacity(0.55)';

// ===== レア度（距離に応じる。共有プールでの出現重みも兼ねる）=====
export const RARITY_TIERS = [
  { id: 'common', minKm: 0,   stars: 1, shareWeight: 1,
    label: { ja: 'コモン',   en: 'Common',   elementary: 'コモン' } },
  { id: 'rare',   minKm: 1.5, stars: 2, shareWeight: 3,
    label: { ja: 'レア',     en: 'Rare',     elementary: 'レア' } },
  { id: 'epic',   minKm: 3,   stars: 3, shareWeight: 6,
    label: { ja: 'エピック', en: 'Epic',     elementary: 'エピック' } },
  { id: 'legend', minKm: 5,   stars: 4, shareWeight: 12,
    label: { ja: 'レジェンド', en: 'Legend', elementary: 'レジェンド' } },
];

/** 距離(km) → レア度ティア（最も高い該当ティア） */
export function rarityForDistance(km) {
  const d = Number(km) || 0;
  let tier = RARITY_TIERS[0];
  for (const t of RARITY_TIERS) if (d >= t.minKm) tier = t;
  return tier;
}
export function rarityById(id) { return RARITY_TIERS.find(t => t.id === id) || RARITY_TIERS[0]; }

// ===== 作成可否（ゲート）=====
// summary: { execScore, spotsWithPhotos, distinctGpsPoints, distanceKm, timeSpreadMin }
// 「移動せず適当に写真を撮っただけ」を弾くため、複数条件の合成で判定する。
export function evaluateEligibility(summary) {
  const s = summary || {};
  const execScore        = Number(s.execScore) || 0;
  const spotsWithPhotos  = Number(s.spotsWithPhotos) || 0;
  const distinctGps      = Number(s.distinctGpsPoints) || 0;
  const distanceKm       = Number(s.distanceKm) || 0;

  const reasons = [];
  if (execScore < GEN_MIN_EXEC)        reasons.push(`exec<${GEN_MIN_EXEC}(${execScore})`);
  if (spotsWithPhotos < GEN_MIN_SPOTS) reasons.push(`spots<${GEN_MIN_SPOTS}(${spotsWithPhotos})`);
  if (distanceKm < GEN_MIN_DISTANCE_KM) reasons.push(`dist<${GEN_MIN_DISTANCE_KM}(${distanceKm})`);
  // 実移動の裏取り: GPSが2点以上、または写真スポットが3以上（AR/GPSオフ端末の救済）
  if (!(distinctGps >= 2 || spotsWithPhotos >= 3)) reasons.push('movement-unproven');

  return { ok: reasons.length === 0, reasons, rarity: rarityForDistance(distanceKm) };
}

// ===== 生成プロンプト構築 =====
// ブランディング固定部＋駅名＋スポット名＋距離(レア度)＋ユーザー変数(軸A×B)。
// ユーザー由来の自由テキストは入れない（安全・プロンプト混入対策）。
export function buildPrompt({ station, spots, distanceKm, vocab }) {
  const rarity = rarityForDistance(distanceKm);
  const v = vocab || {};
  const spotThemes = (spots || []).slice(0, 5).map(sanitizeTheme).filter(Boolean).join(', ');
  return [
    // --- ブランディング固定部（画風・安全）---
    'Original mascot character for a kids station-exploration game "Tekutan".',
    'Consistent house art style: thick clean outlines, rounded chibi proportions, big friendly eyes, soft candy-pop colors, sticker-like flat shading. Single character, centered, plain transparent background.',
    'Child-friendly: not scary, no violence, no text, no weapons.',
    // --- ユーザー変数＝記述語彙DB（6論点・IP非依存の一般名詞。日英混在でOK、Geminiは両対応）---
    v.motif      ? `Creature motif: ${v.motif}.`        : '',
    v.type       ? `Elemental essence: ${v.type}.`      : '',
    v.texture    ? `Texture: ${v.texture}.`             : '',
    v.decoration ? `Decoration: ${v.decoration}.`       : '',
    v.expression ? `Expression: ${v.expression}.`       : '',
    v.atmosphere ? `Atmosphere: ${v.atmosphere}.`       : '',
    // --- 旅のモチーフ ---
    station ? `Inspired by the area around ${sanitizeTheme(station)} station.` : '',
    spotThemes ? `Subtle motifs from: ${spotThemes}.` : '',
    // --- 距離＝レア度の風格 ---
    `Rarity feel: ${rarity.id} (more elaborate and radiant for higher rarity).`,
  ].filter(Boolean).join(' ');
}

// 外部由来（駅名・スポット名）を素直にプロンプトへ入れないためのサニタイズ。
function sanitizeTheme(x) {
  return String(x || '')
    .replace(/[\n\r]+/g, ' ')
    .replace(/["'`{}<>]/g, '')      // 記号でプロンプトを乱さない
    .trim()
    .slice(0, 40);
}

// ===== 実 API 差し込み口（未接続）=====
// 実装時: GAS プロキシに { prompt, count, styleRefs } を渡し、
//   NanoBanana Pro（Gemini 3 Pro Image, 1リクエストで最大4枚）で count 枚生成、
//   IMAGE_SAFETY ブロック時は finishReason を見て再試行/フォールバック。
// 返り値: [{ imageDataUrl }] （count 件）または null（未接続/失敗）。
let _drive = null;
export function setChargenBackend(drive) { _drive = drive; }

// 直近の実API生成の診断（source の切り分け用）。main.js から参照して可視化する。
let _lastGenDebug = { source: null, reason: '' };
export function getLastGenDebug() { return _lastGenDebug; }

async function callNanoBananaPro({ prompt, count }) {
  // 実API: _drive.generateCharacters({ prompt, count })（GAS経由で NanoBanana Pro）。
  // 失敗時は null を返し、呼び出し側がモックにフォールバックする。理由は _lastGenDebug に記録。
  if (!_drive || typeof _drive.generateCharacters !== 'function') {
    _lastGenDebug = { source: 'mock', reason: 'backend未登録（GAS_URL未設定 or setChargenBackend未実行）' };
    console.warn('[chargen] 実API未接続 → モック生成:', _lastGenDebug.reason);
    return null;
  }
  try {
    const res = await _drive.generateCharacters({ prompt, count });
    if (res && Array.isArray(res.images) && res.images.length) {
      _lastGenDebug = { source: 'nanobanana', reason: `実API成功（${res.images.length}枚）` };
      console.info('[chargen] 実API生成 成功:', _lastGenDebug.reason);
      return res.images.map(img => ({ imageDataUrl: img.dataUrl || img }));
    }
    _lastGenDebug = { source: 'mock', reason: '実APIが画像0件を返却' };
    console.warn('[chargen] 実API 画像0件 → モック生成');
    return null;
  } catch (e) {
    const msg = (e && e.message) || String(e);
    _lastGenDebug = { source: 'mock', reason: '実API失敗: ' + msg };
    console.warn('[chargen] 実API生成に失敗（モックにフォールバック）:', msg);
    return null;
  }
}

// ===== モック生成（既存キャラ絵の色替え/選抜で3体を作る）=====
// シルエットは形で選ばせたいので「異なる3キャラ（＝異なる形）」を採用。
// 各候補に body（軸A）を割り当て、色替え filter を持たせる。
function pickDistinct(arr, n) {
  const pool = arr.slice();
  const out = [];
  while (pool.length && out.length < n) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function mockCandidates({ distanceKm, userPicks }) {
  const rarity = rarityForDistance(distanceKm);
  const chars = pickDistinct(CHARACTERS, 3);
  const bodies = pickDistinct(AXIS_BODY, 3);
  const imps = AXIS_IMPRESSION;
  return chars.map((ch, idx) => {
    const body = bodies[idx] || AXIS_BODY[idx % AXIS_BODY.length];
    const impression = imps[Math.floor(Math.random() * imps.length)];
    const hue = ((body.hue || 0) + Math.floor(Math.random() * 40) - 20) % 360;
    const sat = rarity.stars >= 3 ? 1.35 : 1.15;
    return {
      candidateId: 'g' + idx,
      bodyId: body.id,
      impressionId: impression.id,
      rarityId: rarity.id,
      baseCharId: ch.id,
      imageUrl: characterImageUrl(ch, 'normal'),
      // カラー登場用の色替え（実APIでは imageDataUrl を使うので不要になる）
      colorFilter: `hue-rotate(${hue}deg) saturate(${sat})`,
      imageDataUrl: null,
      // 記述語彙DB（6論点）を候補ごとに付与＝実API生成プロンプト＆保存メタに使う。
      // userPicks（case X のユーザー選択：motif/atmosphere）があれば全候補で固定。
      vocab: makeVocabPicks(userPicks),
    };
  });
}

// ===== 先行生成（バックグラウンド）=====
// レポート/スコア表示中に裏で走らせる投機実行。3体候補を返す。
// params: { station, spots, distanceKm, body?, impression? }
export async function startGeneration(params) {
  const p = params || {};
  const count = 3;
  // 候補ごとに語彙DB（6論点）を選定。実APIでは各候補の vocab で個別プロンプト生成する。
  const perCandidate = Array.from({ length: count }, () => makeVocabPicks(p.userPicks));
  const bodies = pickDistinct(AXIS_BODY, count);
  const rarity = rarityForDistance(p.distanceKm);

  // 実 API 接続時: 各候補の vocab でプロンプトを作って生成（ここでは代表1本で疎通確認）。
  const real = await callNanoBananaPro({
    prompt: buildPrompt({
      station: p.station, spots: p.spots, distanceKm: p.distanceKm,
      vocab: perCandidate[0],
    }),
    count,
  });

  // 実APIが1枚でも返れば採用（全3枚成功を要求しない＝一部SAFETYブロック等でも実APIを活かす）。
  if (real && real.length >= 1) {
    return {
      candidates: real.map((r, idx) => ({
        candidateId: 'g' + idx,
        bodyId: (bodies[idx] || AXIS_BODY[0]).id,
        impressionId: AXIS_IMPRESSION[0].id,
        rarityId: rarity.id,
        baseCharId: null,
        imageUrl: r.imageDataUrl,
        colorFilter: 'none',
        imageDataUrl: r.imageDataUrl,
        vocab: perCandidate[idx] || perCandidate[0],
      })),
      rarityId: rarity.id,
      source: 'nanobanana',
    };
  }

  // フォールバック（Phase 1 標準）
  return {
    candidates: mockCandidates({ distanceKm: p.distanceKm, userPicks: p.userPicks }),
    rarityId: rarityForDistance(p.distanceKm).id,
    source: 'mock',
  };
}

// ===== 命名候補（自由入力なし・候補から選ぶ）=====
export function nameCandidates(station, bodyId, lang = 'ja') {
  const b = bodyById(bodyId);
  const bl = b ? axisLabel(b, 'ja') : 'なかま';
  const st = String(station || '').replace(/駅$/, '').trim() || 'たんけん';
  // 子供向けの安全なテンプレのみ（外部テキストはサニタイズ済みの駅名/語彙ラベルだけ）
  const list = [
    `${st}っち`,
    `ぷち${bl}`,
    `${st}の${bl}`,
    `${bl}マル`,
    `ちび${st}`,
  ];
  // 重複除去
  return Array.from(new Set(list)).slice(0, 4);
}

// ===== 生成キャラの保存（図鑑「つくったなかま」用の専用ストア）=====
const GEN_STORE_KEY = 'tanken_generated_v1';
function genStoreKey() { return GEN_STORE_KEY + '__' + getExplorerId(); }

export function loadGeneratedCharacters() {
  try {
    const obj = JSON.parse(localStorage.getItem(genStoreKey()) || '{}') || {};
    // 新しい順の配列で返す
    return Object.values(obj).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (_) { return []; }
}

/** 生成キャラ1体を保存して def を返す */
export function saveGeneratedCharacter(def) {
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem(genStoreKey()) || '{}') || {}; } catch (_) {}
  const genId = def.genId || ('gen_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const record = {
    genId,
    name: def.name || '',
    station: def.station || '',
    spots: def.spots || [],
    distanceKm: def.distanceKm || 0,
    rarityId: def.rarityId || 'common',
    bodyId: def.bodyId || null,
    impressionId: def.impressionId || null,
    vocab: def.vocab || null,              // 記述語彙DB（6論点）の選定結果
    baseCharId: def.baseCharId || null,   // モック描画用
    colorFilter: def.colorFilter || 'none',
    imageDataUrl: def.imageDataUrl || null, // 実API画像
    createdAt: def.createdAt || new Date().toISOString(),
  };
  obj[genId] = record;
  try { localStorage.setItem(genStoreKey(), JSON.stringify(obj)); } catch (_) {}
  return record;
}

/** 生成キャラの表示画像URL（実API画像優先、無ければモックのベース絵） */
export function generatedImageUrl(rec) {
  if (rec && rec.imageDataUrl) return rec.imageDataUrl;
  if (rec && rec.baseCharId) {
    const ch = CHARACTERS.find(c => c.id === rec.baseCharId);
    if (ch) return characterImageUrl(ch, 'normal');
  }
  return '';
}

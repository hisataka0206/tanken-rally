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
import { cutoutBackground } from './imagefx.js?v=106';

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
export function buildPrompt({ station, spots, distanceKm, vocab, bodyHint }) {
  const rarity = rarityForDistance(distanceKm);
  const v = vocab || {};
  const spotThemes = (spots || []).slice(0, 5).map(sanitizeTheme).filter(Boolean).join(', ');
  // レア度連動エフェクト（共有プロンプト議論の effect 層。Gemini 自然文版）
  const effectByRarity = {
    common: 'Keep it plain and clean with no extra effects.',
    rare:   'Add a few small floating accent shapes around the character.',
    epic:   'Add floating accent shapes and soft sparkles around the character.',
    legend: 'Add lively floating accent shapes, glowing sparkles and a subtle radiant aura.',
  };
  // レジェンド枠（epic/legend＝☆3以上）だけ「クールな強キャラ」DNAへ差し替える（提案B）。
  //   ブランド共通ルール（太い焦茶アウトライン・フラット塗り・白ツヤ・2Dベクター）は死守し、
  //   cute/yuru-chara/pastel/pink cheeks を排除して sharp/glowing/dynamic に置換する。
  const legendary = (rarity.stars || 1) >= 3;
  return [
    // === 固定DNA（画風の統一）===
    // 共有された SD/SDXL タグDNA を Gemini 自然文へ翻案。重み記法 (:1.3) と別枠ネガティブは
    // Gemini 非対応のため使わず、否定は末尾に「Avoid: …」の肯定文で付与する。
    ...(legendary ? [
      'Design one COOL LEGENDARY GUARDIAN mascot character for a kids station-exploration game called "Tekutan".',
      'Art style: a single flat 2D vector illustration. Keep the house rules strictly: bold clean dark-brown outlines (never pure black), flat vibrant colors with glossy white highlights, sticker-like flat shading.',
      'This is a special LEGEND-tier character: sharp glowing eyes, sharp edges and a bold dynamic silhouette, floating powerfully, a confident and majestic heroic presence. NOT cute, NOT round-baby, no pastel, no pink cheeks — cool and awe-inspiring but still friendly for kids.',
    ] : [
      'Design one original mascot character for a kids station-exploration game called "Tekutan".',
      'Art style: a single cute kawaii yuru-chara mascot with chibi proportions, drawn as a flat 2D vector illustration.',
      'Bold clean dark-brown outlines (never pure black), flat pastel colors with soft glossy white highlights, round pink rosy cheeks, big friendly eyes, and simple short stubby dark-brown limbs, with sticker-like flat shading.',
    ]),
    // 背景は「透明」を要求しても不透明で返るため、抜きやすい単色ベタ背景を明示（クライアントで透過処理する）。
    'Show only this one character, centered with margin fully inside the frame, isolated on a plain solid pure-white background with no scenery, no shadow, no gradient.',
    // Gemini が「デザインソフトで開いた様子」を絵として描く事故を防ぐ（Photoshop UI 混入対策）。
    'Output ONLY the finished character artwork itself as a clean plain illustration. This is NOT a screenshot and NOT a software mockup: absolutely no application window, no Photoshop or image-editor interface, no menu bar, no toolbars, no side panels, no layers panel, no rulers, no canvas checkerboard, no window frame or UI of any kind.',
    legendary
      ? 'Child-friendly: cool and powerful but not scary, no violence, no weapons.'
      : 'Child-friendly: cute and friendly, not scary, no violence, no weapons.',
    // === フォルム（シルエット）＝候補ごとに変えて3体の形をはっきり分ける ===
    bodyHint ? `Base creature form: ${bodyHint}. Give it a clear, distinctive silhouette in this shape.` : '',
    // === 差別化変数＝記述語彙DB（6論点・IP非依存の一般名詞。日英混在OK、Geminiは両対応）===
    v.motif      ? `Creature concept / motif: ${v.motif}.` : '',
    v.type       ? `Elemental essence: ${v.type}.`         : '',
    v.texture    ? `Surface texture: ${v.texture}.`        : '',
    v.decoration ? `Small accessory: ${v.decoration}.`     : '',
    v.expression ? `Facial expression: ${v.expression}.`   : '',
    v.atmosphere ? `Overall mood: ${v.atmosphere}.`        : '',
    // === 旅のモチーフ ===
    station ? `Gently inspired by the area around ${sanitizeTheme(station)} station.` : '',
    spotThemes ? `Subtle motifs from: ${spotThemes}.` : '',
    // === レア度＝格・エフェクト ===
    `Rarity: ${rarity.id}. ${effectByRarity[rarity.id] || effectByRarity.common} Higher rarity looks more elaborate and radiant.`,
    // === ネガティブ（Gemini は別枠ネガティブ非対応→肯定文の禁止指示として付与）===
    'Avoid: any software/application UI or screenshot, Photoshop or editor windows, toolbars, menus, panels, rulers, checkerboard; realistic or 3D rendering, photorealism, gradient or realistic shading, any humans or human-like hands, fingers or toes, any text, letters, numbers, signature or watermark, multiple characters, pure-black outlines, and busy or detailed backgrounds.',
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

// ===== スポット連動モチーフ（提案A・生成側）=====
// 訪れたスポットのカテゴリ→その場所を象徴する具体オブジェクトの語彙。
// 「この場所だからこの子が出た」というナラティブ（お土産感）を生む。IP非依存の一般名詞のみ。
const SPOT_MOTIFS = {
  station: ['切符', '時計', '案内ばん', '車輪', 'スーツケース', 'コンパス', 'ランプ'],   // 駅・ターミナル（旅の起点）
  historic: ['巻物', 'ランタン', '石ひ', 'ふるいカギ', 'おうぎ', 'かわら', 'こま犬'],       // 史跡・文化財
  museum: ['がくぶち', 'ふで', 'つぼ', '化石', 'ほうせき', 'ちず'],                          // 美術館・博物館
  science: ['フラスコ', '歯車', '磁石', '望遠鏡', '電球', 'ロケット', '試験管'],            // 科学館
  nature: ['どんぐり', '木の葉', '虫めがね', '切りかぶ', 'きのこ', '花', 'お弁当箱'],        // 公園・自然
  toy: ['つみ木', 'こま', 'ボール', 'ロボット', 'ふうせん', 'けん玉'],                       // 玩具
  sweets: ['カップケーキ', 'ソフトクリーム', 'キャンディ', 'いちご', 'クッキー'],            // スイーツ
  dagashi: ['ラムネ', 'あめ玉', 'くじ', 'コイン', 'ふうせんガム'],                           // 駄菓子屋
};

// 訪れたスポットのカテゴリ配列から、その場所らしい具体モチーフを1つ選ぶ。
// 駅（station）は探検の起点として常に候補に含める。該当が無ければ null（→汎用語彙にフォールバック）。
function pickSpotMotif(spotCats) {
  const pool = ['station']; // ハブ（駅）は常に候補
  (spotCats || []).forEach(c => { if (SPOT_MOTIFS[c]) pool.push(c); });
  if (!pool.length) return null;
  const cat = pool[Math.floor(Math.random() * pool.length)];
  const list = SPOT_MOTIFS[cat];
  return (list && list.length) ? list[Math.floor(Math.random() * list.length)] : null;
}

// ===== 先行生成（バックグラウンド）=====
// レポート/スコア表示中に裏で走らせる投機実行。3体候補を返す。
// params: { station, spots, spotCats?, distanceKm, userPicks? }
export async function startGeneration(params) {
  const p = params || {};
  const count = 3;
  // 候補ごとに語彙DB（6論点）を選定。ユーザーがmotifを選んでいなければ、訪れたスポットの
  // カテゴリから「その場所らしいモチーフ」を割り当てる（提案A スポット連動）。
  const perCandidate = Array.from({ length: count }, () => {
    const vv = makeVocabPicks(p.userPicks);
    if (!(p.userPicks && p.userPicks.motif)) {
      const sm = pickSpotMotif(p.spotCats);
      if (sm) vv.motif = sm;
    }
    return vv;
  });
  const bodies = pickDistinct(AXIS_BODY, count);
  const rarity = rarityForDistance(p.distanceKm);

  // ★3体それぞれを「別の語彙＋別のフォルム(body)」で個別に生成する（同じプロンプト×3をやめる）。
  //   これで3体のシルエットがはっきり別物になる。各1枚を並行生成。
  const gens = await Promise.all(perCandidate.map((v, i) => {
    const prompt = buildPrompt({
      station: p.station, spots: p.spots, distanceKm: p.distanceKm,
      vocab: v, bodyHint: bodies[i] ? bodies[i].promptHint : '',
    });
    return callNanoBananaPro({ prompt, count: 1 })
      .then(arr => (arr && arr[0]) ? arr[0].imageDataUrl : null)
      .catch(() => null);
  }));

  // 生成画像は不透明背景のことが多い。外周シードのフラッドフィルで背景を透過に抜く。
  const cuts = await Promise.all(gens.map(img => img ? cutoutBackground(img, { tolerance: 48 }) : null));
  const candidates = [];
  cuts.forEach((c, i) => {
    if (c && c.url && c.removedRatio >= 0.12) {
      candidates.push({
        candidateId: 'g' + candidates.length,
        bodyId: (bodies[i] || AXIS_BODY[0]).id,
        impressionId: AXIS_IMPRESSION[0].id,
        rarityId: rarity.id,
        baseCharId: null,
        imageUrl: c.url,
        colorFilter: 'none',
        imageDataUrl: c.url,
        vocab: perCandidate[i],
      });
    }
  });
  console.info(`[chargen] 個別生成 採用 ${candidates.length}/${count}（removedRatio=${cuts.map(c => (c && c.removedRatio || 0).toFixed(2)).join(',')}）`);
  if (candidates.length >= 1) {
    return { candidates, rarityId: rarity.id, source: 'nanobanana' };
  }
  // 全滅 → 下のモックへフォールバック

  // フォールバック（Phase 1 標準）
  return {
    candidates: mockCandidates({ distanceKm: p.distanceKm, userPicks: p.userPicks }),
    rarityId: rarityForDistance(p.distanceKm).id,
    source: 'mock',
  };
}

// ===== 命名候補（自由入力なし・候補から選ぶ）=====
// 命名候補。見た目（＝生成に使った motif の具体名詞）に寄せて、フォルムと名前が
// ちぐはぐにならないようにする（#9）。motif が無ければ body ラベルにフォールバック。
export function nameCandidates(station, vocab, lang = 'ja') {
  // motif は「ほし」「コンパス」「たね・め」等。中黒の前だけ取って短い核にする。
  const motif = (vocab && vocab.motif) ? String(vocab.motif).split(/[・･]/)[0].trim() : '';
  const b = (vocab && vocab.bodyId != null) ? bodyById(vocab.bodyId) : null;
  const core = motif || (b ? axisLabel(b, 'ja') : '') || 'なかま';
  const st = String(station || '').replace(/駅$/, '').trim() || 'たんけん';
  // 子供向けの安全なテンプレのみ（核＝サニタイズ済みの語彙/駅名だけ）
  const list = [
    `${core}っち`,
    `ぷち${core}`,
    `${st}の${core}`,
    `${core}マル`,
    `ちび${core}`,
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

/** 生成キャラの性格（とくちょう）を語彙から作る（図鑑詳細で表示）。 */
export function generatedPersonality(rec, lang = 'ja') {
  const v = (rec && rec.vocab) || {};
  const core = (s) => String(s || '').split(/[・･]/)[0].trim();
  const atmo = core(v.atmosphere);
  const expr = core(v.expression);
  const parts = [atmo, expr].filter(Boolean);
  return parts.length ? parts.join('・') : (lang === 'en' ? 'One of a kind' : 'せかいに一体');
}

/** 生成キャラのストーリー（背景）を、探検の入力から作る。オリジナルキャラと同程度の長さ。
 *  入力: 名前・motif・駅・スポット数・距離・雰囲気・レア度。 */
export function buildGeneratedStory(rec, lang = 'ja') {
  const r = rec || {};
  const v = r.vocab || {};
  const core = (s, d) => (String(s || '').split(/[・･]/)[0].trim() || d);
  const motif = core(v.motif, lang === 'en' ? 'a mystery' : 'なぞ');
  const atmo  = core(v.atmosphere, '');
  const km    = Math.max(0, Math.round((r.distanceKm || 0) * 10) / 10);
  const spotN = (r.spotCount != null) ? r.spotCount : (r.spots || []).length;
  const rarity = r.rarityId || 'common';
  const legendary = rarity === 'legend' || rarity === 'epic';

  if (lang === 'en') {
    const st = String(r.station || '').replace(/ Station$/i, '') || 'a certain town';
    const atmoLine = atmo ? `It carries a ${atmo} air about it. ` : '';
    const rareLine = legendary
      ? 'It only shows itself to explorers who have walked a very long way.'
      : 'The more you walk together, the more it opens up its heart.';
    return `Born during an adventure that wandered ${spotN} spots and walked ${km} km around ${st}, this is a companion shaped like ${motif}. ${atmoLine}${rareLine}`;
  }

  const st = String(r.station || '').replace(/駅$/, '') || 'どこかの町';
  const fu = (lang === 'elementary');
  const tanken = fu ? '探検（たんけん）' : '探検';
  const machi  = fu ? '町（まち）' : '町';
  const aruita = fu ? '歩（ある）いた' : '歩いた';
  const umareta = fu ? '生（う）まれた' : '生まれた';
  const nakama = fu ? '仲間（なかま）' : '仲間';
  const sugata = fu ? '姿（すがた）' : '姿';
  const tooku  = fu ? '遠（とお）く' : '遠く';
  const kokoro = fu ? '心（こころ）' : '心';
  const atmoLine = atmo ? `${atmo}な ふんいきを まとっている。` : '';
  const rareLine = legendary
    ? `その${sugata}を見せるのは、うんと${tooku}まで${aruita}探検家の前だけ。`
    : `いっしょに${aruita}ぶんだけ、すこしずつ${kokoro}をひらいてくれる。`;
  return `${st}の${machi}を ${spotN}か所 めぐって、${km}km ${aruita}${tanken}の中で ${umareta}、${motif}の${nakama}。${atmoLine}${rareLine}`;
}

/** サーバ（GAS）から取得した生成キャラ一覧をローカルストアへマージ（#10 端末間同期）。
 *  genId をキーに、ローカルに無いものだけ追加する（既存はローカル優先）。 */
export function mergeServerGenerated(list) {
  if (!Array.isArray(list) || !list.length) return 0;
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem(genStoreKey()) || '{}') || {}; } catch (_) {}
  let added = 0;
  list.forEach(r => {
    const genId = r && r.genId;
    if (!genId || obj[genId]) return;
    obj[genId] = {
      genId,
      name: r.name || '',
      station: r.station || '',
      spots: r.spots || [],
      spotCount: (r.spotCount != null) ? r.spotCount : ((r.spots || []).length || 0),
      distanceKm: r.distanceKm || 0,
      rarityId: r.rarityId || 'common',
      bodyId: r.bodyId || null,
      impressionId: r.impressionId || null,
      vocab: r.vocab || null,
      baseCharId: r.baseCharId || null,
      colorFilter: 'none',
      imageDataUrl: r.imageDataUrl || null,
      createdAt: r.createdAt || new Date().toISOString(),
      fromServer: true,
    };
    added++;
  });
  if (added) { try { localStorage.setItem(genStoreKey(), JSON.stringify(obj)); } catch (_) {} }
  return added;
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

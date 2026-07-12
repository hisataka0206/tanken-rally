import { CONFIG } from '../config.js?v=106';
import { loadGoogleMaps, geocodeStation, searchNearbySpotsWith, optimizeRoute, getDirections, calcRouteStats, haversine, fetchOpeningHours, isPlaceOpenInWindow } from './utils/maps.js?v=106';
import { fetchOriginStory, tidyMemo, transcribeAudio } from './utils/ai.js?v=106';
import { startWebSpeech, AudioRecorder, supportsWebSpeech, supportsRecording, speechLang } from './utils/voice.js?v=106';
import { generateMapPdf } from './utils/pdf.js?v=106';
import { DriveClient, generateSessionId } from './utils/drive.js?v=106';
import { state, resetSearchState, CAT, SELECTED_COLOR } from './state.js?v=106';
import { CITIES, localizeStationName } from './data/cities.js?v=106';
import { filterBlocked, addBlockedSpot } from './utils/blocked.js?v=106';
import { addReport as addIssueReport } from './utils/issues.js?v=106';
import { applyI18n, LANG, t, adjustMinForKids, pickWizardSpotHint, apiLang } from './utils/i18n.js?v=106';
import { APP_VERSION, RELEASE_LABEL } from './version.js?v=106';
import { FEATURES } from './config-features.js?v=106';
import { ArSession, supportsArCamera, requestOrientationPermission } from './utils/ar.js?v=106';
import { CHARACTERS, characterForSpot, rareCharacter, characterById, pickStartCharacter, charDisplayName, charPersonality, charStory, characterImageUrl, preloadCharacterImages, drawCharacterOnCanvas, RARE_APPEAR_PROBABILITY, RARE_CHARACTER_ID, VARIANTS, variantById, rollVariant, collectionKey, parseCollectionKey } from './utils/characters.js?v=106';
import { getExplorerId, loadCollection, recordCapture, mergeServerCollection, loadLegacyAnonymousCollection } from './utils/collection.js?v=106';
import { isLoggedIn, getStoredAuth, registerAccount, loginAccount, logout, validateCredentials } from './utils/auth.js?v=106';
import { mountGuides, GUIDE_BASE } from './utils/guides.js?v=106';
import { initShell, updateShell } from './utils/shell.js?v=106';
import { evaluateEligibility, startGeneration, rarityById, nameCandidates, saveGeneratedCharacter, loadGeneratedCharacters, generatedImageUrl, SILHOUETTE_FILTER, setChargenBackend, getUserVocabChoices, getLastGenDebug, mergeServerGenerated } from './utils/chargen.js?v=106';

// DriveClient（GAS_URLが設定されていれば有効）
const drive = CONFIG.GAS_URL && CONFIG.GAS_URL !== 'YOUR_GAS_DEPLOY_URL'
  ? new DriveClient(CONFIG.GAS_URL, CONFIG.GAS_SECRET)
  : null;

// キャラ自動生成のバックエンドとして drive を登録（GAS側に GEMINI_API_KEY が
// 設定されていれば実API生成、無ければ chargen 側が自動でモックにフォールバック）。
setChargenBackend(drive);

// デバッグ用：drive 接続状態を可視化
console.log('[tanken-rally] drive client:', drive ? 'enabled' : 'disabled (GAS未設定)');
console.log('[tanken-rally] CONFIG.GAS_URL:', CONFIG.GAS_URL ? `${String(CONFIG.GAS_URL).slice(0, 60)}…` : '(empty)');

// ===== DOM ヘルパー =====
const $ = id => document.getElementById(id);
const show = id => { $( id ).classList.remove('hidden'); $( id ).classList.add('active'); };
const hide = id => { $( id ).classList.add('hidden'); $( id ).classList.remove('active'); };
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// LatLng / Literal どちらでも { lat, lng } の数値オブジェクトに正規化
const toLL = loc => {
  if (!loc) return null;
  if (typeof loc.lat === 'function') return { lat: loc.lat(), lng: loc.lng() };
  return { lat: loc.lat, lng: loc.lng };
};

// 都市・路線オブジェクトの言語別表示名（cities.js の name / nameEn を切替）
const locName = obj => {
  if (!obj) return '';
  if (LANG === 'en' && obj.nameEn) return obj.nameEn;
  return obj.name || '';
};
// 写真タグの「スタート駅」「ゴール駅」用の内部マーカー。
// 言語切替で表示文字列が変わっても永続化された値が壊れないよう、
// 表示用ラベルとは別に固定の内部キーを使う。photo.spotName にはこの値が入る。
const PHOTO_TAG_START = '__START__';
const PHOTO_TAG_GOAL  = '__GOAL__';

// ===== STEP 4 撮影ウィザード =====
// stage 0:        スタート駅（駅出発）
// stage 1..N:     orderedSpots[i-1]（各スポット）
// stage N+1:      ゴール駅（駅到着）
// stage N+2:      写真一覧管理（従来UI、ウィザード卒業後）
// 復元時は state.photoWizardStage = 一覧管理（最終ステージ）から始める。
function totalWizardStages() {
  return state.orderedSpots.length + 3;  // start + N spots + goal + manage
}
// スポット用ヒントは「セッション内では同じスポットに同じ文言」が見えるよう
// state.spotHintCache（Map）にキャッシュする。前へ/次へで戻ってきても文言が
// 一貫し、UI のチカチカ感が出ない。新しいセッションでは別の文言が選ばれる。
function getStableSpotHint(spot) {
  if (!state.spotHintCache) state.spotHintCache = new Map();
  const key = spot.id || spot.name;
  const cached = state.spotHintCache.get(key);
  if (cached) return cached;
  const fresh = pickWizardSpotHint(spot.category) || t('wizardHintSpotFmt');
  state.spotHintCache.set(key, fresh);
  return fresh;
}

function getWizardStageInfo(stage) {
  const N = state.orderedSpots.length;
  const stationDisp = localizeStationName(state.stationName, LANG);
  if (stage <= 0) {
    return {
      type: 'start', tag: PHOTO_TAG_START, icon: '🚉',
      title: t('wizardStartTitleFmt').replace('{name}', stationDisp),
      hint: t('wizardHintStart'),
    };
  }
  if (stage >= 1 && stage <= N) {
    const spot = state.orderedSpots[stage - 1];
    return {
      type: 'spot', tag: spot.name, icon: '📍',
      title: t('wizardSpotTitleFmt').replace('{label}', String(stage)).replace('{name}', spot.name),
      hint: getStableSpotHint(spot),
    };
  }
  if (stage === N + 1) {
    return {
      type: 'goal', tag: PHOTO_TAG_GOAL, icon: '🏁',
      title: t('wizardGoalTitleFmt').replace('{name}', stationDisp),
      hint: t('wizardHintGoal'),
    };
  }
  return { type: 'manage', tag: '', icon: '', title: '', hint: '' };
}
function showWizardStage(stage) {
  const total = totalWizardStages();
  const clamped = Math.max(0, Math.min(stage, total - 1));
  state.photoWizardStage = clamped;
  renderWizardStage();
}
function renderWizardStage() {
  const info = getWizardStageInfo(state.photoWizardStage);
  const wizardEl = $('photo-wizard');
  const manageEl = $('photo-manage');
  if (!wizardEl || !manageEl) return;
  if (info.type === 'manage') {
    // 最終ステージ：従来の写真一覧管理UIを表示、ウィザードを隠す
    wizardEl.classList.add('hidden');
    manageEl.classList.remove('hidden');
    renderPhotosGrid();
  } else {
    // ウィザードステージ：プロンプトを表示し、一覧管理を隠す
    wizardEl.classList.remove('hidden');
    manageEl.classList.add('hidden');
    $('photo-wizard-icon').textContent = info.icon;
    $('photo-wizard-title').textContent = info.title;
    $('photo-wizard-hint').textContent = info.hint;
    $('photo-wizard-progress').textContent = t('wizardProgressFmt')
      .replace('{n}', state.photoWizardStage + 1)
      .replace('{total}', totalWizardStages());
    // ナビゲーションボタンの活性化
    $('wizard-prev').disabled = (state.photoWizardStage === 0);
    renderWizardThumbs(info.tag);
    // ARキャラ捕獲ボタン（スポット/ゴールステージのみ表示）
    updateArHuntButton(info);
    // ガイドキャラ（画面4: スポットカテゴリ連動・既存アセット流用）
    updateWizardGuide(info);
  }
}

// 撮影ウィザードのガイドキャラ（1体のみ・カテゴリ連動）
//   科学館 → ZOOMY(loupe_get) / スイーツ・駄菓子 → TAFFY(taffy_get) / それ以外 → NUTTY(oakchap_discovery)
//   駅ステージはステージ番号で3体ローテーション
function updateWizardGuide(info) {
  const img = $('wizard-guide');
  if (!img) return;
  let file;
  if (info.type === 'spot') {
    const spot = state.orderedSpots[state.photoWizardStage - 1];
    const cat = spot?.category;
    file = cat === 'science' ? 'loupe_get.png'
      : (cat === 'sweets' || cat === 'dagashi') ? 'taffy_get.png'
      : 'oakchap_discovery.png';
  } else {
    file = ['loupe_get.png', 'taffy_get.png', 'oakchap_discovery.png'][(state.photoWizardStage ?? 0) % 3];
  }
  if (!img.src || !img.src.endsWith(file)) {
    img.style.display = '';
    img.classList.remove('wizard-guide-fade');
    void img.offsetWidth; // アニメ再トリガ
    img.src = 'src/assets/characters/' + file;
    img.classList.add('wizard-guide-fade');
  }
}
function renderWizardThumbs(currentTag) {
  const wrap = $('photo-wizard-thumbs');
  if (!wrap) return;
  wrap.innerHTML = '';
  const photos = state.uploadedPhotos.filter(p => p.spotName === currentTag && !p.uploading);
  if (photos.length === 0) {
    wrap.innerHTML = `<p class="photo-wizard-empty-msg">${escapeHtml(t('wizardNoPhotosYet'))}</p>`;
    return;
  }
  photos.forEach(photo => {
    const div = document.createElement('div');
    div.className = 'photo-wizard-thumb';
    div.innerHTML = `<img src="${photo.thumbnailUrl}" alt="${photo.fileName || ''}" />`;
    wrap.appendChild(div);
  });
}
// 現在のウィザードステージから「自動付与すべきタグ」を返す
// （manage ステージや未起動時は空文字＝タグなし）
function getCurrentWizardAutoTag() {
  if (state.photoWizardStage == null) return '';
  const info = getWizardStageInfo(state.photoWizardStage);
  return info.type === 'manage' ? '' : info.tag;
}
// ウィザード／一覧 のどちらの画面を表示中かに応じて適切なほうを再レンダする
function refreshPhotosView() {
  if (state.photoWizardStage == null) {
    renderPhotosGrid();
    return;
  }
  const info = getWizardStageInfo(state.photoWizardStage);
  if (info.type === 'manage') {
    renderPhotosGrid();
  } else {
    renderWizardThumbs(info.tag);
  }
}

// ===== STEP 4: ARキャラ捕獲 =====
// スポットステージ: カテゴリ対応キャラが出現（GPS 50m以内 + コンパス ±30°）
// ゴールステージ:   レア（タンケンハカセ）がセッション1回の抽選（25%）で出現
// docs/ar-character-capture-spec.md 参照
let arSession = null;
let arCurrent = null;   // { char, tag, targetName, target, latestStatus }

// ===== キャラ出現の仕組み =====
// GPS有り（通常プレイ）: 今セッションで“いる”ステージ数を
//   最低 = max(1, round(スポット数 × FIND_MIN_RATIO))、最大 = 最低 + 確率で増加、で決め、
//   どのステージが当たり（いる）かをランダムに割り当てる。外れステージは行っても「いない」。
// GPS無し（救済）: 1セッション1回だけ「さがす」でき、図鑑で未取得の組合せを優先して1体出す。
const FIND_MIN_RATIO  = 0.5;  // 最低出現ステージ数の割合（スポット数に対して）
const FIND_EXTRA_PROB = 0.4;  // 最低を超えて当たりを1ステージずつ増やす確率
let _hitStages  = null;       // 当たり（キャラがいる）ステージのキー集合。null=未計算・セッション毎に確定
let _searchUsed = false;      // GPS無し救済「さがす」を今セッションで使ったか（1回だけ）
let _resolvedStages = new Set(); // 一度開いて「いなかった」ステージ（再さがし不可・photoWizardStageで管理）

// 当たりステージを確定する（start + spot群 から 最低〜最大 個をランダム選出）。
function ensureHitStages() {
  if (_hitStages) return;
  const n = (state.orderedSpots || []).length;
  const keys = ['start'];
  for (let i = 0; i < n; i++) keys.push('spot' + i);
  let target = Math.max(1, Math.round(n * FIND_MIN_RATIO));            // 最低（1が下限）
  target = Math.min(target, keys.length);
  while (target < keys.length && Math.random() < FIND_EXTRA_PROB) target++; // 確率で最大まで増加
  const shuffled = keys.slice().sort(() => Math.random() - 0.5);
  _hitStages = new Set(shuffled.slice(0, target));
  persistArState(); // 抽選結果を保存（再開時に同じ当たり配置を復元）
}

// GPS無し救済: 図鑑で未取得の組合せ（キャラ×すがた）を優先して1体返す。
function pickUncaughtEncounter() {
  const collection = loadCollection();
  const uncaught = [];
  CHARACTERS.forEach(ch => VARIANTS.forEach(v => {
    const key = collectionKey(ch.id, v.id);
    if (!(collection[key] && collection[key].count > 0)) uncaught.push({ ch, v });
  }));
  if (uncaught.length) {
    const p = uncaught[Math.floor(Math.random() * uncaught.length)];
    return { char: p.ch, variant: p.v };
  }
  return { char: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)], variant: rollVariant() };
}

// バリエーションの表示名（ノーマルは空）。名前に前置して「きんいろ タフィー」等にする。
function variantLabel(v) {
  if (!v || v.id === 'normal') return '';
  return t('variant_' + v.id, v.id);
}
function variantNamePrefix(v) {
  const l = variantLabel(v);
  return l ? l + ' ' : '';
}

// ===== マスターモード（admin） =====
// 「hisatakaadmin」でログインした時だけ有効。確率要素（どのキャラ/すがたが出るか・出現条件）を
// 固定してテストできる。設定は端末に保存。非adminでは一切効かない（各適用箇所で isAdmin() ガード）。
const ADMIN_NAMES = ['hisatakaadmin'];
function isAdmin() {
  const a = getStoredAuth();
  return !!(a && ADMIN_NAMES.includes(String(a.name || '').trim().toLowerCase()));
}
let adminOverride = (() => {
  try { return JSON.parse(localStorage.getItem('tanken_admin_override') || '{}') || {}; }
  catch (_) { return {}; }
})();
function saveAdminOverride() {
  try { localStorage.setItem('tanken_admin_override', JSON.stringify(adminOverride)); } catch (_) { /* no-op */ }
}
function updateAdminButton() {
  const btn = $('admin-btn');
  if (btn) btn.classList.toggle('hidden', !isAdmin());
}
function openAdminPanel() {
  const charSel = $('admin-char');
  charSel.innerHTML = '<option value="">（ステージ通常）</option>' +
    CHARACTERS.map(c => `<option value="${c.id}">${escapeHtml(charDisplayName(c))}</option>`).join('');
  charSel.value = adminOverride.charId || '';
  const varSel = $('admin-variant');
  varSel.innerHTML = '<option value="">（ランダム）</option>' +
    VARIANTS.map(v => `<option value="${v.id}">${escapeHtml(variantLabel(v) || t('variant_normal', 'ノーマル'))}</option>`).join('');
  varSel.value = adminOverride.variantId || '';
  $('admin-force').checked = !!adminOverride.forceAppear;
  $('admin-zukan-all').checked = !!adminOverride.zukanAll;
  $('admin-modal').classList.remove('hidden');
}
// 「図鑑を全部プレビュー」用: 全キャラ×全すがたを取得済み扱いにした表示専用コレクション（保存しない）
function effectiveCollection(collection) {
  if (isAdmin() && adminOverride.zukanAll) {
    const all = {};
    CHARACTERS.forEach(ch => VARIANTS.forEach(v => { all[collectionKey(ch.id, v.id)] = { count: 1 }; }));
    return all;
  }
  return collection || {};
}

// 現在のウィザードステージに対する AR コンテキストを返す（対象外ステージは null）
function arStageContext(info) {
  if (!FEATURES.arCaptureEnabled || !supportsArCamera()) return null;
  ensureHitStages(); // どのステージにキャラが「いる/いない」かを、ルート確定時に一度だけ決定
  if (info.type === 'start') {
    // スタート駅: lookie / colorey からセッションごとにランダムで1体（当たりステージのみ出現）
    if (!state.startCharacterId) state.startCharacterId = pickStartCharacter().id;
    const ll = toLL(state.stationLocation);
    return {
      char: _hitStages.has('start') ? characterById(state.startCharacterId) : null, // 外れは「いない」
      tag: info.tag,
      targetName: localizeStationName(state.stationName, LANG),
      target: ll,
    };
  }
  if (info.type === 'spot') {
    const spot = state.orderedSpots[state.photoWizardStage - 1];
    if (!spot || spot.lat == null) return null;
    const isHit = _hitStages.has('spot' + (state.photoWizardStage - 1));
    return {
      char: isHit ? characterForSpot(spot) : null,  // 外れステージは行ってもいない
      tag: info.tag,
      targetName: spot.name,
      target: { lat: spot.lat, lng: spot.lng },
    };
  }
  if (info.type === 'goal') {
    // レア出現はセッション中1回だけ抽選（ステージを行き来しても結果は変わらない）
    if (state.rareGoalAppears == null) state.rareGoalAppears = Math.random() < RARE_APPEAR_PROBABILITY;
    const ll = toLL(state.stationLocation);
    return {
      char: state.rareGoalAppears ? rareCharacter() : null,  // null = 今回はいない
      tag: info.tag,
      targetName: localizeStationName(state.stationName, LANG),
      target: ll,
    };
  }
  return null;
}

function updateArHuntButton(info) {
  const btn = $('ar-hunt-btn');
  if (!btn) return;
  const ctx = arStageContext(info);
  // 全ステージで押せる（行って確認できる）。ただし一度チェックして「いなかった」ステージは非表示。
  btn.classList.toggle('hidden', !ctx || _resolvedStages.has(state.photoWizardStage));
}

async function openArHunt() {
  const info = getWizardStageInfo(state.photoWizardStage);
  const ctx = arStageContext(info);
  if (!ctx) return;
  // admin: 出すキャラを固定（指定があれば上書き）
  if (isAdmin() && adminOverride.charId) ctx.char = characterById(adminOverride.charId);
  arCurrent = ctx;

  // 「いなかった」外れステージは、開いてチェックした時点で再さがし不可にする（当たり＝キャラ有りは対象外）。
  if (!ctx.char) {
    _resolvedStages.add(state.photoWizardStage);
    persistArState(); // 再開しても「いなかった」ステージは再チェック不可
    updateArHuntButton(info); // 背後のボタンを即・非表示に
  }

  // オーバーレイ表示・初期化
  const overlay = $('ar-overlay');
  overlay.classList.remove('hidden');
  document.body.classList.add('ar-open');
  $('ar-target-name').textContent = ctx.targetName || '';
  $('ar-distance').textContent = '';
  $('ar-status').textContent = ctx.char ? t('arSearching') : t('arNoCharToday');
  $('ar-guide').classList.add('hidden');
  $('ar-call-btn').classList.add('hidden');
  const charEl = $('ar-character');
  charEl.classList.add('hidden');
  charEl.classList.remove('ar-appear');
  // 遭遇ごとにバリエーション（レア度）を抽選。admin指定があればそれを固定。
  ctx.variant = ctx.char
    ? ((isAdmin() && adminOverride.variantId) ? variantById(adminOverride.variantId) : rollVariant())
    : null;
  if (ctx.char) {
    const v = ctx.variant;
    const imgEl = $('ar-character-img');
    imgEl.src = characterImageUrl(ctx.char, 'normal');
    imgEl.style.filter = (v && v.filter !== 'none') ? v.filter : '';
    imgEl.style.transform = (v && v.size !== 1) ? `scale(${v.size})` : '';
    $('ar-character-name').textContent = variantNamePrefix(v) + charDisplayName(ctx.char);
    // 合成用のポーズ画像を先読みしておく（シャッター時に await）
    ctx.imagesPromise = preloadCharacterImages(ctx.char);
  }

  // iOS のコンパス許可はユーザー操作起点でしか取れないため、ボタンクリックのこの場で要求する
  await requestOrientationPermission();

  arSession = new ArSession({
    target: ctx.target,
    onUpdate: status => updateArUi(status),
  });
  try {
    await arSession.start($('ar-video'));
    // admin: GPS・向きを無視して必ず出す（その場テスト用）
    if (isAdmin() && adminOverride.forceAppear && ctx.char) arSession.forceAppear();
  } catch (e) {
    console.warn('[ar] camera start failed:', e);
    alert(t('arCameraError'));
    closeArOverlay();
  }
}

function updateArUi(status) {
  if (!arCurrent) return;
  arCurrent.latestStatus = status;
  const charEl = $('ar-character');
  const guideEl = $('ar-guide');
  const statusEl = $('ar-status');
  const distEl = $('ar-distance');

  // 距離表示
  if (status.distanceM != null) {
    distEl.textContent = t('arDistanceFmt').replace('{m}', String(Math.max(0, Math.round(status.distanceM))));
  } else {
    distEl.textContent = status.gpsAvailable ? '' : t('arNoGps');
  }

  // GPS が取れない時の救済「🔍 さがす」。1セッション1回だけ（使ったら以降は非表示）。
  // キャラなしステージでも押せるよう、no-char の早期returnより前で表示制御する。
  $('ar-call-btn').classList.toggle('hidden', status.gpsAvailable || status.forced || _searchUsed);

  // キャラなし（ゴールで抽選ハズレ）：通常カメラとしてのみ動作
  if (!arCurrent.char) {
    statusEl.textContent = t('arNoCharToday');
    charEl.classList.add('hidden');
    guideEl.classList.add('hidden');
    return;
  }

  if (status.visible) {
    // キャラ出現
    if (charEl.classList.contains('hidden')) {
      charEl.classList.remove('hidden');
      charEl.classList.add('ar-appear');
    }
    guideEl.classList.add('hidden');
    statusEl.textContent = t('arFoundFmt').replace('{name}', charDisplayName(arCurrent.char));
    return;
  }

  charEl.classList.add('hidden');
  charEl.classList.remove('ar-appear');

  // 方向ガイド（コンパスと方位角の両方が取れている時のみ回転表示）
  if (status.bearingDeg != null && status.headingDeg != null && status.headingAvailable) {
    guideEl.classList.remove('hidden');
    const rot = (status.bearingDeg - status.headingDeg + 360) % 360;
    $('ar-guide-arrow').style.transform = `rotate(${rot - 90}deg)`; // ➤ は右向き基準
  } else {
    guideEl.classList.add('hidden');
  }

  if (status.withinRadius) {
    statusEl.textContent = status.headingAvailable ? t('arNear') : t('arNoSensor');
  } else if (status.distanceM != null) {
    statusEl.textContent = t('arFarFmt').replace('{m}', String(Math.max(0, Math.round(status.distanceM))));
  } else {
    statusEl.textContent = t('arSearching');
  }
}

async function onArShutter() {
  if (!arSession || !arCurrent) return;
  const video = $('ar-video');
  const status = arCurrent.latestStatus || {};
  const charVisible = !!(arCurrent.char && status.visible);
  const char = arCurrent.char;
  const tag = arCurrent.tag;
  const variant = arCurrent.variant || variantById('normal');

  // 合成用のキャラ画像（プリロード済み）。found（ゲット！ポーズ）優先。
  let charImg = null;
  if (charVisible && arCurrent.imagesPromise) {
    try {
      const images = await arCurrent.imagesPromise;
      charImg = images.found || images.normal || null;
    } catch (_) { /* 画像なしでもフォールバック描画で続行 */ }
  }

  let file;
  try {
    file = await arSession.captureComposite(video, charVisible
      ? (ctx, w, h) => {
          const size = Math.min(w, h) * 0.5 * (variant.size || 1);
          drawCharacterOnCanvas(ctx, char, charImg, w / 2, h / 2, size, variant.filter);
        }
      : null);
  } catch (e) {
    console.warn('[ar] capture failed:', e);
    alert(t('arCameraError'));
    return;
  }

  // 撮影時の位置・時刻（合成JPEGにEXIFが無いためメタとして別送する）
  const metaOverride = {
    takenAt: new Date().toISOString(),
    lat: status.position?.lat ?? null,
    lng: status.position?.lng ?? null,
  };

  closeArOverlay();

  // 捕獲成功モーダル（キャラが写っている時だけ）
  if (charVisible) {
    const url = URL.createObjectURL(file);
    const dispName = variantNamePrefix(variant) + charDisplayName(char);
    $('ar-captured-title').textContent = t('arCapturedFmt').replace('{name}', dispName);
    const img = $('ar-captured-img');
    img.src = url;
    $('ar-captured-modal').classList.remove('hidden');
  }

  // 既存の写真パイプラインへ（プレビュー先行表示 → Drive アップロード）
  const fileId = await addPhotoAndUpload(file, tag, metaOverride);

  // 捕獲記録（report.json 経由でセッション再開時にも復元される）
  if (charVisible) {
    // 図鑑の保存キーは「charId#variant」（ノーマルは charId のまま＝既存データ互換）。
    // ただし state.captures.characterId は従来どおり base id（スコア/レポート/レア判定で使うため）、
    // 変異は variantId として別に持つ。
    const key = collectionKey(char.id, variant.id);
    state.captures.push({
      characterId: char.id,
      variantId: variant.id,
      spotName: tag,
      photoFileId: fileId,
      capturedAt: metaOverride.takenAt,
      lat: metaOverride.lat,
      lng: metaOverride.lng,
    });
    // 図鑑（セッション横断）: ローカル即時記録 + Sheets へ fire-and-forget 同期（キーは変異込み）
    recordCapture(key, metaOverride.takenAt);
    // #4 乱獲防止: 捕獲したステージは解決済みにし「さがす」を非表示＝同じ場所で再捕獲不可。
    // セッションに永続化するので、履歴から再開しても再捕獲できない。
    _resolvedStages.add(state.photoWizardStage);
    persistArState();
    updateArHuntButton(getWizardStageInfo(state.photoWizardStage));
    if (drive) {
      drive.saveCaptures({
        explorerId: getExplorerId(),
        records: [{ characterId: key, capturedAt: metaOverride.takenAt }],
      }).catch(e => console.warn('[zukan] Sheets同期失敗（ローカルには保存済）:', e));
    }
  }
}

// ===== キャラずかん（コレクション） =====
// ローカル（localStorage）を一次ストアとして即表示し、GAS が使えれば
// Sheets のコレクションをマージして再描画する（セッション・端末をまたぐ収集）。
let _zukanCollection = {};   // renderZukanGrid が保持し、詳細表示で参照する

// あるキャラの累計捕獲回数（全バリエ合計）。説明文の段階解放に使う。
function collectionBaseCount(collection, charId) {
  let n = 0;
  Object.keys(collection || {}).forEach(k => {
    if (parseCollectionKey(k).charId === charId) n += (collection[k].count || 0);
  });
  return n;
}
// あるキャラで取得済みのバリエ id 集合。
function ownedVariantIds(collection, charId) {
  const owned = new Set();
  Object.keys(collection || {}).forEach(k => {
    const p = parseCollectionKey(k);
    if (p.charId === charId && (collection[k].count || 0) > 0) owned.add(p.variantId);
  });
  return owned;
}
// コンプ総数（キャラ×バリエ）。
function zukanTotals(collection) {
  const total = CHARACTERS.length * VARIANTS.length;
  let owned = 0;
  CHARACTERS.forEach(ch => { owned += ownedVariantIds(collection, ch.id).size; });
  return { owned, total };
}

// 決定論的ハッシュ（説明文の「どの文字が読めるか」を安定させる）
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
// 説明文を ratio(0〜1) の割合だけ読めるようにする（残りは ● で伏せる）。
// 位置ごとに固定しきい値を持たせ、ratio が増えるほど単調に読める文字が増える。
function revealStoryText(text, ratio, seed) {
  const KEEP = /[\s、。，．・…！？!?「」『』（）()〜~ー―—\-:：;；]/;
  let pos = 0, out = '';
  for (const ch of String(text || '')) {
    if (KEEP.test(ch)) { out += escapeHtml(ch); continue; }
    const thr = (hash32(seed + ':' + pos) % 1000) / 1000;
    out += (ratio >= 1 || thr < ratio) ? escapeHtml(ch) : '<span class="zukan-mask">●</span>';
    pos++;
  }
  return out;
}
function revealHintText(baseCount) {
  if (baseCount >= 5) return t('zukanRevealFull', 'ぜんぶ読めた！✨');
  const pct = Math.min(100, baseCount * 20);
  const left = Math.max(0, 5 - baseCount);
  return t('zukanRevealHintFmt', 'あと{left}回つかまえると もっと読めるよ（今 {pct}%）')
    .replace('{left}', String(left)).replace('{pct}', String(pct));
}

function renderZukanGrid(collection) {
  const grid = $('zukan-grid');
  if (!grid) return;
  _zukanCollection = effectiveCollection(collection);  // adminの「全部プレビュー」対応

  const { owned, total } = zukanTotals(_zukanCollection);
  const compEl = $('zukan-comp');
  if (compEl) compEl.textContent = t('zukanCompFmt', 'コンプ {n}/{total}').replace('{n}', String(owned)).replace('{total}', String(total));

  const charsHtml = CHARACTERS.map(ch => {
    const ownedSet = ownedVariantIds(_zukanCollection, ch.id);
    const caught = ownedSet.size > 0;
    const name = caught ? charDisplayName(ch) : t('zukanUnknown');
    // 取得済みで最もレアな変異の色をサムネに反映（ごほうび感）
    let filterStyle = '';
    if (caught) {
      let best = null;
      VARIANTS.forEach(v => { if (ownedSet.has(v.id) && (!best || v.stars > best.stars)) best = v; });
      if (best && best.filter !== 'none') filterStyle = ` style="filter:${best.filter}"`;
    }
    const badge = caught ? `<div class="zukan-count">${ownedSet.size}/${VARIANTS.length}</div>` : '';
    return `
      <div class="zukan-item${caught ? ' zukan-clickable' : ' zukan-silhouette'}"${caught ? ` data-char-id="${ch.id}"` : ''} role="${caught ? 'button' : 'presentation'}">
        <img src="${characterImageUrl(ch, 'normal')}" alt=""${filterStyle} />
        <div class="zukan-name">${escapeHtml(name)}</div>
        ${badge}
      </div>`;
  }).join('');

  // つくったなかま（キャラ自動生成）: 専用ストアから追記
  const genRecs = loadGeneratedCharacters();
  let genHtml = '';
  if (genRecs.length) {
    genHtml = `<div class="zukan-section-label">${escapeHtml(t('chargenZukanSection', '🌟 つくった なかま'))}</div>` +
      genRecs.map(rec => {
        const rar = rarityById(rec.rarityId);
        const style = rec.imageDataUrl ? '' : ` style="filter:${rec.colorFilter || 'none'}"`;
        return `
          <div class="zukan-item zukan-generated">
            <img src="${escapeHtml(generatedImageUrl(rec))}" alt=""${style} />
            <div class="zukan-name">${escapeHtml(rec.name || '')}</div>
            <div class="zukan-count">${'★'.repeat(rar.stars || 1)}</div>
          </div>`;
      }).join('');
  }

  grid.innerHTML = charsHtml + genHtml;
  grid.querySelectorAll('.zukan-clickable').forEach(el => {
    el.addEventListener('click', () => showZukanDetail(el.dataset.charId));
  });
}

// 捕獲済みキャラの詳細：性格＋（捕獲回数で段階解放される）ストーリー＋バリエ収集枠。
function showZukanDetail(charId) {
  const ch = characterById(charId);
  const detail = $('zukan-detail');
  if (!ch || !detail) return;
  const collection = _zukanCollection;
  const baseCount = collectionBaseCount(collection, charId);
  const ownedSet = ownedVariantIds(collection, charId);
  const ratio = Math.min(1, baseCount * 0.2);           // 1回=20% … 5回=100%
  const storyHtml = revealStoryText(charStory(ch), ratio, 'story:' + charId);

  const slots = VARIANTS.map(v => {
    const own = ownedSet.has(v.id);
    const imgStyle = own
      ? `${v.filter !== 'none' ? `filter:${v.filter};` : ''}${v.size !== 1 ? `transform:scale(${Math.min(1.15, v.size)});` : ''}`
      : '';
    const label = own ? (variantLabel(v) || t('variant_normal', 'ノーマル')) : '？';
    return `
      <div class="zukan-variant-slot ${own ? 'owned' : 'missing'}">
        <img src="${characterImageUrl(ch, 'normal')}" alt="" style="${imgStyle}" />
        <span class="zukan-variant-stars">${'★'.repeat(v.stars)}</span>
        <span class="zukan-variant-label">${escapeHtml(label)}</span>
      </div>`;
  }).join('');

  detail.innerHTML = `
    <button class="zukan-detail-close" type="button" aria-label="close">✕</button>
    <div class="zukan-detail-body">
      <img src="${characterImageUrl(ch, 'captured')}" alt="" />
      <div class="zukan-detail-text">
        <div class="zukan-detail-name">${escapeHtml(charDisplayName(ch))}</div>
        <div class="zukan-detail-personality">${escapeHtml(charPersonality(ch))}</div>
        <p class="zukan-detail-story">${storyHtml}</p>
        <p class="zukan-detail-reveal">${escapeHtml(revealHintText(baseCount))}</p>
      </div>
    </div>
    <div class="zukan-variants">
      <div class="zukan-variants-title">${escapeHtml(t('zukanVariantsTitle', 'すがた'))} ${ownedSet.size}/${VARIANTS.length}</div>
      <div class="zukan-variants-grid">${slots}</div>
    </div>`;
  detail.classList.remove('hidden');
  detail.querySelector('.zukan-detail-close').addEventListener('click', () => {
    detail.classList.add('hidden');
    detail.innerHTML = '';
  });
}

async function openZukan() {
  // 前回開いていた詳細をリセット
  const detail = $('zukan-detail');
  if (detail) { detail.classList.add('hidden'); detail.innerHTML = ''; }
  updateZukanAccount();
  renderZukanGrid(loadCollection());
  $('zukan-modal').classList.remove('hidden');
  // サーバー側のコレクションをマージして再描画（失敗してもローカル表示のまま）
  if (drive) {
    // 捕獲図鑑と生成キャラ（#10 端末間同期）を並行取得してマージ
    const uid = accountUserId() || getExplorerId();
    const [capRes, genRes] = await Promise.allSettled([
      drive.getCaptures({ explorerId: getExplorerId() }),
      drive.getGeneratedCharacters({ userId: uid }),
    ]);
    if (genRes.status === 'fulfilled') {
      try { mergeServerGenerated(genRes.value); } catch (_) {}
    } else {
      console.warn('[zukan] 生成キャラのサーバ取得失敗（ローカル表示を継続）:', genRes.reason);
    }
    if (capRes.status === 'fulfilled') {
      renderZukanGrid(mergeServerCollection(capRes.value)); // 生成キャラの再描画も内包
    } else {
      console.warn('[zukan] Sheets読み込み失敗（ローカル表示を継続）:', capRes.reason);
      renderZukanGrid(loadCollection()); // 生成キャラのマージ分だけでも反映
    }
  }
}

// ログイン中アカウントの userId を返す（未ログインは null）。
// 履歴・セッションの所有者キーは必ずこれを使い、端末共有の explorerId には落とさない。
function accountUserId() {
  const a = getStoredAuth();
  return (a && a.userId) ? a.userId : null;
}

// 画面内トースト（#6 生成フローの断絶緩和など）。alert の代替の軽量通知。
let _toastTimer = null;
function showToast(msg, ms = 2600) {
  let el = $('tk-toast');
  if (!el) { el = document.createElement('div'); el.id = 'tk-toast'; el.className = 'tk-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// 再開中インジケータ（#2 取り違え防止）: 履歴から再開した探検の間、駅名をずっと表示。
function showResumeIndicator(station) {
  const el = $('resume-indicator');
  if (!el) return;
  el.textContent = t('resumeIndicatorFmt', '📜 再開中のぼうけん: {name}').replace('{name}', station || '');
  el.classList.remove('hidden');
}
function hideResumeIndicator() {
  const el = $('resume-indicator');
  if (el) el.classList.add('hidden');
}

// ===== セッション毎のゲーム状態の永続化（#4 乱獲・#11 再生成の防止）=====
// user×session で名前空間化。再開しても「捕獲済み/生成済み」を引き継ぎ、再捕獲・再生成を封じる。
function sessionStateKey() {
  const uid = accountUserId() || getExplorerId();
  return 'tanken_sess_' + uid + '_' + (state.sessionId || 'nosession');
}
function loadSessionState() {
  try { return JSON.parse(localStorage.getItem(sessionStateKey()) || '{}') || {}; }
  catch (_) { return {}; }
}
function patchSessionState(patch) {
  try { localStorage.setItem(sessionStateKey(), JSON.stringify({ ...loadSessionState(), ...patch })); }
  catch (_) { /* no-op */ }
}
// AR の抽選・救済・チェック済み・スタート/レア確定を保存（再開時に同じ結果を復元）
function persistArState() {
  patchSessionState({
    hitStages: _hitStages ? [..._hitStages] : null,
    resolvedStages: [..._resolvedStages],
    searchUsed: _searchUsed,
    startCharacterId: state.startCharacterId || null,
    rareGoalAppears: (state.rareGoalAppears == null ? null : state.rareGoalAppears),
  });
}
function restoreSessionGameState() {
  const s = loadSessionState();
  if (Array.isArray(s.hitStages)) _hitStages = new Set(s.hitStages);
  _resolvedStages = new Set(Array.isArray(s.resolvedStages) ? s.resolvedStages : []);
  _searchUsed = !!s.searchUsed;
  if (s.startCharacterId) state.startCharacterId = s.startCharacterId;
  if (s.rareGoalAppears != null) state.rareGoalAppears = s.rareGoalAppears;
}

// ===== ぼうけんの履歴 =====
async function openHistory() {
  const list = $('history-list');
  const accEl = $('history-account-name');
  if (accEl) {
    const a = getStoredAuth();
    accEl.textContent = a ? t('zukanAccountFmt').replace('{name}', a.name || '') : '';
  }
  // セキュリティ削除の注意文（今日から約1か月前の日付を計算して表示）
  const noteEl = $('history-security-note');
  if (noteEl) noteEl.textContent = t('historySecurityNoteFmt').replace('{date}', oneMonthAgoLabel());
  $('history-modal').classList.remove('hidden');

  if (!drive) {
    list.innerHTML = `<p class="history-empty">${escapeHtml(t('historyNoGas'))}</p>`;
    return;
  }
  // 履歴はログイン中アカウント限定（未ログイン時は端末IDに落とさず、履歴を出さない）。
  const uid = accountUserId();
  if (!uid) {
    list.innerHTML = `<p class="history-empty">${escapeHtml(t('historyLoginRequired'))}</p>`;
    return;
  }
  list.innerHTML = `<p class="history-loading">${escapeHtml(t('historyLoading'))}</p>`;
  try {
    const items = await drive.getUserHistory({ userId: uid, limit: 50 });
    renderHistory(items);
  } catch (e) {
    console.warn('[history] 取得失敗:', e);
    list.innerHTML = `<p class="history-empty">${escapeHtml(t('historyError'))}</p>`;
  }
}

function formatHistoryDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

// 今日から約1か月前の日付ラベル（写真の保持期間＝GAS の SESSION_RETENTION_DAYS≒30日に対応）
function oneMonthAgoLabel() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  if (LANG === 'en') return `${y}/${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  return `${y}年${m}月${day}日`;
}

function renderHistory(items) {
  const list = $('history-list');
  if (!items || !items.length) {
    list.innerHTML = `<p class="history-empty">${escapeHtml(t('historyEmpty'))}</p>`;
    return;
  }
  list.innerHTML = '';
  items.forEach(it => {
    const dateStr = formatHistoryDate(it.date);
    const scoreStr = (it.score != null) ? `${it.score}${t('suffPoints')}` : '—';
    // 移動（距離・時間）— 写真フォルダを消しても残るメタ情報
    const routeParts = [];
    if (it.distanceText) routeParts.push(`🚶 ${escapeHtml(String(it.distanceText))}`);
    if (it.durationMin)  routeParts.push(`⏱ ${escapeHtml(String(it.durationMin))}${t('suffMin')}`);
    const routeHtml = routeParts.length ? `<div class="history-route">${routeParts.join(' ・ ')}</div>` : '';
    // 訪れたスポット名
    const spotsHtml = (it.spots && it.spots.length)
      ? `<div class="history-spots">📍 ${escapeHtml(it.spots.join(' / '))}</div>`
      : (it.spotCount ? `<div class="history-spots">📍 ${Number(it.spotCount)}</div>` : '');
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-main">
        <div class="history-station">🚉 ${escapeHtml(it.stationName || '')}</div>
        <div class="history-meta">${escapeHtml(dateStr)} ・ 🏆 ${escapeHtml(scoreStr)}</div>
        ${routeHtml}
        ${spotsHtml}
      </div>
      <div class="history-actions">
        ${it.folderUrl ? `<a class="history-link" href="${escapeHtml(it.folderUrl)}" target="_blank" rel="noopener">${escapeHtml(t('historyOpenFolder'))}</a>` : ''}
        ${it.sessionId ? `<button class="history-resume" type="button" data-sid="${escapeHtml(it.sessionId)}">${escapeHtml(t('historyResume'))}</button>` : ''}
      </div>
    `;
    list.appendChild(item);
  });
  // 「つづき」= 既存のセッション再開フローを流用（sessionId をパスワード欄に入れて復元）
  list.querySelectorAll('.history-resume').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      if (!sid) return;
      $('history-modal').classList.add('hidden');
      $('resume-session-input').value = sid;
      onResumeSession();
    });
  });
}

function closeArOverlay() {
  if (arSession) {
    arSession.stop();
    arSession = null;
  }
  const video = $('ar-video');
  if (video) video.srcObject = null;
  $('ar-overlay').classList.add('hidden');
  document.body.classList.remove('ar-open');
}

function closeArCapturedModal() {
  const img = $('ar-captured-img');
  if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = '';
  $('ar-captured-modal').classList.add('hidden');
}

// 1ファイルを写真グリッドに先行表示しつつ Drive にアップロードする。
// onPhotoInputChange のループ本体と同じ流儀（temp entry → Drive 結果で置換）。
// 戻り値: 最終的な fileId（Drive成功時は DriveのID、失敗/未設定時は temp ID）
async function addPhotoAndUpload(file, spotName, metaOverride = null) {
  const tempId = `temp_${Date.now()}_ar`;
  const tempUrl = URL.createObjectURL(file);
  state.uploadedPhotos.push({
    fileId: tempId,
    url: tempUrl,
    thumbnailUrl: tempUrl,
    fullBlobUrl: tempUrl,
    spotName: spotName || '',
    fileName: file.name,
    takenAt: metaOverride?.takenAt || null,
    uploadedAt: new Date().toISOString(),
    lat: metaOverride?.lat ?? null,
    lng: metaOverride?.lng ?? null,
    uploading: true,
  });
  refreshPhotosView();

  let finalId = tempId;
  if (drive && state.driveSession) {
    try {
      const result = await drive.uploadPhoto({
        folderId: state.driveSession.folderId,
        file,
        spotName: spotName || '',
        metaOverride,
      });
      const idx = state.uploadedPhotos.findIndex(p => p.fileId === tempId);
      if (idx >= 0) {
        state.uploadedPhotos[idx] = {
          ...state.uploadedPhotos[idx],
          fileId: result.fileId,
          driveUrl: result.url,
          driveThumbnailUrl: result.thumbnailUrl,
          takenAt: result.takenAt || state.uploadedPhotos[idx].takenAt,
          uploadedAt: result.uploadedAt || state.uploadedPhotos[idx].uploadedAt,
          lat: result.lat ?? state.uploadedPhotos[idx].lat,
          lng: result.lng ?? state.uploadedPhotos[idx].lng,
          uploading: false,
        };
        finalId = result.fileId;
      }
    } catch (err) {
      console.warn('[ar] upload failed:', err);
      const idx = state.uploadedPhotos.findIndex(p => p.fileId === tempId);
      if (idx >= 0) state.uploadedPhotos[idx].uploading = false;
    }
  } else {
    const idx = state.uploadedPhotos.findIndex(p => p.fileId === tempId);
    if (idx >= 0) state.uploadedPhotos[idx].uploading = false;
  }
  refreshPhotosView();
  updatePhotosCount();
  return finalId;
}

// 内部マーカーから localized 表示ラベルへ変換（dropdown / overlay / report で共通使用）
// 元キー（routeFlowStart/Goal）はルート表示で <strong> を含む HTML として使うので、
// プレーンテキスト用途では HTML タグを取り除く必要がある。
function photoTagDisplayLabel(spotName) {
  let raw;
  if (spotName === PHOTO_TAG_START) {
    raw = t('routeFlowStart').replace('{name}', localizeStationName(state.stationName, LANG));
  } else if (spotName === PHOTO_TAG_GOAL) {
    raw = t('routeFlowGoal').replace('{name}', localizeStationName(state.stationName, LANG));
  } else {
    return spotName || '';
  }
  // <strong> 等のタグを除去してプレーンテキスト化
  return raw.replace(/<[^>]+>/g, '');
}

// タグ編集モーダルの dropdown を構築（駅スタート → スポット → 駅ゴール の順）
function buildTagModalOptions() {
  const tagSel = $('tag-modal-select');
  if (!tagSel) return;
  tagSel.innerHTML = '';
  // (タグなし)
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = t('tagModalEmpty');
  tagSel.appendChild(empty);
  // スタート駅
  if (state.stationName) {
    const optStart = document.createElement('option');
    optStart.value = PHOTO_TAG_START;
    optStart.textContent = photoTagDisplayLabel(PHOTO_TAG_START);
    tagSel.appendChild(optStart);
  }
  // 各スポット
  state.orderedSpots.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = `${i + 1}. ${s.name}`;
    tagSel.appendChild(opt);
  });
  // ゴール駅
  if (state.stationName) {
    const optGoal = document.createElement('option');
    optGoal.value = PHOTO_TAG_GOAL;
    optGoal.textContent = photoTagDisplayLabel(PHOTO_TAG_GOAL);
    tagSel.appendChild(optGoal);
  }
}

// CAT カテゴリのラベルを言語別に取得
const catLabel = catKey => t(`catLabel_${catKey}`, (CAT[catKey] || CAT.other).label);

// ===== STEP 1: 都市タブ + 路線/駅 セレクタ =====
function initCityTabs() {
  const tabsEl = $('city-tabs');
  tabsEl.innerHTML = '';
  // 各都市タブ
  CITIES.forEach(city => {
    const tab = document.createElement('button');
    tab.className = 'city-tab';
    tab.dataset.cityId = city.id;
    tab.textContent = locName(city);
    tab.addEventListener('click', () => selectCity(city.id));
    tabsEl.appendChild(tab);
  });
  // 「その他」タブ
  const other = document.createElement('button');
  other.className = 'city-tab';
  other.dataset.cityId = 'other';
  other.textContent = t('cityOther');
  other.addEventListener('click', () => selectCity('other'));
  tabsEl.appendChild(other);
}

function selectCity(cityId, opts = {}) {
  // ランキングは地域単位で比較するので state にも保持する
  state.cityId = cityId;
  // タブのアクティブ状態
  document.querySelectorAll('.city-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.cityId === cityId);
  });
  const selectorEl = $('city-selector');
  const freetextEl = $('freetext-selector');

  if (cityId === 'other') {
    selectorEl.classList.add('hidden');
    freetextEl.classList.remove('hidden');
    return;
  }
  freetextEl.classList.add('hidden');
  selectorEl.classList.remove('hidden');

  // 路線 select 構築
  const city = CITIES.find(c => c.id === cityId);
  const lineSel = $('line-select');
  lineSel.innerHTML = `<option value="">${t('optLineEmpty')}</option>`;
  city.lines.forEach((line, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = locName(line);
    lineSel.appendChild(opt);
  });
  // 駅 select はリセット
  const stationSel = $('station-select');
  stationSel.innerHTML = `<option value="">${t('optStationEmpty')}</option>`;
  stationSel.disabled = true;
  $('search-by-select-btn').disabled = true;

  // 路線変更ハンドラ
  lineSel.onchange = () => {
    const idx = lineSel.value;
    stationSel.innerHTML = `<option value="">${t('optStationPick')}</option>`;
    if (idx === '') {
      stationSel.disabled = true;
      $('search-by-select-btn').disabled = true;
      renderStationChips(null);
      syncChipActive('line-chips', '');
      return;
    }
    const line = city.lines[Number(idx)];
    line.stations.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;                                 // value は日本語（API クエリ用）
      opt.textContent = localizeStationName(name, LANG); // 表示は LANG に応じて切替
      stationSel.appendChild(opt);
    });
    stationSel.disabled = false;
    $('search-by-select-btn').disabled = true;
    // チップUIを路線選択済み状態に同期
    syncChipActive('line-chips', idx);
    renderStationChips(line);
  };
  stationSel.onchange = () => {
    $('search-by-select-btn').disabled = !stationSel.value;
    syncChipActive('station-chips', stationSel.value);
  };

  // チップUI（selectの代替。クリックで select を操作しロジック互換を保つ）
  renderLineChips(city);

  // デフォルト路線を選択する（指定がある場合）
  if (opts.defaultLineName) {
    const idx = city.lines.findIndex(l => l.name === opts.defaultLineName);
    if (idx >= 0) {
      lineSel.value = String(idx);
      lineSel.dispatchEvent(new Event('change'));
    }
  }
}

// ===== STEP1: 段階タップ式ピッカー（Phase B） =====
// select は状態保持用に温存し、チップのタップで select の値を書き換えて
// change イベントを発火する。検索ロジック（onSearchBySelect）は無変更で動く。
function renderLineChips(city) {
  const wrap = $('line-chips');
  if (!wrap) return;
  wrap.innerHTML = '';
  city.lines.forEach((line, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick-chip';
    b.dataset.value = String(i);
    b.textContent = locName(line);
    b.addEventListener('click', () => {
      const lineSel = $('line-select');
      lineSel.value = String(i);
      lineSel.dispatchEvent(new Event('change'));
    });
    wrap.appendChild(b);
  });
  syncChipActive('line-chips', $('line-select').value);
  // 駅チップは路線未選択のヒント表示に戻す
  if ($('line-select').value === '') renderStationChips(null);
}

function renderStationChips(line) {
  const wrap = $('station-chips');
  if (!wrap) return;
  if (!line) {
    wrap.innerHTML = `<p class="chip-hint">${escapeHtml(t('optStationEmpty'))}</p>`;
    return;
  }
  wrap.innerHTML = '';
  line.stations.forEach(name => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick-chip pick-chip-station';
    b.dataset.value = name;
    b.textContent = localizeStationName(name, LANG);
    b.addEventListener('click', () => {
      const sSel = $('station-select');
      sSel.value = name;
      sSel.dispatchEvent(new Event('change'));
      // 選んだ駅が見えるように少しスクロール（次のCTAへ視線誘導）
      b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    wrap.appendChild(b);
  });
  syncChipActive('station-chips', $('station-select').value);
}

function syncChipActive(wrapId, value) {
  document.querySelectorAll(`#${wrapId} .pick-chip`).forEach(c => {
    c.classList.toggle('active', c.dataset.value === String(value));
  });
}

// 詳細絞り込みフォームから営業時間フィルタの値を取得
//   { date: '2026-04-30', startTime: '10:00', endTime: '17:00' } | null
function getDateTimeFilter() {
  const date = $('filter-date').value;
  if (!date) return null;
  const startTime = $('filter-start-time').value || '10:00';
  const endTime   = $('filter-end-time').value   || '17:00';
  return { date, startTime, endTime };
}

// セレクタ「この駅でさがす」 → 都市名・路線名・bounds・日時フィルタ 付きで onSearchStation を呼ぶ
function onSearchBySelect() {
  const stationName = $('station-select').value;
  if (!stationName) return;
  const lineSel = $('line-select');
  const lineIdx = lineSel.value;
  const cityTab = document.querySelector('.city-tab.active');
  const cityId = cityTab && cityTab.dataset.cityId;
  const city = CITIES.find(c => c.id === cityId);
  const lineName = (city && lineIdx !== '') ? city.lines[Number(lineIdx)]?.name : '';
  const cityName = city ? city.name : '';
  $('station-input').value = stationName;
  onSearchStation({
    stationName,
    lineName,
    cityName,
    bounds: city?.bounds,
    center: city?.center,
    dateTimeFilter: getDateTimeFilter(),
  });
}

// 駅 + 全スポットが画面に収まるように地図をフィット
function fitMapToSpots(map, origin, spots) {
  if (!map || !origin) return;
  const bounds = new google.maps.LatLngBounds();
  bounds.extend(origin);
  spots.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
  map.fitBounds(bounds, 60);
}

function showStep(stepId) {
  // CSS の `.step.hidden { display:none !important }` がインライン style に
  // 勝ってしまうため、クラス操作で表示切り替えする
  // トップ画面ではすごろくトレイルを隠す（ゲームの進捗ではないため）
  const trail = document.getElementById('trail');
  if (trail) trail.classList.toggle('hidden', stepId === 'step-home');
  ['step-home', 'step-station', 'step-spots', 'step-route', 'step-photos', 'step-report'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === stepId) {
      el.classList.remove('hidden');
      el.classList.add('active');
    } else {
      el.classList.add('hidden');
      el.classList.remove('active');
    }
    el.style.display = ''; // 過去のインラインstyle残骸をクリア
    // ガイドキャラの受け皿をマウント（素材が無い間は自動非表示）。トップ画面は対象外。
    if (id === stepId && stepId !== 'step-home') {
      mountGuides(stepId);
      updateShell(stepId); // 進捗トレイル + キャラ吹き出し
    }
  });
}

function showError(msg) {
  const el = $('station-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearError() {
  $('station-error').classList.add('hidden');
}

// ===== STEP 1: 駅名検索 =====
// context: { stationName, lineName, cityName } を渡すと曖昧性解消用にgeocodeへ伝搬する
async function onSearchStation(context) {
  const isCtx = context && typeof context === 'object' && typeof context.stationName === 'string';
  const name = isCtx ? context.stationName : $('station-input').value.trim();
  if (!name) { showError(t('errEnterStation')); return; }
  clearError();

  const btn = $('search-btn');
  btn.textContent = t('statusSearching');
  btn.disabled = true;

  // 別の駅で再検索する場合に備えて state を初期化
  resetSearchState();
  // 新しい駅の探検を始める＝再開セッションを抜ける（#2 取り違え防止）。
  state.sessionId = null; state.driveSession = null;
  hideResumeIndicator();
  // ルートプレビューもクリア
  clearTimeout(previewTimer);
  previewSeq++; // 進行中のリクエストを破棄
  const previewEl = $('route-preview');
  if (previewEl) { previewEl.textContent = ''; previewEl.className = 'route-preview'; }

  try {
    await loadGoogleMaps(CONFIG.GOOGLE_MAPS_API_KEY);
    state.stationLocation = await geocodeStation(name, isCtx ? {
      lineName: context.lineName,
      cityName: context.cityName,
      bounds: context.bounds,
      center: context.center,
    } : {});
    state.stationName = name;

    // ローディング表示 → そのあと一度だけ地図を初期化
    const mapEl = $('map');
    mapEl.innerHTML = `<div class="loading">${escapeHtml(t('statusLoadingSpots'))}</div>`;

    // Places API は内部的に div を使うため、別途 PlacesService 用のダミー要素を作る
    // （map 要素を innerHTML で書き換えるため、Places の検索が終わるまで地図描画は待つ）
    const placesScratch = document.createElement('div');
    const placesService = new google.maps.places.PlacesService(placesScratch);

    // ===== スポット検索キャッシュ（GAS/Sheets DB） =====
    // Places API（Nearby ×14 + Text ×1 ≒ ¥70/検索）がコストの支配項のため、
    // 既知の駅は Sheets 上のキャッシュ（TTL 1年・GAS側で判定）を再利用する。
    // キー: スキーマ版 | APIレスポンス言語 | 駅座標（小数4桁 ≒ 11m 粒度）
    // maps.js の検索キーワード構成を変えたら SPOTS_CACHE_SCHEMA を上げること。
    const SPOTS_CACHE_SCHEMA = 'v1';
    const sll = toLL(state.stationLocation);
    const spotsCacheKey = `${SPOTS_CACHE_SCHEMA}|${apiLang()}|${sll.lat.toFixed(4)},${sll.lng.toFixed(4)}`;

    let spots = null;
    if (drive) {
      try {
        const cached = await drive.getSpotsCache(spotsCacheKey);
        if (cached.hit && Array.isArray(cached.spots) && cached.spots.length) {
          spots = cached.spots;
          console.info(`[spots-cache] HIT ${spotsCacheKey} (${cached.spots.length}件, ${cached.ageDays}日前) — Places API 呼び出しをスキップ`);
        }
      } catch (e) {
        console.warn('[spots-cache] 読み込み失敗（通常検索にフォールバック）:', e);
      }
    }
    if (!spots) {
      spots = await searchNearbySpotsWith(placesService, state.stationLocation);
      // 検索成功時のみ保存（fire-and-forget。失敗してもゲーム進行に影響させない）
      if (drive && spots.length) {
        drive.saveSpotsCache({ key: spotsCacheKey, stationName: name, lang: apiLang(), spots })
          .then(() => console.info(`[spots-cache] SAVED ${spotsCacheKey} (${spots.length}件)`))
          .catch(e => console.warn('[spots-cache] 保存失敗:', e));
      }
    }
    // 不適切スポット（学習塾・予備校等のキーワード or ユーザーが過去削除した場所）を除外
    let resultSpots = filterBlocked(spots);

    // 日時フィルタ（指定があれば、各スポットの営業時間を取得して閉まっているものを除外）
    const dtFilter = isCtx ? context.dateTimeFilter : null;
    if (dtFilter && dtFilter.date && resultSpots.length) {
      mapEl.innerHTML = `<div class="loading">${escapeHtml(t('statusCheckingHours').replace('{i}', 0).replace('{n}', resultSpots.length))}</div>`;
      const filtered = [];
      for (let i = 0; i < resultSpots.length; i++) {
        const spot = resultSpots[i];
        // 進捗表示
        mapEl.innerHTML = `<div class="loading">${escapeHtml(t('statusCheckingHours').replace('{i}', i + 1).replace('{n}', resultSpots.length))}</div>`;
        try {
          const hours = await fetchOpeningHours(placesService, spot.id);
          const isOpen = isPlaceOpenInWindow(hours, dtFilter.date, dtFilter.startTime, dtFilter.endTime);
          // false（確実に閉まっている）のみ除外。null（不明）は表示。
          if (isOpen === false) continue;
          filtered.push(spot);
        } catch (e) {
          console.warn('opening_hours fetch failed:', spot.name, e);
          filtered.push(spot); // 取得失敗は除外しない
        }
      }
      console.info(`[date-filter] ${dtFilter.date} ${dtFilter.startTime}-${dtFilter.endTime}: ${resultSpots.length} → ${filtered.length} 件`);
      resultSpots = filtered;
    }
    state.allSpots = resultSpots;

    // 地図を1回だけ生成（後で fitBounds で全スポット入るように調整）
    mapEl.innerHTML = '';
    const map = new google.maps.Map(mapEl, {
      center: state.stationLocation,
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
    });
    state.mapInstances.spots = map;

    // 駅マーカー
    new google.maps.Marker({
      position: state.stationLocation,
      map,
      title: t('markerStationFmt').replace('{name}', localizeStationName(name, LANG)),
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#004029', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
    });

    // 地名由来取得（並行実行）
    $('origin-story').textContent = '';
    fetchOriginStory(name, CONFIG.OPENAI_API_KEY)
      .then(story => { $('origin-story').textContent = `${t('originStoryPrefix')}${story}`; })
      .catch(() => {});

    renderSpotsList(map);
    fitMapToSpots(map, state.stationLocation, state.allSpots);
    showStep('step-spots');

  } catch (e) {
    showError(e.message || t('errGeneric'));
  } finally {
    btn.textContent = t('btnSearch');
    btn.disabled = false;
  }
}


// ===== スポット一覧レンダリング =====
// マーカーは applyCategoryFilter から参照するためモジュールスコープに保持
let _spotMarkers = {};
let _spotMap = null;

function renderSpotsList(map) {
  const list = $('spots-list');
  list.innerHTML = '';

  _spotMap = map;
  _spotMarkers = {};

  // マーカーを追加（カテゴリ別の識別色、選択中は黄色）
  state.allSpots.forEach((spot, i) => {
    const cat = CAT[spot.category] || CAT.other;
    const baseColor = cat.color;
    const marker = new google.maps.Marker({
      position: { lat: spot.lat, lng: spot.lng },
      map,
      title: spot.name,
      label: { text: String(i + 1), color: 'white', fontWeight: 'bold', fontSize: '12px' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 13,
        fillColor: baseColor,
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
      },
    });
    _spotMarkers[spot.id] = marker;

    // 駅からの直線距離を計算（徒歩時間の目安にもなる）
    const distMeters = state.stationLocation
      ? Math.round(haversine(toLL(state.stationLocation), { lat: spot.lat, lng: spot.lng }))
      : 0;
    const distLabel = distMeters >= 1000
      ? `${(distMeters / 1000).toFixed(1)}km`
      : `${distMeters}m`;

    // カード生成（史跡は recommended 装飾でハイライト、ただし選択は任意）
    const card = document.createElement('div');
    card.className = `spot-card${spot.recommended ? ' recommended' : ''}`;
    card.dataset.spotId = spot.id;
    card.dataset.category = spot.category;
    card.innerHTML = `
      <span class="spot-num" style="background:${cat.color}">${i + 1}</span>
      <span class="spot-check">⬜</span>
      <div class="spot-info">
        <div class="spot-name">${spot.name}${spot.recommended ? ` <span class="spot-badge">${escapeHtml(t('badgeRequired'))}</span>` : ''}</div>
        <span class="spot-category ${cat.cls}">${cat.icon} ${escapeHtml(catLabel(spot.category))}</span>
        <div class="spot-desc">📏 ${t('distanceFromStation')} ${distLabel} ・ ${spot.address || ''}</div>
      </div>
      <button class="spot-delete" type="button" title="${escapeHtml(t('spotDeleteTitle'))}" aria-label="${escapeHtml(t('spotDeleteLabel'))}">🗑</button>
    `;

    // 削除ボタン（カード本体クリックにバブルさせない）
    card.querySelector('.spot-delete').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(t('confirmDeleteSpotFmt').replace('{name}', spot.name))) return;
      addBlockedSpot(spot, 'user-removed');
      // state からも除外
      state.allSpots = state.allSpots.filter(s => s.id !== spot.id);
      state.selectedSpotIds.delete(spot.id);
      const m = _spotMarkers[spot.id];
      if (m) m.setMap(null);
      // リストを再構築
      renderSpotsList(_spotMap);
      schedulePreview();
    });

    card.addEventListener('click', () => toggleSpot(spot, card, _spotMarkers));
    list.appendChild(card);

    // マーカータップ = そのスポットを選択/解除（Phase C: 地図主役化）
    // 該当カードへ横スクロールして視覚フィードバックも添える
    marker.addListener('click', () => {
      toggleSpot(spot, card, _spotMarkers);
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });

  renderCategoryFilter();
  applyCategoryFilter();
  updateMakeRouteBtn();
}

// ===== カテゴリフィルタ（チップUI）=====
function renderCategoryFilter() {
  const wrap = $('category-filter');
  wrap.innerHTML = '';

  // 検索結果に存在するカテゴリのみ表示
  const presentCats = new Set(state.allSpots.map(s => s.category));
  if (presentCats.size <= 1) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');

  const lbl = document.createElement('span');
  lbl.className = 'category-filter-label';
  lbl.textContent = t('catFilterLabel');
  wrap.appendChild(lbl);

  Object.keys(CAT).forEach(catKey => {
    if (catKey === 'other') return;
    if (!presentCats.has(catKey)) return;
    const cat = CAT[catKey];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `cat-chip ${cat.cls}`;
    chip.dataset.cat = catKey;
    chip.style.color = 'white';
    chip.style.background = cat.color;
    chip.style.borderColor = cat.color;
    chip.textContent = `${cat.icon} ${catLabel(catKey)}`;
    if (!state.visibleCategories.has(catKey)) chip.classList.add('off');
    chip.addEventListener('click', () => {
      if (state.visibleCategories.has(catKey)) {
        state.visibleCategories.delete(catKey);
        chip.classList.add('off');
      } else {
        state.visibleCategories.add(catKey);
        chip.classList.remove('off');
      }
      applyCategoryFilter();
      updateMakeRouteBtn();
      schedulePreview();
    });
    wrap.appendChild(chip);
  });
}

// 表示中カテゴリに合わせて、カードと地図マーカーの表示を切り替える
function applyCategoryFilter() {
  const list = $('spots-list');
  if (!list) return;
  list.querySelectorAll('.spot-card').forEach(card => {
    const cat = card.dataset.category;
    const visible = state.visibleCategories.has(cat);
    card.style.display = visible ? '' : 'none';
  });
  // マーカー表示制御（選択中のスポットは隠さない）
  state.allSpots.forEach(spot => {
    const m = _spotMarkers[spot.id];
    if (!m) return;
    const visible = state.visibleCategories.has(spot.category) || state.selectedSpotIds.has(spot.id);
    m.setMap(visible ? _spotMap : null);
  });
}

function toggleSpot(spot, card, markers) {
  const icon = card.querySelector('.spot-check');
  const numEl = card.querySelector('.spot-num');
  const marker = markers[spot.id];
  const cat = CAT[spot.category] || CAT.other;
  const baseColor = cat.color;
  if (state.selectedSpotIds.has(spot.id)) {
    state.selectedSpotIds.delete(spot.id);
    card.classList.remove('selected');
    icon.textContent = '⬜';
    if (numEl) numEl.style.background = baseColor;
    if (marker) marker.setIcon({ ...marker.getIcon(), fillColor: baseColor });
  } else {
    state.selectedSpotIds.add(spot.id);
    card.classList.add('selected');
    icon.textContent = '✅';
    if (numEl) numEl.style.background = SELECTED_COLOR;
    if (marker) marker.setIcon({ ...marker.getIcon(), fillColor: SELECTED_COLOR });
  }
  updateMakeRouteBtn();
  schedulePreview();
}

// ===== ルートプレビュー（500ms debounce）=====
let previewTimer = null;
let previewSeq = 0; // 古い API レスポンスを破棄するためのシーケンス番号

function schedulePreview() {
  clearTimeout(previewTimer);
  const previewEl = $('route-preview');
  const selected = state.allSpots.filter(s => state.selectedSpotIds.has(s.id));
  const hasHistoric = selected.some(s => s.category === 'historic');

  // プレビュー対象でない場合はクリア
  if (!hasHistoric || selected.length === 0) {
    previewEl.textContent = '';
    previewEl.className = 'route-preview';
    return;
  }

  // 即座に「計算中」を表示
  previewEl.textContent = t('routePreviewCalcWait');
  previewEl.className = 'route-preview loading';

  previewTimer = setTimeout(async () => {
    const seq = ++previewSeq;
    try {
      const ordered = optimizeRoute(state.stationLocation, selected);
      const result = await getDirections(state.stationLocation, ordered);
      if (seq !== previewSeq) return; // 古いリクエスト → 破棄
      const stats = calcRouteStats(result);
      const displayMin = adjustMinForKids(stats.durationMin);
      const over = displayMin > 60;
      const fmt = t('routePreviewResultFmt')
        .replace('{dist}', stats.distanceText)
        .replace('{min}', displayMin);
      const note = LANG === 'elementary' ? ` ${t('kidsTimeNote')}` : '';
      previewEl.textContent = `${over ? '⚠️ ' : '🚶 '}${fmt}${note}`;
      previewEl.className = `route-preview${over ? ' over' : ''}`;
    } catch (e) {
      if (seq !== previewSeq) return;
      previewEl.textContent = t('routePreviewFailMsg');
      previewEl.className = 'route-preview over';
    }
  }, 500);
}

// 「ルートをつくる」ボタン: 史跡が最低1件含まれていれば有効
function updateMakeRouteBtn() {
  const selected = state.allSpots.filter(s => state.selectedSpotIds.has(s.id));
  const hasHistoric = selected.some(s => s.category === 'historic');
  const btn = $('make-route-btn');
  btn.disabled = !hasHistoric;
  btn.title = hasHistoric ? '' : t('routeBtnTitleHistoricRequired');
  // ヒントメッセージ
  const hint = $('route-btn-hint');
  if (hint) hint.textContent = hasHistoric ? '' : t('hintHistoricRequired');
}

// ===== STEP 3 の UI 構築（state.orderedSpots / state.directionsResult から再描画） =====
// onMakeRoute（新規ルート作成時）と back-to-route（再開セッションで戻ってきた時）の両方から呼ぶ
function renderRouteStepUI() {
  if (!state.stationLocation || !state.directionsResult || !state.orderedSpots.length) return;

  // ルート地図初期化（fitBounds で全スポットが入るよう自動調整）
  const routeMapEl = $('route-map');
  routeMapEl.innerHTML = ''; // 既存内容をクリア（再描画対応）
  const routeMap = new google.maps.Map(routeMapEl, {
    center: state.stationLocation,
    zoom: 15,
    mapTypeControl: false,
    streetViewControl: false,
  });
  state.mapInstances.route = routeMap;
  fitMapToSpots(routeMap, state.stationLocation, state.orderedSpots);

  // 既定マーカーは抑制し、カスタム番号マーカーを描く
  const renderer = new google.maps.DirectionsRenderer({
    map: routeMap,
    suppressMarkers: true,
    polylineOptions: { strokeColor: '#004029', strokeWeight: 5, strokeOpacity: 0.85 },
  });
  renderer.setDirections(state.directionsResult);

  // 駅マーカー（出発点）
  new google.maps.Marker({
    position: state.stationLocation,
    map: routeMap,
    title: t('markerStationFmt').replace('{name}', localizeStationName(state.stationName, LANG)),
    label: { text: 'S', color: 'white', fontWeight: 'bold', fontSize: '12px' },
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#004029', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
  });

  // スポット番号マーカー
  state.orderedSpots.forEach((s, i) => {
    new google.maps.Marker({
      position: { lat: s.lat, lng: s.lng },
      map: routeMap,
      title: s.name,
      label: { text: String(i + 1), color: 'white', fontWeight: 'bold', fontSize: '12px' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#c62828', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
    });
  });

  // ルート統計（Elementary モードは子供ペースで1.5倍表示。スコア計算は元値のまま）
  const { distanceText, durationMin } = state.routeStats;
  const displayMin = adjustMinForKids(durationMin);
  const overLimit = displayMin > 60;
  const kidsNote = LANG === 'elementary'
    ? `<span class="kids-time-note">${escapeHtml(t('kidsTimeNote'))}</span>`
    : '';
  $('route-info').innerHTML = `
    ${overLimit ? `
      <div class="route-warning">
        ${t('routeWarningTpl').replace('{n}', displayMin)}
        <div class="route-warning-actions">
          <button id="warn-back-spots" class="btn-secondary">${escapeHtml(t('btnReduceSpots'))}</button>
          <button id="warn-back-station" class="btn-secondary">${escapeHtml(t('btnDifferentStation'))}</button>
        </div>
      </div>
    ` : ''}
    <div class="route-stats">
      <div><span>${escapeHtml(t('statsTotalDistance'))}</span><br/><strong>${distanceText}</strong></div>
      <div><span>${escapeHtml(t('statsEstTime'))}</span><br/><strong>${escapeHtml(t('approxMin').replace('{n}', displayMin))}</strong>${kidsNote}</div>
      <div><span>${escapeHtml(t('statsSpotCount'))}</span><br/><strong>${state.orderedSpots.length}${escapeHtml(t('suffSpots'))}</strong></div>
    </div>
  `;
  if (overLimit) {
    $('warn-back-spots').addEventListener('click', () => showStep('step-spots'));
    $('warn-back-station').addEventListener('click', () => {
      resetSearchState();
      $('station-input').value = '';
      showStep('step-station');
    });
  }

  // 駅名（EN モードでは Romanji 化）
  const localStationName = localizeStationName(state.stationName, LANG);

  // スポット順リスト（駅 → スポット1 → ... → 駅 のループ、区間時間付き）
  // Elementary モードでは leg ごとの時間も子供ペース（1.5倍）で表示
  const legs = state.directionsResult.routes[0].legs;
  const legHtml = (leg) => {
    const rawMin = Math.max(1, Math.round(leg.duration.value / 60));
    const min = adjustMinForKids(rawMin);
    const dist = leg.distance.text;
    return `
      <div class="route-leg">
        <span class="leg-icon">🚶</span>
        <span>${escapeHtml(t('approxMinKm').replace('{min}', min).replace('{km}', dist))}</span>
      </div>`;
  };
  const parts = [];
  parts.push(`
    <div class="route-spot-item route-station">
      <span class="route-spot-num start">S</span>
      <span>${t('routeFlowStart').replace('{name}', escapeHtml(localStationName))}</span>
    </div>`);
  state.orderedSpots.forEach((s, i) => {
    const cat = CAT[s.category] || CAT.other;
    if (legs[i]) parts.push(legHtml(legs[i]));
    parts.push(`
      <div class="route-spot-item">
        <span class="route-spot-num">${i + 1}</span>
        <span>${cat.icon} <strong>${escapeHtml(s.name)}</strong> — ${escapeHtml(s.address || '')}</span>
      </div>`);
  });
  const lastLeg = legs[legs.length - 1];
  if (lastLeg) parts.push(legHtml(lastLeg));
  parts.push(`
    <div class="route-spot-item route-station">
      <span class="route-spot-num goal">G</span>
      <span>${t('routeFlowGoal').replace('{name}', escapeHtml(localStationName))}</span>
    </div>`);
  $('route-spots').innerHTML = parts.join('');
}

// 必要なら state を補完（駅座標 / Directions）してから STEP 3 を構築。
// 主に再開セッション時に呼ばれる（既に揃っていれば早期リターン）
async function ensureRouteStepReady() {
  if (state.stationLocation && state.directionsResult && state.orderedSpots.length) return;
  if (!state.orderedSpots.length) return;
  await loadGoogleMaps(CONFIG.GOOGLE_MAPS_API_KEY);
  // 駅座標を復元（Sheet には保存されていないので再 geocode）
  if (!state.stationLocation && state.stationName) {
    state.stationLocation = await geocodeStation(state.stationName);
  }
  // Directions を取得
  if (!state.directionsResult && state.stationLocation) {
    state.directionsResult = await getDirections(state.stationLocation, state.orderedSpots);
    state.routeStats = calcRouteStats(state.directionsResult);
  }
  renderRouteStepUI();
}

// ===== STEP 3 内: ルートを逆順に切り替える =====
// 既に決まった orderedSpots の並びを反転して、Directions と routeStats を再構築する。
// 結果として「駅 → A → B → C → 駅」が「駅 → C → B → A → 駅」に切り替わる。
async function onReverseRoute() {
  if (!state.orderedSpots.length || !state.stationLocation) return;
  const btn = $('reverse-route-btn');
  const original = btn.textContent;
  btn.textContent = t('btnReverseRouteCalc');
  btn.disabled = true;
  try {
    // 反転（in-place を避けて新配列に）
    const reversed = [...state.orderedSpots].reverse();
    state.orderedSpots = reversed;
    // Directions を取り直す（駅は変わらず開始 / 終了点）
    state.directionsResult = await getDirections(state.stationLocation, state.orderedSpots);
    state.routeStats = calcRouteStats(state.directionsResult);
    // STEP 3 UI を再描画
    renderRouteStepUI();
  } catch (e) {
    console.error('[reverse-route] failed:', e);
    alert(e.message || t('errRouteFailed'));
    // 失敗時はもう一度反転して元に戻す
    state.orderedSpots = [...state.orderedSpots].reverse();
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

// ===== STEP 2→3: ルート生成 =====
async function onMakeRoute() {
  const btn = $('make-route-btn');
  btn.textContent = t('statusMakingRoute');
  btn.disabled = true;

  try {
    const selected = state.allSpots.filter(s => state.selectedSpotIds.has(s.id));
    state.orderedSpots = optimizeRoute(state.stationLocation, selected);

    // Directions API
    state.directionsResult = await getDirections(state.stationLocation, state.orderedSpots);
    state.routeStats = calcRouteStats(state.directionsResult);

    renderRouteStepUI();
    showStep('step-route');

  } catch (e) {
    alert(e.message || t('errRouteFailed'));
  } finally {
    btn.textContent = t('btnMakeRouteIdle');
    btn.disabled = false;
  }
}

// ===== STEP 3→4: 探検スタート =====
async function onStartExplore() {
  const btn = $('start-explore-btn');
  btn.textContent = t('statusReady');
  btn.disabled = true;
  _hitStages = null; _searchUsed = false; _resolvedStages = new Set(); // 新しい探検＝抽選・救済・チェック済みをリセット

  try {
    state.sessionId = generateSessionId();

    // タグモーダル用のセレクターを構築（駅スタート → スポット → 駅ゴール）
    buildTagModalOptions();

    // DriveクライアントがあればGoogle Driveにセッションフォルダを作成
    if (drive) {
      const info = $('photos-session-info');
      info.textContent = t('driveCreatingFolder');
      try {
        // ログイン中アカウントの名前を使う（履歴はこのアカウントに紐づく）
        const account = getStoredAuth();
        const playerName = (account && account.name) || t('rankNoName');
        state.driveSession = await drive.createSession({
          sessionId: state.sessionId,
          stationName: state.stationName,
          playerName,
        });
        info.innerHTML = t('driveFolderSavedFmt')
          .replace('{url}', state.driveSession.folderUrl)
          .replace('{name}', escapeHtml(state.driveSession.folderName))
          .replace('{sessionId}', escapeHtml(state.sessionId));

        // 続けて Sheet にメタデータ（駅名・スポット順序など）を保存
        // 失敗しても探検フロー自体は継続するため try/catch で握り潰す
        try {
          await drive.saveSession({
            sessionId: state.sessionId,
            stationName: state.stationName,
            playerName,
            userId: accountUserId() || '',    // 所有者はアカウントの userId のみ（未ログインは空＝どのアカウント履歴にも出さない）
            userName: (account && account.name) || '',
            folderUrl: state.driveSession.folderUrl,
            orderedSpots: state.orderedSpots.map(s => ({
              id: s.id,
              name: s.name,
              category: s.category,
              address: s.address || '',
              lat: s.lat,
              lng: s.lng,
              recommended: !!s.recommended,
            })),
            routeStats: state.routeStats || null,
          });
          console.info('[tanken-rally] Sheet にセッション保存しました');
        } catch (e) {
          console.warn('Sheetへのセッション保存に失敗（続行）:', e);
        }
      } catch (e) {
        info.textContent = t('driveErrorPhotosLocalFmt').replace('{err}', e.message);
        console.warn('Drive session creation failed:', e);
      }
    } else {
      $('photos-session-info').textContent = t('driveSessionInfoNoGas');
    }

    // 過去のセッション残骸（特に selectedPhotoIds の古いID）をクリア
    state.uploadedPhotos.forEach(p => {
      if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
    });
    state.uploadedPhotos = [];
    state.selectedPhotoIds.clear();
    // 撮影ウィザードを駅出発（stage 0）から開始
    state.photoWizardStage = 0;
    showStep('step-photos');
    renderWizardStage();

  } catch (e) {
    alert(t('errStartFailedFmt').replace('{err}', e.message));
  } finally {
    btn.textContent = t('btnStartExploreIdle');
    btn.disabled = false;
  }
}

// ===== STEP 4: 写真アップロード =====
async function onPhotoInputChange(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const progress = $('upload-progress');
  progress.classList.remove('hidden');

  // 撮影ウィザードのアクティブステージから自動タグを取得（manage ステージ時は '' = 未タグ）
  const autoTag = getCurrentWizardAutoTag();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const spotName = autoTag; // ウィザードで指定されていれば自動タグ、なければ未タグ
    progress.textContent = t('statusUploading').replace('{i}', i + 1).replace('{n}', files.length);

    // グリッドにプレビューを先行表示（アップロード中状態）
    const tempId = `temp_${Date.now()}_${i}`;
    const tempUrl = URL.createObjectURL(file);
    state.uploadedPhotos.push({
      fileId: tempId,
      url: tempUrl,
      thumbnailUrl: tempUrl,
      // 新規アップロードは元ファイル（フル解像度）の blob を持っているので
      // PDF生成時の追加フェッチは不要。サムネと同一 URL を fullBlobUrl にも入れておく。
      fullBlobUrl: tempUrl,
      spotName: spotName || '',
      fileName: file.name,
      uploadedAt: new Date().toISOString(), // ローカルでも記録（DriveなしモードでもOK）
      uploading: true,
    });
    refreshPhotosView();

    // 撮影直後の自動メモ：アップロード完了を待たず、プレビュー表示の直後にすぐ開く。
    // （1枚だけ追加したとき＝その場撮影/1枚選択のみ。複数枚選択時は煩わしいので出さない）
    // この時点では fileId は temp_ のまま。アップロード完了時に photoComments のキーを
    // 正式IDへ引き継ぐ（下の Object.assign → migratePhotoCommentKey）。
    if (files.length === 1) {
      const justAdded = state.uploadedPhotos[state.uploadedPhotos.length - 1];
      if (justAdded) openVoiceMemoModal(justAdded);
    }

    // Drive にアップロード（ポップアップを出したあと、裏で進める）
    if (drive && state.driveSession) {
      try {
        const result = await drive.uploadPhoto({
          folderId: state.driveSession.folderId,
          file,
          spotName,
        });
        // ★重要：表示・PDF生成用には引き続きローカル blob URL を使う
        // （Drive の uc?id= URL は CORS 非対応 + 403 になることがあるため html2canvas で失敗する）
        // Drive 側のメタ情報は driveUrl / driveThumbnailUrl として別途保存
        const idx = state.uploadedPhotos.findIndex(p => p.fileId === tempId);
        if (idx >= 0) {
          // オブジェクトは「置換」ではなく「上書き（mutate）」する。
          // → 音声メモモーダルが保持している photo 参照を生かしたまま fileId を更新でき、
          //   録音中にアップロードが完了しても保存先が迷子にならない。
          Object.assign(state.uploadedPhotos[idx], {
            fileId: result.fileId,          // Drive のファイルID で置き換え
            driveUrl: result.url,
            driveThumbnailUrl: result.thumbnailUrl,
            takenAt: result.takenAt || null,         // EXIF DateTimeOriginal（無ければ null）
            uploadedAt: result.uploadedAt || state.uploadedPhotos[idx].uploadedAt,
            lat: result.lat ?? null,
            lng: result.lng ?? null,
            uploading: false,
          });
          // temp_ ID で先に付いたメモ（音声メモ等）を正式IDへ引き継ぐ
          migratePhotoCommentKey(tempId, result.fileId);
        }
      } catch (err) {
        console.warn('Upload failed:', err);
        const idx = state.uploadedPhotos.findIndex(p => p.fileId === tempId);
        if (idx >= 0) state.uploadedPhotos[idx].uploading = false;
      }
    } else {
      // Drive未設定：ローカルURLのみで保持
      const idx = state.uploadedPhotos.findIndex(p => p.fileId === tempId);
      if (idx >= 0) state.uploadedPhotos[idx].uploading = false;
    }
    refreshPhotosView();
  }

  progress.textContent = t('statusUploaded').replace('{n}', files.length);
  setTimeout(() => progress.classList.add('hidden'), 2000);
  // 両方の input を空にして、同じファイル/同じ撮影をもう一度トリガできるようにする
  $('photo-input').value = '';
  const camInput = $('photo-camera-input');
  if (camInput) camInput.value = '';
  updatePhotosCount();
}

// temp_ ID で先に保存された写真メモ（音声メモ等）を、アップロード完了後の正式IDへ移す。
// 撮影直後にアップロードを待たずメモを取れるようにしたため、キーの引き継ぎが必要になる。
function migratePhotoCommentKey(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;
  const rd = state.reportData;
  if (rd.photoComments && rd.photoComments[oldId] != null) {
    rd.photoComments[newId] = rd.photoComments[oldId];
    delete rd.photoComments[oldId];
  }
  if (rd.photoCommentsRaw && rd.photoCommentsRaw[oldId] != null) {
    rd.photoCommentsRaw[newId] = rd.photoCommentsRaw[oldId];
    delete rd.photoCommentsRaw[oldId];
  }
}

function renderPhotosGrid() {
  const grid = $('photos-grid');
  grid.innerHTML = '';
  state.uploadedPhotos.forEach(photo => {
    grid.appendChild(buildPhotoItem(photo));
  });
  updatePhotosCount();
}

// 1枚分の photo-item DOM を生成。タグ編集・取捨選択時には buildPhotoItem を再呼び出しせず、
// updatePhotoItemTag / updatePhotoItemExcluded で該当要素だけピンポイント更新する。
// → <img> を作り直さないので画像の再ロード／再デコードが発生しない（重さ対策）
function buildPhotoItem(photo) {
  const excluded = state.reportData.excludedPhotoIds.has(photo.fileId);
  const item = document.createElement('div');
  item.className = `photo-item${photo.uploading ? ' photo-uploading' : ''}${excluded ? ' photo-excluded' : ''}`;
  item.dataset.fileId = photo.fileId;
  const tagText = photo.spotName ? `📍 ${photoTagDisplayLabel(photo.spotName)}` : t('photoTagAdd');
  const toggleIcon = excluded ? '⬜' : '✅';
  const toggleTitle = excluded ? t('photoTagInclude') : t('photoTagExclude');
  item.innerHTML = `
    <img src="${photo.thumbnailUrl}" alt="${photo.fileName}" loading="lazy" />
    <div class="photo-overlay">${escapeHtml(tagText)}</div>
    <button class="photo-include-toggle" type="button" title="${escapeHtml(toggleTitle)}" aria-label="${escapeHtml(toggleTitle)}">${toggleIcon}</button>
  `;

  // 取捨選択トグル（バブルさせない）
  item.querySelector('.photo-include-toggle').addEventListener('click', e => {
    e.stopPropagation();
    if (photo.uploading) return;
    const isExcluded = state.reportData.excludedPhotoIds.has(photo.fileId);
    if (isExcluded) {
      state.reportData.excludedPhotoIds.delete(photo.fileId);
    } else {
      state.reportData.excludedPhotoIds.add(photo.fileId);
    }
    // 該当アイテムだけ更新（<img> は触らない）
    updatePhotoItemExcluded(photo.fileId);
    updatePhotosCount();
  });

  // 写真本体クリック → タグ編集モーダル
  item.addEventListener('click', e => {
    if (e.target.closest('.photo-include-toggle')) return;
    if (photo.uploading) return;
    openTagModal(photo);
  });

  return item;
}

// 該当 photo-item の overlay（タグ表示）だけ書き換える。<img> は触らない。
function updatePhotoItemTag(fileId) {
  const photo = state.uploadedPhotos.find(p => p.fileId === fileId);
  if (!photo) return;
  const item = document.querySelector(`.photo-item[data-file-id="${CSS.escape(fileId)}"]`);
  if (!item) return;
  const overlay = item.querySelector('.photo-overlay');
  if (overlay) {
    overlay.textContent = photo.spotName ? `📍 ${photoTagDisplayLabel(photo.spotName)}` : t('photoTagAdd');
  }
}

// 該当 photo-item の取捨選択状態（class とトグルアイコン）だけ書き換える。<img> は触らない。
function updatePhotoItemExcluded(fileId) {
  const item = document.querySelector(`.photo-item[data-file-id="${CSS.escape(fileId)}"]`);
  if (!item) return;
  const excluded = state.reportData.excludedPhotoIds.has(fileId);
  item.classList.toggle('photo-excluded', excluded);
  const btn = item.querySelector('.photo-include-toggle');
  if (btn) {
    btn.textContent = excluded ? '⬜' : '✅';
    const title = excluded ? t('photoTagInclude') : t('photoTagExclude');
    btn.setAttribute('title', title);
    btn.setAttribute('aria-label', title);
  }
}

function updatePhotosCount() {
  const total = state.uploadedPhotos.length;
  const excluded = state.reportData.excludedPhotoIds.size;
  const included = total - excluded;
  if (total === 0) {
    $('photos-count').textContent = `0${t('suffPhotos')}`;
    return;
  }
  const tagged = state.uploadedPhotos.filter(p => p.spotName).length;
  let txt = `${total}${t('suffPhotos')}`;
  if (excluded > 0) {
    txt = `${total}${t('suffPhotosIncluded').replace('{n}', included)}`;
  } else if (tagged > 0) {
    txt = `${total}${t('suffPhotosTagged').replace('{n}', tagged)}`;
  }
  $('photos-count').textContent = txt;
}

// ===== STEP 4: タグ編集モーダル =====
let _tagEditTarget = null; // 編集中の photo オブジェクト
function openTagModal(photo) {
  _tagEditTarget = photo;
  const modal = $('tag-modal');
  const sel = $('tag-modal-select');
  sel.value = photo.spotName || '';
  modal.classList.remove('hidden');
}
function closeTagModal() {
  _tagEditTarget = null;
  $('tag-modal').classList.add('hidden');
}
async function saveTagModal() {
  if (!_tagEditTarget) return;
  const sel = $('tag-modal-select');
  const photo = _tagEditTarget;
  const newTag = sel.value || '';
  photo.spotName = newTag;
  closeTagModal();
  // 該当アイテムの overlay だけ更新（<img> は触らないので再描画が劇的に速い）
  updatePhotoItemTag(photo.fileId);
  updatePhotosCount();

  // Drive にも書き戻す（復元時にタグが残るように）
  // - 一時ID（temp_*）はまだアップロード未完了なのでスキップ
  // - drive クライアントが無効な場合（ローカル運用）もスキップ
  if (drive && photo.fileId && !photo.fileId.startsWith('temp_')) {
    try {
      await drive.updatePhotoTag(photo.fileId, newTag);
    } catch (e) {
      console.warn('[tag] Drive 永続化に失敗（ローカル状態は反映済）:', e);
    }
  }
}

// ===== STEP 4: 音声メモモーダル =====
// 撮影直後に自動で開き、写真ごとの「ひと言メモ」を声で入力できる。
// 方式は2つ：webspeech（標準・端末内・無料） / whisper（高精度・OpenAI）。
// 既定は webspeech。選択は localStorage に保存して次回以降も維持する。
const VOICE_METHOD_KEY = 'tankenVoiceMethod';
let _voiceMemoTarget = null;   // メモ対象の photo オブジェクト
let _voiceStopFn = null;       // Web Speech の停止関数
let _voiceRecorder = null;     // Whisper 用 AudioRecorder
let _voiceRecording = false;   // 録音/認識 中フラグ
let _voiceBaseText = '';       // 認識開始時点のテキスト（interim を上書き表示するための土台）

function getVoiceMethod() {
  try {
    const v = localStorage.getItem(VOICE_METHOD_KEY);
    if (v === 'whisper' || v === 'webspeech') return v;
  } catch (e) { /* localStorage 不可環境 */ }
  return 'webspeech';   // 既定
}
function setVoiceMethod(method) {
  try { localStorage.setItem(VOICE_METHOD_KEY, method); } catch (e) { /* no-op */ }
}

function openVoiceMemoModal(photo) {
  _voiceMemoTarget = photo;

  // サムネ表示
  const thumb = $('voice-memo-thumb');
  if (thumb) thumb.src = photo.thumbnailUrl || photo.url || '';

  // 既存メモがあれば読み込む（撮り直し・再オープン時）
  const ta = $('voice-memo-text');
  ta.value = state.reportData.photoComments[photo.fileId] || '';

  // 方式ラジオを保存値へ復元
  let method = getVoiceMethod();
  // 標準（Web Speech）が使えない端末なら高精度へ自動フォールバック
  if (method === 'webspeech' && !supportsWebSpeech()) method = 'whisper';
  document.querySelectorAll('input[name="voice-method"]').forEach(r => {
    r.checked = (r.value === method);
  });
  updateVoiceMethodNote(method);

  // ステータス/ボタンを初期化
  _voiceRecording = false;
  setMicButtonState(false);
  $('voice-status').textContent = '';

  $('voice-memo-modal').classList.remove('hidden');
}

function closeVoiceMemoModal() {
  stopVoiceCapture();          // 認識/録音中なら止める
  _voiceMemoTarget = null;
  $('voice-memo-modal').classList.add('hidden');
}

// 現在の方式に応じた注意書き（非対応・キー無し等）を表示
function updateVoiceMethodNote(method) {
  const note = $('voice-method-note');
  if (!note) return;
  let msg = '';
  if (method === 'webspeech' && !supportsWebSpeech()) {
    msg = t('voiceNoteWebspeechUnsupported');
  } else if (method === 'whisper') {
    if (!supportsRecording()) msg = t('voiceNoteRecordingUnsupported');
    else if (!hasOpenAiKey()) msg = t('voiceNoteNoKey');
  }
  note.textContent = msg;
  note.classList.toggle('hidden', !msg);
}

function hasOpenAiKey() {
  return !!(CONFIG.OPENAI_API_KEY && CONFIG.OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY');
}

function currentVoiceMethod() {
  const checked = document.querySelector('input[name="voice-method"]:checked');
  return checked ? checked.value : 'webspeech';
}

function setMicButtonState(recording) {
  const btn = $('voice-mic-btn');
  const label = $('voice-mic-label');
  if (!btn || !label) return;
  btn.classList.toggle('recording', recording);
  label.textContent = recording ? t('voiceMicStop') : t('voiceMicStart');
}

// マイクボタン：押すたびに 開始 ⇄ 停止 をトグル
async function onMicButton() {
  if (_voiceRecording) {
    stopVoiceCapture();
    return;
  }
  const method = currentVoiceMethod();
  if (method === 'whisper') {
    await startWhisperCapture();
  } else {
    startWebSpeechCapture();
  }
}

function startWebSpeechCapture() {
  if (!supportsWebSpeech()) {
    $('voice-status').textContent = t('voiceNoteWebspeechUnsupported');
    return;
  }
  const ta = $('voice-memo-text');
  _voiceBaseText = ta.value ? ta.value.replace(/\s*$/, '') + ' ' : '';
  _voiceRecording = true;
  setMicButtonState(true);
  $('voice-status').textContent = t('voiceStatusListening');

  _voiceStopFn = startWebSpeech({
    lang: speechLang(),
    interim: true,
    onInterim: (interimText) => {
      ta.value = _voiceBaseText + interimText;
    },
    onFinal: (finalText) => {
      ta.value = _voiceBaseText + finalText;
    },
    onError: (err) => {
      console.warn('[voice] web speech error:', err);
      const code = (err && err.toString) ? err.toString() : '';
      $('voice-status').textContent = (code.includes('not-allowed') || code.includes('denied'))
        ? t('voiceStatusMicDenied')
        : t('voiceStatusError');
      _voiceRecording = false;
      setMicButtonState(false);
    },
    onEnd: () => {
      _voiceRecording = false;
      setMicButtonState(false);
      if ($('voice-status').textContent === t('voiceStatusListening')) {
        $('voice-status').textContent = '';
      }
    },
  });
}

async function startWhisperCapture() {
  if (!supportsRecording()) {
    $('voice-status').textContent = t('voiceNoteRecordingUnsupported');
    return;
  }
  if (!hasOpenAiKey()) {
    $('voice-status').textContent = t('voiceNoteNoKey');
    return;
  }
  try {
    _voiceRecorder = new AudioRecorder();
    await _voiceRecorder.start();
    _voiceRecording = true;
    setMicButtonState(true);
    $('voice-status').textContent = t('voiceStatusRecording');
  } catch (err) {
    console.warn('[voice] recorder start failed:', err);
    $('voice-status').textContent = t('voiceStatusMicDenied');
    _voiceRecording = false;
    setMicButtonState(false);
    _voiceRecorder = null;
  }
}

// 認識/録音を停止。Whisper の場合は停止後に文字起こしを実行。
async function stopVoiceCapture() {
  if (!_voiceRecording && !_voiceStopFn && !_voiceRecorder) return;

  // Web Speech
  if (_voiceStopFn) {
    const stop = _voiceStopFn;
    _voiceStopFn = null;
    _voiceRecording = false;
    setMicButtonState(false);
    stop();
    return;
  }

  // Whisper（録音停止 → 文字起こし）
  if (_voiceRecorder) {
    const recorder = _voiceRecorder;
    _voiceRecorder = null;
    _voiceRecording = false;
    setMicButtonState(false);
    $('voice-status').textContent = t('voiceStatusTranscribing');
    try {
      const blob = await recorder.stop();
      const text = await transcribeAudio(blob, CONFIG.OPENAI_API_KEY, apiLang());
      if (text) {
        const ta = $('voice-memo-text');
        ta.value = ta.value ? (ta.value.replace(/\s*$/, '') + ' ' + text) : text;
        $('voice-status').textContent = '';
      } else {
        $('voice-status').textContent = t('voiceStatusNoSpeech');
      }
    } catch (err) {
      console.warn('[voice] whisper failed:', err);
      $('voice-status').textContent = t('voiceStatusError');
    }
    return;
  }

  _voiceRecording = false;
  setMicButtonState(false);
}

function saveVoiceMemo() {
  if (_voiceMemoTarget) {
    const text = $('voice-memo-text').value;
    state.reportData.photoComments[_voiceMemoTarget.fileId] = text;
  }
  closeVoiceMemoModal();
}

// ===== セッション再開（パスワード入力） =====
async function onResumeSession() {
  const errEl = $('resume-error');
  errEl.classList.add('hidden');
  errEl.textContent = '';

  const sessionId = $('resume-session-input').value.trim();
  if (!sessionId) {
    errEl.textContent = t('errEnterSessionId');
    errEl.classList.remove('hidden');
    return;
  }
  if (!drive) {
    errEl.textContent = t('errDriveDisabledResume');
    errEl.classList.remove('hidden');
    return;
  }

  const btn = $('resume-session-btn');
  const original = btn.textContent;
  btn.textContent = t('btnLoadingResume');
  btn.disabled = true;

  try {
    // 1) セッション情報を Drive + Sheet から取得
    const session = await drive.resumeSession({ sessionId });
    console.log('[resume] GAS response:', session);
    if (session.sheetWarning) {
      console.warn('[resume] Sheet 読込み警告:', session.sheetWarning);
    }
    state.driveSession = session;
    state.sessionId = sessionId;
    // 再開時: このセッションの AR 抽選・捕獲済み・救済使用・スタート/レア確定を復元（#4 乱獲防止）
    restoreSessionGameState();

    // 2) Sheet 由来の駅名を優先、無ければフォルダ名から推定
    if (session.stationName) {
      state.stationName = session.stationName;
    } else {
      const folderName = session.folderName || '';
      const stationGuess = folderName.split('_')[0] || '';
      if (stationGuess) state.stationName = stationGuess;
    }

    // 3) Sheet にスポット順序が記録されていれば復元
    if (Array.isArray(session.orderedSpots) && session.orderedSpots.length) {
      state.orderedSpots = session.orderedSpots;
      if (session.routeStats) state.routeStats = session.routeStats;
      console.info(`[resume] スポット ${state.orderedSpots.length} 件を復元:`,
        state.orderedSpots.map(s => s.name).join(' → '));
    } else {
      state.orderedSpots = [];
      console.warn('[resume] スポット復元できず（Sheet にデータなし or 読み込み失敗）');
    }

    // 4) 写真一覧を取得
    const photos = await drive.listPhotos(session.folderId);
    state.uploadedPhotos = (photos || []).map(p => ({
      fileId: p.fileId,
      url: p.url,
      thumbnailUrl: p.thumbnailUrl,
      driveUrl: p.url,
      driveThumbnailUrl: p.thumbnailUrl,
      spotName: p.spotName || '',
      fileName: p.fileName || '',
      takenAt:    p.takenAt    || '',
      uploadedAt: p.uploadedAt || '',
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      uploading: false,
    }));
    state.selectedPhotoIds.clear();

    // 4.5) 写真の表示用サムネイル（GAS 経由 base64 → blob URL）を取得
    //   - Drive の uc?id= / thumbnail?id= は CORS ヘッダ無し → html2canvas で tainted になる
    //   - uc?id= は時々ウィルス警告ページにリダイレクトされ <img> 自体も読み込み失敗する
    //   - そこで GAS proxy 経由で base64 を取得 → 同一オリジン blob URL に変換する
    //   - **復元時はサムネ（w800, ~100KB）のみ取得して高速化**
    //     PDF生成時のみ ensureFullResolutionPhotos() がオリジナルを取得し直す
    if (state.uploadedPhotos.length > 0) {
      const total = state.uploadedPhotos.length;
      let done = 0;
      const updateBtn = () => {
        const btn = $('resume-session-btn');
        if (btn) btn.textContent = `${t('btnLoadingResume')} (${done}/${total})`;
      };
      updateBtn();
      const CONCURRENCY = 3;
      const queue = [...state.uploadedPhotos];
      const worker = async () => {
        while (queue.length > 0) {
          const p = queue.shift();
          try {
            const data = await drive.getPhotoThumbnail(p.fileId, 'w800');
            const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: data.mimeType || 'image/jpeg' });
            // 既存の `url` を blob URL で上書き（Drive URL は driveUrl に保持済）
            p.url = URL.createObjectURL(blob);
            p.thumbnailUrl = p.url;
            // フル解像度はまだ未取得（PDF生成時にオンデマンドで取得）
            p.fullResLoaded = false;
          } catch (e) {
            console.warn('[resume] getPhotoThumbnail failed:', p.fileId, e);
            // フォールバック: Drive URL のまま（編集画面は <img> で表示できる可能性あり、PDFは失敗）
            p.fullResLoaded = false;
          } finally {
            done++;
            updateBtn();
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    }
    // Drive に保存されている過去のノートを取得（あれば）
    let restoredReport = null;
    try {
      const r = await drive.loadReportData({ sessionId });
      if (r && r.reportData) restoredReport = r.reportData;
    } catch (e) {
      console.warn('[resume] loadReportData failed:', e);
    }
    state.reportData = restoredReport
      ? deserializeReportData(restoredReport)
      : { date: '', author: '', overview: '', afterword: '', photoComments: {}, excludedPhotoIds: new Set() };
    if (restoredReport) {
      console.info('[resume] Driveから過去のノートを復元しました');
    }

    // 5) STEP 4 ヘ：セッション情報を見やすく表示
    const info = $('photos-session-info');
    const localStation = localizeStationName(state.stationName || '', LANG);
    const stationLabel = localStation
      ? `${t('reportStationFmt').replace('{name}', localStation)} / `
      : '';
    const folderLink = `<a href="${session.folderUrl}" target="_blank" style="color:#2e7d32">${escapeHtml(session.folderName)}</a>`;
    const counts = t('sessionStatsFmt')
      .replace('{photos}', state.uploadedPhotos.length)
      .replace('{spots}', state.orderedSpots.length);

    let html = `${t('sessionResumedHeader')} ${stationLabel}${folderLink}（${counts}）`;
    if (state.orderedSpots.length) {
      const spotsLine = state.orderedSpots.map((s, i) => `${i + 1}. ${s.name}`).join(' → ');
      html += `<br/><span style="font-size:12px;color:#2e7d32;">${t('sessionVisitedLabel')} ${spotsLine}</span>`;
    }
    if (session.sheetWarning) {
      html += `<br/><span style="font-size:12px;color:#c62828;">${t('sessionWarnSpotsFmt').replace('{reason}', escapeHtml(session.sheetWarning))}</span>`;
    } else if (state.orderedSpots.length === 0) {
      html += `<br/><span style="font-size:12px;color:#c62828;">${t('sessionWarnNotFound')}</span>`;
    }
    info.innerHTML = html;

    // タグ編集モーダルの選択肢を再構築（駅スタート → スポット → 駅ゴール）
    buildTagModalOptions();

    // 復元時は撮影ウィザードをスキップして写真一覧管理（最終ステージ）から始める
    state.photoWizardStage = totalWizardStages() - 1;
    showStep('step-photos');
    renderWizardStage();
    // 再開中インジケータを表示（新しい駅で検索するまで出しっぱなし。#2 取り違え防止）
    showResumeIndicator(localizeStationName(state.stationName, LANG));
  } catch (e) {
    errEl.textContent = e.message || t('errResumeFailed');
    errEl.classList.remove('hidden');
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

// ===== 計画点の正規化パラメータ（あとで調整しやすいよう1か所に集約）=====
// 計画点を 0〜100 に正規化するときの「満点の定義」に使う。
//   満点スポット数 n* = 時間予算 ÷ ( そのルートの平均移動時間/スポット + 標準滞在 )
//   → 平均移動時間/スポット が「スポットの近さ（＝選んだ方向の密集度）」を表すので、
//     満点基準がルート・駅・方向ごとに自動で変わる。
const PLAN_TIME_BUDGET_MIN = 60;    // 探検の時間予算（分）
const PLAN_STAY_PER_SPOT_MIN = 10;  // 1スポットの標準滞在時間（分）

// ===== スコア計算 & ランキング =====
//
// ⚠️ 配点ロジックは秘匿対象（ユーザーには合計点のみ表示）。
// ここでは内部計算のみ行い、UI には breakdown を出さない。
//
// 評価する要素（順不同）：
//   - 訪問スポットの数
//   - 写真の枚数 / タグ付き写真の枚数
//   - コメントの総数 / 文字数（写真ごと + 感想欄）
//   - 移動距離
//   - 1時間以内に収まったか
//   - Google算出の移動時間（=滞在時間を除く実移動時間）との一致度
//
// 撮影時刻の取得優先順位：
//   1. EXIF DateTimeOriginal（最優先）
//   2. クライアントが記録したアップロード時刻（フォールバック）
function calculateScore() {
  const visitCount = state.orderedSpots.length;
  const photos = state.uploadedPhotos.filter(p => !p.uploading);
  const photoCount = photos.length;
  const taggedPhotoCount = photos.filter(p => p.spotName).length;

  // コメント関連（写真コメント + 感想文）
  const photoComments = Object.values(state.reportData.photoComments || {})
    .map(c => (c || '').trim())
    .filter(c => c.length > 0);
  const photoCommentCount = photoComments.length;
  const photoCommentChars = photoComments.reduce((s, c) => s + c.length, 0);
  const overviewLen  = (state.reportData.overview  || '').trim().length;
  const afterwordLen = (state.reportData.afterword || '').trim().length;
  const totalCommentChars = photoCommentChars + overviewLen + afterwordLen;

  const distanceM   = state.routeStats?.distanceM   || 0;
  const distanceKm  = distanceM / 1000;
  const estimatedMin = state.routeStats?.durationMin || 0;

  // 写真の有効時刻：EXIF があれば EXIF、無ければアップロード時刻
  const getEffectiveMs = p => {
    const t = p.takenAt || p.uploadedAt;
    if (!t) return null;
    const ms = new Date(t).getTime();
    return (ms && !isNaN(ms)) ? ms : null;
  };
  const photoTimes = photos.map(getEffectiveMs).filter(Boolean);

  // 総経過時間（最初〜最後の写真の差分）
  let totalElapsedMin = 0;
  if (photoTimes.length >= 2) {
    totalElapsedMin = (Math.max(...photoTimes) - Math.min(...photoTimes)) / 60000;
  }

  // 各スポットの滞在時間 = そのスポットでタグ付き写真の最初〜最後の差分
  // タグなし写真は無視。スポット内に写真1枚しかない場合は滞在 0 とみなす。
  const stayBySpot = {};
  photos.forEach(p => {
    if (!p.spotName) return;
    const ms = getEffectiveMs(p);
    if (!ms) return;
    if (!stayBySpot[p.spotName]) {
      stayBySpot[p.spotName] = { min: ms, max: ms };
    } else {
      stayBySpot[p.spotName].min = Math.min(stayBySpot[p.spotName].min, ms);
      stayBySpot[p.spotName].max = Math.max(stayBySpot[p.spotName].max, ms);
    }
  });
  const totalStayMin = Object.values(stayBySpot)
    .reduce((sum, r) => sum + (r.max - r.min), 0) / 60000;

  // Google が算出する移動時間（滞在は含まない）と比較するため、
  // ユーザーの「移動時間」も滞在を除いて算出する。
  const userMoveMin = Math.max(0, totalElapsedMin - totalStayMin);

  // 1時間以内ボーナス（総経過時間ベース）
  const within60bonus = (totalElapsedMin > 0 && totalElapsedMin <= 60) ? 200 : 0;

  // Google移動時間との一致度（移動時間ベースで比較。理想 0.8〜1.5）
  let paceScore = 0;
  if (estimatedMin > 0 && userMoveMin > 0) {
    const ratio = userMoveMin / estimatedMin;
    if (ratio >= 0.8 && ratio <= 1.5)        paceScore = 200;
    else if (ratio >= 0.5 && ratio < 0.8)    paceScore = 100;
    else if (ratio > 1.5  && ratio <= 2.5)   paceScore = 100;
    else                                      paceScore = 50;
  }

  // ARキャラ捕獲（9要素目）: 捕獲数 + ユニーク種ボーナス + レア捕獲ボーナス
  const captures = state.captures || [];
  const captureCount = captures.length;
  const uniqueCharCount = new Set(captures.map(c => c.characterId)).size;
  const rareCaptured = captures.some(c => c.characterId === RARE_CHARACTER_ID);

  // 内部計算（外部には公開しない）
  const _internalBreakdown = {
    visit:    visitCount * 100,
    photo:    photoCount * 10,
    tagged:   taggedPhotoCount * 5,
    cmtNum:   photoCommentCount * 20,
    cmtChar:  Math.min(totalCommentChars, 500),
    within60: within60bonus,
    distance: Math.round(distanceKm * 30),
    pace:     paceScore,
    capture:  captureCount * 40 + uniqueCharCount * 40 + (rareCaptured ? 150 : 0),
  };
  const total = Object.values(_internalBreakdown).reduce((a, b) => a + b, 0);

  // 「計画点」と「実行点」の2分割（合計は total と一致する）。
  //   計画点 = どんな探検を計画したか（訪問スポット数 + 移動距離）
  //   実行点 = 実際にどれだけ楽しんで動けたか（写真・タグ・コメント・時間・ペース・キャラ捕獲）
  const planScore = _internalBreakdown.visit + _internalBreakdown.distance;
  const execScore = _internalBreakdown.photo + _internalBreakdown.tagged
    + _internalBreakdown.cmtNum + _internalBreakdown.cmtChar
    + _internalBreakdown.within60 + _internalBreakdown.pace + _internalBreakdown.capture;

  // 計画点の 0〜100 正規化（満点基準は駅・ルートごとに動的）。
  //   avgMovePerSpot = そのルートの1スポットあたり平均移動時間（＝スポットの近さ）。
  //     スポットが密集した方向を選ぶほど小さく → n* が大きく（満点ハードルが上がる）。
  //     疎な方向を選ぶほど大きく → n* が小さく（少ないスポットでも満点に届く）。
  //   → どの方向を狙っても「その方向なりに回り切れば満点」に近づき、方向の有利/不利を緩和する。
  const avgMovePerSpot = (visitCount > 0 && estimatedMin > 0) ? estimatedMin / visitCount : 0;
  let planIdealSpots = PLAN_TIME_BUDGET_MIN / (avgMovePerSpot + PLAN_STAY_PER_SPOT_MIN);
  if (!isFinite(planIdealSpots) || planIdealSpots < 1) planIdealSpots = 1;
  const planScore100 = visitCount > 0
    ? Math.round(100 * Math.min(1, visitCount / planIdealSpots))
    : 0;

  return {
    total,
    planScore,
    planScore100,
    planIdealSpots,
    execScore,
    // breakdown は内部計算のみで、UIへは渡さない（秘匿）
    visitCount,
    photoCount,
    taggedPhotoCount,
    photoCommentCount,
    overviewLen,
    afterwordLen,
    distanceM,
    distanceKm,
    totalElapsedMin,
    totalStayMin,
    userMoveMin,
    estimatedMin,
    reportWordCount: overviewLen + afterwordLen,
    captureCount,
    uniqueCharCount,
    rareCaptured,
  };
}

// スコア結果から「弱点」をピックアップしてアドバイス文字列の配列を返す。
// 全要素がしきい値を満たしていれば advicePerfect 1件のみを返す。
function buildScoreAdvice(result) {
  const tips = [];
  // 写真枚数
  if (result.photoCount < 5) {
    tips.push(t('adviceMorePhotos').replace('{n}', result.photoCount));
  }
  // タグ付き写真
  if (result.photoCount >= 3 && result.taggedPhotoCount < result.photoCount) {
    tips.push(t('adviceTagPhotos')
      .replace('{n}', result.taggedPhotoCount)
      .replace('{total}', result.photoCount));
  }
  // 写真コメント数
  if (result.photoCount >= 3 && result.photoCommentCount < result.photoCount) {
    tips.push(t('adviceMoreComments')
      .replace('{n}', result.photoCommentCount)
      .replace('{total}', result.photoCount));
  }
  // 全体感想
  if (result.overviewLen < 30) {
    tips.push(t('adviceLongerOverview').replace('{n}', result.overviewLen));
  }
  // 60分以内
  if (result.totalElapsedMin > 60) {
    tips.push(t('adviceUnder60').replace('{min}', Math.round(result.totalElapsedMin)));
  }
  // 距離
  if (result.distanceKm > 0 && result.distanceKm < 1.5) {
    tips.push(t('adviceMoreDistance').replace('{km}', result.distanceKm.toFixed(1)));
  }
  // ペース
  if (result.estimatedMin > 0 && result.userMoveMin > 0) {
    const ratio = result.userMoveMin / result.estimatedMin;
    if (ratio < 0.8 || ratio > 1.5) {
      tips.push(t('advicePace'));
    }
  }
  // ARキャラ捕獲
  if (result.captureCount === 0) {
    tips.push(t('adviceCatchChars'));
  } else if (result.visitCount > 0 && result.captureCount < result.visitCount) {
    tips.push(t('adviceCatchMoreChars').replace('{n}', result.captureCount));
  }
  if (tips.length === 0) tips.push(t('advicePerfect'));
  return tips;
}

// 合計点の絶対値で簡単な気分メッセージを返す（内訳の代わり）
function scoreMoodLabel(score) {
  if (score >= 1500) return t('mood_master');
  if (score >= 1000) return t('mood_great');
  if (score >=  500) return t('mood_good');
  if (score >=  200) return t('mood_almost');
  return t('mood_keepgoing');
}

function openScoreModal() {
  // 機能フラグでスコアが無効な言語ではモーダルを開かない（保険）
  if (!FEATURES.scoringEnabled) return;

  const result = calculateScore();
  $('score-total').textContent = `${result.total}${t('suffPoints')}`;
  $('score-rank-label').textContent = scoreMoodLabel(result.total);

  // 計画点 / 実行点 の内訳表示
  //   計画点は 0〜100 に正規化した独立指標（XX/100）で表示。
  //   実行点は従来どおりの生スコア（合計点・ランキングは生スコアのまま）。
  const planEl = $('score-plan');
  const execEl = $('score-exec');
  if (planEl) planEl.textContent = `${result.planScore100}/100`;
  if (execEl) execEl.textContent = `${result.execScore}${t('suffPoints')}`;

  // 弱点アドバイス（FEATURES.showScoreAdvice が true のときだけ）
  const adviceEl = $('score-advice');
  if (adviceEl) {
    if (FEATURES.showScoreAdvice) {
      const tips = buildScoreAdvice(result);
      adviceEl.innerHTML = `
        <div class="score-advice-title">${escapeHtml(t('scoreAdviceTitle'))}</div>
        <ul class="score-advice-list">${tips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>
      `;
      adviceEl.classList.remove('hidden');
    } else {
      adviceEl.classList.add('hidden');
    }
  }

  // ランキング送信ボタンも機能フラグで制御
  const submitBtn = $('score-submit-btn');
  if (submitBtn) {
    submitBtn.classList.toggle('hidden', !FEATURES.rankingEnabled);
  }

  // キャラ自動生成の導線（条件クリア＆未消費のときだけ）
  const genEntry = $('chargen-entry');
  if (genEntry) {
    const show = !!(state.charGen && state.charGen.eligible && !state.charGen.consumed);
    genEntry.classList.toggle('hidden', !show);
  }

  $('score-player-name').value = state.reportData.author || '';
  $('score-phase-input').classList.remove('hidden');
  $('score-phase-ranking').classList.add('hidden');
  $('score-modal').classList.remove('hidden');
}

// ===== キャラ自動生成: 表出フロー（3体シルエット→選択→カラー登場→命名→登録）=====
let _chargenCandidates = [];
let _chargenChosen = null;
let _chargenChosenName = '';

function chargenSetPhase(phase) {
  ['loading', 'pick', 'reveal', 'done'].forEach(p => {
    const el = $('chargen-phase-' + p);
    if (el) el.classList.toggle('hidden', p !== phase);
  });
}

async function openChargen() {
  if (!state.charGen || !state.charGen.eligible || state.charGen.consumed) return;
  $('chargen-modal').classList.remove('hidden');
  chargenSetPhase('loading');
  // 念のため: 変数ティーザーを閉じずにここへ来た等で未開始なら、ここで開始（おまかせ扱い）
  if (!state.charGen.result && !state.charGen.promise) startCharGenBg();
  let result = state.charGen.result;
  if (!result && state.charGen.promise) result = await state.charGen.promise;
  if (!result || !result.candidates || !result.candidates.length) {
    $('chargen-modal').classList.add('hidden');
    alert(t('chargenLoading'));
    return;
  }
  // 生成経路（実API/モック）の可視化: コンソールに必ず出力＋admin時はバッジ表示。
  const genDbg = getLastGenDebug();
  console.info('[chargen] source =', result.source, '｜', genDbg && genDbg.reason);
  updateChargenSourceBadge(result.source, genDbg && genDbg.reason);
  _chargenCandidates = result.candidates;
  _chargenChosen = null;
  _chargenChosenName = '';
  renderChargenSilhouettes(_chargenCandidates);
  chargenSetPhase('pick');
}

// 生成経路バッジ（テスト用）。admin ログイン中 or URLに ?debug=1 のとき表示。
// source: 'nanobanana'（実API）/ 'mock'（既存絵の色替え）。
function chargenDebugVisible() {
  try { if (location.search.indexOf('debug=1') >= 0) return true; } catch (_) { /* no-op */ }
  return isAdmin();
}
function updateChargenSourceBadge(source, reason) {
  const card = document.querySelector('#chargen-modal .chargen-content');
  if (!card) return;
  let badge = $('chargen-source-badge');
  if (!chargenDebugVisible()) { if (badge) badge.remove(); return; }
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'chargen-source-badge';
    // モーダル上部に帯として差し込む（in-flow＝クリップされない・確実に見える）
    badge.style.cssText = 'margin:4px 0 8px;padding:6px 10px;border-radius:10px;'
      + 'font-size:12px;font-weight:700;color:#fff;text-align:center;line-height:1.4;';
    card.insertBefore(badge, card.firstElementChild ? card.firstElementChild.nextSibling : null);
  }
  const real = source === 'nanobanana';
  badge.textContent = (real ? '🟢 実API（NanoBanana）' : '🟠 モック（既存絵の色替え）') + (reason ? '｜' + reason : '');
  badge.style.background = real ? '#2e7d32' : '#e07b00';
}

function renderChargenSilhouettes(cands) {
  const wrap = $('chargen-silhouettes');
  if (!wrap) return;
  wrap.innerHTML = cands.map((c, i) => `
    <button type="button" class="chargen-silhouette" data-idx="${i}">
      <img src="${escapeHtml(c.imageUrl || '')}" alt="" style="filter:${SILHOUETTE_FILTER}" />
      <span class="chargen-silhouette-q">？</span>
    </button>`).join('');
  wrap.querySelectorAll('.chargen-silhouette').forEach(btn => {
    btn.addEventListener('click', () => onChargenPick(parseInt(btn.dataset.idx, 10)));
  });
}

function onChargenPick(idx) {
  const cand = _chargenCandidates[idx];
  if (!cand) return;
  _chargenChosen = cand;
  _chargenChosenName = '';

  // カラー登場（実API画像があればそれを、無ければベース絵＋色替えフィルタ）
  const img = $('chargen-reveal-img');
  if (cand.imageDataUrl) {
    img.src = cand.imageDataUrl; img.style.filter = 'none';
  } else {
    img.src = cand.imageUrl || ''; img.style.filter = cand.colorFilter || 'none';
  }
  const rar = rarityById(cand.rarityId);
  const rarLabel = (rar.label && (rar.label[LANG] || rar.label.ja)) || '';
  $('chargen-rarity').textContent = `${rarLabel} ${'★'.repeat(rar.stars || 1)}`;

  // 命名候補（候補から選ぶ・自由入力なし）
  const names = nameCandidates(state.charGen.params.station, { ...(cand.vocab || {}), bodyId: cand.bodyId }, LANG === 'en' ? 'en' : 'ja');
  const nopt = $('chargen-name-options');
  nopt.innerHTML = names.map(n =>
    `<button type="button" class="chargen-name-opt" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('');
  nopt.querySelectorAll('.chargen-name-opt').forEach(b => {
    b.addEventListener('click', () => {
      _chargenChosenName = b.dataset.name;
      nopt.querySelectorAll('.chargen-name-opt').forEach(x => x.classList.toggle('selected', x === b));
      $('chargen-save-btn').disabled = false;
    });
  });
  $('chargen-save-btn').disabled = true;
  chargenSetPhase('reveal');
}

function onChargenSave() {
  if (!_chargenChosen || !_chargenChosenName) return;
  const p = state.charGen.params || {};
  const rec = saveGeneratedCharacter({
    name: _chargenChosenName,
    station: p.station,
    spots: p.spots,
    distanceKm: p.distanceKm,
    rarityId: _chargenChosen.rarityId,
    bodyId: _chargenChosen.bodyId,
    impressionId: _chargenChosen.impressionId,
    vocab: _chargenChosen.vocab,
    baseCharId: _chargenChosen.baseCharId,
    colorFilter: _chargenChosen.colorFilter,
    imageDataUrl: _chargenChosen.imageDataUrl,
  });
  state.charGen.consumed = true;
  patchSessionState({ charGenDone: true }); // #11: この探検では生成済み→再開しても再生成不可
  // #10 端末間同期: 実API画像を持つ生成キャラをサーバ保存（画像=Drive／メタ=Sheets）。
  //   fire-and-forget（失敗してもローカルには保存済み）。モック（画像なし）は同期しない。
  if (drive && rec.imageDataUrl) {
    drive.saveGeneratedCharacter({
      userId: accountUserId() || getExplorerId(),
      genId: rec.genId, name: rec.name, station: rec.station,
      rarityId: rec.rarityId, vocab: rec.vocab,
      imageDataUrl: rec.imageDataUrl, createdAt: rec.createdAt,
    }).catch(e => console.warn('[chargen] 生成キャラのサーバ保存失敗（ローカルには保存済）:', e));
  }
  $('chargen-done-msg').textContent = t('chargenDoneFmt').replace('{name}', rec.name);
  chargenSetPhase('done');
  const genEntry = $('chargen-entry');
  if (genEntry) genEntry.classList.add('hidden');
  if (!$('zukan-modal').classList.contains('hidden')) renderZukanGrid(loadCollection());
}

async function onSubmitScore() {
  const playerName = $('score-player-name').value.trim() || t('rankNoName');
  const result = calculateScore();
  const submitBtn = $('score-submit-btn');
  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = t('statusSavingScore');

  if (!drive) {
    alert(t('errRankingDriveDisabled'));
    submitBtn.disabled = false;
    submitBtn.textContent = original;
    return;
  }

  try {
    await drive.saveRanking({
      stationName: state.stationName,
      cityId: state.cityId || 'other',          // 地域単位（東京/名古屋/大阪/神戸/京都/その他）
      playerName,
      score: result.total,
      visitCount: result.visitCount,
      distanceM: result.distanceM,
      photoCount: result.photoCount,
      reportWordCount: result.reportWordCount,
      userId: getExplorerId(),                  // アカウントに紐づけ（履歴でスコアを突合）
      sessionId: state.sessionId || '',         // どの探検のスコアか
    });
    // 同じ地域内（例: 名古屋）のランキングを取得
    const ranking = await drive.getRanking({ cityId: state.cityId || 'other', limit: 10 });
    showRankingPhase(playerName, result.total, ranking);
  } catch (e) {
    alert(t('errRankingSendFailedFmt').replace('{err}', e.message || e));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
}

function showRankingPhase(myName, myScore, ranking) {
  // 地域名を解決（東京/名古屋/大阪/神戸/京都/その他）
  const regionKey = 'region_' + (state.cityId || 'other');
  const regionName = t(regionKey) || t('region_other');

  // 自分の順位
  const myRank = (ranking || []).findIndex(r =>
    r['プレーヤー名'] === myName && Number(r['スコア']) === Number(myScore)
  );
  let msg;
  if (myRank === 0) {
    msg = t('rankFirstFmt')
      .replace('{name}', myName)
      .replace('{score}', myScore)
      .replace('{region}', regionName);
  } else if (myRank > 0) {
    msg = t('rankYourFmt')
      .replace('{name}', myName)
      .replace('{n}', myRank + 1)
      .replace('{score}', myScore)
      .replace('{region}', regionName);
  } else {
    msg = t('rankNoplaceFmt')
      .replace('{name}', myName)
      .replace('{score}', myScore)
      .replace('{region}', regionName);
  }
  $('score-rank-message').innerHTML = msg.replace(/\n/g, '<br/>');

  // ランキング一覧（タイトルは地域名）
  $('ranking-station-name').textContent = t('regionAreaFmt').replace('{region}', regionName);
  const ol = $('ranking-list');
  ol.innerHTML = '';
  if (!ranking || ranking.length === 0) {
    ol.innerHTML = `<li style="text-align:center;color:#999;padding:20px;">${escapeHtml(t('rankNoRecords'))}</li>`;
  } else {
    ranking.forEach((r, i) => {
      const li = document.createElement('li');
      const isYou = (r['プレーヤー名'] === myName && Number(r['スコア']) === Number(myScore));
      if (isYou) li.classList.add('you');
      const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const stationLine = r['駅名']
        ? `<span class="ranking-station">${escapeHtml(r['駅名'])}</span>`
        : '';
      li.innerHTML = `
        <span class="ranking-rank ${rankCls}">${i + 1}</span>
        <span class="ranking-name">${escapeHtml(r['プレーヤー名'] || t('rankNoName'))}${isYou ? ' ' + escapeHtml(t('rankYou')) : ''}${stationLine}</span>
        <span class="ranking-score">${r['スコア']}${t('suffPoints')}</span>
      `;
      ol.appendChild(li);
    });
  }
  $('score-phase-input').classList.add('hidden');
  $('score-phase-ranking').classList.remove('hidden');
}

// reportData の JSON 直列化／復元（Setはそのままだと JSON にならないので配列で扱う）
function serializeReportData(rd) {
  return {
    date: rd.date || '',
    author: rd.author || '',
    overview: rd.overview || '',
    afterword: rd.afterword || '',
    photoComments: rd.photoComments || {},
    photoCommentsRaw: rd.photoCommentsRaw || {},
    excludedPhotoIds: Array.from(rd.excludedPhotoIds || []),
    // ARキャラの捕獲記録も report.json に相乗りさせて永続化する（P1実装）
    captures: (state.captures || []).map(c => ({ ...c })),
  };
}
function deserializeReportData(obj) {
  // 捕獲記録は state 側に復元する（reportData ではなくセッションデータのため）
  state.captures = Array.isArray(obj?.captures) ? obj.captures : [];
  return {
    date: obj?.date || '',
    author: obj?.author || '',
    overview: obj?.overview || '',
    afterword: obj?.afterword || '',
    photoComments: obj?.photoComments || {},
    photoCommentsRaw: obj?.photoCommentsRaw || {},
    excludedPhotoIds: new Set(obj?.excludedPhotoIds || []),
  };
}

// ノートの状態を Drive へ保存（手動 + 「ノートを保存」ボタン）
async function onSaveReportToDrive() {
  if (!drive || !state.sessionId) {
    alert(t('errReportDriveDisabled'));
    return;
  }
  const btn = $('save-report-btn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('statusSavingReport');
  try {
    await drive.saveReportData({
      sessionId: state.sessionId,
      reportData: serializeReportData(state.reportData),
    });
    btn.textContent = t('statusSavedReport');
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
  } catch (e) {
    console.error(e);
    alert(t('errReportSaveFailedFmt').replace('{err}', e.message || e));
    btn.textContent = original;
    btn.disabled = false;
  }
}

// 「ひと言メモをすっきり整える」ボタン。
// 写真ごとのひと言メモ（音声入力でつなぎ言葉が乗りやすい）を OpenAI で整形する。
// 元テキストは photoCommentsRaw に退避し、いつでも「元に戻す」ができる。
// 整形済み状態のときは、同じボタンが「元に戻す」として働く（トグル）。
async function onTidyMemos() {
  const btn = $('tidy-memos-btn');
  if (!btn || btn.disabled) return;

  const rd = state.reportData;
  if (!rd.photoCommentsRaw) rd.photoCommentsRaw = {};

  // すでに整形済み（退避テキストがある）→ 元に戻す
  if (Object.keys(rd.photoCommentsRaw).length > 0) {
    Object.entries(rd.photoCommentsRaw).forEach(([fileId, raw]) => {
      rd.photoComments[fileId] = raw;
    });
    rd.photoCommentsRaw = {};
    renderReportPhotos();
    setTidyButtonState(false);
    return;
  }

  // 整形対象＝表示中の写真のうち、中身のあるメモ
  const visibleIds = new Set(
    getPhotosInVisitOrder()
      .filter(p => !rd.excludedPhotoIds.has(p.fileId))
      .map(p => p.fileId)
  );
  const targets = Object.keys(rd.photoComments)
    .filter(fileId => visibleIds.has(fileId))
    .filter(fileId => (rd.photoComments[fileId] || '').trim().length > 0);

  if (targets.length === 0) {
    alert(t('tidyMemosNone'));
    return;
  }
  if (!CONFIG.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY') {
    alert(t('tidyMemosNoKey'));
    return;
  }
  if (!confirm(t('tidyMemosConfirm'))) return;

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('tidyMemosRunning');

  const raw = {};
  let errorCount = 0;
  // 並列で整形（写真は多くないので gpt-4o-mini の並列で十分速い）
  await Promise.all(targets.map(async fileId => {
    const before = rd.photoComments[fileId];
    try {
      const cleaned = await tidyMemo(before, CONFIG.OPENAI_API_KEY);
      // 実際に変化があったメモだけ退避（元に戻す対象にする）
      if (cleaned && cleaned !== before) {
        raw[fileId] = before;
        rd.photoComments[fileId] = cleaned;
      }
    } catch (e) {
      console.warn('[tidy-memos] 整形失敗（元のメモを保持）:', fileId, e);
      errorCount++;
    }
  }));

  rd.photoCommentsRaw = raw;
  renderReportPhotos();

  const changed = Object.keys(raw).length;
  if (changed > 0) {
    setTidyButtonState(true);
    alert(errorCount > 0 ? t('tidyMemosDonePartial') : t('tidyMemosDone'));
  } else {
    // 変化なし（すでにきれい / 全部失敗）
    btn.disabled = false;
    btn.textContent = original;
    alert(errorCount > 0 ? t('tidyMemosError') : t('tidyMemosAlreadyClean'));
  }
}

// 整形ボタンの見た目を「整形」⇄「元に戻す」で切り替える
function setTidyButtonState(tidied) {
  const btn = $('tidy-memos-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = tidied ? t('btnTidyMemosUndo') : t('btnTidyMemos');
}

// ===== STEP 5: レポート =====
// ===== キャラ自動生成（Phase 1）=====
// レポート表示の"前"に作成可否を判定し、可なら3体を裏で先行生成しておく（レイテンシ隠蔽）。
// 表出はスコア表示後にユーザーが「むかえる」を押したとき（openChargen）。
function parseKm(distanceText) {
  const m = String(distanceText || '').match(/([\d.]+)\s*(km|m)\b/i);
  if (!m) return 0;
  const v = parseFloat(m[1]) || 0;
  return /km/i.test(m[2]) ? v : v / 1000;
}
function buildGenSummary() {
  const score = FEATURES.scoringEnabled ? calculateScore() : { execScore: 0 };
  const meaningfulSpots = new Set(
    (state.uploadedPhotos || [])
      .map(p => p.spotName)
      .filter(n => n && n !== PHOTO_TAG_START && n !== PHOTO_TAG_GOAL)
  );
  const gps = new Set(
    (state.captures || [])
      .filter(c => c.lat != null && c.lng != null)
      .map(c => `${(+c.lat).toFixed(3)},${(+c.lng).toFixed(3)}`)
  );
  return {
    execScore: score.execScore || 0,
    spotsWithPhotos: meaningfulSpots.size,
    distinctGpsPoints: gps.size,
    distanceKm: parseKm(state.routeStats && state.routeStats.distanceText),
  };
}
function maybeStartCharGen() {
  state.charGen = { eligible: false, consumed: false, result: null, promise: null, params: null, summary: null, rarityId: 'common', userPicks: null };
  if (!FEATURES.scoringEnabled) return; // Phase 1 はスコア有効言語のみ
  const summary = buildGenSummary();
  const elig = evaluateEligibility(summary);
  state.charGen.summary = summary;
  // admin マスターモードは生成ゲートを無条件で通す（テスト用・非adminには一切影響しない）。
  const adminBypass = isAdmin();
  state.charGen.eligible = elig.ok || adminBypass;
  state.charGen.consumed = !!loadSessionState().charGenDone; // #11: 既に今探検で生成済みなら再生成不可
  state.charGen.rarityId = elig.rarity.id;
  console.info('[chargen] eligibility', elig.ok, elig.reasons, summary, adminBypass ? '(admin bypass)' : '', state.charGen.consumed ? '(already generated)' : '');
  if (!state.charGen.eligible || state.charGen.consumed) return;
  const spots = (state.orderedSpots || []).map(s => s.name);
  state.charGen.params = { station: state.stationName, spots, distanceKm: summary.distanceKm, userPicks: null };
  // ※生成の開始は case X の変数選択（openChargenPickModal → finalizeChargenPick）確定後。
}

// 先行生成を裏で開始（変数選択の確定後・重複開始しない）
function startCharGenBg() {
  if (!state.charGen || !state.charGen.params || state.charGen.promise) return;
  state.charGen.promise = startGeneration(state.charGen.params)
    .then(r => { state.charGen.result = r; return r; })
    .catch(e => { console.warn('[chargen] 先行生成失敗', e); return null; });
}

// case X: 変数選択ティーザー（探検おわり時に すき を選ぶ）
let _chargenVarMotif = null;
let _chargenVarAtmo = null;
function openChargenPickModal() {
  if (!state.charGen || !state.charGen.eligible || state.charGen.consumed) return;
  if (state.charGen.promise) return; // 既に生成開始済みなら出さない
  _chargenVarMotif = null;
  _chargenVarAtmo = null;
  const choices = getUserVocabChoices();
  const buildChips = (containerId, list, onPick) => {
    const c = $(containerId);
    if (!c) return;
    c.innerHTML = (list || []).map(k =>
      `<button type="button" class="chargen-var-chip" data-k="${escapeHtml(k)}">${escapeHtml(k)}</button>`).join('');
    c.querySelectorAll('.chargen-var-chip').forEach(b => b.addEventListener('click', () => {
      c.querySelectorAll('.chargen-var-chip').forEach(x => x.classList.toggle('selected', x === b));
      onPick(b.dataset.k);
    }));
  };
  buildChips('chargen-var-motif', choices.motif, k => { _chargenVarMotif = k; });
  buildChips('chargen-var-atmo', choices.atmosphere, k => { _chargenVarAtmo = k; });
  $('chargen-pick-modal').classList.remove('hidden');
}
function finalizeChargenPick(useSelection) {
  const picks = {};
  if (useSelection) {
    if (_chargenVarMotif) picks.motif = _chargenVarMotif;
    if (_chargenVarAtmo) picks.atmosphere = _chargenVarAtmo;
  }
  if (state.charGen) {
    state.charGen.userPicks = picks;
    if (state.charGen.params) state.charGen.params.userPicks = picks;
  }
  $('chargen-pick-modal').classList.add('hidden');
  startCharGenBg(); // 選択が済んだので裏で先行生成
  // #6 生成フローの断絶緩和: 選択→即スコア画面で途切れないよう、進行を明示する。
  showToast(t('chargenBrewingToast', '✨ なかまを つくっているよ！ スコアのあとで あえるよ'), 3000);
}

function onStartReport() {
  // ★キャラ自動生成: レポート生成の前に可否判定（生成開始は変数選択の後）
  try { maybeStartCharGen(); } catch (e) { console.warn('[chargen] eligibility skip', e); }

  // メタ情報初期化（日付はシステム側で自動入力しない。ユーザーが date picker で入力）
  $('report-date').value = state.reportData.date || '';
  $('report-author').value = state.reportData.author || '';
  $('report-station').textContent = state.stationName
    ? t('reportStationFmt').replace('{name}', localizeStationName(state.stationName, LANG))
    : '';
  $('report-overview').value = state.reportData.overview || '';
  $('report-afterword').value = state.reportData.afterword || '';

  renderReportPhotos();
  renderReportCharacters();
  // 整形ボタンの状態を復元（保存セッションで整形済みなら「元に戻す」表示）
  setTidyButtonState(Object.keys(state.reportData.photoCommentsRaw || {}).length > 0);
  showStep('step-report');

  // ステップ表示後（display:none が外れた後）に textarea の高さを再計算する。
  // 初回 setupAutoResize の grow() は hidden 状態だと scrollHeight=0 で no-op になるため
  // ここで明示的に再トリガする。
  requestAnimationFrame(() => {
    document.querySelectorAll('.report-page textarea').forEach(t => {
      if (t._autoGrow) t._autoGrow();
    });
  });

  // case X: 条件クリアなら「どんなのが すき？」ティーザーを軽く出す（レポート描画後）。
  // 選択/おまかせで裏の先行生成が始まり、スコア後に「むかえる」で表出する。
  if (state.charGen && state.charGen.eligible && !state.charGen.promise) {
    setTimeout(() => openChargenPickModal(), 500);
  }
}

// 写真を「行った順」に並び替える
// 順序: スタート駅 → orderedSpots[0..N-1] → ゴール駅 → 未タグ
function getPhotosInVisitOrder() {
  const order = state.orderedSpots.map(s => s.name);
  const orderIndex = name => {
    if (name === PHOTO_TAG_START) return -1;             // 一番前
    if (name === PHOTO_TAG_GOAL)  return order.length;   // スポット群の直後
    const idx = order.indexOf(name);
    return idx < 0 ? Infinity : idx;                     // 未タグは最後
  };
  return [...state.uploadedPhotos].sort((a, b) => {
    const oa = orderIndex(a.spotName);
    const ob = orderIndex(b.spotName);
    if (oa !== ob) return oa - ob;
    // 同じスポット内では撮影順（fileId or createdの代用として配列順を維持）
    return state.uploadedPhotos.indexOf(a) - state.uploadedPhotos.indexOf(b);
  });
}

// fileId から捕獲キャラを返す（捕獲写真でなければ null）
function captureCharForPhoto(fileId) {
  const rec = (state.captures || []).find(c => c.photoFileId === fileId);
  return rec ? characterById(rec.characterId) : null;
}

// 「今回であったキャラたち」欄（捕獲したユニーク種を bonus ポーズで一覧表示）
function renderReportCharacters() {
  const section = $('report-characters-section');
  const wrap = $('report-characters');
  if (!section || !wrap) return;
  const ids = [...new Set((state.captures || []).map(c => c.characterId))];
  if (ids.length === 0) {
    section.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  section.classList.remove('hidden');
  wrap.innerHTML = ids.map(id => {
    const ch = characterById(id);
    if (!ch) return '';
    return `
      <div class="report-character-item">
        <img src="${characterImageUrl(ch, 'captured')}" alt="${escapeHtml(charDisplayName(ch))}" />
        <div class="report-character-name">${escapeHtml(charDisplayName(ch))}</div>
      </div>`;
  }).join('');
}

function renderReportPhotos() {
  const wrap = $('report-photos');
  wrap.innerHTML = '';

  // STEP 4 で除外された写真はそもそもレポートに含めない
  const photos = getPhotosInVisitOrder()
    .filter(p => !state.reportData.excludedPhotoIds.has(p.fileId));
  if (photos.length === 0) {
    wrap.innerHTML = `<p class="report-hint">${escapeHtml(t('reportNoPhotos'))}</p>`;
    return;
  }

  // 写真をページ単位の .report-photo-page グループに格納し、PDF生成時に「割らない単位」として扱う。
  //   - 1ページ目は 4 枚（タイトル＋全体感想と同居するためスペース節約）
  //   - 2ページ目以降は 6 枚ずつ（ページ全体を写真で使う）
  // ユーザーが大量にコメントを書いてグループがページ高を超えた場合は、個別カード単位で
  // フォールバック分割される（写真自体は決して割れない）。
  const FIRST_PAGE_PHOTOS = 4;
  const NEXT_PAGES_PHOTOS = 6;
  let groupSize = FIRST_PAGE_PHOTOS;
  let inGroupCount = 0;
  let currentPage = null;
  photos.forEach((photo, i) => {
    if (currentPage === null || inGroupCount >= groupSize) {
      currentPage = document.createElement('div');
      currentPage.className = 'report-photo-page';
      wrap.appendChild(currentPage);
      inGroupCount = 0;
      // 2 グループ目以降は 6 枚枠に切り替え（i>0 のとき = 2グループ目以降）
      if (i > 0) groupSize = NEXT_PAGES_PHOTOS;
    }
    const item = document.createElement('div');
    item.className = 'report-photo-item';
    item.dataset.fileId = photo.fileId;
    // タグなし時は判別できる class を付ける（CSS で PDF時のみ非表示にする）
    const tagHtml = photo.spotName
      ? `<span class="report-photo-tag">📍 ${escapeHtml(photoTagDisplayLabel(photo.spotName))}</span>`
      : `<span class="report-photo-tag report-photo-tag-empty">${escapeHtml(t('photoTagless'))}</span>`;
    // 捕獲写真には「つかまえた！」バッジを付ける
    const capChar = captureCharForPhoto(photo.fileId);
    const capBadgeHtml = capChar
      ? `<span class="report-capture-badge">${escapeHtml(t('reportCaptureBadgeFmt').replace('{name}', charDisplayName(capChar)))}</span>`
      : '';
    // 画像ソース選択：blob URL（サムネ）→ Drive URL（フォールバック） の順で試す
    // 最初の src が読めない場合に備えて候補チェーンを保存し、img.onerror で順送りに
    const imgCandidates = [
      photo.url,
      photo.thumbnailUrl,
      photo.driveThumbnailUrl,
      photo.driveUrl,
    ].filter(Boolean);
    const imgSrc = imgCandidates[0] || '';
    item.innerHTML = `
      <div class="report-photo-img-wrap">
        <img src="${imgSrc}" alt="${escapeHtml(photo.fileName || '')}" data-fallback-idx="0" />
      </div>
      <div class="report-photo-meta">
        <div>
          <span class="report-photo-order">${i + 1}</span>
          ${tagHtml}
          ${capBadgeHtml}
        </div>
        <textarea class="report-photo-comment" rows="1"
          placeholder="${escapeHtml(t('photoCommentPlaceholder'))}"
        >${state.reportData.photoComments[photo.fileId] || ''}</textarea>
      </div>
    `;

    // 写真ロード後の処理：
    //  1) 自然な縦横比から実寸（mm）を計算し、インラインで width / height を設定
    //     → html2canvas が object-fit: contain を完全実装していないため、明示寸法で確実に縦横比を維持
    //  2) 横長判定（naturalWidth > naturalHeight）で .landscape クラス付与
    //     → CSS で「写真上 + コメント下」のレイアウトに切り替え
    const imgEl = item.querySelector('img');

    // src が読めなかった場合は候補チェーンを順送りに試す（自己回復）
    imgEl.addEventListener('error', () => {
      const idx = parseInt(imgEl.dataset.fallbackIdx || '0', 10);
      const next = idx + 1;
      const nextSrc = imgCandidates[next];
      if (nextSrc) {
        console.warn(`[report] img ${idx} 失敗 (${imgEl.src.slice(0, 60)}...) → 候補${next} へフォールバック`);
        imgEl.dataset.fallbackIdx = String(next);
        imgEl.src = nextSrc;
      } else {
        console.error(`[report] 全画像候補が失敗:`, photo.fileName, imgCandidates);
      }
    });
    const ENVELOPE_MM = 100; // 1ページ6枚に収めるための写真の長辺
    const applyImageSize = () => {
      if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;
      const aspect = imgEl.naturalWidth / imgEl.naturalHeight;
      let widthMm, heightMm;
      if (aspect >= 1) {
        // 横長 / 正方形 — 長辺は幅
        widthMm = ENVELOPE_MM;
        heightMm = ENVELOPE_MM / aspect;
        if (aspect > 1.05) item.classList.add('landscape');
      } else {
        // 縦長 — 長辺は高さ
        heightMm = ENVELOPE_MM;
        widthMm = ENVELOPE_MM * aspect;
      }
      imgEl.style.width = widthMm.toFixed(2) + 'mm';
      imgEl.style.height = heightMm.toFixed(2) + 'mm';
    };
    if (imgEl.complete && imgEl.naturalWidth) applyImageSize();
    else imgEl.addEventListener('load', applyImageSize);

    // 感想テキストの永続化 + 自動リサイズ
    const commentEl = item.querySelector('.report-photo-comment');
    commentEl.addEventListener('input', e => {
      state.reportData.photoComments[photo.fileId] = e.target.value;
    });
    setupAutoResize(commentEl);

    currentPage.appendChild(item);
    inGroupCount++;
  });

  // 画面6（PDF装飾）: 各写真グループの右上角に TAFFY の額縁アクセント
  // （素材未着時は onerror で自動除去。編集画面ではうっすら、PDF出力時に本表示）
  wrap.querySelectorAll('.report-photo-page').forEach(page => {
    const deco = document.createElement('img');
    deco.className = 'report-guide rg-taffy';
    deco.alt = '';
    deco.addEventListener('error', () => deco.remove());
    deco.src = GUIDE_BASE + 'taffy_g6.png';
    page.appendChild(deco);
  });
}

// テキストエリアを「内容に応じて高さを自動拡張する」よう設定する。
// resize: none + overflow: hidden の textarea に対し、input ごとに
// scrollHeight に合わせて height を再設定して、ユーザーの入力が
// 常に全部見えるようにする（はみ出し防止）。
//
// ※ 初回設定時にステップが display:none のときは scrollHeight=0 になるため、
//    onStartReport 側で showStep の後に明示的に再トリガする必要がある。
//    そのため grow を `el._autoGrow` として外から呼べるようにしておく。
function setupAutoResize(textarea) {
  if (!textarea || textarea._autoResize) return;
  textarea._autoResize = true;
  const grow = () => {
    if (textarea.offsetParent === null) return; // display:none のときはスキップ
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };
  textarea._autoGrow = grow;
  textarea.addEventListener('input', grow);
  // 初期化：DOM がレイアウト確定したタイミングで一度実行（hidden なら no-op）
  requestAnimationFrame(grow);
  // フォントロード後にも再計算（Klee One が読み込まれて高さが変わるため）
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(grow);
  }
}

// レポートテキストの自動保存
function bindReportInputs() {
  ['report-date', 'report-author', 'report-overview', 'report-afterword'].forEach(id => {
    const el = $(id);
    if (!el || el._bound) return;
    el._bound = true;
    el.addEventListener('input', () => {
      const key = id.replace('report-', '');
      state.reportData[key] = el.value;
    });
  });
  // overview / afterword は内容に合わせて自動拡張
  ['report-overview', 'report-afterword'].forEach(id => {
    const el = $(id);
    if (el) setupAutoResize(el);
  });
}

// PDF生成時にだけオリジナル解像度を取得し、photo.fullBlobUrl に保存する。
// 編集画面の <img src> は photo.url（サムネ）のまま固定 → 編集画面は軽量・高速のまま。
// 新規アップロード（photo.fullBlobUrl が url と同じ＝ローカルファイル）は再フェッチ不要なのでスキップ。
async function ensureFullResolutionPhotos(progressCb) {
  // photo.fullBlobUrl がまだ無いものだけ対象
  // 新規アップロードは upload 時に fullBlobUrl = url を仕込んでいるため、復元写真のみ該当
  const targets = state.uploadedPhotos.filter(p => !p.fullBlobUrl);
  if (targets.length === 0) return;
  let done = 0;
  const total = targets.length;
  if (progressCb) progressCb(done, total);
  const CONCURRENCY = 3;
  const queue = [...targets];
  const worker = async () => {
    while (queue.length > 0) {
      const p = queue.shift();
      try {
        const data = await drive.getPhotoData(p.fileId);
        const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: data.mimeType || 'image/jpeg' });
        // photo.url（サムネ）は触らず、別フィールドに保存
        p.fullBlobUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.warn('[pdf] full-res fetch failed:', p.fileId, e);
        // フォールバック：サムネを fullBlobUrl 扱いにする（PDF も結局サムネで作られる）
        p.fullBlobUrl = p.url;
      } finally {
        done++;
        if (progressCb) progressCb(done, total);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
}

// PDF生成後にフル解像度 blob を解放してメモリを戻す
// （編集画面はサムネに戻り、再度 PDF を出す時は再フェッチ）
function releaseFullResolutionBlobs() {
  state.uploadedPhotos.forEach(p => {
    // url（サムネ）と異なる blob URL のみ解放（同じ場合は revoke するとサムネも壊れる）
    if (p.fullBlobUrl && p.fullBlobUrl !== p.url) {
      URL.revokeObjectURL(p.fullBlobUrl);
    }
    p.fullBlobUrl = null;
  });
}

async function onReportPdf() {
  const btn = $('report-pdf-btn');
  const original = btn.textContent;
  btn.textContent = t('statusGeneratingPdf');
  btn.disabled = true;

  // PDF生成用に固定幅で描画
  const page = document.querySelector('.report-page');
  page.classList.add('pdf-rendering');

  // PDF生成中だけ <img src> をフル解像度へ差し替えるための記録
  // finally で必ず元の src（サムネ）に戻す
  const swappedImgs = [];

  try {
    // 復元セッションでサムネのみの写真は、PDF生成前にオリジナル解像度を取得する
    // （photo.url（サムネ）は触らず、photo.fullBlobUrl に保存される）
    await ensureFullResolutionPhotos((done, total) => {
      btn.textContent = `${t('statusGeneratingPdf')} (${done}/${total})`;
    });

    // 各 report-photo-item の <img> を一時的にフル解像度へ swap
    // （編集画面のサムネ表示は保持したまま、html2canvas が捕捉する DOM だけ高解像度化）
    const items = page.querySelectorAll('.report-photo-item');
    items.forEach(item => {
      const fileId = item.dataset.fileId;
      if (!fileId) return;
      const photo = state.uploadedPhotos.find(p => p.fileId === fileId);
      if (!photo || !photo.fullBlobUrl || photo.fullBlobUrl === photo.url) return;
      const img = item.querySelector('.report-photo-img-wrap img');
      if (!img) return;
      swappedImgs.push({ img, originalSrc: img.src });
      img.src = photo.fullBlobUrl;
    });

    if (swappedImgs.length > 0) {
      // 差し替えた <img> がロード完了するまで待つ
      // ※ complete は失敗確定でも true。成功のみ既決扱いにすると、失敗確定済みの
      //   画像を永遠に待つデッドロックになる（地図PDFで実際に発生したバグと同型）
      await Promise.all(swappedImgs.map(({ img }) => {
        if (img.complete) return Promise.resolve();
        return new Promise(res => {
          img.addEventListener('load', res, { once: true });
          img.addEventListener('error', res, { once: true });
          setTimeout(res, 20000); // 保険
        });
      }));
    }
    btn.textContent = t('statusGeneratingPdf');

    // Webフォント (Klee One regular/bold / Yusei Magic) のロード完了を待つ。
    // → 待たないと html2canvas が初期表示時のフォールバックフォントで描画してしまう。
    // Klee One bold (600) はユーザーコメント用なので、明示的に load() を呼んで
    // フェッチを発火させる必要がある（普段の編集画面では 400 しか使っていない）。
    if (document.fonts && document.fonts.load) {
      try {
        await Promise.all([
          document.fonts.load("28px 'Klee One'"),
          document.fonts.load("bold 28px 'Klee One'"),
          document.fonts.load("28px 'Yusei Magic'"),
        ]);
      } catch (e) {
        console.warn('[pdf] font preload partial failure:', e);
      }
    }
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // html2canvas で画像化（B3の解像度: scale=2 で十分）
    // windowWidth=1400 でモバイル用 @media (max-width: 768px) を無効化し、
    // PDF はデスクトップレイアウトで描画する
    // onclone でクローン側の form要素を「描画用テキスト」に置換する
    //
    // 写真ブロックの Y 範囲はライブDOMではなく **クローン側のDOM** で測定する必要がある。
    //   - ライブDOMはユーザーのウィンドウ幅に依存（max-width: 100% で縮められる）
    //   - クローンは windowWidth=1400 で再レイアウトされるので、canvas 座標と一致する
    // クローンが破棄される前（onclone 内）に rect を取得して外スコープに保存する。
    // ★モバイル対策: スマホブラウザの canvas 上限（約1,600万画素・1辺約16,000px）を
    // 超えると描画が固まる／空になるため、コンテンツ量に応じて scale を自動で下げる。
    // scrollHeight は 1400px 幅換算より大きめに出る（＝安全側の見積もり）。
    let SCALE = 2;
    {
      const estW = 1400;
      const estH = Math.max(1, page.scrollHeight);
      const MAX_PIXELS = 14000000;
      const MAX_DIMENSION = 14000;
      if (estW * estH * SCALE * SCALE > MAX_PIXELS) {
        SCALE = Math.max(0.8, Math.sqrt(MAX_PIXELS / (estW * estH)));
      }
      if (estH * SCALE > MAX_DIMENSION) {
        SCALE = Math.min(SCALE, MAX_DIMENSION / estH);
      }
      console.info(`[report-pdf] estH=${estH}px scale=${SCALE.toFixed(2)}`);
    }
    let blockRanges = [];
    const canvas = await html2canvas(page, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: 1400,
      onclone: (clonedDoc) => {
        const clonedPage = clonedDoc.querySelector('.report-page');
        if (!clonedPage) return;
        // 除外写真は非表示
        clonedPage.querySelectorAll('.report-photo-item.excluded').forEach(el => {
          el.style.display = 'none';
        });
        // 「レポートに載せる」チェックUIは印刷不要 → 隠す
        clonedPage.querySelectorAll('.report-photo-include').forEach(el => {
          el.style.display = 'none';
        });
        // textarea / input を div / span へ置換（値が確実にレンダリングされる）
        // 28px font × line-height 1.8 ≒ 50px/行 を minHeight の基準にする。
        // id を引き継ぐことで `#report-overview { font-size: 28px }` 等のルールが
        // 置換後の要素にもそのまま効く（id 引き継ぎが無いと PDF でテキストが
        // 16pxに縮んで出力される）。
        clonedPage.querySelectorAll('textarea').forEach(t => {
          const div = clonedDoc.createElement('div');
          if (t.id) div.id = t.id;
          div.className = (t.className || '') + ' pdf-text-block';
          div.textContent = t.value || '';
          // 元のサイズを概ね継承（空欄でも rows 分の高さは確保）
          div.style.minHeight = (t.rows ? t.rows * 50 : 150) + 'px';
          div.style.whiteSpace = 'pre-wrap';
          div.style.wordBreak = 'break-word';
          t.parentNode.replaceChild(div, t);
        });
        clonedPage.querySelectorAll('input[type="text"], input[type="date"]').forEach(inp => {
          const span = clonedDoc.createElement('span');
          if (inp.id) span.id = inp.id;
          // .pdf-input-value は CSS でユーザーコメント用のフォント（Hachi Maru Pop）を指定する目印
          span.className = 'pdf-input-value';
          span.textContent = inp.value || '';
          span.style.borderBottom = '2px solid #999';
          span.style.padding = '4px 8px';
          span.style.fontSize = '22px';
          span.style.minWidth = '180px';
          span.style.display = 'inline-block';
          inp.parentNode.replaceChild(span, inp);
        });

        // 上記の表示変更後、レイアウトを強制計算してから写真ブロックの位置を取得。
        // 取得した rect はクローンドキュメントの座標 → canvas 座標へは × SCALE で変換。
        //
        // ★ 視覚オーバーフロー対応 ★
        // .report-photo-item は box-shadow（下にぼかし）、::before のマスキングテープ
        // （上端 -10px）、transform: rotate(±0.9°) によって、要素本体の bbox
        // よりも視覚的な描画範囲が広い。getBoundingClientRect は本体の bbox しか
        // 返さないので、そのまま使うと findSafeSplit が「装飾の途中」で改ページしてしまい
        // ・影だけ次ページに少し残る
        // ・マステが前ページに見切れる
        // などの「装飾が中途半端に切れる」問題が起きる。
        // → 上下方向にバッファを足して「割らないゾーン」を装飾分まで広げる。
        const VISUAL_OVERFLOW_PX = 28; // shadow ~14 + tape ~12 + rotation の余裕
        void clonedPage.offsetHeight; // force reflow
        const pageRect = clonedPage.getBoundingClientRect();
        // 「割らないブロック」として 6枚グループ (.report-photo-page) を最優先、
        // 個別カード (.report-photo-item) もフォールバック用に同時にトラックする。
        // findSafeSplit は両方を見て、グループ境界を優先しつつ、グループがページ高を
        // 超える場合のみ個別カード境界で分割する（写真が中途半端に割れない）。
        const blocks = clonedPage.querySelectorAll('.report-photo-page, .report-photo-item');
        blockRanges = Array.from(blocks)
          .filter(el => {
            // display:none / 排他要素を除外
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.width > 0;
          })
          .map(el => {
            const r = el.getBoundingClientRect();
            return {
              top:    ((r.top    - pageRect.top) - VISUAL_OVERFLOW_PX) * SCALE,
              bottom: ((r.bottom - pageRect.top) + VISUAL_OVERFLOW_PX) * SCALE,
            };
          })
          .sort((a, b) => a.top - b.top);
      },
    });

    const { jsPDF } = window.jspdf;
    // B3 縦：364mm × 515mm
    const pdf = new jsPDF({ unit: 'mm', format: 'b3', orientation: 'portrait' });
    const pdfW = pdf.internal.pageSize.getWidth();   // 364
    const pdfH = pdf.internal.pageSize.getHeight();  // 515

    // desired Y で分割するとブロックを割ってしまう場合、そのブロックの上端まで戻して安全に分割。
    // ブロックがページ高さより大きく minAdvance も確保できないケースは諦めて分割する（無限ループ防止）。
    const findSafeSplit = (desired, lowerBound) => {
      const minAdvance = 200;
      let cutAt = desired;
      for (const r of blockRanges) {
        if (r.top < desired && r.bottom > desired) {
          // r.top が現ページ内（lowerBound 以降）で、minAdvance より十分先にあれば
          // そこを区切りにする。それより前なら諦め（ブロックがページ高さを超えている）。
          if (r.top > lowerBound + minAdvance && r.top < cutAt) {
            cutAt = r.top;
          }
        }
      }
      return cutAt;
    };

    // B3 1ページあたりの canvas ピクセル高さ
    const pageHeightPx = (pdfH * canvas.width) / pdfW;

    // === パス1: スライスを生成して配列に集める（ページ数を確定するため）===
    const slices = [];
    let offsetPx = 0;
    while (offsetPx < canvas.height) {
      const remaining = canvas.height - offsetPx;
      let sliceHeight;
      if (remaining <= pageHeightPx) {
        sliceHeight = remaining;
      } else {
        const desired = offsetPx + pageHeightPx;
        const safeY = findSafeSplit(desired, offsetPx);
        sliceHeight = Math.max(1, Math.floor(safeY - offsetPx));
      }
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const sctx = slice.getContext('2d');
      sctx.fillStyle = '#ffffff';
      sctx.fillRect(0, 0, slice.width, slice.height);
      sctx.drawImage(canvas, 0, -offsetPx);
      slices.push({
        data: slice.toDataURL('image/jpeg', 0.92),
        heightMm: (sliceHeight * pdfW) / canvas.width,
      });
      offsetPx += sliceHeight;
    }
    const totalPages = slices.length;

    // === ヘッダー画像を1度だけ html2canvas でレンダリング（複数ページのときだけ）===
    // 2ページ目以降の上部に貼り付ける。日本語/英語/ひらがなを含むので
    // jsPDF native font では描画できないため html2canvas 経由で画像化。
    let headerImgData = null;
    let headerHeightMm = 0;
    if (totalPages > 1) {
      const localStation = localizeStationName(state.stationName, LANG);
      const headerText = t('reportPdfHeaderFmt').replace('{name}', localStation);
      const headerWrap = document.createElement('div');
      headerWrap.style.cssText = `
        position: fixed; top: -10000px; left: 0; width: 1376px;
        background: #ffffff; color: #4a6a4a;
        padding: 8px 30px;
        font-family: 'Klee One', 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif;
        font-size: 14px;
        font-weight: 600;
        border-bottom: 1.5px solid #c5e1a5;
        box-sizing: border-box;
      `;
      headerWrap.textContent = headerText;
      document.body.appendChild(headerWrap);
      try {
        const hcanvas = await html2canvas(headerWrap, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
        });
        headerImgData = hcanvas.toDataURL('image/jpeg', 0.92);
        headerHeightMm = (hcanvas.height * pdfW) / hcanvas.width;
      } finally {
        headerWrap.remove();
      }
    }

    // === パス2: 各ページに slice + ヘッダー（2ページ目以降）+ ページ番号フッターを配置 ===
    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage();
      // 本体スライス
      pdf.addImage(slices[i].data, 'JPEG', 0, 0, pdfW, slices[i].heightMm);

      // ヘッダー（2ページ目以降のみ）：上部に重ねて貼り付け
      if (i > 0 && headerImgData) {
        pdf.addImage(headerImgData, 'JPEG', 0, 0, pdfW, headerHeightMm);
      }

      // フッター: ページ番号 "X / Y"（ASCII なので jsPDF native font で OK）
      // 1ページしかないときは煩わしいので省略
      if (totalPages > 1) {
        pdf.setFontSize(11);
        pdf.setTextColor(120, 140, 120); // 薄い緑グレー
        pdf.text(`${i + 1} / ${totalPages}`, pdfW / 2, pdfH - 5, { align: 'center' });
      }
    }

    const fname = `tanken-note_${state.stationName || 'unknown'}_${new Date().toISOString().slice(0,10)}.pdf`;
    pdf.save(fname);
  } catch (e) {
    console.error(e);
    alert(t('errPdfFailedFmt').replace('{err}', e.message || e));
  } finally {
    // 差し替えた <img src> をサムネに戻す（編集画面が再びサムネ表示に戻る）
    for (const { img, originalSrc } of swappedImgs) {
      img.src = originalSrc;
    }
    // フル解像度 blob を解放してメモリを戻す（次回 PDF 生成時は再フェッチ）
    releaseFullResolutionBlobs();
    page.classList.remove('pdf-rendering');
    btn.textContent = original;
    btn.disabled = false;
  }
}

// ===== PDF生成 =====
async function onDownloadPdf() {
  const btn = $('download-pdf-btn');
  const original = btn.textContent;
  btn.textContent = t('statusGeneratingPdf');
  btn.disabled = true;
  try {
    await generateMapPdf({
      stationName: state.stationName,
      orderedSpots: state.orderedSpots,
      stats: state.routeStats,
      origin: state.stationLocation,
      directions: state.directionsResult,
      apiKey: CONFIG.GOOGLE_MAPS_API_KEY,
      // どの段階で止まっているか分かるよう、ボタンに進捗を表示する
      onProgress: msg => { btn.textContent = msg; },
    });
  } catch (e) {
    alert(t('errPdfFailedFmt').replace('{err}', e.message || e));
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

// ===== イベントリスナー =====
// 自由入力モードからの検索もフィルタを渡す（駅名は input 値から取る）
const searchFromInput = () => {
  const stationName = $('station-input').value.trim();
  if (!stationName) return;
  onSearchStation({ stationName, dateTimeFilter: getDateTimeFilter() });
};
$('search-btn').addEventListener('click', searchFromInput);
$('station-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchFromInput(); });
$('search-by-select-btn').addEventListener('click', onSearchBySelect);
$('make-route-btn').addEventListener('click', onMakeRoute);
$('download-pdf-btn').addEventListener('click', onDownloadPdf);
$('reverse-route-btn').addEventListener('click', onReverseRoute);
$('back-to-station').addEventListener('click', () => {
  state.selectedSpotIds.clear();
  showStep('step-station');
});
$('back-to-spots').addEventListener('click', () => showStep('step-spots'));

// STEP 3 → 4
$('start-explore-btn').addEventListener('click', onStartExplore);

// STEP 4
// カメラ直起動とギャラリー選択を別 input にしているので、両方に同じハンドラを bind
$('photo-input').addEventListener('change', onPhotoInputChange);
$('photo-camera-input').addEventListener('change', onPhotoInputChange);

// トップ画面（#3）の3つの入口＋ホームに戻るボタン
$('home-start').addEventListener('click', () => showStep('step-station'));
$('home-history').addEventListener('click', openHistory);
$('home-zukan').addEventListener('click', openZukan);
$('home-btn').addEventListener('click', () => showStep('step-home'));
$('home-logout').addEventListener('click', onLogout);

// キャラずかん
$('logout-btn').addEventListener('click', onLogout);
$('history-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'close') $('history-modal').classList.add('hidden');
});

// マスターモード（admin）
$('admin-btn').addEventListener('click', openAdminPanel);
$('admin-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'close') $('admin-modal').classList.add('hidden');
});
$('admin-char').addEventListener('change', e => { adminOverride.charId = e.target.value || null; saveAdminOverride(); });
$('admin-variant').addEventListener('change', e => { adminOverride.variantId = e.target.value || null; saveAdminOverride(); });
$('admin-force').addEventListener('change', e => { adminOverride.forceAppear = e.target.checked; saveAdminOverride(); });
$('admin-zukan-all').addEventListener('change', e => {
  adminOverride.zukanAll = e.target.checked;
  saveAdminOverride();
  // 図鑑を開いている最中なら即再描画
  if (!$('zukan-modal').classList.contains('hidden')) renderZukanGrid(loadCollection());
});
$('zukan-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'close') $('zukan-modal').classList.add('hidden');
});

// ARキャラ捕獲
$('ar-hunt-btn').addEventListener('click', openArHunt);
$('ar-close-btn').addEventListener('click', closeArOverlay);
$('ar-shutter-btn').addEventListener('click', onArShutter);
// GPS無しの救済「🔍 さがす」: 1セッションに1回だけ。図鑑で未取得の組合せを優先して1体出す。
// 一度使ったら、押し直しても再出現しない（_searchUsed で打ち止め）。
$('ar-call-btn').addEventListener('click', () => {
  if (!arSession || !arCurrent || _searchUsed) return;
  _searchUsed = true;
  persistArState(); // GPS無し救済「さがす」は1セッション1回だけ（再開しても復活しない）
  $('ar-call-btn').classList.add('hidden');
  const { char: rc, variant: v } = pickUncaughtEncounter();
  arCurrent.char = rc;
  arCurrent.variant = v;
  const imgEl = $('ar-character-img');
  imgEl.src = characterImageUrl(rc, 'normal');
  imgEl.style.filter = (v.filter !== 'none') ? v.filter : '';
  imgEl.style.transform = (v.size !== 1) ? `scale(${v.size})` : '';
  $('ar-character-name').textContent = variantNamePrefix(v) + charDisplayName(rc);
  arCurrent.imagesPromise = preloadCharacterImages(rc);
  arSession.forceAppear();
});
$('ar-captured-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'close') closeArCapturedModal();
});

// 撮影ウィザードのナビゲーション
$('wizard-prev').addEventListener('click', () => showWizardStage((state.photoWizardStage ?? 0) - 1));
$('wizard-next').addEventListener('click', () => showWizardStage((state.photoWizardStage ?? 0) + 1));
$('wizard-skip').addEventListener('click', () => showWizardStage(totalWizardStages() - 1));
// 一覧管理（manage）から各スポット撮影ウィザードへ戻る（履歴からの再開時に各スポットで撮れるようにする）
{
  const reenterBtn = $('wizard-reenter');
  if (reenterBtn) reenterBtn.addEventListener('click', () => showWizardStage(0));
}
$('back-to-route').addEventListener('click', async () => {
  // 再開セッションでは Directions が未構築なので必要に応じて再構築する
  const btn = $('back-to-route');
  const orig = btn.textContent;
  if (state.orderedSpots.length && (!state.directionsResult || !state.stationLocation)) {
    btn.textContent = t('btnLoadingResume');
    btn.disabled = true;
    try {
      await ensureRouteStepReady();
    } catch (e) {
      console.warn('ルート復元失敗:', e);
      alert(t('errRestoreRouteFmt').replace('{err}', e.message || e));
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  }
  showStep('step-route');
});
$('finish-explore-btn').addEventListener('click', onStartReport);

// タグ編集モーダル
$('tag-modal-save').addEventListener('click', saveTagModal);
$('tag-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'close') closeTagModal();
});

// 音声メモモーダル
$('voice-mic-btn').addEventListener('click', onMicButton);
$('voice-memo-save').addEventListener('click', saveVoiceMemo);
$('voice-memo-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'close') closeVoiceMemoModal();
});
document.querySelectorAll('input[name="voice-method"]').forEach(radio => {
  radio.addEventListener('change', () => {
    stopVoiceCapture();          // 方式を変えたら進行中の認識は止める
    const method = currentVoiceMethod();
    setVoiceMethod(method);       // 選択を保存（次回以降も維持）
    updateVoiceMethodNote(method);
    $('voice-status').textContent = '';
  });
});

// STEP 5（レポート）
$('back-to-photos').addEventListener('click', () => showStep('step-photos'));
$('report-pdf-btn').addEventListener('click', onReportPdf);

// ひと言メモを OpenAI で整形（無意味語の除去）
$('tidy-memos-btn').addEventListener('click', onTidyMemos);

// ノートを Drive に保存
$('save-report-btn').addEventListener('click', onSaveReportToDrive);

// スコア＆ランキング
$('submit-score-btn').addEventListener('click', openScoreModal);
$('score-submit-btn').addEventListener('click', onSubmitScore);
$('score-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'close') $('score-modal').classList.add('hidden');
});

// キャラ自動生成（表出フロー）
$('chargen-start-btn').addEventListener('click', openChargen);
$('chargen-save-btn').addEventListener('click', onChargenSave);
$('chargen-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'chargen-close') $('chargen-modal').classList.add('hidden');
});

// キャラ自動生成（case X 変数選択ティーザー）
$('chargen-var-ok').addEventListener('click', () => finalizeChargenPick(true));
$('chargen-pick-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'chargen-pick-skip') finalizeChargenPick(false);
});

// セッション再開（パスワードで前回の写真を復元）
$('resume-session-btn').addEventListener('click', onResumeSession);
$('resume-session-input').addEventListener('keydown', e => { if (e.key === 'Enter') onResumeSession(); });

// 不具合報告
$('report-issue-btn').addEventListener('click', () => {
  const modal = $('issue-modal');
  // 開くたびにフォームをリセット
  modal.querySelectorAll('[data-issue-type]').forEach(cb => { cb.checked = false; });
  $('issue-detail').value = '';
  modal.classList.remove('hidden');
});
$('issue-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'close') $('issue-modal').classList.add('hidden');
});
$('issue-submit-btn').addEventListener('click', async () => {
  const types = Array.from(document.querySelectorAll('#issue-modal [data-issue-type]:checked'))
    .map(cb => cb.dataset.issueType);
  const detail = $('issue-detail').value;
  const context = {
    stationName: state.stationName || '',
    cityTab: document.querySelector('.city-tab.active')?.dataset.cityId || '',
    currentStep: document.querySelector('.step.active')?.id || '',
    sessionId: state.sessionId || '',
    ua: navigator.userAgent,
    href: location.href,
  };
  const submitBtn = $('issue-submit-btn');
  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = t('statusSavingScore');
  try {
    // ローカル保存（オフラインバックアップ）
    addIssueReport({ types, detail, context });
    // Sheet にも送信（drive クライアントが無効なら自動でスキップ）
    if (drive) {
      try {
        await drive.submitIssue({ types, detail, context });
        console.info('[issue-report] Sheet にも保存しました');
      } catch (e) {
        console.warn('[issue-report] Sheet送信失敗（ローカルには保存済）:', e);
      }
    }
    alert(t('notifyIssueThanks'));
    $('issue-modal').classList.add('hidden');
  } catch (e) {
    alert(e.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
});

// ===== 起動時ログインゲート（なまえ＋あいことば） =====
let _appEntered = false;

// 統合フロー: ログインと新規作成を1画面に統一（#3）。モード切替は廃止。
function applyLoginMode() {
  $('login-title').textContent      = t('loginTitleUnified', 'なまえと あいことばを いれてね');
  $('login-lead').textContent       = t('loginLeadUnified', 'はじめての人は じどうで つくられるよ。まえに つくった人は そのまま入れるよ。');
  $('login-submit-btn').textContent = t('loginSubmitUnified', 'はじめる →');
  hideLoginError();
}

function showLoginError(code) {
  const map = {
    'name-required':  'loginErrNameRequired',
    'name-too-long':  'loginErrNameTooLong',
    'pin-too-short':  'loginErrPinTooShort',
    'pin-required':   'loginErrPinTooShort',
    'name-taken':     'loginErrNameTaken',
    'bad-credentials':'loginErrBadCredentials',
    'not-found':      'loginErrNotFound',
    'login-mismatch': 'loginErrMismatch',
    'network':        'loginErrNetwork',
  };
  const el = $('login-error');
  el.textContent = t(map[code] || 'loginErrNetwork');
  el.classList.remove('hidden');
}
function hideLoginError() { $('login-error').classList.add('hidden'); }

function showLoginGate() {
  const btn = $('login-submit-btn');
  if (btn) btn.disabled = false;
  $('login-name').value = '';
  $('login-pin').value = '';
  $('login-pin').type = 'password';
  $('login-pin-toggle').textContent = t('loginPinShow');
  $('login-gate').classList.remove('hidden');
  applyLoginMode();
  setTimeout(() => { const n = $('login-name'); if (n) n.focus(); }, 60);
}
function hideLoginGate() { $('login-gate').classList.add('hidden'); }

function initLoginGate() {
  applyLoginMode();
  $('login-submit-btn').addEventListener('click', onLoginSubmit);
  const switchLine = document.querySelector('.login-switch');
  if (switchLine) switchLine.classList.add('hidden'); // 統合フローでモード切替は不要
  $('login-pin-toggle').addEventListener('click', () => {
    const pin = $('login-pin');
    const wasHidden = pin.type === 'password';
    pin.type = wasHidden ? 'text' : 'password';
    $('login-pin-toggle').textContent = t(wasHidden ? 'loginPinHide' : 'loginPinShow');
  });
  ['login-name', 'login-pin'].forEach(id => {
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') onLoginSubmit(); });
  });
}

// 統合ログイン（#3）: まずログインを試し、名前が無ければ新規作成。
//   ・ログイン成功            → そのまま入る
//   ・名前が新規（login失敗→register成功） → 新規作成して入る
//   ・名前は在るがあいことば違い（login失敗→register が name-taken） → 統合エラー表示
//     （どちらの理由かをあえて言い分けない＝アカウント有無を漏らさない）
async function onLoginSubmit() {
  const name = $('login-name').value;
  const pin  = $('login-pin').value;
  const btn = $('login-submit-btn');
  const original = btn.textContent;
  const fail = (code) => { showLoginError(code); btn.disabled = false; btn.textContent = original; };

  const vErr = validateCredentials(name, pin);
  if (vErr) { showLoginError(vErr); return; }

  btn.disabled = true;
  btn.textContent = t('loginWorking');
  hideLoginError();
  try {
    // 1) まずログイン
    let res = await loginAccount(name, pin, drive);
    if (!res.ok) {
      // 2) 失敗 → 新規作成を試す
      const reg = await registerAccount(name, pin, drive);
      if (reg.ok) {
        res = reg; // 新しい名前だった＝新規作成成功
      } else if (reg.error === 'name-taken') {
        // 名前は存在する＝ログイン失敗の理由はあいことば違い
        return fail('login-mismatch');
      } else {
        return fail(reg.error || res.error);
      }
    }
    // 初回ログイン時、端末に残っている無記名の図鑑をアカウントへ引き継ぐ
    await migrateAnonymousCollection();
    enterApp();
  } catch (e) {
    console.warn('[login] error:', e);
    fail('network');
  }
}

// 端末の旧・無記名図鑑を、ログインしたアカウントへ1回だけ引き継ぐ
async function migrateAnonymousCollection() {
  try {
    const legacy = loadLegacyAnonymousCollection();
    const ids = Object.keys(legacy);
    if (!ids.length) return;
    mergeServerCollection(legacy); // ログイン後の getExplorerId()=userId のローカル図鑑へマージ
    if (drive) {
      const records = ids.map(characterId => ({
        characterId,
        capturedAt: legacy[characterId].firstAt || new Date().toISOString(),
      }));
      try { await drive.saveCaptures({ explorerId: getExplorerId(), records }); } catch (_) { /* 後で同期される */ }
    }
    try { localStorage.removeItem('tanken_collection_v1'); } catch (_) { /* no-op */ }
    console.info('[auth] 無記名の図鑑をアカウントへ引き継ぎました:', ids.length, '種');
  } catch (e) {
    console.warn('[auth] 図鑑の引き継ぎに失敗（続行）:', e);
  }
}

// 図鑑モーダルにログイン中アカウント名を表示
function updateZukanAccount() {
  const el = $('zukan-account-name');
  if (!el) return;
  const a = getStoredAuth();
  el.textContent = a ? t('zukanAccountFmt').replace('{name}', a.name || '') : '';
}

function onLogout() {
  if (!confirm(t('logoutConfirm'))) return;
  logout();
  $('zukan-modal').classList.add('hidden');
  resetSearchState();  // 前のアカウントの探検データをクリア
  showLoginGate();
}

// ログイン成功後にアプリ本体へ入る
function enterApp() {
  hideLoginGate();
  updateZukanAccount();
  updateAdminButton();   // admin アカウントなら 🛠 ボタンを表示
  if (!_appEntered) {
    _appEntered = true;
    if (!FEATURES.scoringEnabled) {
      const scoreBtn = $('submit-score-btn');
      if (scoreBtn) scoreBtn.classList.add('hidden');
    }
    initShell();       // 進捗トレイル構築（showStep 前に必要）
    initCityTabs();
    // デフォルト: 名古屋タブ + 桜通線を選択（プロジェクトの主要利用エリア）
    selectCity('nagoya', { defaultLineName: '名古屋市営地下鉄 桜通線' });
    bindReportInputs();
  }
  // トップ画面（3つの入口）から開始（#3）
  const hello = $('home-hello');
  if (hello) { const a = getStoredAuth(); hello.textContent = a && a.name ? t('homeHelloFmt', 'ようこそ、{name}さん！').replace('{name}', a.name) : ''; }
  showStep('step-home');
}

// ===== 初期表示 =====
// バージョン表示・言語切替を最初に適用
applyI18n();

// body.lang-XX クラスを付けて CSS から言語別スタイルを切り替えられるようにする
document.body.classList.add(`lang-${LANG}`);

const versionEl = $('header-version');
if (versionEl) {
  versionEl.textContent = `v${APP_VERSION}`;
  versionEl.title = `${RELEASE_LABEL} v${APP_VERSION} / lang=${LANG}`;
}
console.info(`[tanken-rally] v${APP_VERSION} (${RELEASE_LABEL}) — lang=${LANG}`);

// ログインゲートを準備し、未ログインならゲート表示・ログイン済みならそのまま入場
initLoginGate();
if (isLoggedIn()) {
  enterApp();
} else {
  showLoginGate();
}

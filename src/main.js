import { CONFIG } from '../config.js?v=41';
import { loadGoogleMaps, geocodeStation, searchNearbySpotsWith, optimizeRoute, getDirections, calcRouteStats } from './utils/maps.js?v=41';
import { fetchOriginStory } from './utils/ai.js?v=41';
import { generateMapPdf } from './utils/pdf.js?v=41';
import { DriveClient, generateSessionId } from './utils/drive.js?v=41';
import { state, resetSearchState, CAT, SELECTED_COLOR } from './state.js?v=41';
import { CITIES } from './data/cities.js?v=41';
import { filterBlocked, addBlockedSpot } from './utils/blocked.js?v=41';
import { addReport as addIssueReport } from './utils/issues.js?v=41';

// DriveClient（GAS_URLが設定されていれば有効）
const drive = CONFIG.GAS_URL && CONFIG.GAS_URL !== 'YOUR_GAS_DEPLOY_URL'
  ? new DriveClient(CONFIG.GAS_URL, CONFIG.GAS_SECRET)
  : null;

// デバッグ用：drive 接続状態を可視化
console.log('[tanken-rally] drive client:', drive ? 'enabled' : 'disabled (GAS未設定)');
console.log('[tanken-rally] CONFIG.GAS_URL:', CONFIG.GAS_URL ? `${String(CONFIG.GAS_URL).slice(0, 60)}…` : '(empty)');

// ===== DOM ヘルパー =====
const $ = id => document.getElementById(id);
const show = id => { $( id ).classList.remove('hidden'); $( id ).classList.add('active'); };
const hide = id => { $( id ).classList.add('hidden'); $( id ).classList.remove('active'); };
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ===== STEP 1: 都市タブ + 路線/駅 セレクタ =====
function initCityTabs() {
  const tabsEl = $('city-tabs');
  tabsEl.innerHTML = '';
  // 各都市タブ
  CITIES.forEach(city => {
    const t = document.createElement('button');
    t.className = 'city-tab';
    t.dataset.cityId = city.id;
    t.textContent = city.name;
    t.addEventListener('click', () => selectCity(city.id));
    tabsEl.appendChild(t);
  });
  // 「その他」タブ
  const other = document.createElement('button');
  other.className = 'city-tab';
  other.dataset.cityId = 'other';
  other.textContent = 'その他';
  other.addEventListener('click', () => selectCity('other'));
  tabsEl.appendChild(other);
}

function selectCity(cityId, opts = {}) {
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
  lineSel.innerHTML = '<option value="">── 路線をえらんでね ──</option>';
  city.lines.forEach((line, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = line.name;
    lineSel.appendChild(opt);
  });
  // 駅 select はリセット
  const stationSel = $('station-select');
  stationSel.innerHTML = '<option value="">── 先に路線をえらんでね ──</option>';
  stationSel.disabled = true;
  $('search-by-select-btn').disabled = true;

  // 路線変更ハンドラ
  lineSel.onchange = () => {
    const idx = lineSel.value;
    stationSel.innerHTML = '<option value="">── 駅をえらんでね ──</option>';
    if (idx === '') {
      stationSel.disabled = true;
      $('search-by-select-btn').disabled = true;
      return;
    }
    const line = city.lines[Number(idx)];
    line.stations.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      stationSel.appendChild(opt);
    });
    stationSel.disabled = false;
    $('search-by-select-btn').disabled = true;
  };
  stationSel.onchange = () => {
    $('search-by-select-btn').disabled = !stationSel.value;
  };

  // デフォルト路線を選択する（指定がある場合）
  if (opts.defaultLineName) {
    const idx = city.lines.findIndex(l => l.name === opts.defaultLineName);
    if (idx >= 0) {
      lineSel.value = String(idx);
      lineSel.dispatchEvent(new Event('change'));
    }
  }
}

// セレクタ「この駅でさがす」 → 都市名・路線名・bounds 付きで onSearchStation を呼ぶ
// （同名駅の曖昧性解消のため。例: 名古屋の「吹上」と東京の「吹上」、名古屋の「荒畑」を別エリアの同名と区別）
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
    bounds: city?.bounds,        // 都市矩形に検索を絞り込む
    center: city?.center,        // 同点時のタイブレーク用
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
  ['step-station', 'step-spots', 'step-route', 'step-photos', 'step-report'].forEach(id => {
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
  if (!name) { showError('駅名を入力してください'); return; }
  clearError();

  const btn = $('search-btn');
  btn.textContent = '検索中…';
  btn.disabled = true;

  // 別の駅で再検索する場合に備えて state を初期化
  resetSearchState();
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
    mapEl.innerHTML = '<div class="loading">スポットを検索中…</div>';

    // Places API は内部的に div を使うため、別途 PlacesService 用のダミー要素を作る
    // （map 要素を innerHTML で書き換えるため、Places の検索が終わるまで地図描画は待つ）
    const placesScratch = document.createElement('div');
    const placesService = new google.maps.places.PlacesService(placesScratch);
    const spots = await searchNearbySpotsWith(placesService, state.stationLocation);
    // 不適切スポット（学習塾・予備校等のキーワード or ユーザーが過去削除した場所）を除外
    state.allSpots = filterBlocked(spots);

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
      title: `${name}駅`,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#004029', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
    });

    // 地名由来取得（並行実行）
    $('origin-story').textContent = '';
    fetchOriginStory(name, CONFIG.OPENAI_API_KEY)
      .then(story => { $('origin-story').textContent = `🗣️ たんけん博士より：${story}`; })
      .catch(() => {});

    renderSpotsList(map);
    fitMapToSpots(map, state.stationLocation, state.allSpots);
    showStep('step-spots');

  } catch (e) {
    showError(e.message || 'エラーが発生しました');
  } finally {
    btn.textContent = 'さがす';
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

    // カード生成（史跡は recommended 装飾でハイライト、ただし選択は任意）
    const card = document.createElement('div');
    card.className = `spot-card${spot.recommended ? ' recommended' : ''}`;
    card.dataset.spotId = spot.id;
    card.dataset.category = spot.category;
    card.innerHTML = `
      <span class="spot-num" style="background:${cat.color}">${i + 1}</span>
      <span class="spot-check">⬜</span>
      <div class="spot-info">
        <div class="spot-name">${spot.name}${spot.recommended ? ' <span class="spot-badge">必ず1つ</span>' : ''}</div>
        <span class="spot-category ${cat.cls}">${cat.icon} ${cat.label}</span>
        <div class="spot-desc">${spot.address}</div>
      </div>
      <button class="spot-delete" type="button" title="この場所を結果から削除（次回以降も非表示）" aria-label="削除">🗑</button>
    `;

    // 削除ボタン（カード本体クリックにバブルさせない）
    card.querySelector('.spot-delete').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`「${spot.name}」を結果から削除します。\n同じ場所は今後の検索でも表示されません。よろしいですか？`)) return;
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

    // マーカークリックでカードをハイライト
    marker.addListener('click', () => {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      card.style.outline = '3px solid #004029';
      setTimeout(() => { card.style.outline = ''; }, 1500);
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
  lbl.textContent = '🏷️ カテゴリで絞り込み:';
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
    chip.textContent = `${cat.icon} ${cat.label}`;
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
  previewEl.textContent = '⏳ 計算中…';
  previewEl.className = 'route-preview loading';

  previewTimer = setTimeout(async () => {
    const seq = ++previewSeq;
    try {
      const ordered = optimizeRoute(state.stationLocation, selected);
      const result = await getDirections(state.stationLocation, ordered);
      if (seq !== previewSeq) return; // 古いリクエスト → 破棄
      const stats = calcRouteStats(result);
      const over = stats.durationMin > 60;
      previewEl.textContent = `${over ? '⚠️ ' : '🚶 '}約 ${stats.distanceText} / ${stats.durationMin}分`;
      previewEl.className = `route-preview${over ? ' over' : ''}`;
    } catch (e) {
      if (seq !== previewSeq) return;
      previewEl.textContent = '⚠️ 計算失敗';
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
  btn.title = hasHistoric ? '' : '史跡を1つ以上選んでね';
  // ヒントメッセージ
  const hint = $('route-btn-hint');
  if (hint) hint.textContent = hasHistoric ? '' : '🏯 史跡（ピンク枠）から1つ以上選んでね';
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
    title: `${state.stationName}駅`,
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

  // ルート統計
  const { distanceText, durationMin } = state.routeStats;
  const overLimit = durationMin > 60;
  $('route-info').innerHTML = `
    ${overLimit ? `
      <div class="route-warning">
        ⚠️ <strong>このコースは約${durationMin}分かかります。</strong>
        1時間以内が目安だよ。スポットを減らすか、別の駅で試してみよう！
        <div class="route-warning-actions">
          <button id="warn-back-spots" class="btn-secondary">スポットを減らす</button>
          <button id="warn-back-station" class="btn-secondary">別の駅にする</button>
        </div>
      </div>
    ` : ''}
    <div class="route-stats">
      <div><span>総距離</span><br/><strong>${distanceText}</strong></div>
      <div><span>推定時間</span><br/><strong>約${durationMin}分</strong></div>
      <div><span>スポット数</span><br/><strong>${state.orderedSpots.length}件</strong></div>
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

  // スポット順リスト（駅 → スポット1 → ... → 駅 のループ、区間時間付き）
  const legs = state.directionsResult.routes[0].legs;
  const legHtml = (leg) => `
    <div class="route-leg">
      <span class="leg-icon">🚶</span>
      <span>約 ${Math.max(1, Math.round(leg.duration.value / 60))}分・${leg.distance.text}</span>
    </div>`;
  const parts = [];
  parts.push(`
    <div class="route-spot-item route-station">
      <span class="route-spot-num start">S</span>
      <span>🚉 <strong>${state.stationName}駅</strong>（スタート）</span>
    </div>`);
  state.orderedSpots.forEach((s, i) => {
    const cat = CAT[s.category] || CAT.other;
    if (legs[i]) parts.push(legHtml(legs[i]));
    parts.push(`
      <div class="route-spot-item">
        <span class="route-spot-num">${i + 1}</span>
        <span>${cat.icon} <strong>${s.name}</strong> — ${s.address || ''}</span>
      </div>`);
  });
  const lastLeg = legs[legs.length - 1];
  if (lastLeg) parts.push(legHtml(lastLeg));
  parts.push(`
    <div class="route-spot-item route-station">
      <span class="route-spot-num goal">G</span>
      <span>🚉 <strong>${state.stationName}駅</strong>（ゴール）</span>
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

// ===== STEP 2→3: ルート生成 =====
async function onMakeRoute() {
  const btn = $('make-route-btn');
  btn.textContent = 'ルート作成中…';
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
    alert(e.message || 'ルートの生成に失敗しました');
  } finally {
    btn.textContent = 'ルートをつくる →';
    btn.disabled = false;
  }
}

// ===== STEP 3→4: 探検スタート =====
async function onStartExplore() {
  const btn = $('start-explore-btn');
  btn.textContent = '準備中…';
  btn.disabled = true;

  try {
    state.sessionId = generateSessionId();

    // タグモーダル用のスポットセレクターを構築
    const tagSel = $('tag-modal-select');
    tagSel.innerHTML = '<option value="">── タグなし ──</option>';
    state.orderedSpots.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${i + 1}. ${s.name}`;
      tagSel.appendChild(opt);
    });

    // DriveクライアントがあればGoogle Driveにセッションフォルダを作成
    if (drive) {
      const info = $('photos-session-info');
      info.textContent = '📂 Google Driveにフォルダを作成中…';
      try {
        const playerName = 'たんけんたろう'; // TODO: プレーヤー名入力UI
        state.driveSession = await drive.createSession({
          sessionId: state.sessionId,
          stationName: state.stationName,
          playerName,
        });
        info.innerHTML = `📂 保存先: <a href="${state.driveSession.folderUrl}" target="_blank" style="color:#2e7d32">${state.driveSession.folderName}</a><br/>` +
          `🔑 再開パスワード: <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;font-family:monospace">${state.sessionId}</code>（メモしておこう）`;

        // 続けて Sheet にメタデータ（駅名・スポット順序など）を保存
        // 失敗しても探検フロー自体は継続するため try/catch で握り潰す
        try {
          await drive.saveSession({
            sessionId: state.sessionId,
            stationName: state.stationName,
            playerName,
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
        info.textContent = `⚠️ Drive接続エラー（写真はローカルのみ）: ${e.message}`;
        console.warn('Drive session creation failed:', e);
      }
    } else {
      $('photos-session-info').textContent = '📸 写真を撮って探検の記録をのこそう！（GAS未設定のためローカルのみ）';
    }

    // 過去のセッション残骸（特に selectedPhotoIds の古いID）をクリア
    state.uploadedPhotos.forEach(p => {
      if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
    });
    state.uploadedPhotos = [];
    state.selectedPhotoIds.clear();
    renderPhotosGrid();
    showStep('step-photos');

  } catch (e) {
    alert('スタートに失敗しました: ' + e.message);
  } finally {
    btn.textContent = '探検スタート！ →';
    btn.disabled = false;
  }
}

// ===== STEP 4: 写真アップロード =====
async function onPhotoInputChange(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const progress = $('upload-progress');
  progress.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const spotName = ''; // 撮影後にタグ付けする運用に変更
    progress.textContent = `📤 アップロード中… ${i + 1}/${files.length}`;

    // グリッドにプレビューを先行表示（アップロード中状態）
    const tempId = `temp_${Date.now()}_${i}`;
    const tempUrl = URL.createObjectURL(file);
    state.uploadedPhotos.push({
      fileId: tempId,
      url: tempUrl,
      thumbnailUrl: tempUrl,
      spotName: spotName || '',
      fileName: file.name,
      uploading: true,
    });
    renderPhotosGrid();

    // Drive にアップロード
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
          state.uploadedPhotos[idx] = {
            ...state.uploadedPhotos[idx],   // ローカル情報を保持（url, thumbnailUrl は blob:）
            fileId: result.fileId,          // Drive のファイルID で置き換え
            driveUrl: result.url,           // Drive の表示URL
            driveThumbnailUrl: result.thumbnailUrl,
            takenAt: result.takenAt,
            uploading: false,
          };
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
    renderPhotosGrid();
  }

  progress.textContent = `✅ ${files.length}枚追加しました`;
  setTimeout(() => progress.classList.add('hidden'), 2000);
  $('photo-input').value = ''; // 同じファイルの再選択を可能にする
  updatePhotosCount();
}

function renderPhotosGrid() {
  const grid = $('photos-grid');
  grid.innerHTML = '';
  state.uploadedPhotos.forEach(photo => {
    const excluded = state.reportData.excludedPhotoIds.has(photo.fileId);
    const item = document.createElement('div');
    item.className = `photo-item${photo.uploading ? ' photo-uploading' : ''}${excluded ? ' photo-excluded' : ''}`;
    const tag = photo.spotName ? `📍 ${photo.spotName}` : '➕ タップしてタグ付け';
    const toggleIcon = excluded ? '⬜' : '✅';
    const toggleTitle = excluded ? 'ノートに載せる' : 'ノートから外す';
    item.innerHTML = `
      <img src="${photo.thumbnailUrl}" alt="${photo.fileName}" loading="lazy" />
      <div class="photo-overlay">${tag}</div>
      <button class="photo-include-toggle" type="button" title="${toggleTitle}" aria-label="${toggleTitle}">${toggleIcon}</button>
    `;

    // 取捨選択トグル（バブルさせない）
    item.querySelector('.photo-include-toggle').addEventListener('click', e => {
      e.stopPropagation();
      if (photo.uploading) return;
      if (state.reportData.excludedPhotoIds.has(photo.fileId)) {
        state.reportData.excludedPhotoIds.delete(photo.fileId);
      } else {
        state.reportData.excludedPhotoIds.add(photo.fileId);
      }
      renderPhotosGrid();
    });

    // 写真本体クリック → タグ編集モーダル
    item.addEventListener('click', e => {
      if (e.target.closest('.photo-include-toggle')) return;
      if (photo.uploading) return;
      openTagModal(photo);
    });

    grid.appendChild(item);
  });
  updatePhotosCount();
}

function updatePhotosCount() {
  const total = state.uploadedPhotos.length;
  const excluded = state.reportData.excludedPhotoIds.size;
  const included = total - excluded;
  if (total === 0) {
    $('photos-count').textContent = '0枚';
    return;
  }
  const tagged = state.uploadedPhotos.filter(p => p.spotName).length;
  let txt = `${total}枚`;
  if (excluded > 0) txt += `（ノートに載せる: ${included}枚）`;
  else if (tagged > 0) txt += `（うち${tagged}枚にタグあり）`;
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
function saveTagModal() {
  if (!_tagEditTarget) return;
  const sel = $('tag-modal-select');
  _tagEditTarget.spotName = sel.value || '';
  closeTagModal();
  renderPhotosGrid();
}

// ===== セッション再開（パスワード入力） =====
async function onResumeSession() {
  const errEl = $('resume-error');
  errEl.classList.add('hidden');
  errEl.textContent = '';

  const sessionId = $('resume-session-input').value.trim();
  if (!sessionId) {
    errEl.textContent = 'セッションIDを入力してね。';
    errEl.classList.remove('hidden');
    return;
  }
  if (!drive) {
    errEl.textContent = 'Drive 連携が無効です（GAS未設定）。再開機能は使えません。';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = $('resume-session-btn');
  const original = btn.textContent;
  btn.textContent = '読み込み中…';
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
      takenAt: p.takenAt || '',
      uploading: false,
    }));
    state.selectedPhotoIds.clear();
    state.reportData = {
      date: '', author: '', overview: '', afterword: '',
      photoComments: {},
      excludedPhotoIds: new Set(),
    };

    // 5) STEP 4 ヘ：セッション情報を見やすく表示
    const info = $('photos-session-info');
    const stationLabel = state.stationName ? `${state.stationName}駅 / ` : '';
    const folderLink = `<a href="${session.folderUrl}" target="_blank" style="color:#2e7d32">${session.folderName}</a>`;
    const counts = `写真 ${state.uploadedPhotos.length} 枚 / スポット ${state.orderedSpots.length} 件`;

    let html = `📂 <strong>セッション再開:</strong> ${stationLabel}${folderLink}（${counts}）`;
    // 復元したスポット一覧（あれば）
    if (state.orderedSpots.length) {
      const spotsLine = state.orderedSpots.map((s, i) => `${i + 1}. ${s.name}`).join(' → ');
      html += `<br/><span style="font-size:12px;color:#2e7d32;">📍 行った場所: ${spotsLine}</span>`;
    }
    // Sheet 読込み失敗の警告（取れたフォルダだけ表示状態）
    if (session.sheetWarning) {
      html += `<br/><span style="font-size:12px;color:#c62828;">⚠️ スポット情報の復元に失敗（${escapeHtml(session.sheetWarning)}）— GAS の権限承認またはデプロイ更新を確認してください</span>`;
    } else if (state.orderedSpots.length === 0) {
      html += `<br/><span style="font-size:12px;color:#c62828;">⚠️ Sheet に該当 sessionId のセッション情報が見つかりませんでした</span>`;
    }
    info.innerHTML = html;

    // タグ編集モーダルのスポット選択肢を再構築
    const tagSel = $('tag-modal-select');
    tagSel.innerHTML = '<option value="">── タグなし ──</option>';
    state.orderedSpots.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${i + 1}. ${s.name}`;
      tagSel.appendChild(opt);
    });

    renderPhotosGrid();
    showStep('step-photos');
  } catch (e) {
    errEl.textContent = e.message || '再開に失敗しました';
    errEl.classList.remove('hidden');
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

// ===== STEP 5: レポート =====
function onStartReport() {
  // メタ情報初期化（日付はシステム側で自動入力しない。ユーザーが date picker で入力）
  $('report-date').value = state.reportData.date || '';
  $('report-author').value = state.reportData.author || '';
  $('report-station').textContent = state.stationName ? `${state.stationName}駅` : '';
  $('report-overview').value = state.reportData.overview || '';
  $('report-afterword').value = state.reportData.afterword || '';

  renderReportPhotos();
  showStep('step-report');
}

// 写真を「行った順」に並び替える
// orderedSpots の順序にしたがって spotName 一致でグループ化、未タグ写真は最後
function getPhotosInVisitOrder() {
  const order = state.orderedSpots.map(s => s.name);
  const orderIndex = name => {
    const idx = order.indexOf(name);
    return idx < 0 ? Infinity : idx;
  };
  return [...state.uploadedPhotos].sort((a, b) => {
    const oa = orderIndex(a.spotName);
    const ob = orderIndex(b.spotName);
    if (oa !== ob) return oa - ob;
    // 同じスポット内では撮影順（fileId or createdの代用として配列順を維持）
    return state.uploadedPhotos.indexOf(a) - state.uploadedPhotos.indexOf(b);
  });
}

function renderReportPhotos() {
  const wrap = $('report-photos');
  wrap.innerHTML = '';

  // STEP 4 で除外された写真はそもそもレポートに含めない
  const photos = getPhotosInVisitOrder()
    .filter(p => !state.reportData.excludedPhotoIds.has(p.fileId));
  if (photos.length === 0) {
    wrap.innerHTML = '<p class="report-hint">📷 ノートに載せる写真がありません。STEP 4 で写真を撮るか、外した写真を戻そう。</p>';
    return;
  }

  photos.forEach((photo, i) => {
    const item = document.createElement('div');
    item.className = 'report-photo-item';
    item.dataset.fileId = photo.fileId;
    // タグなし時は判別できる class を付ける（CSS で PDF時のみ非表示にする）
    const tagHtml = photo.spotName
      ? `<span class="report-photo-tag">📍 ${photo.spotName}</span>`
      : `<span class="report-photo-tag report-photo-tag-empty">📍 タグなし</span>`;
    // 表示には必ずローカルの blob: URL を使う（Drive の uc?id= は CORS で読めない）
    const imgSrc = photo.url || photo.thumbnailUrl || photo.driveThumbnailUrl || photo.driveUrl || '';
    item.innerHTML = `
      <div class="report-photo-img-wrap">
        <img src="${imgSrc}" alt="${photo.fileName}" />
      </div>
      <div class="report-photo-meta">
        <div>
          <span class="report-photo-order">${i + 1}</span>
          ${tagHtml}
        </div>
        <textarea class="report-photo-comment" rows="1"
          placeholder="この写真について気づいたこと・思ったこと（任意・1行でもOK）"
        >${state.reportData.photoComments[photo.fileId] || ''}</textarea>
      </div>
    `;

    // 写真ロード後の処理：
    //  1) 自然な縦横比から実寸（mm）を計算し、インラインで width / height を設定
    //     → html2canvas が object-fit: contain を完全実装していないため、明示寸法で確実に縦横比を維持
    //  2) 横長判定（naturalWidth > naturalHeight）で .landscape クラス付与
    //     → CSS で「写真上 + コメント下」のレイアウトに切り替え
    const imgEl = item.querySelector('img');
    const ENVELOPE_MM = 148; // ハガキ長辺
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

    // 感想テキストの永続化
    item.querySelector('.report-photo-comment').addEventListener('input', e => {
      state.reportData.photoComments[photo.fileId] = e.target.value;
    });

    wrap.appendChild(item);
  });
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
}

async function onReportPdf() {
  const btn = $('report-pdf-btn');
  const original = btn.textContent;
  btn.textContent = '📄 PDF生成中…（少し時間がかかるよ）';
  btn.disabled = true;

  // PDF生成用に固定幅で描画
  const page = document.querySelector('.report-page');
  page.classList.add('pdf-rendering');

  try {
    // Webフォント (Klee One / Yusei Magic) のロード完了を待つ
    // → 待たないと html2canvas が初期表示時のフォールバックフォントで描画してしまうことがある
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // html2canvas で画像化（B3の解像度: scale=2 で十分）
    // windowWidth=1400 でモバイル用 @media (max-width: 768px) を無効化し、
    // PDF はデスクトップレイアウトで描画する
    // onclone でクローン側の form要素を「描画用テキスト」に置換する
    const canvas = await html2canvas(page, {
      scale: 2,
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
        clonedPage.querySelectorAll('textarea').forEach(t => {
          const div = clonedDoc.createElement('div');
          div.className = t.className + ' pdf-text-block';
          div.textContent = t.value || '';
          // 元のサイズを概ね継承
          div.style.minHeight = (t.rows ? t.rows * 28 : 100) + 'px';
          div.style.whiteSpace = 'pre-wrap';
          div.style.wordBreak = 'break-word';
          t.parentNode.replaceChild(div, t);
        });
        clonedPage.querySelectorAll('input[type="text"], input[type="date"]').forEach(inp => {
          const span = clonedDoc.createElement('span');
          span.textContent = inp.value || '';
          span.style.borderBottom = '1.5px solid #999';
          span.style.padding = '4px 6px';
          span.style.fontSize = '14px';
          span.style.minWidth = '140px';
          span.style.display = 'inline-block';
          inp.parentNode.replaceChild(span, inp);
        });
      },
    });

    const { jsPDF } = window.jspdf;
    // B3 縦：364mm × 515mm
    const pdf = new jsPDF({ unit: 'mm', format: 'b3', orientation: 'portrait' });
    const pdfW = pdf.internal.pageSize.getWidth();   // 364
    const pdfH = pdf.internal.pageSize.getHeight();  // 515

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgH = canvas.height * pdfW / canvas.width;

    let position = 0;
    let heightLeft = imgH;
    pdf.addImage(imgData, 'JPEG', 0, position, pdfW, imgH);
    heightLeft -= pdfH;
    while (heightLeft > 0) {
      position -= pdfH;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pdfW, imgH);
      heightLeft -= pdfH;
    }

    const fname = `tanken-note_${state.stationName || 'unknown'}_${new Date().toISOString().slice(0,10)}.pdf`;
    pdf.save(fname);
  } catch (e) {
    console.error(e);
    alert('PDF生成に失敗しました: ' + (e.message || e));
  } finally {
    page.classList.remove('pdf-rendering');
    btn.textContent = original;
    btn.disabled = false;
  }
}

// ===== PDF生成 =====
async function onDownloadPdf() {
  const btn = $('download-pdf-btn');
  const original = btn.textContent;
  btn.textContent = '📄 PDF生成中…';
  btn.disabled = true;
  try {
    await generateMapPdf({
      stationName: state.stationName,
      orderedSpots: state.orderedSpots,
      stats: state.routeStats,
      origin: state.stationLocation,
      directions: state.directionsResult,
      apiKey: CONFIG.GOOGLE_MAPS_API_KEY,
    });
  } catch (e) {
    alert('PDF生成に失敗しました: ' + e.message);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

// ===== イベントリスナー =====
$('search-btn').addEventListener('click', onSearchStation);
$('station-input').addEventListener('keydown', e => { if (e.key === 'Enter') onSearchStation(); });
$('search-by-select-btn').addEventListener('click', onSearchBySelect);
$('make-route-btn').addEventListener('click', onMakeRoute);
$('download-pdf-btn').addEventListener('click', onDownloadPdf);
$('back-to-station').addEventListener('click', () => {
  state.selectedSpotIds.clear();
  showStep('step-station');
});
$('back-to-spots').addEventListener('click', () => showStep('step-spots'));

// STEP 3 → 4
$('start-explore-btn').addEventListener('click', onStartExplore);

// STEP 4
$('photo-input').addEventListener('change', onPhotoInputChange);
$('back-to-route').addEventListener('click', async () => {
  // 再開セッションでは Directions が未構築なので必要に応じて再構築する
  const btn = $('back-to-route');
  const orig = btn.textContent;
  if (state.orderedSpots.length && (!state.directionsResult || !state.stationLocation)) {
    btn.textContent = 'ルート復元中…';
    btn.disabled = true;
    try {
      await ensureRouteStepReady();
    } catch (e) {
      console.warn('ルート復元失敗:', e);
      alert('ルートの復元に失敗しました: ' + (e.message || e));
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

// STEP 5（レポート）
$('back-to-photos').addEventListener('click', () => showStep('step-photos'));
$('report-pdf-btn').addEventListener('click', onReportPdf);

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
  submitBtn.textContent = '送信中…';
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
    alert('🐛 報告ありがとうございました！\n開発者がこの情報をもとに改善していきます。');
    $('issue-modal').classList.add('hidden');
  } catch (e) {
    alert(e.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
});

// ===== 初期表示 =====
initCityTabs();
// デフォルト: 名古屋タブ + 桜通線を選択（プロジェクトの主要利用エリア）
selectCity('nagoya', { defaultLineName: '名古屋市営地下鉄 桜通線' });
bindReportInputs();
showStep('step-station');

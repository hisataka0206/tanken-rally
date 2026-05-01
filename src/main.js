import { CONFIG } from '../config.js?v=68';
import { loadGoogleMaps, geocodeStation, searchNearbySpotsWith, optimizeRoute, getDirections, calcRouteStats, haversine, fetchOpeningHours, isPlaceOpenInWindow } from './utils/maps.js?v=68';
import { fetchOriginStory } from './utils/ai.js?v=68';
import { generateMapPdf } from './utils/pdf.js?v=68';
import { DriveClient, generateSessionId } from './utils/drive.js?v=68';
import { state, resetSearchState, CAT, SELECTED_COLOR } from './state.js?v=68';
import { CITIES, localizeStationName } from './data/cities.js?v=68';
import { filterBlocked, addBlockedSpot } from './utils/blocked.js?v=68';
import { addReport as addIssueReport } from './utils/issues.js?v=68';
import { applyI18n, LANG, t, adjustMinForKids } from './utils/i18n.js?v=68';
import { APP_VERSION, RELEASE_LABEL } from './version.js?v=68';

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
  if (!name) { showError(t('errEnterStation')); return; }
  clearError();

  const btn = $('search-btn');
  btn.textContent = t('statusSearching');
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
    mapEl.innerHTML = `<div class="loading">${escapeHtml(t('statusLoadingSpots'))}</div>`;

    // Places API は内部的に div を使うため、別途 PlacesService 用のダミー要素を作る
    // （map 要素を innerHTML で書き換えるため、Places の検索が終わるまで地図描画は待つ）
    const placesScratch = document.createElement('div');
    const placesService = new google.maps.places.PlacesService(placesScratch);
    const spots = await searchNearbySpotsWith(placesService, state.stationLocation);
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

  try {
    state.sessionId = generateSessionId();

    // タグモーダル用のスポットセレクターを構築
    const tagSel = $('tag-modal-select');
    tagSel.innerHTML = `<option value="">${t('tagModalEmpty')}</option>`;
    state.orderedSpots.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${i + 1}. ${s.name}`;
      tagSel.appendChild(opt);
    });

    // DriveクライアントがあればGoogle Driveにセッションフォルダを作成
    if (drive) {
      const info = $('photos-session-info');
      info.textContent = t('driveCreatingFolder');
      try {
        const playerName = 'たんけんたろう'; // TODO: プレーヤー名入力UI
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
    renderPhotosGrid();
    showStep('step-photos');

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

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const spotName = ''; // 撮影後にタグ付けする運用に変更
    progress.textContent = t('statusUploading').replace('{i}', i + 1).replace('{n}', files.length);

    // グリッドにプレビューを先行表示（アップロード中状態）
    const tempId = `temp_${Date.now()}_${i}`;
    const tempUrl = URL.createObjectURL(file);
    state.uploadedPhotos.push({
      fileId: tempId,
      url: tempUrl,
      thumbnailUrl: tempUrl,
      spotName: spotName || '',
      fileName: file.name,
      uploadedAt: new Date().toISOString(), // ローカルでも記録（DriveなしモードでもOK）
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
            driveUrl: result.url,
            driveThumbnailUrl: result.thumbnailUrl,
            takenAt: result.takenAt || null,         // EXIF DateTimeOriginal（無ければ null）
            uploadedAt: result.uploadedAt || state.uploadedPhotos[idx].uploadedAt,
            lat: result.lat ?? null,
            lng: result.lng ?? null,
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

  progress.textContent = t('statusUploaded').replace('{n}', files.length);
  setTimeout(() => progress.classList.add('hidden'), 2000);
  $('photo-input').value = ''; // 同じファイルの再選択を可能にする
  updatePhotosCount();
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
  const tagText = photo.spotName ? `📍 ${photo.spotName}` : t('photoTagAdd');
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
    overlay.textContent = photo.spotName ? `📍 ${photo.spotName}` : t('photoTagAdd');
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

    // タグ編集モーダルのスポット選択肢を再構築
    const tagSel = $('tag-modal-select');
    tagSel.innerHTML = `<option value="">${t('tagModalEmpty')}</option>`;
    state.orderedSpots.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${i + 1}. ${s.name}`;
      tagSel.appendChild(opt);
    });

    renderPhotosGrid();
    showStep('step-photos');
  } catch (e) {
    errEl.textContent = e.message || t('errResumeFailed');
    errEl.classList.remove('hidden');
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

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
  };
  const total = Object.values(_internalBreakdown).reduce((a, b) => a + b, 0);

  return {
    total,
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
  const result = calculateScore();
  $('score-total').textContent = `${result.total}${t('suffPoints')}`;
  $('score-rank-label').textContent = scoreMoodLabel(result.total);

  // 弱点アドバイス
  const adviceEl = $('score-advice');
  if (adviceEl) {
    const tips = buildScoreAdvice(result);
    adviceEl.innerHTML = `
      <div class="score-advice-title">${escapeHtml(t('scoreAdviceTitle'))}</div>
      <ul class="score-advice-list">${tips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>
    `;
    adviceEl.classList.remove('hidden');
  }

  $('score-player-name').value = state.reportData.author || '';
  $('score-phase-input').classList.remove('hidden');
  $('score-phase-ranking').classList.add('hidden');
  $('score-modal').classList.remove('hidden');
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
    excludedPhotoIds: Array.from(rd.excludedPhotoIds || []),
  };
}
function deserializeReportData(obj) {
  return {
    date: obj?.date || '',
    author: obj?.author || '',
    overview: obj?.overview || '',
    afterword: obj?.afterword || '',
    photoComments: obj?.photoComments || {},
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

// ===== STEP 5: レポート =====
function onStartReport() {
  // メタ情報初期化（日付はシステム側で自動入力しない。ユーザーが date picker で入力）
  $('report-date').value = state.reportData.date || '';
  $('report-author').value = state.reportData.author || '';
  $('report-station').textContent = state.stationName
    ? t('reportStationFmt').replace('{name}', localizeStationName(state.stationName, LANG))
    : '';
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
    wrap.innerHTML = `<p class="report-hint">${escapeHtml(t('reportNoPhotos'))}</p>`;
    return;
  }

  photos.forEach((photo, i) => {
    const item = document.createElement('div');
    item.className = 'report-photo-item';
    item.dataset.fileId = photo.fileId;
    // タグなし時は判別できる class を付ける（CSS で PDF時のみ非表示にする）
    const tagHtml = photo.spotName
      ? `<span class="report-photo-tag">📍 ${photo.spotName}</span>`
      : `<span class="report-photo-tag report-photo-tag-empty">${escapeHtml(t('photoTagless'))}</span>`;
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

// 復元セッションは表示用にサムネ（w800）の blob URL を持つだけで、フル解像度は未取得。
// PDF生成時にだけここでオリジナルを fetch し直し、blob URL をフル解像度に差し替える。
// fullResLoaded === false の写真のみ対象。新規アップロード写真（fullResLoaded undefined or true）はスキップ。
async function ensureFullResolutionPhotos(progressCb) {
  const targets = state.uploadedPhotos.filter(p => p.fullResLoaded === false);
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
        // 旧サムネ blob URL を解放してから差し替え（メモリリーク防止）
        const oldUrl = p.url;
        p.url = URL.createObjectURL(blob);
        p.thumbnailUrl = p.url;
        if (oldUrl && oldUrl.startsWith('blob:') && oldUrl !== p.url) {
          URL.revokeObjectURL(oldUrl);
        }
        p.fullResLoaded = true;
      } catch (e) {
        console.warn('[pdf] full-res fetch failed:', p.fileId, e);
        // フォールバック：サムネのまま PDF を出す（品質は落ちるが生成自体は続行）
      } finally {
        done++;
        if (progressCb) progressCb(done, total);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
}

async function onReportPdf() {
  const btn = $('report-pdf-btn');
  const original = btn.textContent;
  btn.textContent = t('statusGeneratingPdf');
  btn.disabled = true;

  // PDF生成用に固定幅で描画
  const page = document.querySelector('.report-page');
  page.classList.add('pdf-rendering');

  try {
    // 復元セッションでサムネのみ取得済みの写真は、PDF生成前にオリジナル解像度を取得する
    await ensureFullResolutionPhotos((done, total) => {
      btn.textContent = `${t('statusGeneratingPdf')} (${done}/${total})`;
    });
    // フル解像度に差し替えたので、レポート写真の <img src> を更新するため再レンダ
    // （renderReportPhotos は state.uploadedPhotos[].url を読み直す）
    if (state.uploadedPhotos.some(p => p.fullResLoaded === true)) {
      renderReportPhotos();
      // 新しい <img> がロード完了するまで待つ（complete を確認）
      const imgs = page.querySelectorAll('.report-photo-img-wrap img');
      await Promise.all(Array.from(imgs).map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(res => {
          img.addEventListener('load', res, { once: true });
          img.addEventListener('error', res, { once: true });
        });
      }));
    }
    btn.textContent = t('statusGeneratingPdf');

    // Webフォント (Klee One / Yusei Magic) のロード完了を待つ
    // → 待たないと html2canvas が初期表示時のフォールバックフォントで描画してしまうことがある
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
    const SCALE = 2; // html2canvas の scale と一致
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

        // 上記の表示変更後、レイアウトを強制計算してから写真ブロックの位置を取得。
        // 取得した rect はクローンドキュメントの座標 → canvas 座標へは × SCALE で変換。
        void clonedPage.offsetHeight; // force reflow
        const pageRect = clonedPage.getBoundingClientRect();
        const photos = clonedPage.querySelectorAll('.report-photo-item');
        blockRanges = Array.from(photos)
          .filter(el => {
            // display:none を除外（excluded やレイアウト外のもの）
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.width > 0;
          })
          .map(el => {
            const r = el.getBoundingClientRect();
            return {
              top: (r.top - pageRect.top) * SCALE,
              bottom: (r.bottom - pageRect.top) * SCALE,
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
    let offsetPx = 0;
    let pageNum = 0;
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
      const ctx = slice.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, -offsetPx);
      const sliceData = slice.toDataURL('image/jpeg', 0.92);
      const sliceMm = (sliceHeight * pdfW) / canvas.width;
      if (pageNum > 0) pdf.addPage();
      pdf.addImage(sliceData, 'JPEG', 0, 0, pdfW, sliceMm);
      offsetPx += sliceHeight;
      pageNum++;
    }

    const fname = `tanken-note_${state.stationName || 'unknown'}_${new Date().toISOString().slice(0,10)}.pdf`;
    pdf.save(fname);
  } catch (e) {
    console.error(e);
    alert(t('errPdfFailedFmt').replace('{err}', e.message || e));
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

// STEP 5（レポート）
$('back-to-photos').addEventListener('click', () => showStep('step-photos'));
$('report-pdf-btn').addEventListener('click', onReportPdf);

// ノートを Drive に保存
$('save-report-btn').addEventListener('click', onSaveReportToDrive);

// スコア＆ランキング
$('submit-score-btn').addEventListener('click', openScoreModal);
$('score-submit-btn').addEventListener('click', onSubmitScore);
$('score-modal').addEventListener('click', e => {
  if (e.target.dataset.action === 'close') $('score-modal').classList.add('hidden');
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

// ===== 初期表示 =====
// バージョン表示・言語切替を最初に適用
applyI18n();
const versionEl = $('header-version');
if (versionEl) {
  versionEl.textContent = `v${APP_VERSION}`;
  versionEl.title = `${RELEASE_LABEL} v${APP_VERSION} / lang=${LANG}`;
}
console.info(`[tanken-rally] v${APP_VERSION} (${RELEASE_LABEL}) — lang=${LANG}`);

initCityTabs();
// デフォルト: 名古屋タブ + 桜通線を選択（プロジェクトの主要利用エリア）
selectCity('nagoya', { defaultLineName: '名古屋市営地下鉄 桜通線' });
bindReportInputs();
showStep('step-station');

import { CONFIG } from '../config.js?v=17';
import { loadGoogleMaps, geocodeStation, searchNearbySpotsWith, optimizeRoute, getDirections, calcRouteStats } from './utils/maps.js?v=17';
import { fetchOriginStory } from './utils/ai.js?v=17';
import { generateMapPdf } from './utils/pdf.js?v=17';
import { DriveClient, generateSessionId } from './utils/drive.js?v=17';
import { state, resetSearchState, CAT, SELECTED_COLOR } from './state.js?v=17';
import { CITIES } from './data/cities.js?v=17';

// DriveClient（GAS_URLが設定されていれば有効）
const drive = CONFIG.GAS_URL && CONFIG.GAS_URL !== 'YOUR_GAS_DEPLOY_URL'
  ? new DriveClient(CONFIG.GAS_URL, CONFIG.GAS_SECRET)
  : null;

// ===== DOM ヘルパー =====
const $ = id => document.getElementById(id);
const show = id => { $( id ).classList.remove('hidden'); $( id ).classList.add('active'); };
const hide = id => { $( id ).classList.add('hidden'); $( id ).classList.remove('active'); };

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

function selectCity(cityId) {
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
}

// セレクタ「この駅でさがす」 → 既存の onSearchStation を駅名指定で呼ぶ
function onSearchBySelect() {
  const stationName = $('station-select').value;
  if (!stationName) return;
  $('station-input').value = stationName;
  onSearchStation();
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
  ['step-station', 'step-spots', 'step-route', 'step-photos'].forEach(id => {
    const el = document.getElementById(id);
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
async function onSearchStation() {
  const name = $('station-input').value.trim();
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
    state.stationLocation = await geocodeStation(name);
    state.stationName = name;

    // ローディング表示 → そのあと一度だけ地図を初期化
    const mapEl = $('map');
    mapEl.innerHTML = '<div class="loading">スポットを検索中…</div>';

    // Places API は内部的に div を使うため、別途 PlacesService 用のダミー要素を作る
    // （map 要素を innerHTML で書き換えるため、Places の検索が終わるまで地図描画は待つ）
    const placesScratch = document.createElement('div');
    const placesService = new google.maps.places.PlacesService(placesScratch);
    const spots = await searchNearbySpotsWith(placesService, state.stationLocation);
    state.allSpots = spots;

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
function renderSpotsList(map) {
  const list = $('spots-list');
  list.innerHTML = '';

  // マーカーを追加（カテゴリ別の識別色、選択中は黄色）
  const markers = {};
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
    markers[spot.id] = marker;

    // カード生成（史跡は recommended 装飾でハイライト、ただし選択は任意）
    const card = document.createElement('div');
    card.className = `spot-card${spot.recommended ? ' recommended' : ''}`;
    card.dataset.spotId = spot.id;
    card.innerHTML = `
      <span class="spot-num" style="background:${cat.color}">${i + 1}</span>
      <span class="spot-check">⬜</span>
      <div class="spot-info">
        <div class="spot-name">${spot.name}${spot.recommended ? ' <span class="spot-badge">必ず1つ</span>' : ''}</div>
        <span class="spot-category ${cat.cls}">${cat.icon} ${cat.label}</span>
        <div class="spot-desc">${spot.address}</div>
      </div>
    `;

    card.addEventListener('click', () => toggleSpot(spot, card, markers));
    list.appendChild(card);

    // マーカークリックでカードをハイライト
    marker.addListener('click', () => {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      card.style.outline = '3px solid #004029';
      setTimeout(() => { card.style.outline = ''; }, 1500);
    });
  });

  updateMakeRouteBtn();
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

    // ルート地図初期化（fitBounds で全スポットが入るよう自動調整）
    const routeMapEl = $('route-map');
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
    // スタート駅
    parts.push(`
      <div class="route-spot-item route-station">
        <span class="route-spot-num start">S</span>
        <span>🚉 <strong>${state.stationName}駅</strong>（スタート）</span>
      </div>`);
    // 各スポット（前の区間 + スポット）
    state.orderedSpots.forEach((s, i) => {
      const cat = CAT[s.category] || CAT.other;
      if (legs[i]) parts.push(legHtml(legs[i]));
      parts.push(`
        <div class="route-spot-item">
          <span class="route-spot-num">${i + 1}</span>
          <span>${cat.icon} <strong>${s.name}</strong> — ${s.address}</span>
        </div>`);
    });
    // 最終区間（最後のスポット → 駅）
    const lastLeg = legs[legs.length - 1];
    if (lastLeg) parts.push(legHtml(lastLeg));
    // ゴール駅
    parts.push(`
      <div class="route-spot-item route-station">
        <span class="route-spot-num goal">G</span>
        <span>🚉 <strong>${state.stationName}駅</strong>（ゴール）</span>
      </div>`);
    $('route-spots').innerHTML = parts.join('');

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

    // スポットセレクターを設定
    const sel = $('photo-spot-select');
    sel.innerHTML = '<option value="">── どこで撮った？（任意）──</option>';
    state.orderedSpots.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${i + 1}. ${s.name}`;
      sel.appendChild(opt);
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
        info.innerHTML = `📂 保存先: <a href="${state.driveSession.folderUrl}" target="_blank" style="color:#2e7d32">${state.driveSession.folderName}</a>`;
      } catch (e) {
        info.textContent = `⚠️ Drive接続エラー（写真はローカルのみ）: ${e.message}`;
        console.warn('Drive session creation failed:', e);
      }
    } else {
      $('photos-session-info').textContent = '📸 写真を撮って探検の記録をのこそう！（GAS未設定のためローカルのみ）';
    }

    state.uploadedPhotos = [];
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
    const spotName = $('photo-spot-select').value;
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
        // tempエントリを置き換え（古い blob URL を解放してから差し替え）
        const idx = state.uploadedPhotos.findIndex(p => p.fileId === tempId);
        if (idx >= 0) {
          const oldUrl = state.uploadedPhotos[idx].url;
          state.uploadedPhotos[idx] = { ...result, uploading: false };
          if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
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
    const item = document.createElement('div');
    item.className = `photo-item${state.selectedPhotoIds.has(photo.fileId) ? ' selected' : ''}${photo.uploading ? ' photo-uploading' : ''}`;
    item.innerHTML = `
      <img src="${photo.thumbnailUrl}" alt="${photo.fileName}" loading="lazy" />
      <div class="photo-overlay">${photo.spotName || '場所未設定'}</div>
      <span class="photo-check">${state.selectedPhotoIds.has(photo.fileId) ? '✅' : ''}</span>
    `;
    item.addEventListener('click', () => {
      if (photo.uploading) return;
      if (state.selectedPhotoIds.has(photo.fileId)) {
        state.selectedPhotoIds.delete(photo.fileId);
      } else {
        state.selectedPhotoIds.add(photo.fileId);
      }
      renderPhotosGrid();
    });
    grid.appendChild(item);
  });
  updatePhotosCount();
}

function updatePhotosCount() {
  const total = state.uploadedPhotos.length;
  const sel = state.selectedPhotoIds.size;
  $('photos-count').textContent = sel > 0 ? `${total}枚（${sel}枚選択中）` : `${total}枚`;
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
$('back-to-route').addEventListener('click', () => showStep('step-route'));
$('finish-explore-btn').addEventListener('click', () => {
  // TODO: レポート生成ステップへ（Phase 2）
  alert(`🎉 探検おわり！\n📸 ${state.uploadedPhotos.length}枚の写真を撮りました。\nレポート機能は近日公開予定です！`);
});

// ===== 初期表示 =====
initCityTabs();
selectCity('tokyo'); // デフォルト: 東京タブ選択
showStep('step-station');

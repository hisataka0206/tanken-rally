// アプリ全体で共有する状態
// （PoCのためモジュールスコープで保持。本番ではストア化推奨）

export const state = {
  // STEP 1
  stationName: '',
  stationLocation: null,        // google.maps.LatLng

  // STEP 2 (スポット選択)
  allSpots: [],                 // [{ id, name, category, address, lat, lng, ... }]
  selectedSpotIds: new Set(),

  // STEP 3 (ルート)
  orderedSpots: [],
  directionsResult: null,
  routeStats: null,
  mapInstances: {},             // { spots: Map, route: Map }

  // STEP 4 (写真)
  sessionId: null,
  driveSession: null,           // { folderId, folderUrl, folderName }
  uploadedPhotos: [],           // [{ fileId, url, thumbnailUrl, spotName, fileName, uploading }]
  selectedPhotoIds: new Set(),
};

// 駅再検索時のクリーンアップ。blob URL は明示的に解放する
export function resetSearchState() {
  state.uploadedPhotos.forEach(p => {
    if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  });
  state.allSpots = [];
  state.selectedSpotIds.clear();
  state.orderedSpots = [];
  state.directionsResult = null;
  state.routeStats = null;
  state.uploadedPhotos = [];
  state.selectedPhotoIds.clear();
  state.driveSession = null;
  state.sessionId = null;
}

// カテゴリのラベル定義（main.js / pdf.js / style.css で共用）
// color: カードの番号バッジ／地図マーカーで使う識別色
export const CAT = {
  historic: { label: '史跡・文化財',     cls: 'cat-historic', icon: '🏯', color: '#795548' }, // 茶
  sweets:   { label: 'スイーツ・菓子店', cls: 'cat-sweets',   icon: '🍰', color: '#e91e8c' }, // ピンク
  nature:   { label: '公園・自然',       cls: 'cat-nature',   icon: '🌿', color: '#2e7d32' }, // 緑
  other:    { label: 'その他',           cls: 'cat-other',    icon: '📍', color: '#666666' }, // グレー
};

// 選択中のハイライト色（カテゴリ色と被らない金黄色）
export const SELECTED_COLOR = '#fbc02d';

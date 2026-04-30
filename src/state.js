// アプリ全体で共有する状態
// （PoCのためモジュールスコープで保持。本番ではストア化推奨）

export const state = {
  // STEP 1
  stationName: '',
  stationLocation: null,        // google.maps.LatLng
  cityId: '',                   // 'tokyo'/'nagoya'/'osaka'/'kobe'/'kyoto'/'other' — ランキングの地域単位に使う

  // STEP 2 (スポット選択)
  allSpots: [],                 // [{ id, name, category, address, lat, lng, ... }]
  selectedSpotIds: new Set(),
  visibleCategories: new Set(['historic', 'sweets', 'nature', 'toy', 'museum', 'science']),

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

  // STEP 5 (レポート)
  reportData: {
    date: '',
    author: '',
    overview: '',
    afterword: '',
    photoComments: {},          // { fileId: '感想' }
    excludedPhotoIds: new Set(),// レポートから除外する写真ID
  },
};

// 駅再検索時のクリーンアップ。blob URL は明示的に解放する
export function resetSearchState() {
  state.uploadedPhotos.forEach(p => {
    if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  });
  state.allSpots = [];
  state.selectedSpotIds.clear();
  state.visibleCategories = new Set(['historic', 'sweets', 'nature', 'toy', 'museum', 'science']);
  state.orderedSpots = [];
  state.directionsResult = null;
  state.routeStats = null;
  state.uploadedPhotos = [];
  state.selectedPhotoIds.clear();
  state.driveSession = null;
  state.sessionId = null;
  state.reportData = {
    date: '', author: '', overview: '', afterword: '',
    photoComments: {},
    excludedPhotoIds: new Set(),
  };
}

// カテゴリのラベル定義（main.js / pdf.js / style.css で共用）
// color: カードの番号バッジ／地図マーカーで使う識別色
export const CAT = {
  historic: { label: '史跡・文化財',     cls: 'cat-historic', icon: '🏯', color: '#795548' }, // 茶
  sweets:   { label: 'スイーツ・菓子店', cls: 'cat-sweets',   icon: '🍰', color: '#e91e8c' }, // ピンク
  nature:   { label: '公園・自然',       cls: 'cat-nature',   icon: '🌿', color: '#2e7d32' }, // 緑
  toy:      { label: '玩具・おもちゃ',   cls: 'cat-toy',      icon: '🧸', color: '#ff9800' }, // オレンジ
  museum:   { label: '美術館・博物館',   cls: 'cat-museum',   icon: '🎨', color: '#5e35b1' }, // 紫
  science:  { label: '科学館・自然史',   cls: 'cat-science',  icon: '🔬', color: '#0097a7' }, // 青緑
  other:    { label: 'その他',           cls: 'cat-other',    icon: '📍', color: '#666666' }, // グレー
};

// 選択中のハイライト色（カテゴリ色と被らない金黄色）
export const SELECTED_COLOR = '#fbc02d';

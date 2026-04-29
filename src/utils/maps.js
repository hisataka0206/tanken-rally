// Google Maps API の動的ロードとユーティリティ

let mapsLoaded = false;

export function loadGoogleMaps(apiKey) {
  if (mapsLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&language=ja`;
    script.async = true;
    script.defer = true;
    script.onload = () => { mapsLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// 駅名からジオコード（緯度経度）を取得
// opts.cityName / opts.lineName を渡すと、同名駅の曖昧性解消用にクエリへ追加する
//   例: cityName="名古屋市", lineName="名古屋市営地下鉄 桜通線", stationName="吹上"
//        → "名古屋市 名古屋市営地下鉄 桜通線 吹上駅"
//
// 動作仕様：
//   1. Geocoding API を試す（最優先・精度が一番高い）
//   2. 失敗 (REQUEST_DENIED 等) なら Places API findPlaceFromQuery にフォールバック
//      → Geocoding API が Cloud で有効化されていなくても、Places が有効なら動く
export function geocodeStation(stationName, opts = {}) {
  return new Promise((resolve, reject) => {
    const parts = [];
    if (opts.cityName) parts.push(opts.cityName);
    if (opts.lineName) parts.push(opts.lineName);
    parts.push(`${stationName}駅`);
    const address = parts.join(' ');

    // Places API へのフォールバック（無料で使える findPlaceFromQuery）
    const tryPlacesFallback = (reason = 'unknown') => {
      const ps = new google.maps.places.PlacesService(document.createElement('div'));
      const queries = parts.length > 1
        ? [address, `${stationName}駅`]   // コンテキスト付き → 単独 の順で試す
        : [`${stationName}駅`];

      const tryQuery = (i) => {
        if (i >= queries.length) {
          reject(new Error(`駅が見つかりませんでした: ${stationName}（Geocoding/Places どちらも失敗）`));
          return;
        }
        ps.findPlaceFromQuery({
          query: queries[i],
          fields: ['geometry', 'name'],
          language: 'ja',
        }, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK
              && results && results[0] && results[0].geometry?.location) {
            console.warn(`[geocodeStation] Places API フォールバック成功 (Geocoding 失敗理由: ${reason})`);
            resolve(results[0].geometry.location);
          } else {
            tryQuery(i + 1);
          }
        });
      };
      tryQuery(0);
    };

    // 1) Geocoding API を試す
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode(
      { address, region: 'JP', language: 'ja' },
      (results, status) => {
        if (status === 'OK' && results && results[0]) {
          resolve(results[0].geometry.location);
        } else if (status === 'REQUEST_DENIED' || status === 'OVER_QUERY_LIMIT') {
          // API無効 or quota超過 → Places にフォールバック
          tryPlacesFallback(status);
        } else if (parts.length > 1) {
          // 結果0件 → コンテキスト無しで再試行
          geocoder.geocode(
            { address: `${stationName}駅`, region: 'JP', language: 'ja' },
            (r2, s2) => {
              if (s2 === 'OK' && r2 && r2[0]) {
                resolve(r2[0].geometry.location);
              } else if (s2 === 'REQUEST_DENIED' || s2 === 'OVER_QUERY_LIMIT') {
                tryPlacesFallback(s2);
              } else {
                tryPlacesFallback(`Geocode ${s2}`);
              }
            }
          );
        } else {
          tryPlacesFallback(`Geocode ${status}`);
        }
      }
    );
  });
}

// 周辺スポットを検索（Places API）
// container: PlacesService に渡す DOM 要素 (map でもダミー div でもOK)
export function searchNearbySpots(location, container) {
  const service = container instanceof google.maps.Map
    ? new google.maps.places.PlacesService(container)
    : new google.maps.places.PlacesService(container || document.createElement('div'));

  return _searchWithService(service, location);
}

// PlacesService インスタンスを直接渡す版
export function searchNearbySpotsWith(service, location) {
  return _searchWithService(service, location);
}

function _searchWithService(service, location) {
  const queries = [
    { keyword: '神社 OR 寺 OR 史跡 OR 城跡 OR 記念碑',     category: 'historic', label: '史跡・文化財' },
    { keyword: 'ケーキ屋 OR 和菓子 OR お菓子 OR スイーツ', category: 'sweets',   label: 'スイーツ・菓子店' },
    { keyword: '公園 OR 庭園',                             category: 'nature',   label: '公園・自然' },
    { keyword: 'おもちゃ屋 OR 玩具店 OR キャラクターショップ', category: 'toy',  label: '玩具・おもちゃ' },
    { keyword: '美術館 OR 博物館 OR 資料館 OR ギャラリー',  category: 'museum',   label: '美術館・博物館' },
    { keyword: '科学館 OR プラネタリウム OR 天文台',        category: 'science',  label: '科学館・自然史' },
  ];

  const allSpots = [];
  const seenIds = new Set(); // place_id 重複除去（複数カテゴリの keyword に同じ場所がヒットすることがある）
  let pending = queries.length;

  // カテゴリ優先度: historic > museum/science > nature > toy > sweets > other
  // 同じ place_id が複数カテゴリにマッチした場合、優先度の高いカテゴリで保持
  const CAT_PRIORITY = { historic: 6, museum: 5, science: 5, nature: 4, toy: 3, sweets: 2, other: 0 };

  return new Promise((resolve) => {
    queries.forEach(q => {
      service.nearbySearch(
        {
          location,
          radius: 1500,           // 駅から半径1.5km。1時間以内のフィルタは Directions API 後に判定
          keyword: q.keyword,
          language: 'ja',
        },
        (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            results.slice(0, 4).forEach(place => {
              const newSpot = {
                id: place.place_id,
                name: place.name,
                category: q.category,
                label: q.label,
                address: place.vicinity || '',
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                rating: place.rating || null,
                desc: place.types?.join('、') || '',
                recommended: q.category === 'historic',  // 史跡は推奨表示。選択は任意だが最低1件必要
              };
              if (seenIds.has(place.place_id)) {
                // 既に登録済み: 優先度の高いカテゴリで上書き
                const existing = allSpots.find(s => s.id === place.place_id);
                if (existing && CAT_PRIORITY[q.category] > CAT_PRIORITY[existing.category]) {
                  Object.assign(existing, newSpot);
                }
              } else {
                seenIds.add(place.place_id);
                allSpots.push(newSpot);
              }
            });
          }
          pending--;
          if (pending === 0) resolve(allSpots);
        }
      );
    });
  });
}

// ルート最適化（簡易: 出発点から最近傍法）
export function optimizeRoute(origin, spots) {
  const remaining = [...spots];
  const ordered = [];
  let current = toLatLngLiteral(origin);

  while (remaining.length > 0) {
    let minDist = Infinity;
    let nearest = 0;
    remaining.forEach((s, i) => {
      const d = haversine(current, s);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    ordered.push(remaining[nearest]);
    current = remaining[nearest];
    remaining.splice(nearest, 1);
  }
  return ordered;
}

// LatLng インスタンス / plain object どちらも { lat, lng } に正規化
export function toLatLngLiteral(loc) {
  if (!loc) return null;
  if (typeof loc.lat === 'function') return { lat: loc.lat(), lng: loc.lng() };
  return { lat: loc.lat, lng: loc.lng };
}

function haversine(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

// Directions API でルート取得（駅 → スポット1 → ... → スポットN → 駅 のループ）
export function getDirections(origin, orderedSpots) {
  return new Promise((resolve, reject) => {
    const service = new google.maps.DirectionsService();
    const waypoints = orderedSpots.map(s => ({
      location: new google.maps.LatLng(s.lat, s.lng),
      stopover: true,
    }));
    // 出発も到着も駅に固定（ループルート）
    service.route(
      {
        origin,
        destination: origin,
        waypoints,
        travelMode: google.maps.TravelMode.WALKING,
        language: 'ja',
      },
      (result, status) => {
        if (status === 'OK') resolve(result);
        else reject(new Error('ルートの取得に失敗しました'));
      }
    );
  });
}

// 総距離・時間を計算
export function calcRouteStats(directionsResult) {
  const legs = directionsResult.routes[0].legs;
  const totalDist = legs.reduce((sum, l) => sum + l.distance.value, 0);
  const totalTime = legs.reduce((sum, l) => sum + l.duration.value, 0);
  return {
    distanceM: totalDist,
    distanceText: totalDist >= 1000 ? `${(totalDist/1000).toFixed(1)}km` : `${totalDist}m`,
    durationMin: Math.round(totalTime / 60),
  };
}

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
//   例: cityName="名古屋", lineName="名古屋市営地下鉄 桜通線", stationName="吹上"
//        → "名古屋 名古屋市営地下鉄 桜通線 吹上駅"
// opts.bounds (= { sw:{lat,lng}, ne:{lat,lng} }) を渡すと geocoder の検索範囲をその矩形にバイアス。
// opts.center を渡すと結果が center に近いものを優先する後処理を行う（同点時の判定）。
//
// 動作仕様：
//   1. Geocoding API を試す（最優先・精度が一番高い）
//      - bounds があれば探索を都市範囲に絞り込む
//      - bounds 内の結果がなければ範囲外でも採用
//   2. 失敗 (REQUEST_DENIED 等) なら Places API findPlaceFromQuery にフォールバック
//      - locationRestriction を bounds で指定して市内の場所のみ取得
//   3. 全部失敗 → エラー
export function geocodeStation(stationName, opts = {}) {
  return new Promise((resolve, reject) => {
    const parts = [];
    if (opts.cityName) parts.push(opts.cityName);
    if (opts.lineName) parts.push(opts.lineName);
    parts.push(`${stationName}駅`);
    const address = parts.join(' ');

    const gmBounds = opts.bounds
      ? new google.maps.LatLngBounds(
          new google.maps.LatLng(opts.bounds.sw.lat, opts.bounds.sw.lng),
          new google.maps.LatLng(opts.bounds.ne.lat, opts.bounds.ne.lng)
        )
      : null;

    // bounds 内の結果を最優先で選ぶ。なければ最初の結果を返す。
    const pickBest = (results) => {
      if (!results || !results.length) return null;
      if (gmBounds) {
        const inside = results.find(r => {
          const loc = r.geometry?.location;
          return loc && gmBounds.contains(loc);
        });
        if (inside) return inside.geometry.location;
      }
      return results[0].geometry.location;
    };

    // Places API へのフォールバック（findPlaceFromQuery）
    const tryPlacesFallback = (reason = 'unknown') => {
      const ps = new google.maps.places.PlacesService(document.createElement('div'));
      const queries = parts.length > 1
        ? [address, `${stationName}駅`]
        : [`${stationName}駅`];

      const tryQuery = (i) => {
        if (i >= queries.length) {
          reject(new Error(`駅が見つかりませんでした: ${stationName}（Geocoding/Places どちらも失敗）`));
          return;
        }
        const req = {
          query: queries[i],
          fields: ['geometry', 'name'],
          language: 'ja',
        };
        // locationBias は SW/NE タプルか radius/center で指定（ここでは bounds の長方形で）
        if (gmBounds) req.locationBias = gmBounds;
        ps.findPlaceFromQuery(req, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK
              && results && results[0] && results[0].geometry?.location) {
            console.warn(`[geocodeStation] Places API フォールバック成功 (Geocoding 失敗理由: ${reason})`);
            // bounds がある場合は内側の結果を優先（誤マッチ回避）
            if (gmBounds) {
              const inside = results.find(r => r.geometry?.location && gmBounds.contains(r.geometry.location));
              if (inside) { resolve(inside.geometry.location); return; }
            }
            resolve(results[0].geometry.location);
          } else {
            tryQuery(i + 1);
          }
        });
      };
      tryQuery(0);
    };

    // 1) Geocoding API を試す（bounds bias あり）
    const geocoder = new google.maps.Geocoder();
    const baseReq = { address, region: 'JP', language: 'ja' };
    if (gmBounds) baseReq.bounds = gmBounds;

    geocoder.geocode(baseReq, (results, status) => {
      if (status === 'OK' && results && results.length) {
        const loc = pickBest(results);
        if (loc) { resolve(loc); return; }
      }
      if (status === 'REQUEST_DENIED' || status === 'OVER_QUERY_LIMIT') {
        tryPlacesFallback(status);
        return;
      }
      // 結果0件 or 拾えなかった → コンテキスト無しで再試行
      if (parts.length > 1) {
        const fallbackReq = { address: `${stationName}駅`, region: 'JP', language: 'ja' };
        if (gmBounds) fallbackReq.bounds = gmBounds;
        geocoder.geocode(fallbackReq, (r2, s2) => {
          if (s2 === 'OK' && r2 && r2.length) {
            const loc = pickBest(r2);
            if (loc) { resolve(loc); return; }
          }
          if (s2 === 'REQUEST_DENIED' || s2 === 'OVER_QUERY_LIMIT') tryPlacesFallback(s2);
          else tryPlacesFallback(`Geocode ${s2}`);
        });
      } else {
        tryPlacesFallback(`Geocode ${status}`);
      }
    });
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
  // 教訓：
  //   - 旧 PlacesService.nearbySearch の `type` パラメータは現行 API では実質的に効かないことがあり、
  //     結果がプロミネンス順の汎用近傍リスト（=飲食店等）になりがち。⛔️
  //   - `keyword` の OR 連結（"神社 OR 寺 OR ..."）も期待通りに動かないケースが多く、
  //     特定名称（例: "大須観音"）を取り逃すことが頻発。⛔️
  //   - 最も信頼性が高いのは **単一キーワードの個別検索 + 結果マージ**。
  //     1キーワード=1リクエストでコストはかかるが、網羅性と精度を両立できる。✅
  //   - "観音" を独立クエリにすることで大須観音などの観音堂を確実にヒット。
  //   - 加えて place.types を見て「明らかに違うカテゴリ」を後段で除外する防御フィルタを併用。
  const queries = [
    // === 史跡・文化財 ===
    { keyword: '神社',     category: 'historic', label: '史跡・文化財' },
    { keyword: '寺',       category: 'historic', label: '史跡・文化財' },
    { keyword: '観音',     category: 'historic', label: '史跡・文化財' },
    { keyword: '史跡',     category: 'historic', label: '史跡・文化財' },
    { keyword: '古墳',     category: 'historic', label: '史跡・文化財' },
    // === スイーツ ===
    { keyword: 'ケーキ',   category: 'sweets',   label: 'スイーツ・菓子店' },
    { keyword: '和菓子',   category: 'sweets',   label: 'スイーツ・菓子店' },
    // === 公園・自然 ===
    { keyword: '公園',     category: 'nature',   label: '公園・自然' },
    // === 玩具・おもちゃ ===
    { keyword: 'おもちゃ', category: 'toy',      label: '玩具・おもちゃ' },
    // === 美術館・博物館 ===
    { keyword: '美術館',   category: 'museum',   label: '美術館・博物館' },
    { keyword: '博物館',   category: 'museum',   label: '美術館・博物館' },
    // === 科学館・自然史 ===
    { keyword: '科学館',   category: 'science',  label: '科学館・自然史' },
  ];

  const allSpots = [];
  const seenIds = new Set();
  let pending = queries.length;

  // 同じ place_id が複数クエリにマッチした場合、優先度の高いカテゴリで上書き
  const CAT_PRIORITY = { historic: 6, science: 5, museum: 4, nature: 3, toy: 2, sweets: 1, other: 0 };
  // 1クエリあたりの最大取得件数（少なくして全体件数を抑える）
  const RESULTS_PER_QUERY = 3;
  // 駅からの検索半径（徒歩往復で60分に収まりやすい範囲に絞る）
  const SEARCH_RADIUS_M = 800;

  // 史跡カテゴリに混入したくない place.types
  // （keyword='神社' でも稀に「神社町○○店」のような飲食店が混ざるため）
  const FORBIDDEN_TYPES_FOR_HISTORIC = new Set([
    'restaurant', 'cafe', 'food', 'bar', 'meal_takeaway', 'meal_delivery',
    'convenience_store', 'supermarket', 'lodging', 'gas_station',
    'pharmacy', 'doctor', 'dentist', 'hospital', 'school',
    'clothing_store', 'shoe_store', 'jewelry_store',
  ]);
  // 公園カテゴリに混入したくないもの
  const FORBIDDEN_TYPES_FOR_NATURE = new Set([
    'restaurant', 'cafe', 'food', 'bar', 'lodging', 'parking',
  ]);

  return new Promise((resolve) => {
    queries.forEach(q => {
      service.nearbySearch(
        {
          location,
          radius: SEARCH_RADIUS_M,
          keyword: q.keyword,
          language: 'ja',
        },
        (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            results.slice(0, RESULTS_PER_QUERY).forEach(place => {
              const types = place.types || [];

              // カテゴリ別の防御フィルタ
              if (q.category === 'historic'
                  && types.some(t => FORBIDDEN_TYPES_FOR_HISTORIC.has(t))) return;
              if (q.category === 'nature'
                  && types.some(t => FORBIDDEN_TYPES_FOR_NATURE.has(t))) return;

              const newSpot = {
                id: place.place_id,
                name: place.name,
                category: q.category,
                label: q.label,
                address: place.vicinity || '',
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                rating: place.rating || null,
                desc: types.join('、'),
                recommended: q.category === 'historic',
              };
              if (seenIds.has(place.place_id)) {
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
          if (pending === 0) {
            // 駅からの直線距離で昇順ソート（近い順 = ルートに組みやすい順）
            const origin = toLatLngLiteral(location);
            allSpots.sort((a, b) => haversine(origin, a) - haversine(origin, b));
            resolve(allSpots);
          }
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

// 2点間の直線距離（メートル）。駅から各スポットの距離計算で UI 側からも使うため export。
export function haversine(a, b) {
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

// Google Maps API の動的ロードとユーティリティ
import { apiLang } from './i18n.js?v=80';

let mapsLoaded = false;

export function loadGoogleMaps(apiKey) {
  if (mapsLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // language= に EN/ja を渡すことで Geocoding / Places / Directions の結果が
    // 該当言語で返ってくる
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&language=${apiLang()}`;
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
    // ※ cityName はクエリ文字列に含めない。
    //   理由: 駅が市境をまたぐケース（例: 新居町駅は浜松エリアの bounds 内だが
    //         行政区分は湖西市）で「浜松 ... 新居町駅」と検索すると、Google が
    //         「浜松内で該当駅なし」と判断して浜松駅を返す誤マッチを起こす。
    //   都市の絞り込みは bounds bias で十分行えるため、address 文字列には含めない。
    //   lineName は他都市の同名駅（例: 三条駅）の曖昧解消に有用なので残す。
    const parts = [];
    if (opts.lineName) parts.push(opts.lineName);
    parts.push(`${stationName}駅`);
    const address = parts.join(' ');

    const gmBounds = opts.bounds
      ? new google.maps.LatLngBounds(
          new google.maps.LatLng(opts.bounds.sw.lat, opts.bounds.sw.lng),
          new google.maps.LatLng(opts.bounds.ne.lat, opts.bounds.ne.lng)
        )
      : null;

    // 結果の選定優先度（誤マッチ対策）：
    //   1. bounds 内 かつ 駅型（train_station / transit_station / subway_station）
    //   2. bounds 内（型は問わない）
    //   3. 駅型（bounds は問わない）— 唯一の駅名なら別都市まで広げても正しいことが多い
    //   4. 最初の結果（最終手段）
    //
    // 旧実装は (2) → (4) しかなかったため、たとえば「浜松 JR東海道本線 舞阪駅」で
    // Google が「舞阪町（地域）」や「浜松（広域中心点）」を返したとき、それが bounds 内に
    // 入ると駅本来の位置ではない場所が採用される問題があった。
    const isStation = (r) => {
      const types = r.types || [];
      return types.includes('train_station')
          || types.includes('transit_station')
          || types.includes('subway_station')
          || types.includes('light_rail_station');
    };
    const pickBest = (results) => {
      if (!results || !results.length) return null;
      if (gmBounds) {
        // (1) bounds 内 かつ 駅型
        const insideStation = results.find(r => {
          const loc = r.geometry?.location;
          return loc && gmBounds.contains(loc) && isStation(r);
        });
        if (insideStation) return insideStation.geometry.location;
        // (2) bounds 内（型は問わない）
        const inside = results.find(r => {
          const loc = r.geometry?.location;
          return loc && gmBounds.contains(loc);
        });
        if (inside) return inside.geometry.location;
      }
      // (3) 駅型（bounds 外でも採用）
      const stationResult = results.find(isStation);
      if (stationResult) return stationResult.geometry.location;
      // (4) 最終フォールバック
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
          language: apiLang(),
        };
        // locationBias は SW/NE タプルか radius/center で指定（ここでは bounds の長方形で）
        if (gmBounds) req.locationBias = gmBounds;
        // Places API では fields に 'types' を含めて駅型かどうかを判定
        req.fields = ['geometry', 'name', 'types'];
        ps.findPlaceFromQuery(req, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK
              && results && results[0] && results[0].geometry?.location) {
            console.warn(`[geocodeStation] Places API フォールバック成功 (Geocoding 失敗理由: ${reason})`);
            // 同じ4段階の優先度で選定（駅型 + bounds 内が最優先）
            if (gmBounds) {
              const insideStation = results.find(r =>
                r.geometry?.location && gmBounds.contains(r.geometry.location) && isStation(r));
              if (insideStation) { resolve(insideStation.geometry.location); return; }
              const inside = results.find(r =>
                r.geometry?.location && gmBounds.contains(r.geometry.location));
              if (inside) { resolve(inside.geometry.location); return; }
            }
            const stationResult = results.find(isStation);
            if (stationResult) { resolve(stationResult.geometry.location); return; }
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
    const baseReq = { address, region: 'JP', language: apiLang() };
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
        const fallbackReq = { address: `${stationName}駅`, region: 'JP', language: apiLang() };
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

// 個別スポットの営業時間（opening_hours）を取得。失敗時は null。
// fields に opening_hours を含めることで Place Details (Contact Data) を取得する。
export function fetchOpeningHours(service, placeId) {
  return new Promise(resolve => {
    service.getDetails(
      { placeId, fields: ['opening_hours'] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          resolve(place.opening_hours || null);
        } else {
          resolve(null); // 取れなかったら不明扱い
        }
      }
    );
  });
}

// opening_hours と「日付＋開始/終了時刻」から、指定時間帯のいずれかでお店が
// 営業しているかを判定。
//   true  : 重なる営業時間あり（=この時間帯に開いている）
//   false : 重なる営業時間なし（=確実に閉まっている）
//   null  : opening_hours が不明・解釈不能（=判定保留 → 表示すべき）
export function isPlaceOpenInWindow(opening_hours, dateStr, startTime, endTime) {
  if (!opening_hours) return null;
  const periods = opening_hours.periods || [];
  if (periods.length === 0) return null;

  // 24時間営業の特殊ケース
  if (periods.length === 1 && periods[0].open
      && periods[0].open.time === '0000' && !periods[0].close) {
    return true;
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const day = date.getDay(); // 0=Sun
  const [sh, sm] = (startTime || '10:00').split(':').map(Number);
  const [eh, em] = (endTime   || '17:00').split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;

  for (const p of periods) {
    if (!p.open) continue;
    if (p.open.day !== day) continue;
    const openMin = parseInt(p.open.time.slice(0, 2), 10) * 60
                  + parseInt(p.open.time.slice(2, 4), 10);
    let closeMin;
    if (p.close) {
      closeMin = parseInt(p.close.time.slice(0, 2), 10) * 60
               + parseInt(p.close.time.slice(2, 4), 10);
      // 翌日にまたがる場合（例: 22:00〜02:00）は close を +24h
      if (p.close.day !== p.open.day) closeMin += 24 * 60;
    } else {
      closeMin = 24 * 60; // close 情報なし → 1日中営業扱い
    }
    // [startMin, endMin] と [openMin, closeMin] が重なるか判定
    if (Math.max(startMin, openMin) < Math.min(endMin, closeMin)) {
      return true;
    }
  }
  return false;
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
    // === 駄菓子屋 ===
    // 古い個人商店（荒牧商店・杉若商店など）は店名に「駄菓子」を含まないので、
    // 複数キーワード + textSearch 併用で網羅性を確保する。
    { keyword: '駄菓子',   category: 'dagashi',  label: '駄菓子屋' },
    { keyword: '駄菓子屋', category: 'dagashi',  label: '駄菓子屋' },
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
  // textSearch（駄菓子用の補助検索）を併用するため pending は queries.length + textSearch分
  let pending = queries.length + 1;

  // 同じ place_id が複数クエリにマッチした場合、優先度の高いカテゴリで上書き
  const CAT_PRIORITY = { historic: 7, science: 6, museum: 5, nature: 4, toy: 3, dagashi: 2, sweets: 1, other: 0 };
  // 1クエリあたりの最大取得件数（カテゴリごとに調整：駄菓子屋は小規模店多数のため広めに取る）
  const RESULTS_PER_QUERY_BY_CAT = {
    dagashi: 10,
    sweets: 3,
    historic: 3,
    nature: 3,
    toy: 3,
    museum: 3,
    science: 3,
    other: 3,
  };
  const DEFAULT_RESULTS_PER_QUERY = 3;
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

  // 結果の処理を共通化（nearbySearch / textSearch どちらからの結果も同じロジックで処理）
  const ingest = (place, category, label) => {
    const types = place.types || [];

    // カテゴリ別の防御フィルタ
    if (category === 'historic' && types.some(t => FORBIDDEN_TYPES_FOR_HISTORIC.has(t))) return;
    if (category === 'nature'   && types.some(t => FORBIDDEN_TYPES_FOR_NATURE.has(t)))   return;

    const newSpot = {
      id: place.place_id,
      name: place.name,
      category,
      label,
      address: place.vicinity || place.formatted_address || '',
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      rating: place.rating || null,
      desc: types.join('、'),
      recommended: category === 'historic',
    };
    if (seenIds.has(place.place_id)) {
      const existing = allSpots.find(s => s.id === place.place_id);
      if (existing && CAT_PRIORITY[category] > CAT_PRIORITY[existing.category]) {
        Object.assign(existing, newSpot);
      }
    } else {
      seenIds.add(place.place_id);
      allSpots.push(newSpot);
    }
  };

  return new Promise((resolve) => {
    queries.forEach(q => {
      const limit = RESULTS_PER_QUERY_BY_CAT[q.category] || DEFAULT_RESULTS_PER_QUERY;
      service.nearbySearch(
        {
          location,
          radius: SEARCH_RADIUS_M,
          keyword: q.keyword,
          language: apiLang(),
        },
        (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            results.slice(0, limit).forEach(place => ingest(place, q.category, q.label));
          }
          pending--;
          if (pending === 0) {
            const origin = toLatLngLiteral(location);
            allSpots.sort((a, b) => haversine(origin, a) - haversine(origin, b));
            resolve(allSpots);
          }
        }
      );
    });

    // 駄菓子屋の補助検索（textSearch）：
    // nearbySearch は keyword をレビュー本文・types などにファジー一致させる仕様だが、
    // 「荒牧商店」のような店名に「駄菓子」を含まない古い個人商店は順位が低くて
    // 上位3〜10件には載らないことがある。textSearch の結果は別アルゴリズムなので
    // 補完的に併用することで取りこぼしを減らす。
    service.textSearch(
      {
        query: '駄菓子屋',
        location,
        radius: SEARCH_RADIUS_M,
        language: apiLang(),
      },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          // 駅からの直線距離が search radius 内のものだけ採用
          const origin = toLatLngLiteral(location);
          const filtered = results.filter(p => {
            if (!p.geometry || !p.geometry.location) return false;
            const d = haversine(origin, { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() });
            return d <= SEARCH_RADIUS_M;
          });
          filtered.slice(0, 10).forEach(place => ingest(place, 'dagashi', '駄菓子屋'));
        }
        pending--;
        if (pending === 0) {
          const origin = toLatLngLiteral(location);
          allSpots.sort((a, b) => haversine(origin, a) - haversine(origin, b));
          resolve(allSpots);
        }
      }
    );
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
        language: apiLang(),
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

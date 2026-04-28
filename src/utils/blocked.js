// 不適切スポットのブロック管理
//
// 蓄積される情報：
//   - ids: { [place_id]: { name, address, blockedAt, reason } }
//          ユーザーがゴミ箱で個別に削除した場所
//   - keywords: string[]
//          名前・住所に含まれていたら自動除外するキーワード（学習塾等）
//
// localStorage に永続化することで、検索のたびに学習プロンプトを育てていく前提。

const STORE_KEY = 'tanken-rally:blocked-spots:v1';

const DEFAULT_KEYWORDS = [
  '学習塾',
  '進学塾',
  '予備校',
  '個別指導',
  '塾',          // 「塾」単独。誤爆（茶道塾等）はあるが、子ども向け探検では基本不要
  '専門学校',
  '自動車学校',
];

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ids: {}, keywords: [...DEFAULT_KEYWORDS] };
    const parsed = JSON.parse(raw);
    return {
      ids: parsed.ids || {},
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [...DEFAULT_KEYWORDS],
    };
  } catch {
    return { ids: {}, keywords: [...DEFAULT_KEYWORDS] };
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('blocked.js: 保存に失敗', e);
  }
}

let _cache = null;
function getStore() {
  if (!_cache) _cache = readStore();
  return _cache;
}

/** 1スポットがブロック対象か判定 */
export function isBlocked(spot) {
  const store = getStore();
  if (store.ids[spot.id]) return true;
  const haystack = `${spot.name || ''}\n${spot.address || ''}`;
  for (const kw of store.keywords) {
    if (kw && haystack.includes(kw)) return true;
  }
  return false;
}

/** スポット配列からブロック対象を除外 */
export function filterBlocked(spots) {
  return (spots || []).filter(s => !isBlocked(s));
}

/** ユーザーがスポットをブロックリストへ追加 */
export function addBlockedSpot(spot, reason = 'user-removed') {
  const store = getStore();
  store.ids[spot.id] = {
    name: spot.name,
    address: spot.address || '',
    category: spot.category || '',
    blockedAt: new Date().toISOString(),
    reason,
  };
  writeStore(store);
}

/** ブロックを解除（特定の place_id を白黒名簿から削除） */
export function unblockSpot(placeId) {
  const store = getStore();
  if (store.ids[placeId]) {
    delete store.ids[placeId];
    writeStore(store);
  }
}

/** デバッグ・将来の検索プロンプト改善用：ブロック済み一覧を取得 */
export function listBlockedSpots() {
  const store = getStore();
  return Object.entries(store.ids).map(([id, meta]) => ({ id, ...meta }));
}

/** ブロック対象キーワード一覧 */
export function listBlockedKeywords() {
  return [...getStore().keywords];
}

/** キーワード追加 */
export function addBlockedKeyword(kw) {
  if (!kw) return;
  const store = getStore();
  if (!store.keywords.includes(kw)) {
    store.keywords.push(kw);
    writeStore(store);
  }
}

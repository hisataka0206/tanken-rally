// 図鑑（キャラコレクション）のローカル保存
//
// キー設計: ニックネームは重複しうるため、端末ローカルID（explorerId）を
// localStorage に発行して図鑑のキーにする（docs/ar-character-capture-spec.md §5-2）。
//   - localStorage が一次ストア（オフライン・GAS未設定でも図鑑は機能する）
//   - GAS（Sheets「captures」タブ）へは main.js が fire-and-forget で同期し、
//     図鑑を開いたときにサーバー値をマージして表示する
//
// collection の形: { [characterId]: { count, firstAt, lastAt } }

const EXPLORER_ID_KEY = 'tanken_explorer_id';
const COLLECTION_KEY  = 'tanken_collection_v1';

/** 端末ローカルの探検者ID（初回アクセス時に発行して永続化） */
export function getExplorerId() {
  try {
    let id = localStorage.getItem(EXPLORER_ID_KEY);
    if (!id) {
      id = 'ex_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(EXPLORER_ID_KEY, id);
    }
    return id;
  } catch (_) {
    return 'ex_ephemeral'; // localStorage 不可（プライベートモード等）
  }
}

/** ローカルの図鑑コレクションを読み込む */
export function loadCollection() {
  try {
    return JSON.parse(localStorage.getItem(COLLECTION_KEY) || '{}') || {};
  } catch (_) {
    return {};
  }
}

function saveCollection(collection) {
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  } catch (_) { /* 保存できなくてもアプリは続行 */ }
}

/** 捕獲1件をローカル図鑑に記録して、更新後のコレクションを返す */
export function recordCapture(characterId, capturedAt) {
  const collection = loadCollection();
  const at = capturedAt || new Date().toISOString();
  const cur = collection[characterId];
  if (cur) {
    cur.count = (cur.count || 0) + 1;
    cur.lastAt = at;
    if (!cur.firstAt) cur.firstAt = at;
  } else {
    collection[characterId] = { count: 1, firstAt: at, lastAt: at };
  }
  saveCollection(collection);
  return collection;
}

/** サーバー（Sheets）のコレクションをローカルへマージして返す。
 *  count は大きい方、firstAt は古い方、lastAt は新しい方を採用。 */
export function mergeServerCollection(server) {
  const local = loadCollection();
  Object.entries(server || {}).forEach(([id, s]) => {
    const l = local[id];
    if (!l) {
      local[id] = { count: s.count || 0, firstAt: s.firstAt || null, lastAt: s.lastAt || null };
    } else {
      l.count = Math.max(l.count || 0, s.count || 0);
      if (s.firstAt && (!l.firstAt || s.firstAt < l.firstAt)) l.firstAt = s.firstAt;
      if (s.lastAt && (!l.lastAt || s.lastAt > l.lastAt)) l.lastAt = s.lastAt;
    }
  });
  saveCollection(local);
  return local;
}

// なまえ＋あいことば の簡易ログイン
//
// 目的: 図鑑（キャラコレクション）を「自分のアカウント」に紐づけ、どの端末からでも
//       自分の図鑑を開けるようにする。アプリ起動時にログインを必須にする。
//
// 保存:
//   - localStorage 'tanken_auth' = { userId, name }（ログイン状態の保持）
//   - GAS 未設定時のフォールバックとして 'tanken_local_users' に端末内アカウントを保持
//
// あいことばの扱い:
//   - 平文はサーバーに送らない。SHA-256（secure context）でハッシュ化して送受信する。
//   - これは子ども向けPoCの簡易ログインであり、本格的な認証強度は持たない
//     （図鑑を守る「ひみつのことば」程度の位置づけ）。
//
// [[ログイン]] [[なまえとあいことば]] [[図鑑]]

const AUTH_KEY        = 'tanken_auth';
const LOCAL_USERS_KEY = 'tanken_local_users';

/** 保存されたログイン情報 { userId, name } を返す（未ログインなら null） */
export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function isLoggedIn() {
  const a = getStoredAuth();
  return !!(a && a.userId);
}

function setStoredAuth(auth) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch (_) { /* no-op */ }
}

/** ログアウト（ログイン状態のみ消す。図鑑データ自体は残す） */
export function logout() {
  try { localStorage.removeItem(AUTH_KEY); } catch (_) { /* no-op */ }
}

/** あいことばを SHA-256 でハッシュ化（なまえと結合。secure context 前提、無い環境は簡易fallback） */
async function hashPin(name, pin) {
  const msg = String(name || '').trim().toLowerCase() + '|' + String(pin || '');
  try {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) { /* fall through */ }
  // 非 secure context 用フォールバック（強度は低い）
  let h = 5381;
  for (let i = 0; i < msg.length; i++) h = ((h << 5) + h + msg.charCodeAt(i)) >>> 0;
  return 'fb_' + h.toString(16);
}

function loadLocalUsers() {
  try { return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '{}') || {}; }
  catch (_) { return {}; }
}
function saveLocalUsers(u) {
  try { localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(u)); } catch (_) { /* no-op */ }
}

/** GAS がまだ更新されておらず、ユーザーAPI(registerUser/loginUser)が無い状態か判定。
 *  その場合はロックアウト回避のためローカルログインにフォールバックする。 */
function isGasNotUpdated_(error) {
  const e = String(error || '').toLowerCase();
  return e.includes('unknown action') || e.includes('unknown-action');
}

/** 入力チェック。問題があればエラーコード文字列、無ければ null。 */
export function validateCredentials(name, pin) {
  const n = String(name || '').trim();
  if (n.length < 1)  return 'name-required';
  if (n.length > 20) return 'name-too-long';
  const p = String(pin || '');
  if (p.length < 6)  return 'pin-too-short';
  return null;
}

/** 新規登録。drive があればサーバー、無ければ端末内。
 *  戻り値: { ok, userId, name } / { ok:false, error } */
export async function registerAccount(name, pin, drive) {
  const err = validateCredentials(name, pin);
  if (err) return { ok: false, error: err };
  const cleanName = String(name).trim();
  const pinHash = await hashPin(cleanName, pin);

  if (drive) {
    try {
      const res = await drive.registerUser({ name: cleanName, pinHash });
      if (res && res.ok) {
        setStoredAuth({ userId: res.userId, name: res.name });
        return { ok: true, userId: res.userId, name: res.name };
      }
      // GAS が未更新（registerUser 未実装）なら「unknown action」が返る。
      // その場合はロックアウトを避けるため、下のローカル処理へフォールバックする。
      if (res && res.error && !isGasNotUpdated_(res.error)) {
        return { ok: false, error: res.error };
      }
    } catch (e) {
      // GAS が例外（HTTPエラー / 非JSON応答＝Google認証HTML など）を投げた場合。
      // 通信断とは限らないので握りつぶさず、下のローカル作成へフォールバックする（ハード失敗を避ける）。
      console.warn('[auth] registerUser via GAS failed; falling back to local:', e);
    }
  }

  // ローカルfallback（GAS未設定 / GAS未更新 / GASが例外を投げた場合）
  const users = loadLocalUsers();
  const key = cleanName.toLowerCase();
  if (users[key]) return { ok: false, error: 'name-taken' };
  const userId = 'u_local_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  users[key] = { userId, name: cleanName, pinHash };
  saveLocalUsers(users);
  setStoredAuth({ userId, name: cleanName });
  return { ok: true, userId, name: cleanName };
}

/** ログイン。drive があればサーバー、無ければ端末内。
 *  戻り値: { ok, userId, name } / { ok:false, error } */
export async function loginAccount(name, pin, drive) {
  const err = validateCredentials(name, pin);
  if (err) return { ok: false, error: err };
  const cleanName = String(name).trim();
  const pinHash = await hashPin(cleanName, pin);

  if (drive) {
    try {
      const res = await drive.loginUser({ name: cleanName, pinHash });
      if (res && res.ok) {
        setStoredAuth({ userId: res.userId, name: res.name });
        return { ok: true, userId: res.userId, name: res.name };
      }
      // GAS 未更新（loginUser 未実装）なら「unknown action」→ ローカルへフォールバック
      if (res && res.error && !isGasNotUpdated_(res.error)) {
        // レート制限（クールダウン中）は残り時間も添えて返す
        return { ok: false, error: res.error, retryAfterSec: res.retryAfterSec };
      }
    } catch (e) {
      // GAS が例外を投げた場合。ハード失敗させず、下のローカル照合へフォールバックする。
      console.warn('[auth] loginUser via GAS failed; falling back to local:', e);
    }
  }

  const users = loadLocalUsers();
  const key = cleanName.toLowerCase();
  const u = users[key];
  if (!u) return { ok: false, error: 'not-found' };
  if (u.pinHash !== pinHash) return { ok: false, error: 'bad-credentials' };
  setStoredAuth({ userId: u.userId, name: u.name });
  return { ok: true, userId: u.userId, name: u.name };
}

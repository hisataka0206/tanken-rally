// Google Drive 連携 (Google Apps Script 経由)

export class DriveClient {
  constructor(gasUrl, secret) {
    this.gasUrl = gasUrl;
    this.secret = secret;
  }

  async _post(body) {
    const res = await fetch(this.gasUrl, {
      method: 'POST',
      // GAS は no-cors だと JSON が読めないため redirect で対処
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' }, // GAS の CORS 制限を回避
      body: JSON.stringify({ ...body, secret: this.secret }),
    });
    if (!res.ok) throw new Error(`GAS API エラー: ${res.status}`);
    return res.json();
  }

  /** 探検セッション用フォルダを作成 */
  async createSession({ sessionId, stationName, playerName }) {
    const data = await this._post({ action: 'createSession', sessionId, stationName, playerName });
    if (!data.ok) throw new Error(data.error);
    return data; // { folderId, folderName, folderUrl }
  }

  /** セッションID（パスワード）から既存フォルダ＋Sheetメタを取得 */
  async resumeSession({ sessionId }) {
    const data = await this._post({ action: 'resumeSession', sessionId });
    if (!data.ok) throw new Error(data.error);
    return data; // { folderId, folderName, folderUrl, stationName, orderedSpots, routeStats, ... }
  }

  /** たんけんノート（レポート編集状態）を Drive の report.json に保存 */
  async saveReportData({ sessionId, reportData }) {
    const data = await this._post({ action: 'saveReportData', sessionId, reportData });
    if (!data.ok) throw new Error(data.error);
    return data;
  }

  /** Drive の report.json を読み込む（無ければ reportData: null） */
  async loadReportData({ sessionId }) {
    const data = await this._post({ action: 'loadReportData', sessionId });
    if (!data.ok) throw new Error(data.error);
    return data; // { reportData }
  }

  /** 探検開始時にセッションのメタデータを Sheet に保存（アカウントに紐づける userId/userName 付き） */
  async saveSession({ sessionId, stationName, playerName, folderUrl, orderedSpots, routeStats, userId, userName, photoCount = 0 }) {
    const data = await this._post({
      action: 'saveSession',
      sessionId, stationName, playerName, folderUrl,
      orderedSpots, routeStats, userId, userName, photoCount,
    });
    if (!data.ok) throw new Error(data.error);
    return data;
  }

  // 履歴の写真枚数を更新（写真アップ時。plan→写真あり へ昇格）
  async updateSessionPhotoCount({ sessionId, userId, photoCount }) {
    const data = await this._post({ action: 'updateSessionPhotoCount', sessionId, userId, photoCount });
    if (!data || !data.ok) throw new Error((data && data.error) || 'updateSessionPhotoCount failed');
    return data;
  }

  // 履歴を1件削除（本人のみ）
  async deleteSession({ sessionId, userId }) {
    const data = await this._post({ action: 'deleteSession', sessionId, userId });
    if (!data || !data.ok) throw new Error((data && data.error) || 'deleteSession failed');
    return data;
  }

  /** ログインユーザーの冒険履歴を取得。
   *  戻り値: [{ sessionId, date, stationName, folderUrl, spotCount, score }]（新しい順） */
  async getUserHistory({ userId, limit } = {}) {
    const data = await this._post({ action: 'getUserHistory', userId, limit });
    if (!data.ok) throw new Error(data.error);
    return data.history || [];
  }

  /** ユーザーからの不具合報告を Sheet に送信 */
  async submitIssue({ types, detail, context }) {
    const data = await this._post({
      action: 'saveIssueReport',
      types: types || [],
      detail: detail || '',
      context: context || {},
    });
    if (!data.ok) throw new Error(data.error);
    return data;
  }

  /** 画像付き不具合報告を送る（ログイン不要）。
   *  画像は base64（リサイズ済み）で渡す。GAS が Drive 保存＋Sheet 記録＋（設定時）Google フォーム送信を行う。
   *  戻り値: { ok, imageUrl?, form } */
  async submitIssueReport({ types, detail, contact, name, imageBase64, imageMime, imageName, context }) {
    const data = await this._post({
      action: 'submitIssueReport',
      types: types || [],
      detail: detail || '',
      contact: contact || '',
      name: name || '',
      imageBase64: imageBase64 || '',
      imageMime: imageMime || '',
      imageName: imageName || '',
      context: context || {},
    });
    if (!data || !data.ok) throw new Error((data && data.error) || 'submitIssueReport failed');
    return data;
  }

  /** 写真をアップロード
   *   - takenAt: EXIF DateTimeOriginal（取れない場合は null）
   *   - uploadedAt: アップロード時のクライアント時刻（常に記録）
   *   - lat/lng: EXIF GPS（取れない場合は null）
   *   - metaOverride: EXIF の代わりに使うメタ（AR捕獲写真は canvas 合成で EXIF が無いため、
   *                   撮影時の Geolocation / 現在時刻を { takenAt, lat, lng } で渡す） */
  async uploadPhoto({ folderId, file, spotName, metaOverride = null }) {
    const { base64, mimeType, fileName } = await fileToBase64(file);
    const exifMeta = await extractPhotoMeta(file);
    const meta = {
      takenAt: metaOverride?.takenAt ?? exifMeta.takenAt,
      lat: metaOverride?.lat ?? exifMeta.lat,
      lng: metaOverride?.lng ?? exifMeta.lng,
    };
    const uploadedAt = new Date().toISOString();
    const data = await this._post({
      action: 'uploadPhoto',
      folderId,
      base64Data: base64,
      mimeType,
      fileName,
      takenAt: meta.takenAt,    // EXIF のみ（無ければ null）
      uploadedAt,                // アップロード時刻（フォールバック用）
      lat: meta.lat,
      lng: meta.lng,
      spotName: spotName || '',
    });
    if (!data.ok) throw new Error(data.error);
    return data; // { fileId, url, thumbnailUrl, takenAt, uploadedAt, lat, lng, spotName }
  }

  /** フォルダ内の写真一覧を取得 */
  async listPhotos(folderId) {
    const data = await this._post({ action: 'listPhotos', folderId });
    if (!data.ok) throw new Error(data.error);
    return data.photos;
  }

  /** 写真のタグ（spotName）を更新（Drive の file.description JSON を書き換え） */
  async updatePhotoTag(fileId, spotName) {
    const data = await this._post({ action: 'updatePhotoTag', fileId, spotName: spotName || '' });
    if (!data.ok) throw new Error(data.error);
    return data;
  }

  /** 写真ファイルの実体（base64）を取得。CORS 回避用に blob URL 生成へ使う。 */
  async getPhotoData(fileId) {
    const data = await this._post({ action: 'getPhotoData', fileId });
    if (!data.ok) throw new Error(data.error);
    return data; // { fileId, fileName, mimeType, base64 }
  }

  /** 写真ファイルのサムネイル（中サイズ）を base64 で取得。表示用に軽量＆高速。
   *  size: 'w400' / 'w800' / 'w1600' など。省略時は w800。 */
  async getPhotoThumbnail(fileId, size) {
    const data = await this._post({ action: 'getPhotoThumbnail', fileId, size });
    if (!data.ok) throw new Error(data.error);
    return data; // { fileId, mimeType, base64, size }
  }

  /** 捕獲記録を図鑑（Sheets「captures」タブ）にマージ保存 */
  async saveCaptures({ explorerId, records }) {
    const data = await this._post({ action: 'saveCaptures', explorerId, records });
    if (!data.ok) throw new Error(data.error);
    return data;
  }

  /** 図鑑コレクションを取得。戻り値: { characterId: { count, firstAt, lastAt } } */
  async getCaptures({ explorerId }) {
    const data = await this._post({ action: 'getCaptures', explorerId });
    if (!data.ok) throw new Error(data.error);
    return data.collection || {};
  }

  /** なまえ＋あいことば(ハッシュ)で新規ユーザー登録。
   *  戻り値: { ok, userId, name } / 失敗時は { ok:false, error } をそのまま返す（呼び出し側でエラーコード分岐） */
  async registerUser({ name, pinHash }) {
    return this._post({ action: 'registerUser', name, pinHash });
  }

  /** なまえ＋あいことば(ハッシュ)でログイン。
   *  戻り値: { ok, userId, name } / 失敗時は { ok:false, error } */
  async loginUser({ name, pinHash }) {
    return this._post({ action: 'loginUser', name, pinHash });
  }

  /** ランキングを保存 */
  async saveRanking(payload) {
    const data = await this._post({ action: 'saveRanking', ...payload });
    if (!data.ok) throw new Error(data.error);
    return data;
  }

  /** ランキングを取得（cityId で地域絞り込み、stationName で駅絞り込み・両方任意） */
  async getRanking({ stationName, cityId, limit } = {}) {
    const data = await this._post({ action: 'getRanking', stationName, cityId, limit });
    if (!data.ok) throw new Error(data.error);
    return data.ranking;
  }

  /** スポット検索キャッシュを取得。戻り値: { hit, spots?, updatedAt?, ageDays? }
   *  （Places API 課金削減のため、駅ごとの検索結果を Sheets に保存して再利用する） */
  async getSpotsCache(key) {
    const data = await this._post({ action: 'getSpotsCache', key });
    if (!data.ok) throw new Error(data.error);
    return data;
  }

  /** スポット検索キャッシュを保存（fire-and-forget 推奨） */
  async saveSpotsCache({ key, stationName, lang, spots }) {
    const data = await this._post({ action: 'saveSpotsCache', key, stationName, lang, spots });
    if (!data.ok) throw new Error(data.error);
    return data;
  }

  /** キャラ自動生成: NanoBanana Pro（GAS側でAPIキー保持）で count 枚生成。
   *  返り値: { ok, images: [{ dataUrl }] } を想定。GAS未対応/失敗時は呼び出し側でモックにフォールバック。 */
  async generateCharacters({ prompt, count = 3 }) {
    const data = await this._post({ action: 'generateCharacters', prompt, count });
    if (!data || !data.ok) throw new Error((data && data.error) || 'generateCharacters failed');
    return data; // { ok:true, images:[{dataUrl}] }
  }

  // 生成キャラ1体をサーバ保存（画像=Drive／メタ=Sheets、userId 紐付け）
  async saveGeneratedCharacter(payload) {
    const data = await this._post({ action: 'saveGeneratedCharacter', ...payload });
    if (!data || !data.ok) throw new Error((data && data.error) || 'saveGeneratedCharacter failed');
    return data; // { ok, fileId, fileUrl }
  }

  // userId の生成キャラ一覧を取得（画像は base64 dataURL 同梱）
  async getGeneratedCharacters({ userId }) {
    const data = await this._post({ action: 'getGeneratedCharacters', userId });
    if (!data || !data.ok) throw new Error((data && data.error) || 'getGeneratedCharacters failed');
    return data.characters || [];
  }

  // OpenAI プロキシ（キーは GAS の Script Property OPENAI_API_KEY・ブラウザ非露出）
  async openaiChat(payload) {
    const data = await this._post({ action: 'openaiChat', ...payload });
    if (!data || !data.ok) throw new Error((data && data.error) || 'openaiChat failed');
    return data; // { ok, text }
  }
  async openaiTranscribe(payload) {
    const data = await this._post({ action: 'openaiTranscribe', ...payload });
    if (!data || !data.ok) throw new Error((data && data.error) || 'openaiTranscribe failed');
    return data; // { ok, text }
  }
}

// ===== ユーティリティ =====

/** File → base64 変換 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve({
        base64,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name || `photo_${Date.now()}.jpg`,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * EXIF から撮影日時 (DateTimeOriginal) と GPS 座標 (latitude / longitude) を抽出。
 *   - takenAt: EXIF が無い場合は null（lastModified にはフォールバックしない。
 *              呼び出し側で uploadedAt を別途記録する）
 *   - lat/lng: 取れない場合は null
 */
async function extractPhotoMeta(file) {
  let takenAt = null, lat = null, lng = null;
  try {
    if (typeof window !== 'undefined' && window.exifr) {
      const exif = await window.exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate'] });
      if (exif) {
        const dt = exif.DateTimeOriginal || exif.CreateDate;
        if (dt instanceof Date && !isNaN(dt.getTime())) takenAt = dt.toISOString();
        if (typeof exif.latitude === 'number'  && !isNaN(exif.latitude))  lat = exif.latitude;
        if (typeof exif.longitude === 'number' && !isNaN(exif.longitude)) lng = exif.longitude;
      }
    }
  } catch (e) {
    console.warn('[exifr] EXIF抽出失敗:', e);
  }
  return { takenAt, lat, lng };
}

/** セッション ID を生成 */
export function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

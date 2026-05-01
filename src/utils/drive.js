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

  /** 探検開始時にセッションのメタデータを Sheet に保存 */
  async saveSession({ sessionId, stationName, playerName, folderUrl, orderedSpots, routeStats }) {
    const data = await this._post({
      action: 'saveSession',
      sessionId, stationName, playerName, folderUrl,
      orderedSpots, routeStats,
    });
    if (!data.ok) throw new Error(data.error);
    return data;
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

  /** 写真をアップロード
   *   - takenAt: EXIF DateTimeOriginal（取れない場合は null）
   *   - uploadedAt: アップロード時のクライアント時刻（常に記録）
   *   - lat/lng: EXIF GPS（取れない場合は null） */
  async uploadPhoto({ folderId, file, spotName }) {
    const { base64, mimeType, fileName } = await fileToBase64(file);
    const meta = await extractPhotoMeta(file);
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

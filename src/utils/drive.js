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

  /** 写真をアップロード（EXIF から撮影日時と GPS を抽出して送る） */
  async uploadPhoto({ folderId, file, spotName }) {
    const { base64, mimeType, fileName } = await fileToBase64(file);
    const meta = await extractPhotoMeta(file);
    const data = await this._post({
      action: 'uploadPhoto',
      folderId,
      base64Data: base64,
      mimeType,
      fileName,
      takenAt: meta.takenAt,
      lat: meta.lat,
      lng: meta.lng,
      spotName: spotName || '',
    });
    if (!data.ok) throw new Error(data.error);
    return data; // { fileId, url, thumbnailUrl, takenAt, lat, lng, spotName }
  }

  /** フォルダ内の写真一覧を取得 */
  async listPhotos(folderId) {
    const data = await this._post({ action: 'listPhotos', folderId });
    if (!data.ok) throw new Error(data.error);
    return data.photos;
  }

  /** ランキングを保存 */
  async saveRanking(payload) {
    const data = await this._post({ action: 'saveRanking', ...payload });
    if (!data.ok) throw new Error(data.error);
    return data;
  }

  /** ランキングを取得 */
  async getRanking({ stationName, limit } = {}) {
    const data = await this._post({ action: 'getRanking', stationName, limit });
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
 * 取れない場合は file.lastModified にフォールバック、座標は null。
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
  if (!takenAt) {
    takenAt = file.lastModified
      ? new Date(file.lastModified).toISOString()
      : new Date().toISOString();
  }
  return { takenAt, lat, lng };
}

/** セッション ID を生成 */
export function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

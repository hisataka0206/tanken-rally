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

  /** 写真をアップロード */
  async uploadPhoto({ folderId, file, spotName }) {
    const { base64, mimeType, fileName } = await fileToBase64(file);
    const takenAt = extractExifDate(file) || new Date().toISOString();
    const data = await this._post({
      action: 'uploadPhoto',
      folderId,
      base64Data: base64,
      mimeType,
      fileName,
      takenAt,
      spotName: spotName || '',
    });
    if (!data.ok) throw new Error(data.error);
    return data; // { fileId, url, thumbnailUrl, takenAt, spotName }
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

/** EXIF から撮影日時を取得（簡易版：ファイルの lastModified を使用）*/
function extractExifDate(file) {
  if (file.lastModified) {
    return new Date(file.lastModified).toISOString();
  }
  return null;
}

/** セッション ID を生成 */
export function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

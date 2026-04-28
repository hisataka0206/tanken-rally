/**
 * たんけんラリー — Google Apps Script バックエンド
 *
 * このスクリプトは Google Drive への写真保存を担う。
 * フロントエンドから HTTP POST で呼び出す。
 *
 * デプロイ方法:
 *   1. script.google.com で新規プロジェクトを作成
 *   2. このコードを貼り付ける
 *   3. 「デプロイ」→「新しいデプロイ」→ 種類: ウェブアプリ
 *   4. 実行ユーザー: 自分 / アクセスできるユーザー: 全員
 *   5. デプロイURL を config.js の GAS_URL に設定する
 */

// ===== 設定 =====
const ROOT_FOLDER_NAME = 'たんけんラリー';
const SHARED_SECRET    = 'tanken-rally-poc-2026'; // config.js の GAS_SECRET と合わせること

// ===== エントリポイント =====
function doPost(e) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = JSON.parse(e.postData.contents);

    // 簡易認証
    if (body.secret !== SHARED_SECRET) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const action = body.action;

    if (action === 'createSession') {
      return respond(headers, createSession(body));
    }
    if (action === 'uploadPhoto') {
      return respond(headers, uploadPhoto(body));
    }
    if (action === 'listPhotos') {
      return respond(headers, listPhotos(body));
    }
    if (action === 'saveRanking') {
      return respond(headers, saveRanking(body));
    }
    if (action === 'getRanking') {
      return respond(headers, getRanking(body));
    }

    return respond(headers, { ok: false, error: 'unknown action' });

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// OPTIONS リクエスト（CORS preflight）対応
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: 'たんけんラリー GAS API' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function respond(headers, data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== Drive フォルダ管理 =====

/** ルートフォルダを取得（なければ作成） */
function getRootFolder() {
  const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

/** 探検セッション用フォルダを作成 */
function createSession(body) {
  const { sessionId, stationName, playerName } = body;
  if (!sessionId || !stationName) return { ok: false, error: 'sessionId と stationName が必要です' };

  const root = getRootFolder();
  const folderName = `${stationName}_${playerName || 'たんけんしゃ'}_${sessionId}`;
  const folder = root.createFolder(folderName);

  return {
    ok: true,
    folderId: folder.getId(),
    folderName,
    folderUrl: folder.getUrl(),
  };
}

/** 写真をDriveに保存 */
function uploadPhoto(body) {
  const { folderId, fileName, base64Data, mimeType, takenAt, spotName } = body;
  if (!folderId || !base64Data) return { ok: false, error: 'folderId と base64Data が必要です' };

  const folder = DriveApp.getFolderById(folderId);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType || 'image/jpeg',
    fileName || `photo_${Date.now()}.jpg`
  );
  const file = folder.createFile(blob);

  // メタデータをプロパティに保存（撮影時刻・スポット名）
  file.setDescription(JSON.stringify({ takenAt, spotName: spotName || '' }));

  // 共有リンクを公開に設定（プレビュー用）
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    url: `https://drive.google.com/uc?id=${file.getId()}`,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400`,
    takenAt,
    spotName,
  };
}

/** フォルダ内の写真一覧を取得 */
function listPhotos(body) {
  const { folderId } = body;
  if (!folderId) return { ok: false, error: 'folderId が必要です' };

  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const photos = [];

  while (files.hasNext()) {
    const file = files.next();
    let meta = {};
    try { meta = JSON.parse(file.getDescription() || '{}'); } catch (_) {}
    photos.push({
      fileId: file.getId(),
      fileName: file.getName(),
      url: `https://drive.google.com/uc?id=${file.getId()}`,
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400`,
      takenAt: meta.takenAt || null,
      spotName: meta.spotName || '',
    });
  }

  // 撮影時刻順にソート
  photos.sort((a, b) => (a.takenAt || '') < (b.takenAt || '') ? -1 : 1);
  return { ok: true, photos };
}

// ===== ランキング（Sheets） =====

const RANKING_SHEET_NAME = 'ランキング';

function getRankingSheet() {
  const root = getRootFolder();
  const files = root.getFilesByName(RANKING_SHEET_NAME);
  let sheet;
  if (files.hasNext()) {
    sheet = SpreadsheetApp.open(files.next()).getActiveSheet();
  } else {
    const ss = SpreadsheetApp.create(RANKING_SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    sheet = ss.getActiveSheet();
    sheet.appendRow(['日時', '駅名', 'プレーヤー名', 'スコア', '訪問スポット数', '移動距離(m)', '写真枚数', 'レポート文字数']);
  }
  return sheet;
}

function saveRanking(body) {
  const { stationName, playerName, score, visitCount, distanceM, photoCount, reportWordCount } = body;
  if (!stationName || score == null) return { ok: false, error: 'stationName と score が必要です' };

  const sheet = getRankingSheet();
  const now = new Date().toISOString();
  sheet.appendRow([now, stationName, playerName || '名無し', score, visitCount || 0, distanceM || 0, photoCount || 0, reportWordCount || 0]);

  return { ok: true, savedAt: now };
}

function getRanking(body) {
  const { stationName, limit } = body;
  const sheet = getRankingSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const data = rows.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    })
    .filter(r => !stationName || r['駅名'] === stationName)
    .sort((a, b) => b['スコア'] - a['スコア'])
    .slice(0, limit || 50);

  return { ok: true, ranking: data };
}

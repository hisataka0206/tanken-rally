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
// 指定 Drive フォルダ（https://drive.google.com/drive/folders/<ID>）
const ROOT_FOLDER_ID = '10EzCggGS5BcZ2LJXOnbfd1WLhSh7MECH';
// セッションログ・不具合報告の蓄積用 Spreadsheet ID
// https://docs.google.com/spreadsheets/d/<ID>/edit
const LOG_SHEET_ID   = '1ClqbDlFA6flvz2i3A7OABE0seq4GeqhcztLFCHdTuHk';
const SHARED_SECRET    = 'tanken-rally-poc-2026'; // config.js の GAS_SECRET と合わせること
const SESSION_RETENTION_DAYS = 7;                  // セッションフォルダの保持期間（日）

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
    if (action === 'resumeSession') {
      return respond(headers, resumeSession(body));
    }
    if (action === 'saveSession') {
      return respond(headers, saveSession(body));
    }
    if (action === 'loadSession') {
      return respond(headers, loadSession(body));
    }
    if (action === 'saveReportData') {
      return respond(headers, saveReportData(body));
    }
    if (action === 'loadReportData') {
      return respond(headers, loadReportData(body));
    }
    if (action === 'uploadPhoto') {
      return respond(headers, uploadPhoto(body));
    }
    if (action === 'listPhotos') {
      return respond(headers, listPhotos(body));
    }
    if (action === 'saveIssueReport') {
      return respond(headers, saveIssueReport(body));
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

/** ルートフォルダを取得（ID 固定） */
function getRootFolder() {
  try {
    return DriveApp.getFolderById(ROOT_FOLDER_ID);
  } catch (e) {
    throw new Error(`ルートフォルダ(ID=${ROOT_FOLDER_ID})にアクセスできません。GAS実行ユーザーがフォルダの編集者になっているか確認してください。原因: ${e.message}`);
  }
}

/** 探検セッション用フォルダを作成 */
function createSession(body) {
  try {
    const { sessionId, stationName, playerName } = body;
    if (!sessionId || !stationName) return { ok: false, error: 'sessionId と stationName が必要です' };

    const root = getRootFolder();
    const folderName = `${stationName}_${playerName || 'たんけんしゃ'}_${sessionId}`;
    let folder;
    try {
      folder = root.createFolder(folderName);
    } catch (e) {
      throw new Error(`createFolder失敗（folderName="${folderName}"）: ${e.message}`);
    }

    return {
      ok: true,
      folderId: folder.getId(),
      folderName,
      folderUrl: folder.getUrl(),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** セッションIDから既存フォルダを探す（パスワードログイン用）
 *  フォルダ名末尾が "_<sessionId>" のもの＋Sheetのセッション行を統合して返す */
function resumeSession(body) {
  try {
    const { sessionId } = body;
    if (!sessionId) return { ok: false, error: 'sessionId が必要です' };
    const folder = findSessionFolder(sessionId);
    if (!folder) {
      return { ok: false, error: 'セッションフォルダが見つかりません。IDを確認してください（古いセッションは7日で自動削除されます）。' };
    }

    // Sheet からセッションメタデータを読む（失敗してもフォルダ情報は返すが、
    // 原因はクライアント側でデバッグできるよう sheetWarning として明示）
    let sheetData = null;
    let sheetWarning = '';
    try {
      const r = loadSession({ sessionId });
      if (r && r.ok) sheetData = r;
      else if (r) sheetWarning = r.error || 'loadSession returned not-ok';
      else sheetWarning = 'loadSession returned null';
    } catch (e) {
      sheetWarning = 'Sheet read exception: ' + (e.message || e);
    }

    return {
      ok: true,
      folderId: folder.getId(),
      folderName: folder.getName(),
      folderUrl: folder.getUrl(),
      stationName: sheetData ? sheetData.stationName : '',
      playerName:  sheetData ? sheetData.playerName  : '',
      orderedSpots: sheetData ? sheetData.orderedSpots : [],
      routeStats:   sheetData ? sheetData.routeStats   : null,
      sheetWarning, // 空文字なら成功、何か入っていれば失敗理由
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// ===== 外部 Spreadsheet 連携 =====
//
// 「セッション」タブ：探検開始時に保存
//   日時 / sessionId / 駅名 / プレーヤー名 / フォルダURL / スポット数 / スポット詳細(JSON) / 総距離 / 推定時間(分)
// 「不具合報告」タブ：ユーザーが「🐛 不具合を報告」したときに追記
//   日時 / sessionId / 駅名 / 都市タブ / ステップ / 種類 / 詳細 / userAgent / URL

const SHEET_TAB_SESSION = 'セッション';
const SHEET_TAB_ISSUE   = '不具合報告';
const SHEET_HEADERS_SESSION = ['日時', 'sessionId', '駅名', 'プレーヤー名', 'フォルダURL', 'スポット数', 'スポット詳細(JSON)', '総距離', '推定時間(分)'];
const SHEET_HEADERS_ISSUE   = ['日時', 'sessionId', '駅名', '都市タブ', 'ステップ', '種類', '詳細', 'userAgent', 'URL'];

/** ログ用 Spreadsheet の指定タブを取得（無ければ作成、ヘッダ行も自動投入） */
function getLogSheet(tabName, headers) {
  const ss = SpreadsheetApp.openById(LOG_SHEET_ID);
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    if (headers && headers.length) sheet.appendRow(headers);
  } else if (sheet.getLastRow() === 0 && headers && headers.length) {
    sheet.appendRow(headers);
  }
  return sheet;
}

/** 探検開始時にセッションのメタデータを Sheet に保存 */
function saveSession(body) {
  try {
    const { sessionId, stationName, playerName, folderUrl, orderedSpots, routeStats } = body;
    if (!sessionId) return { ok: false, error: 'sessionId が必要です' };
    const sheet = getLogSheet(SHEET_TAB_SESSION, SHEET_HEADERS_SESSION);
    sheet.appendRow([
      new Date().toISOString(),
      sessionId,
      stationName || '',
      playerName || '',
      folderUrl || '',
      (orderedSpots && orderedSpots.length) || 0,
      JSON.stringify(orderedSpots || []),
      (routeStats && routeStats.distanceText) || '',
      (routeStats && routeStats.durationMin) || '',
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Sheet からセッション行を1件取得（同IDで複数あれば最新） */
function loadSession(body) {
  try {
    const { sessionId } = body;
    if (!sessionId) return { ok: false, error: 'sessionId が必要です' };
    const sheet = getLogSheet(SHEET_TAB_SESSION, SHEET_HEADERS_SESSION);
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return { ok: false, error: 'セッションが見つかりません' };
    const headers = rows[0];
    const idIdx = headers.indexOf('sessionId');
    if (idIdx < 0) return { ok: false, error: 'シートのヘッダー不正' };
    let found = null;
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][idIdx]) === String(sessionId)) {
        found = rows[i]; break;
      }
    }
    if (!found) return { ok: false, error: 'セッションが見つかりません' };
    const obj = {};
    headers.forEach((h, i) => { obj[h] = found[i]; });
    let orderedSpots = [];
    try { orderedSpots = JSON.parse(obj['スポット詳細(JSON)'] || '[]'); } catch (_) {}
    return {
      ok: true,
      sessionId: obj.sessionId,
      stationName: obj['駅名'],
      playerName:  obj['プレーヤー名'],
      folderUrl:   obj['フォルダURL'],
      orderedSpots,
      routeStats: { distanceText: obj['総距離'], durationMin: obj['推定時間(分)'] },
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** sessionId から該当のセッションフォルダを探す（共通ヘルパ） */
function findSessionFolder(sessionId) {
  const root = getRootFolder();
  const folders = root.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    if (f.getName().endsWith('_' + sessionId)) return f;
  }
  return null;
}

/** たんけんノート（レポート編集状態）をセッションフォルダの report.json に保存 */
function saveReportData(body) {
  try {
    const { sessionId, reportData } = body;
    if (!sessionId)   return { ok: false, error: 'sessionId が必要です' };
    if (!reportData)  return { ok: false, error: 'reportData が必要です' };
    const folder = findSessionFolder(sessionId);
    if (!folder) return { ok: false, error: 'セッションフォルダが見つかりません' };

    // 既存の report.json があれば trash → 新規作成
    const existing = folder.getFilesByName('report.json');
    while (existing.hasNext()) existing.next().setTrashed(true);

    const content = JSON.stringify(reportData, null, 2);
    const file = folder.createFile('report.json', content, 'application/json');
    return { ok: true, fileId: file.getId(), savedAt: new Date().toISOString() };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** report.json を読み込んで返す。無ければ reportData: null */
function loadReportData(body) {
  try {
    const { sessionId } = body;
    if (!sessionId) return { ok: false, error: 'sessionId が必要です' };
    const folder = findSessionFolder(sessionId);
    if (!folder) return { ok: false, error: 'セッションフォルダが見つかりません' };

    const files = folder.getFilesByName('report.json');
    if (!files.hasNext()) return { ok: true, reportData: null };
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    let reportData = null;
    try { reportData = JSON.parse(content); } catch (_) {}
    return { ok: true, reportData };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** ユーザーからの不具合報告を Sheet に保存 */
function saveIssueReport(body) {
  try {
    const types   = body && body.types   ? body.types   : [];
    const detail  = body && body.detail  ? body.detail  : '';
    const context = body && body.context ? body.context : {};
    const sheet = getLogSheet(SHEET_TAB_ISSUE, SHEET_HEADERS_ISSUE);
    sheet.appendRow([
      new Date().toISOString(),
      context.sessionId   || '',
      context.stationName || '',
      context.cityTab     || '',
      context.currentStep || '',
      types.join(','),
      detail,
      context.ua   || '',
      context.href || '',
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** 写真をDriveに保存（撮影時刻・GPS座標も保存） */
function uploadPhoto(body) {
  const { folderId, fileName, base64Data, mimeType, takenAt, spotName, lat, lng } = body;
  if (!folderId || !base64Data) return { ok: false, error: 'folderId と base64Data が必要です' };

  const folder = DriveApp.getFolderById(folderId);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType || 'image/jpeg',
    fileName || `photo_${Date.now()}.jpg`
  );
  const file = folder.createFile(blob);

  // メタデータをプロパティに保存（撮影時刻・スポット名・GPS）
  file.setDescription(JSON.stringify({
    takenAt,
    spotName: spotName || '',
    lat: (lat == null) ? null : Number(lat),
    lng: (lng == null) ? null : Number(lng),
  }));

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
    lat,
    lng,
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
      lat: (meta.lat == null) ? null : Number(meta.lat),
      lng: (meta.lng == null) ? null : Number(meta.lng),
    });
  }

  // 撮影時刻順にソート
  photos.sort((a, b) => (a.takenAt || '') < (b.takenAt || '') ? -1 : 1);
  return { ok: true, photos };
}

// ===== セッションフォルダ自動掃除 =====

/**
 * SESSION_RETENTION_DAYS より古いセッションフォルダをゴミ箱へ移動。
 * トリガーから定期実行される（setupAutoCleanup() で6時間ごとに登録）。
 */
function cleanupOldSessions() {
  const root = getRootFolder();
  const folders = root.getFolders();
  const cutoff = new Date(Date.now() - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let removed = 0;
  while (folders.hasNext()) {
    const folder = folders.next();
    if (folder.getDateCreated() < cutoff) {
      const name = folder.getName();
      const created = folder.getDateCreated();
      folder.setTrashed(true); // ゴミ箱へ（30日後に Drive が完全削除）
      removed++;
      console.log('Trashed: %s (created %s)', name, created);
    }
  }
  console.log('cleanupOldSessions done. Removed %s folder(s).', removed);
  return removed;
}

/**
 * 6時間ごとに cleanupOldSessions を実行するトリガーを登録。
 * 初回 1 度だけ GAS エディタから手動実行すれば、以降は自動。
 */
function setupAutoCleanup() {
  // 既存の同名トリガーがあれば削除（重複防止）
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'cleanupOldSessions') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // 新規トリガー作成
  ScriptApp.newTrigger('cleanupOldSessions')
    .timeBased()
    .everyHours(6)
    .create();
  console.log('cleanupOldSessions トリガー登録: 6時間ごと');
  return 'OK';
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

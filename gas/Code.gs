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
    if (action === 'getPhotoData') {
      return respond(headers, getPhotoData(body));
    }
    if (action === 'getPhotoThumbnail') {
      return respond(headers, getPhotoThumbnail(body));
    }
    if (action === 'updatePhotoTag') {
      return respond(headers, updatePhotoTag(body));
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
    if (action === 'saveCaptures') {
      return respond(headers, saveCaptures(body));
    }
    if (action === 'getCaptures') {
      return respond(headers, getCaptures(body));
    }
    if (action === 'registerUser') {
      return respond(headers, registerUser(body));
    }
    if (action === 'loginUser') {
      return respond(headers, loginUser(body));
    }
    if (action === 'getSpotsCache') {
      return respond(headers, getSpotsCache(body));
    }
    if (action === 'saveSpotsCache') {
      return respond(headers, saveSpotsCache(body));
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

/** 写真をDriveに保存（撮影時刻・アップロード時刻・GPS座標を保存） */
function uploadPhoto(body) {
  const { folderId, fileName, base64Data, mimeType, takenAt, uploadedAt, spotName, lat, lng } = body;
  if (!folderId || !base64Data) return { ok: false, error: 'folderId と base64Data が必要です' };

  const folder = DriveApp.getFolderById(folderId);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType || 'image/jpeg',
    fileName || `photo_${Date.now()}.jpg`
  );
  const file = folder.createFile(blob);

  // メタデータをプロパティに保存：
  //   takenAt    : EXIF DateTimeOriginal （無ければ null）
  //   uploadedAt : クライアントが送ってきたアップロード時刻 （無ければサーバ now）
  //   spotName   : ユーザーが付けたタグ
  //   lat / lng  : EXIF GPS座標
  const serverNow = new Date().toISOString();
  file.setDescription(JSON.stringify({
    takenAt: takenAt || null,
    uploadedAt: uploadedAt || serverNow,
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
    takenAt: takenAt || null,
    uploadedAt: uploadedAt || serverNow,
    spotName,
    lat,
    lng,
  };
}

/** フォルダ内の写真一覧を取得（画像ファイルのみ・report.json などのメタファイルは除外） */
function listPhotos(body) {
  const { folderId } = body;
  if (!folderId) return { ok: false, error: 'folderId が必要です' };

  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const photos = [];

  while (files.hasNext()) {
    const file = files.next();
    // MIME タイプが image/* で無いファイルはスキップ
    // （report.json (application/json)・summary.json などのメタファイルや、
    //  ユーザーが手で置いた非画像ファイルが混入するのを防ぐ）
    const mime = file.getMimeType() || '';
    if (!mime.startsWith('image/')) continue;

    let meta = {};
    try { meta = JSON.parse(file.getDescription() || '{}'); } catch (_) {}
    photos.push({
      fileId: file.getId(),
      fileName: file.getName(),
      url: `https://drive.google.com/uc?id=${file.getId()}`,
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400`,
      takenAt:    meta.takenAt    || null,
      uploadedAt: meta.uploadedAt || null,
      spotName:   meta.spotName   || '',
      lat: (meta.lat == null) ? null : Number(meta.lat),
      lng: (meta.lng == null) ? null : Number(meta.lng),
    });
  }

  // 撮影時刻順にソート
  photos.sort((a, b) => (a.takenAt || '') < (b.takenAt || '') ? -1 : 1);
  return { ok: true, photos };
}

/**
 * 写真ファイルの中身を base64 で返す（パスワード復元時のクライアント側 blob URL 生成用）。
 *
 * 背景:
 *   - Drive の uc?id= / thumbnail?id= URL は CORS ヘッダを返さないため、
 *     html2canvas で読み込もうとすると tainted canvas になり PDF生成が失敗する。
 *   - また uc?id= は時々ウィルススキャン警告ページにリダイレクトされ <img> 自体も読めないことがある。
 *   - そこで base64 をクライアントに渡し、createObjectURL で blob URL を生成して
 *     同一オリジン扱いの安全な image source として利用する。
 */
function getPhotoData(body) {
  const { fileId } = body;
  if (!fileId) return { ok: false, error: 'fileId が必要です' };

  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());
  return {
    ok: true,
    fileId,
    fileName: file.getName(),
    mimeType: blob.getContentType() || 'image/jpeg',
    base64,
  };
}

/**
 * 写真ファイルのサムネイル（中サイズ）を base64 で返す。
 *
 * 用途:
 *   - 復元セッションの一覧表示・編集画面用に「軽量な画像」を素早く取得する
 *   - PDF生成時のオリジナル画像取得（getPhotoData）と使い分ける
 *
 * 仕組み:
 *   - Drive が自動生成するサムネ URL を UrlFetchApp で取得
 *     ( https://drive.google.com/thumbnail?id=FILE_ID&sz=w800 )
 *   - GAS 経由なので CORS 制約を回避できる
 *   - ストレージは消費しない（Drive 内に新規ファイルを作らない）
 *
 * size パラメータ:
 *   - 'w400' / 'w800' / 'w1000' / 'w1600' など（Google サムネ API の慣用記法）
 *   - 省略時は 'w800'（一般的なディスプレイで十分な解像度・容量も100KB前後と軽い）
 */
/**
 * 既存写真ファイルのタグ（spotName）を更新する。
 * description JSON 内の spotName だけを差し替え、他のメタ情報（takenAt / lat / lng 等）は保持する。
 * 復元時にタグ情報が消えてしまう問題を解決するために使用。
 */
function updatePhotoTag(body) {
  const { fileId, spotName } = body;
  if (!fileId) return { ok: false, error: 'fileId が必要です' };

  const file = DriveApp.getFileById(fileId);
  let meta = {};
  try { meta = JSON.parse(file.getDescription() || '{}'); } catch (_) {}
  meta.spotName = spotName || '';
  file.setDescription(JSON.stringify(meta));
  return { ok: true, fileId, spotName: meta.spotName };
}

function getPhotoThumbnail(body) {
  const { fileId, size } = body;
  if (!fileId) return { ok: false, error: 'fileId が必要です' };

  const sz = size || 'w800';
  const url = `https://drive.google.com/thumbnail?id=${fileId}&sz=${sz}`;
  const resp = UrlFetchApp.fetch(url, {
    followRedirects: true,
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code !== 200) {
    return { ok: false, error: `thumbnail fetch failed (HTTP ${code})` };
  }
  const blob = resp.getBlob();
  return {
    ok: true,
    fileId,
    mimeType: blob.getContentType() || 'image/jpeg',
    base64: Utilities.base64Encode(blob.getBytes()),
    size: sz,
  };
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
    sheet.appendRow(['日時', '地域', '駅名', 'プレーヤー名', 'スコア', '訪問スポット数', '移動距離(m)', '写真枚数', 'レポート文字数']);
  }
  // 既存シートのスキーマ移行：「地域」列が無ければ「駅名」の前に挿入
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('地域') < 0) {
    let insertIdx = headers.indexOf('駅名');
    if (insertIdx < 0) insertIdx = headers.length;
    sheet.insertColumnBefore(insertIdx + 1);
    sheet.getRange(1, insertIdx + 1).setValue('地域');
  }
  return sheet;
}

function saveRanking(body) {
  try {
    const { stationName, cityId, playerName, score, visitCount, distanceM, photoCount, reportWordCount } = body;
    if (!stationName || score == null) return { ok: false, error: 'stationName と score が必要です' };

    const sheet = getRankingSheet();
    // ヘッダー順を読んで、その順番に値を組み立てる（スキーマ変動に強い）
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const now = new Date().toISOString();
    const map = {
      '日時': now,
      '地域': cityId || 'other',
      '駅名': stationName,
      'プレーヤー名': playerName || '名無し',
      'スコア': score,
      '訪問スポット数': visitCount || 0,
      '移動距離(m)': distanceM || 0,
      '写真枚数': photoCount || 0,
      'レポート文字数': reportWordCount || 0,
    };
    const row = headers.map(h => map[h] !== undefined ? map[h] : '');
    sheet.appendRow(row);

    return { ok: true, savedAt: now };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// ===== ARキャラ捕獲コレクション（図鑑・Sheets） =====
//
// 「captures」タブ: 端末ローカルID（explorerId）× キャラID ごとに1行。
//   explorerId / characterId / count / firstCapturedAt / lastCapturedAt / updatedAt
// ニックネームではなく端末ローカルIDをキーにすることで重複問題を回避する
// （docs/ar-character-capture-spec.md §5-2）。

const SHEET_TAB_CAPTURES = 'captures';
const SHEET_HEADERS_CAPTURES = ['explorerId', 'characterId', 'count', 'firstCapturedAt', 'lastCapturedAt', 'updatedAt'];

/** 捕獲記録を追記マージする。
 *  body: { explorerId, records: [{ characterId, capturedAt }] } */
function saveCaptures(body) {
  try {
    const { explorerId, records } = body;
    if (!explorerId) return { ok: false, error: 'explorerId が必要です' };
    if (!records || !records.length) return { ok: true, updated: 0 };

    const sheet = getLogSheet(SHEET_TAB_CAPTURES, SHEET_HEADERS_CAPTURES);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    const col = name => headers.indexOf(name);
    const now = new Date().toISOString();

    // explorerId + characterId → 行番号（1-based。ヘッダ行は1）
    const rowIndex = {};
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][col('explorerId')]) === String(explorerId)) {
        rowIndex[String(rows[i][col('characterId')])] = i + 1;
      }
    }

    let updated = 0;
    records.forEach(rec => {
      const charId = String(rec.characterId || '');
      if (!charId) return;
      const capturedAt = rec.capturedAt || now;
      const rowNum = rowIndex[charId];
      if (rowNum) {
        const count = Number(sheet.getRange(rowNum, col('count') + 1).getValue()) || 0;
        sheet.getRange(rowNum, col('count') + 1).setValue(count + 1);
        sheet.getRange(rowNum, col('lastCapturedAt') + 1).setValue(capturedAt);
        sheet.getRange(rowNum, col('updatedAt') + 1).setValue(now);
        if (!sheet.getRange(rowNum, col('firstCapturedAt') + 1).getValue()) {
          sheet.getRange(rowNum, col('firstCapturedAt') + 1).setValue(capturedAt);
        }
      } else {
        sheet.appendRow([explorerId, charId, 1, capturedAt, capturedAt, now]);
        rowIndex[charId] = sheet.getLastRow();
      }
      updated++;
    });
    return { ok: true, updated };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** explorerId のコレクションを返す。
 *  戻り値: { ok, collection: { characterId: { count, firstAt, lastAt } } } */
function getCaptures(body) {
  try {
    const { explorerId } = body;
    if (!explorerId) return { ok: false, error: 'explorerId が必要です' };
    const sheet = getLogSheet(SHEET_TAB_CAPTURES, SHEET_HEADERS_CAPTURES);
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return { ok: true, collection: {} };
    const headers = rows[0];
    const col = name => headers.indexOf(name);
    const collection = {};
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][col('explorerId')]) !== String(explorerId)) continue;
      collection[String(rows[i][col('characterId')])] = {
        count: Number(rows[i][col('count')]) || 0,
        firstAt: rows[i][col('firstCapturedAt')] ? String(rows[i][col('firstCapturedAt')]) : null,
        lastAt: rows[i][col('lastCapturedAt')] ? String(rows[i][col('lastCapturedAt')]) : null,
      };
    }
    return { ok: true, collection };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// ===== ユーザーアカウント（なまえ＋あいことば ログイン・Sheets） =====
//
// 「users」タブ: 1ユーザー1行。
//   userId / name / nameLower / pinHash / createdAt / lastLoginAt
// - userId は図鑑(captures)のキー explorerId として使う（ログイン後の捕獲は userId に紐づく）。
// - なまえ(name)は一意（重複登録は拒否）。ログインは name(小文字) で引き、pinHash を照合。
// - pinHash はクライアント側で SHA-256 済みの文字列（あいことば平文はサーバーに送らない）。
//   ※ 子ども向けPoCの簡易ログインであり、本格的な認証強度は持たない。
const SHEET_TAB_USERS = 'users';
const SHEET_HEADERS_USERS = ['userId', 'name', 'nameLower', 'pinHash', 'createdAt', 'lastLoginAt'];

function normalizeName_(name) {
  return String(name || '').trim();
}

/** なまえ＋あいことば(ハッシュ)で新規登録。body: { name, pinHash } */
function registerUser(body) {
  try {
    const name = normalizeName_(body.name);
    const pinHash = String(body.pinHash || '');
    if (!name)     return { ok: false, error: 'name-required' };
    if (!pinHash)  return { ok: false, error: 'pin-required' };

    const nameLower = name.toLowerCase();
    const sheet = getLogSheet(SHEET_TAB_USERS, SHEET_HEADERS_USERS);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    const col = n => headers.indexOf(n);

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][col('nameLower')]) === nameLower) {
        return { ok: false, error: 'name-taken' };
      }
    }

    const now = new Date().toISOString();
    const userId = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    sheet.appendRow([userId, name, nameLower, pinHash, now, now]);
    return { ok: true, userId, name };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** なまえ＋あいことば(ハッシュ)でログイン。body: { name, pinHash } */
function loginUser(body) {
  try {
    const name = normalizeName_(body.name);
    const pinHash = String(body.pinHash || '');
    if (!name)     return { ok: false, error: 'name-required' };
    if (!pinHash)  return { ok: false, error: 'pin-required' };

    const nameLower = name.toLowerCase();
    const sheet = getLogSheet(SHEET_TAB_USERS, SHEET_HEADERS_USERS);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    const col = n => headers.indexOf(n);

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][col('nameLower')]) === nameLower) {
        if (String(rows[i][col('pinHash')]) !== pinHash) {
          return { ok: false, error: 'bad-credentials' };
        }
        // lastLoginAt を更新
        sheet.getRange(i + 1, col('lastLoginAt') + 1).setValue(new Date().toISOString());
        return { ok: true, userId: String(rows[i][col('userId')]), name: String(rows[i][col('name')]) };
      }
    }
    return { ok: false, error: 'not-found' };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function getRanking(body) {
  const { stationName, cityId, limit } = body;
  const sheet = getRankingSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const data = rows.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    })
    // cityId が指定されたら同じ地域のみ。stationName 指定時は駅名でも絞る
    .filter(r => {
      if (cityId && (r['地域'] || '') !== cityId) return false;
      if (stationName && r['駅名'] !== stationName) return false;
      return true;
    })
    .sort((a, b) => Number(b['スコア']) - Number(a['スコア']))
    .slice(0, limit || 50);

  return { ok: true, ranking: data };
}

// ===== スポット検索結果キャッシュ（Sheets DB） =====
//
// 目的: Places API（Nearby Search ×14 + Text Search ×1 ≒ $0.48/検索）が
//       コストの支配項のため、駅ごとの検索結果を Sheets に保存して再利用する。
// キー: フロントで生成（例: "v1|ja|35.1709,136.8815"）
//       = スキーマ版 | 言語 | 駅座標（小数4桁 ≒ 11m 粒度）
//       maps.js の検索キーワード構成を変えたらフロント側の SPOTS_CACHE_SCHEMA を上げること。
// TTL: SPOTS_CACHE_TTL_DAYS（既定 365日）。期限切れは miss として返し、
//      フロントが再検索 → saveSpotsCache で同じ行を上書きする。
// 注意: Google Maps Platform 規約上、Places コンテンツのキャッシュは
//       原則30日以内（place_id は無期限可）。1年キャッシュは規約リスクあり
//       （docs/public-release-plan.md リスク#10 参照）。

const SHEET_TAB_SPOTS_CACHE = 'spots_cache';
const SHEET_HEADERS_SPOTS_CACHE = ['key', 'stationName', 'lang', 'updatedAt', 'spotCount', 'json'];
const SPOTS_CACHE_TTL_DAYS = 365;
const SPOTS_CACHE_MAX_JSON_CHARS = 45000; // Sheets セル上限 50,000 文字への安全マージン

/** キャッシュ取得。body: { key }
 *  戻り値: { ok, hit, updatedAt?, ageDays?, spots? } */
function getSpotsCache(body) {
  try {
    const key = String(body.key || '');
    if (!key) return { ok: false, error: 'key が必要です' };

    const sheet = getLogSheet(SHEET_TAB_SPOTS_CACHE, SHEET_HEADERS_SPOTS_CACHE);
    const rowNum = findSpotsCacheRow_(sheet, key);
    if (!rowNum) return { ok: true, hit: false };

    const row = sheet.getRange(rowNum, 1, 1, SHEET_HEADERS_SPOTS_CACHE.length).getValues()[0];
    const updatedAt = String(row[3] || '');
    const ageDays = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (!updatedAt || isNaN(ageDays) || ageDays > SPOTS_CACHE_TTL_DAYS) {
      return { ok: true, hit: false, stale: true, updatedAt };
    }

    let spots;
    try {
      spots = JSON.parse(String(row[5] || '[]'));
    } catch (e) {
      return { ok: true, hit: false, error: 'cache JSON 破損' };
    }
    if (!Array.isArray(spots) || !spots.length) return { ok: true, hit: false };

    return { ok: true, hit: true, updatedAt, ageDays: Math.round(ageDays), spots };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** キャッシュ保存（upsert）。body: { key, stationName, lang, spots } */
function saveSpotsCache(body) {
  try {
    const key = String(body.key || '');
    const spots = body.spots;
    if (!key) return { ok: false, error: 'key が必要です' };
    if (!Array.isArray(spots) || !spots.length) return { ok: false, error: 'spots が空です' };

    const json = JSON.stringify(spots);
    if (json.length > SPOTS_CACHE_MAX_JSON_CHARS) {
      return { ok: false, error: `spots JSON が大きすぎます (${json.length} chars)` };
    }

    const sheet = getLogSheet(SHEET_TAB_SPOTS_CACHE, SHEET_HEADERS_SPOTS_CACHE);
    const now = new Date().toISOString();
    const rowValues = [key, String(body.stationName || ''), String(body.lang || ''), now, spots.length, json];

    const rowNum = findSpotsCacheRow_(sheet, key);
    if (rowNum) {
      sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    return { ok: true, savedAt: now, spotCount: spots.length };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** key 列（A列）から行番号を返す。なければ null */
function findSpotsCacheRow_(sheet, key) {
  const finder = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1)
    .createTextFinder(key)
    .matchEntireCell(true);
  const cell = finder.findNext();
  return cell ? cell.getRow() : null;
}

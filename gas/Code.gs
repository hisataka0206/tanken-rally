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
const SESSION_RETENTION_DAYS = 30;                 // セッションフォルダ（写真）の保持期間（日）。約1か月。
                                                   // ※フロントの履歴に出す「削除済み」文言と一致させること。

// ===== キャラ自動生成（NanoBanana Pro / Gemini 3 Pro Image）=====
// APIキーはコードに直書きせず、スクリプトプロパティに置く（GAS: プロジェクト設定 → スクリプト プロパティ）。
//   キー名: GEMINI_API_KEY
// 未設定なら generateCharacters は ok:false を返し、フロントは自動でモック生成にフォールバックする。
const NANOBANANA_MODEL = 'gemini-3-pro-image'; // infographicパイプライン(nb_generate.py)で実績のある本番モデル
const NANOBANANA_MAX_IMAGES = 4;               // 1回のキャラ生成で作る最大枚数（1リクエスト=1枚をこの回数ループ）

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
    if (action === 'updateSessionPhotoCount') {
      return respond(headers, updateSessionPhotoCount(body));
    }
    if (action === 'deleteSession') {
      return respond(headers, deleteSession(body));
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
    if (action === 'getUserHistory') {
      return respond(headers, getUserHistory(body));
    }
    if (action === 'getSpotsCache') {
      return respond(headers, getSpotsCache(body));
    }
    if (action === 'saveSpotsCache') {
      return respond(headers, saveSpotsCache(body));
    }
    if (action === 'generateCharacters') {
      return respond(headers, generateCharacters(body));
    }
    if (action === 'saveGeneratedCharacter') {
      return respond(headers, saveGeneratedCharacter(body));
    }
    if (action === 'getGeneratedCharacters') {
      return respond(headers, getGeneratedCharacters(body));
    }
    if (action === 'openaiChat') {
      return respond(headers, openaiChat(body));
    }
    if (action === 'openaiTranscribe') {
      return respond(headers, openaiTranscribe(body));
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
const SHEET_HEADERS_SESSION = ['日時', 'sessionId', '駅名', 'プレーヤー名', 'フォルダURL', 'スポット数', 'スポット詳細(JSON)', '総距離', '推定時間(分)', 'userId', 'userName', '写真枚数'];
const SHEET_HEADERS_ISSUE   = ['日時', 'sessionId', '駅名', '都市タブ', 'ステップ', '種類', '詳細', 'userAgent', 'URL'];

/** シートのヘッダ行に、不足している列を末尾に追加する（既存シートのスキーマ移行用）。 */
function ensureColumns_(sheet, requiredHeaders) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let changed = false;
  requiredHeaders.forEach(h => {
    if (headers.indexOf(h) < 0) { headers.push(h); changed = true; }
  });
  if (changed) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

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

/** セッションのメタデータを Sheet に保存。
 *  ・同一 sessionId があれば更新（冪等）。
 *  ・「計画のみ(写真0)」の新規は、同一内容(同 userId・駅・スポット構成)の計画のみ行があれば
 *    その行を今の sessionId で更新して重複を作らない（＝写真画面に入って戻るだけの増殖を防ぐ）。
 *  ・写真ありは触らない。作成時刻(日時)は既存行なら保持する。 */
function saveSession(body) {
  try {
    const { sessionId, stationName, playerName, folderUrl, orderedSpots, routeStats, userId, userName } = body;
    if (!sessionId) return { ok: false, error: 'sessionId が必要です' };
    const photoCount = Number(body.photoCount) || 0;
    const sheet = getLogSheet(SHEET_TAB_SESSION, SHEET_HEADERS_SESSION);
    ensureColumns_(sheet, SHEET_HEADERS_SESSION);
    const rng = sheet.getDataRange().getValues();
    const headers = rng[0];
    const ci = h => headers.indexOf(h);
    const now = new Date().toISOString();
    const spotsSig = JSON.stringify((orderedSpots || []).map(s => String((s && s.name) || '')));
    const rowSig = row => {
      try { return JSON.stringify(JSON.parse(String(row[ci('スポット詳細(JSON)')] || '[]')).map(s => String((s && s.name) || ''))); }
      catch (_) { return '[]'; }
    };
    const buildVals = existing => headers.map(h => {
      switch (h) {
        case '日時': return existing ? existing[ci('日時')] : now;
        case 'sessionId': return sessionId;
        case '駅名': return stationName || '';
        case 'プレーヤー名': return playerName || '';
        case 'フォルダURL': return folderUrl || '';
        case 'スポット数': return (orderedSpots && orderedSpots.length) || 0;
        case 'スポット詳細(JSON)': return JSON.stringify(orderedSpots || []);
        case '総距離': return (routeStats && routeStats.distanceText) || '';
        case '推定時間(分)': return (routeStats && routeStats.durationMin) || '';
        case 'userId': return userId || '';
        case 'userName': return userName || '';
        case '写真枚数': return photoCount;
        default: return existing ? existing[ci(h)] : '';
      }
    });
    // 1) 同一 sessionId → 更新
    for (let i = 1; i < rng.length; i++) {
      if (String(rng[i][ci('sessionId')]) === String(sessionId)) {
        sheet.getRange(i + 1, 1, 1, headers.length).setValues([buildVals(rng[i])]);
        return { ok: true, updated: true };
      }
    }
    // 2) 計画のみ(写真0)の重複を集約
    if (photoCount === 0 && userId) {
      for (let i = 1; i < rng.length; i++) {
        if (String(rng[i][ci('userId')]) !== String(userId)) continue;
        if ((Number(rng[i][ci('写真枚数')]) || 0) !== 0) continue;
        if (String(rng[i][ci('駅名')]) === String(stationName || '') && rowSig(rng[i]) === spotsSig) {
          sheet.getRange(i + 1, 1, 1, headers.length).setValues([buildVals(rng[i])]);
          return { ok: true, deduped: true };
        }
      }
    }
    // 3) 新規追加
    sheet.appendRow(buildVals(null));
    return { ok: true, inserted: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** 写真枚数を更新（写真アップ時に呼ぶ。plan→写真あり へ昇格） */
function updateSessionPhotoCount(body) {
  try {
    const sessionId = String((body && body.sessionId) || '');
    if (!sessionId) return { ok: false, error: 'sessionId が必要です' };
    const photoCount = Number(body && body.photoCount) || 0;
    const sheet = getLogSheet(SHEET_TAB_SESSION, SHEET_HEADERS_SESSION);
    ensureColumns_(sheet, SHEET_HEADERS_SESSION);
    const rng = sheet.getDataRange().getValues();
    const headers = rng[0]; const ci = h => headers.indexOf(h);
    for (let i = 1; i < rng.length; i++) {
      if (String(rng[i][ci('sessionId')]) === sessionId) {
        sheet.getRange(i + 1, ci('写真枚数') + 1).setValue(photoCount);
        return { ok: true };
      }
    }
    return { ok: false, error: 'session not found' };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** 履歴の1件を削除（本人=同 userId のみ削除可） */
function deleteSession(body) {
  try {
    const sessionId = String((body && body.sessionId) || '');
    const userId = String((body && body.userId) || '');
    if (!sessionId) return { ok: false, error: 'sessionId が必要です' };
    if (!userId) return { ok: false, error: 'userId が必要です' };
    const sheet = getLogSheet(SHEET_TAB_SESSION, SHEET_HEADERS_SESSION);
    const rng = sheet.getDataRange().getValues();
    const headers = rng[0]; const ci = h => headers.indexOf(h);
    for (let i = rng.length - 1; i >= 1; i--) {
      if (String(rng[i][ci('sessionId')]) === sessionId && String(rng[i][ci('userId')]) === userId) {
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false, error: 'not found' };
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
    sheet.appendRow(['日時', '地域', '駅名', 'プレーヤー名', 'スコア', '訪問スポット数', '移動距離(m)', '写真枚数', 'レポート文字数', 'userId', 'sessionId']);
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
  // userId / sessionId 列を末尾に追加（履歴とスコアの突合用）
  ensureColumns_(sheet, ['userId', 'sessionId']);
  return sheet;
}

function saveRanking(body) {
  try {
    const { stationName, cityId, playerName, score, visitCount, distanceM, photoCount, reportWordCount, userId, sessionId } = body;
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
      'userId': userId || '',
      'sessionId': sessionId || '',
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

// ===== 生成キャラの端末間同期（#10：画像=Drive／メタ=Sheets、userId 紐付け） =====
const SHEET_TAB_GENERATED = 'generated';
const SHEET_HEADERS_GENERATED = ['userId', 'genId', 'name', 'station', 'rarityId', 'vocabJSON', 'distanceKm', 'spotCount', 'fileId', 'fileUrl', 'createdAt'];

// 生成キャラ画像の保存先フォルダ（ルート直下に1つ作って共用）
function getGeneratedFolder_() {
  const root = getRootFolder();
  const name = '_generated_characters';
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

/** 生成キャラ1体を保存。画像を Drive に、メタを Sheets に（userId 紐付け）。
 *  body: { userId, genId, name, station, rarityId, vocab, imageDataUrl, createdAt } */
function saveGeneratedCharacter(body) {
  try {
    const userId = String((body && body.userId) || '');
    const genId  = String((body && body.genId) || '');
    if (!userId || !genId) return { ok: false, error: 'userId と genId が必要です' };

    // 既に同じ genId が保存済みなら重複保存しない
    const sheet = getLogSheet(SHEET_TAB_GENERATED, SHEET_HEADERS_GENERATED);
    const rows = sheet.getDataRange().getValues();
    const col = n => rows[0].indexOf(n);
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][col('genId')]) === genId) {
        return { ok: true, dup: true, fileUrl: String(rows[i][col('fileUrl')] || '') };
      }
    }

    // 画像（dataURL）を Drive に PNG 保存
    let fileId = '', fileUrl = '';
    const dataUrl = String((body && body.imageDataUrl) || '');
    const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (m) {
      const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], genId + '.png');
      const file = getGeneratedFolder_().createFile(blob);
      fileId = file.getId();
      fileUrl = 'https://drive.google.com/uc?id=' + fileId;
    }

    sheet.appendRow([
      userId, genId,
      String((body && body.name) || ''),
      String((body && body.station) || ''),
      String((body && body.rarityId) || ''),
      JSON.stringify((body && body.vocab) || {}),
      Number((body && body.distanceKm) || 0),
      Number((body && body.spotCount) || 0),
      fileId, fileUrl,
      String((body && body.createdAt) || new Date().toISOString()),
    ]);
    return { ok: true, fileId, fileUrl };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** userId の生成キャラ一覧を返す（画像は base64 dataURL で同梱＝端末を跨いで表示可能）。
 *  body: { userId } → { ok, characters: [{ genId, name, station, rarityId, vocab, imageDataUrl, createdAt }] } */
function getGeneratedCharacters(body) {
  try {
    const userId = String((body && body.userId) || '');
    if (!userId) return { ok: false, error: 'userId が必要です' };
    const sheet = getLogSheet(SHEET_TAB_GENERATED, SHEET_HEADERS_GENERATED);
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return { ok: true, characters: [] };
    const col = n => rows[0].indexOf(n);
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][col('userId')]) !== userId) continue;
      let vocab = {};
      try { vocab = JSON.parse(String(rows[i][col('vocabJSON')] || '{}')) || {}; } catch (_) {}
      let imageDataUrl = null;
      const fileId = String(rows[i][col('fileId')] || '');
      if (fileId) {
        try {
          const blob = DriveApp.getFileById(fileId).getBlob();
          imageDataUrl = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
        } catch (_) { imageDataUrl = null; }
      }
      out.push({
        genId: String(rows[i][col('genId')] || ''),
        name: String(rows[i][col('name')] || ''),
        station: String(rows[i][col('station')] || ''),
        rarityId: String(rows[i][col('rarityId')] || 'common'),
        vocab: vocab,
        distanceKm: Number(rows[i][col('distanceKm')]) || 0,
        spotCount: Number(rows[i][col('spotCount')]) || 0,
        imageDataUrl: imageDataUrl,
        createdAt: String(rows[i][col('createdAt')] || ''),
      });
    }
    return { ok: true, characters: out };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// ===== OpenAI プロキシ（キーは Script Property OPENAI_API_KEY・ブラウザ非露出） =====
// テキスト: chat/completions。音声: Whisper(audio/transcriptions)。
// ※ script.external_request スコープが必要（Gemini 用に承認済みなら追加承認は不要）。
function openaiChat(body) {
  try {
    var key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
    if (!key) return { ok: false, error: 'OPENAI_API_KEY not set' };
    var payload = {
      model: (body && body.model) || 'gpt-4o-mini',
      messages: (body && body.messages) || [],
      max_tokens: (body && body.max_tokens) || 350,
      temperature: (body && body.temperature != null) ? body.temperature : 0.3,
    };
    var res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    var txt = res.getContentText();
    if (code !== 200) return { ok: false, error: 'openai http ' + code + ': ' + txt.slice(0, 200) };
    var j = JSON.parse(txt);
    var content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    return { ok: true, text: String(content) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function openaiTranscribe(body) {
  try {
    var key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
    if (!key) return { ok: false, error: 'OPENAI_API_KEY not set' };
    var b64 = (body && body.audioBase64) || '';
    if (!b64) return { ok: false, error: 'audioBase64 が必要です' };
    var mime = (body && body.mimeType) || 'audio/webm';
    var ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, 'memo.' + ext);
    var form = { file: blob, model: 'whisper-1', temperature: '0' };
    if (body && body.lang) form.language = String(body.lang);
    var res = UrlFetchApp.fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'post',
      headers: { Authorization: 'Bearer ' + key },
      payload: form,               // Blob を含むオブジェクト → GAS が multipart/form-data で送信
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    var txt = res.getContentText();
    if (code !== 200) return { ok: false, error: 'whisper http ' + code + ': ' + txt.slice(0, 200) };
    var j = JSON.parse(txt);
    return { ok: true, text: String((j && j.text) || '').trim() };
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

/** ログインユーザーの冒険履歴を返す。
 *  body: { userId, limit? }
 *  戻り値: { ok, history: [{ sessionId, date, stationName, folderUrl, spotCount, score }] } （新しい順）
 *  スコアはランキングtabの同 sessionId の最高点を突合（無ければ null）。 */
function getUserHistory(body) {
  try {
    const userId = String(body.userId || '');
    if (!userId) return { ok: false, error: 'userId が必要です' };
    const limit = body.limit || 50;

    // セッション一覧（userId 一致のみ。過去の無記名セッションは userId 空なので自然に除外）
    const sSheet = getLogSheet(SHEET_TAB_SESSION, SHEET_HEADERS_SESSION);
    const sRows = sSheet.getDataRange().getValues();
    if (sRows.length < 2) return { ok: true, history: [] };
    const sHead = sRows[0];
    const sCol = n => sHead.indexOf(n);
    const uidIdx = sCol('userId');
    if (uidIdx < 0) return { ok: true, history: [] };

    const sessions = [];
    for (let i = 1; i < sRows.length; i++) {
      if (String(sRows[i][uidIdx]) !== userId) continue;
      // スポット名の一覧を「スポット詳細(JSON)」から取り出す（写真フォルダを消しても残る情報）
      let spots = [];
      try {
        const arr = JSON.parse(String(sRows[i][sCol('スポット詳細(JSON)')] || '[]'));
        if (Array.isArray(arr)) spots = arr.map(s => (s && s.name) ? String(s.name) : '').filter(Boolean);
      } catch (_) { /* JSON壊れは空扱い */ }
      sessions.push({
        sessionId:    String(sRows[i][sCol('sessionId')] || ''),
        date:         String(sRows[i][sCol('日時')] || ''),
        stationName:  String(sRows[i][sCol('駅名')] || ''),
        folderUrl:    String(sRows[i][sCol('フォルダURL')] || ''),
        spotCount:    Number(sRows[i][sCol('スポット数')]) || 0,
        spots:        spots,
        distanceText: String(sRows[i][sCol('総距離')] || ''),
        durationMin:  sRows[i][sCol('推定時間(分)')] || '',
        photoCount:   (sCol('写真枚数') >= 0 ? (Number(sRows[i][sCol('写真枚数')]) || 0) : 0),
        score:        null,
      });
    }

    // スコアを sessionId で突合（ランキングtab）。
    try {
      const rSheet = getRankingSheet();
      const rRows = rSheet.getDataRange().getValues();
      if (rRows.length >= 2) {
        const rHead = rRows[0];
        const sidIdx = rHead.indexOf('sessionId');
        const scoreIdx = rHead.indexOf('スコア');
        if (sidIdx >= 0 && scoreIdx >= 0) {
          const bySid = {};
          for (let i = 1; i < rRows.length; i++) {
            const sid = String(rRows[i][sidIdx] || '');
            if (!sid) continue;
            const sc = Number(rRows[i][scoreIdx]) || 0;
            if (bySid[sid] == null || sc > bySid[sid]) bySid[sid] = sc;
          }
          sessions.forEach(s => { if (bySid[s.sessionId] != null) s.score = bySid[s.sessionId]; });
        }
      }
    } catch (_) { /* スコア突合失敗は履歴自体には影響させない */ }

    sessions.sort((a, b) => (a.date < b.date ? 1 : -1)); // 新しい順
    return { ok: true, history: sessions.slice(0, limit) };
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

// ===== キャラ自動生成: NanoBanana Pro（Gemini 3 Pro Image）=====
// body: { prompt, count }
// 返り値: { ok:true, images:[{dataUrl}] } / 失敗時 { ok:false, error }
// ※APIキーはスクリプトプロパティ GEMINI_API_KEY に設定。未設定なら ok:false（フロントはモックへ）。
// ※モデル名・レスポンス形状は最新ドキュメントで要確認（下記は generateContent の一般形に基づく実装）。
// ===== 外部リクエスト権限(script.external_request)の承認用ワンショット =====
// UrlFetchApp で外部URL（Gemini API 等）を叩くには script.external_request スコープの承認が必要。
// 手順: Apps Scriptエディタでこの関数を選び「実行」→権限ダイアログで「許可」→
//       その後 Webアプリを「新バージョン」でデプロイし直す。以降 generateCharacters が実API生成になる。
function authorizeExternalRequest() {
  var res = UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis', { muteHttpExceptions: true });
  Logger.log('authorizeExternalRequest status: ' + res.getResponseCode());
  return res.getResponseCode();
}

function generateCharacters(body) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return { ok: false, error: 'GEMINI_API_KEY not set (falling back to mock)' };
    }
    var prompt = String((body && body.prompt) || '').slice(0, 4000);
    if (!prompt) return { ok: false, error: 'empty prompt' };
    var count = Math.max(1, Math.min(NANOBANANA_MAX_IMAGES, parseInt((body && body.count) || 3, 10)));

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
      + encodeURIComponent(NANOBANANA_MODEL) + ':generateContent?key=' + encodeURIComponent(apiKey);

    // 子供向け: 安全側の指示をプロンプト末尾にも明示（サーバ側 IMAGE_SAFETY と二重）。
    var safePrompt = prompt + ' Safe for young children. No text, no logos, no real people.';

    // 実績のある呼び出し形（infographic-creator / nb_generate.py と同一）:
    // 最小ボディ {contents:[{parts:[{text}]}]} で 1リクエスト=1枚。count 枚ぶんループし、
    // それぞれ独立したバリエーションを得る（candidateCount は画像モデルで不安定なため不使用）。
    var reqPayload = JSON.stringify({ contents: [{ parts: [{ text: safePrompt }] }] });
    var images = [];
    var lastErr = '';
    for (var n = 0; n < count; n++) {
      var res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: reqPayload,
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      var textBody = res.getContentText();
      if (code !== 200) {
        // プリペイド残高切れは共通の運用エラーなので即時返す（infographicと同じ挙動）。
        if (textBody.indexOf('prepayment credits are depleted') >= 0) {
          return { ok: false, error: 'gemini 429: プリペイド残高切れ。ai.studio でチャージしてください。' };
        }
        lastErr = 'gemini http ' + code + ': ' + textBody.slice(0, 200);
        continue;
      }
      // candidates[].content.parts[].inlineData(.data,.mimeType) から最初の画像を1枚採用。
      var json = JSON.parse(textBody);
      var cands = (json && json.candidates) || [];
      var picked = false;
      for (var i = 0; i < cands.length && !picked; i++) {
        // 生成物の安全ブロック（IMAGE_SAFETY 等）はスキップ。
        if (cands[i].finishReason && String(cands[i].finishReason).indexOf('SAFETY') >= 0) continue;
        var parts = (cands[i].content && cands[i].content.parts) || [];
        for (var j = 0; j < parts.length; j++) {
          var inline = parts[j].inlineData || parts[j].inline_data;
          if (inline && inline.data) {
            var mime = inline.mimeType || inline.mime_type || 'image/png';
            images.push({ dataUrl: 'data:' + mime + ';base64,' + inline.data });
            picked = true;
            break;
          }
        }
      }
      if (!picked) lastErr = 'no image in response (possibly IMAGE_SAFETY blocked)';
    }
    if (!images.length) {
      return { ok: false, error: lastErr || 'no images generated' };
    }
    return { ok: true, images: images };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

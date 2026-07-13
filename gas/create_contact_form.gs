// テクタン お問い合わせフォームを作る「一度きり」ユーティリティ。
//
// 使い方:
//   1. script.google.com で新規プロジェクトを作成（既存のCode.gsとは別が無難＝Formsスコープを本番に足さないため）
//   2. この内容を貼り付け
//   3. 関数プルダウンで createContactForm を選び「実行」→ 初回は権限承認
//   4. 実行ログ（表示 → ログ）に出る「公開URL」を policy.html の連絡先に貼る
//
// ★「Specified permissions are not sufficient ... auth/forms」と出たら:
//   マニフェストにFormsスコープが無いのが原因。
//   ⚙️プロジェクトの設定 →「appsscript.json マニフェストをエディタで表示する」にチェック
//   → appsscript.json に下記を追加して保存 → 再実行:
//     "oauthScopes": ["https://www.googleapis.com/auth/forms"]
//
// 回答は作成者（あなた）だけが Google フォームの回答画面で確認できます。
// メールアドレスは公開せず、このフォームが唯一の連絡窓口になります。
function createContactForm() {
  var form = FormApp.create('テクタン お問い合わせ');
  form.setDescription(
    'テクタンに関するお問い合わせ・写真やデータの削除依頼・キャラクターの報告などにご利用ください。\n' +
    'いただいた内容は運営者のみが確認します。');
  form.setCollectEmail(false);                 // 送信者メールの強制収集はしない（任意項目で受ける）
  form.setConfirmationMessage('送信ありがとうございました。内容を確認します。');
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);

  form.addMultipleChoiceItem()
    .setTitle('お問い合わせの種類')
    .setChoiceValues([
      '写真・データの削除依頼',
      'キャラクターの報告（不適切など）',
      '不具合の報告',
      'その他',
    ])
    .setRequired(true);

  form.addTextItem()
    .setTitle('返信が必要な場合の連絡先（メールなど・任意）')
    .setRequired(false);

  form.addTextItem()
    .setTitle('アカウントのなまえ（削除依頼などの特定用・任意）')
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle('お問い合わせ内容')
    .setRequired(true);

  // アプリから自動で入る画像リンク（ユーザーは記入不要）。
  // 画像そのものはアプリ内で Drive にアップロードし、その共有URLがここに入る（＝ログイン不要）。
  form.addTextItem()
    .setTitle('画像URL（アプリが自動で添付・記入不要）')
    .setRequired(false);

  var pub = form.getPublishedUrl();
  Logger.log('■ 公開URL（policy.html / config.js の CONTACT_FORM_URL に貼る）: ' + pub);
  Logger.log('■ 編集/回答確認URL（管理用・非公開）: ' + form.getEditUrl());
  logFormEntryIds_(form);   // ↓ GAS スクリプトプロパティに貼る値を出力
  return pub;
}

// 既存フォームに「画像URL」欄が無ければ追加し、entry ID 一式を出力する。
// 使い方: この関数を選び、引数の formId（編集URL /d/●●●/edit の ●●● 部分）を books で渡すか、
//         下の DEFAULT_FORM_ID に貼って実行する。現在のフォームURLを変えずに連携できる。
var DEFAULT_FORM_ID = '';   // ←編集URLのファイルID（任意）
function upgradeExistingForm(formId) {
  var id = formId || DEFAULT_FORM_ID;
  if (!id) { Logger.log('formId を渡すか DEFAULT_FORM_ID を設定してください（編集URLのファイルID）'); return; }
  var form = FormApp.openById(id);
  var hasImage = form.getItems(FormApp.ItemType.TEXT).some(function (it) {
    return it.getTitle().indexOf('画像URL') === 0;
  });
  if (!hasImage) {
    form.addTextItem().setTitle('画像URL（アプリが自動で添付・記入不要）').setRequired(false);
    Logger.log('「画像URL」欄を追加しました。');
  } else {
    Logger.log('「画像URL」欄は既にあります。');
  }
  Logger.log('■ 公開URL: ' + form.getPublishedUrl());
  logFormEntryIds_(form);
}

// 各設問の entry ID と formResponse URL を出力する。ここに出た値を
// 本番 GAS の Code.gs 先頭の定数へ貼る：
//   ISSUE_FORM_RESPONSE_URL / ISSUE_ENTRY_TYPE / ISSUE_ENTRY_DETAIL /
//   ISSUE_ENTRY_CONTACT / ISSUE_ENTRY_NAME / ISSUE_ENTRY_IMAGE
// entry ID は getId() とは別物なので、ダミー値を入れた prefilled URL から確実に割り出す。
function logFormEntryIds_(form) {
  var respUrl = form.getPublishedUrl().replace('/viewform', '/formResponse');
  Logger.log('==== Google フォーム連携用の値（Code.gs 先頭の定数へ貼る）====');
  Logger.log('ISSUE_FORM_RESPONSE_URL = ' + respUrl);

  // 各設問に一意なマーカー値を入れて prefilled URL を生成 → entry.xxxx=マーカー を逆引き。
  var resp = form.createResponse();
  var byMarker = {};
  form.getItems().forEach(function (item) {
    var t = item.getType();
    var marker = 'MARK' + item.getId();
    try {
      if (t === FormApp.ItemType.TEXT) {
        resp.withItemResponse(item.asTextItem().createResponse(marker));
      } else if (t === FormApp.ItemType.PARAGRAPH_TEXT) {
        resp.withItemResponse(item.asParagraphTextItem().createResponse(marker));
      } else if (t === FormApp.ItemType.MULTIPLE_CHOICE) {
        var ch = item.asMultipleChoiceItem().getChoices();
        if (!ch.length) return;
        marker = ch[0].getValue();
        resp.withItemResponse(item.asMultipleChoiceItem().createResponse(marker));
      } else {
        return;
      }
      byMarker[marker] = item.getTitle();
    } catch (e) { /* skip */ }
  });

  var pre = form.getPublishedUrl();
  try { pre = resp.toPrefilledUrl(); } catch (e) { Logger.log('prefill 生成に失敗: ' + e); }
  var q = (pre.split('?')[1] || '');
  q.split('&').forEach(function (kv) {
    var m = kv.match(/^entry\.(\d+)=(.*)$/);
    if (!m) return;
    var entryId = m[1];
    var val = decodeURIComponent(m[2].replace(/\+/g, ' '));
    var title = byMarker[val] || '(不明)';
    var hint = '';
    if (title.indexOf('種類') >= 0) hint = ' → ISSUE_ENTRY_TYPE';
    else if (title.indexOf('内容') >= 0) hint = ' → ISSUE_ENTRY_DETAIL';
    else if (title.indexOf('連絡先') >= 0) hint = ' → ISSUE_ENTRY_CONTACT';
    else if (title.indexOf('なまえ') >= 0) hint = ' → ISSUE_ENTRY_NAME';
    else if (title.indexOf('画像URL') >= 0) hint = ' → ISSUE_ENTRY_IMAGE';
    Logger.log('entry.' + entryId + '  「' + title + '」' + hint);
  });
  Logger.log('※ 各 ISSUE_ENTRY_* には entry. の後ろの数字だけを Code.gs の定数に入れる。');
}

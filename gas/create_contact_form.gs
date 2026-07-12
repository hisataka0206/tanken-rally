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

  var pub = form.getPublishedUrl();
  Logger.log('■ 公開URL（policy.html に貼る）: ' + pub);
  Logger.log('■ 編集/回答確認URL（管理用・非公開）: ' + form.getEditUrl());
  return pub;
}

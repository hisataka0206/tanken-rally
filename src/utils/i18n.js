// 多言語対応（JA / EN / Elementary[漢字+ふりがな]）
//
// 言語の判定方法：
//   1. URL クエリ `?lang=en` `?lang=elementary` `?lang=ja`
//   2. URL ハッシュ `#EN` `#Elementary` （クエリと同等）
//   3. `?lang=` 無指定 → 'ja' (デフォルト)
//
// パス末尾 `/EN` `/Elementary` は GitHub Pages の 404.html リダイレクトでクエリへ変換。
//
// HTML マークアップ:
//   data-i18n="key"             → textContent を差し替え
//   data-i18n-html="key"        → innerHTML を差し替え（<strong>等を含む文）
//   data-i18n-placeholder="key" → placeholder 属性を差し替え
//   data-i18n-title="key"       → title 属性を差し替え
//
// applyI18n() を初期化時に呼ぶと、対象ノードの中身を一括差し替え。

const TRANSLATIONS = {
  // ============ 日本語（デフォルト） ============
  ja: {
    appTitle: 'たんけんラリー',
    headerSub: '駅から街を探検しよう',

    // ステップタイトル
    step1Title: '探検する駅をえらぼう',
    step2Title: '行きたい場所を選ぼう',
    step3Title: '探検マップを確認しよう',
    step4Title: '探検しながら写真を撮ろう',
    step5Title: 'たんけんノートをつくろう',

    // STEP 1
    disclaimer: '⚠️ <strong>すべての駅で適切なルートが確保できていることを確約していません。</strong> スポットが少なかったり、目安時間（約60分）に収まらないこともあります。気になったら別の駅も試してみてね。',
    resumeSummary: '🔑 前回のたんけんを開く（パスワード入力）',
    resumeHint: '前回の探検時に Drive 上に作成されたフォルダ名の末尾にあるランダムな文字列（例：<code>lwgvzs6b9k2</code>）を入力すると、そのときの写真を読み込んで「たんけんノート」の続きが書けます。',
    resumeInputPh: 'セッションIDを貼り付け...',
    btnResume: '前回を開く →',
    labelLine: '路線',
    labelStation: '駅',
    optLineEmpty: '── 路線をえらんでね ──',
    optStationEmpty: '── 先に路線をえらんでね ──',
    optStationPick: '── 駅をえらんでね ──',
    btnSearchSelect: 'この駅でさがす →',
    stationInputPh: '例：高円寺、鎌倉、浅草 ...',
    btnSearch: 'さがす',
    filterSummary: '🔍 詳細絞り込み（任意）',
    filterHint: '探検する日時を入れると、<strong>その時間に開いていないお店や施設は結果から自動で除外</strong>します。',
    filterDate: '📅 日にち',
    filterStart: '⏰ 開始',
    filterEnd: '⏰ 終了',
    filterDisclaimer: '⚠️ 営業時間情報は <strong>Google マップが提供する情報に依存</strong>しており、正確性を保証するものではありません。実際にお出かけする前に、お店や施設の公式サイト・電話などで営業時間を必ずご確認ください。',

    // STEP 2
    catFilterLabel: '🏷️ カテゴリで絞り込み:',
    btnBackStation: '← 駅を変える',
    btnMakeRoute: 'ルートをつくる →',

    // STEP 3
    btnBackSpots: '← スポットを変える',
    btnDownloadPdf: '📄 地図PDFをダウンロード',
    btnReverseRoute: '🔄 逆順にする',
    btnReverseRouteCalc: '🔄 入れ替え中…',
    btnStartExplore: '探検スタート！ →',

    // STEP 4
    photoUploadLabel: '📷 写真を撮る / 選ぶ',
    photoCameraLabel: '📷 写真を撮る',
    photoGalleryLabel: '🖼️ 写真を選ぶ',
    photoHint: '💡 撮影あとに写真をタップして、場所のタグ（任意）を付けられるよ。',
    // 撮影ウィザード（STEP 4 のステージ別画面）
    btnWizardPrev: '← 前へ',
    btnWizardNext: '次へ →',
    btnWizardSkip: 'スキップ ↪',
    wizardProgressFmt: '{n} / {total}',
    wizardStartTitleFmt: '🚉 {name}駅 (スタート)',
    wizardGoalTitleFmt: '🏁 {name}駅 (ゴール)',
    wizardSpotTitleFmt: '📍 {label}. {name}',
    wizardHintStart: '出発の写真を一枚！🚉\n駅前の様子や、これから探検する街のはじまりを残してね',
    wizardHintGoal: 'おかえり！🎉\n探検の最後を記念に一枚撮ろう',
    wizardHintSpotFmt: 'ここで気になったもの、面白いと思ったものを写真に残そう！\nどんな発見があったかな？',
    wizardNoPhotosYet: 'まだここでの写真はないよ。撮ってみよう！',
    wizardPhotosTakenFmt: 'ここで {n} 枚撮ったよ',
    btnBackRoute: '← マップに戻る',
    btnFinishExplore: '探検おわり！ノートへ →',

    // STEP 5
    reportIntro: '✏️ 自分のことばで、感じたこと・見つけたこと・気になったことを書いてみよう。PDFにして印刷すると、B3ポスターサイズのたんけんノートになるよ。',
    reportTitleH1: '🗺 たんけんノート',
    reportDate: '📅 たんけん日',
    reportAuthor: '✏️ きろくした人',
    reportAuthorPh: '（あなたの名前）',
    reportStation: '🚉 たんけんした駅',
    reportSecOverview: '🌟 たんけんを終えて思ったこと',
    reportOverviewPh: 'ここに自由に感想を書こう。一番たのしかったこと、びっくりしたこと、気になったこと…',
    reportSecPhotos: '📷 とった写真と思い出',
    reportPhotosHint: '行った順に並べてあるよ。ノートに載せたくない写真は STEP 4 で外しておこう。写真ごとに思ったこと・気づいたことを書きこめます（任意）。',
    reportSecAfterword: '✏️ ノートを書いてみて',
    reportAfterwordPh: 'ノートを書いてみて、新しく気づいたことや、もっと知りたくなったことがあれば書こう',
    btnBackPhotos: '← 写真にもどる',
    btnSaveReport: '💾 保存',
    btnSubmitScore: '🏆 スコア',
    btnReportPdf: '📄 PDF出力',

    // 写真タグモーダル
    tagModalTitle: '📍 タグをつける',
    tagModalDesc: 'この写真を撮った場所を選んでね（任意）。',
    tagModalEmpty: '── タグなし ──',
    btnCancel: 'キャンセル',
    btnSave: '保存',

    // スコア・ランキングモーダル
    scoreModalTitle: '🏆 たんけんスコア',
    scoreNameLabel: '✏️ 名前（ニックネームでもOK）',
    scoreNamePh: '（探検者の名前）',
    scoreDesc: 'ランキングに登録すると、同じ地域で探検した他の人と点数を比べられます。',
    scoreHowtoSummary: '💡 スコアはどう決まるの？',
    scoreHowtoList: '<li>🚶 たくさん歩く</li><li>📍 いろんなスポットに行く</li><li>📷 写真をたくさん撮る</li><li>🏷️ 写真にスポットのタグを付ける</li><li>📝 感想や写真コメントを書く</li><li>⏱️ 1時間以内におわらせる</li><li>🎯 Googleの所要時間に近いペースで歩く</li>',
    scoreAdviceTitle: '🌱 こうするともっと点が伸びるかも！',
    adviceMorePhotos: '📷 写真をもう少し撮ってみよう（{n}枚 → 5枚以上が目安）',
    adviceTagPhotos: '🏷️ 写真にスポットのタグを付けると点が伸びるよ（タグ付き {n}/{total}枚）',
    adviceMoreComments: '📝 写真の感想を書いてみよう（コメント {n}枚／{total}枚）',
    adviceLongerOverview: '✏️ 「ぜんたいの感想」をもう少し書いてみよう（今 {n}文字）',
    adviceUnder60: '⏱️ 1時間以内におわらせると大きなボーナスがあるよ（今回 {min}分）',
    adviceMoreDistance: '🚶 もっと歩いてみよう（今回 {km}km）',
    advicePace: '🎯 Googleの所要時間に近いペース（短すぎ・長すぎは減点）',
    advicePerfect: '🌟 弱点なし！すばらしい探検でした',
    btnClose: '閉じる',
    btnSubmitRanking: 'ランキングに送信 →',
    rankingTitle: '🏆 <span id="ranking-station-name"></span> ランキング (上位10名)',

    // 不具合報告
    btnReportIssue: '🐛 不具合を報告',
    issueTitle: '🐛 不具合を報告',
    issueDesc: '困ったことや、おかしな動きがあったら教えてください。<br />開発者がこの情報をもとに、ちょっとずつ良くしていきます。',
    issueT_stationLocation: '駅の位置がおかしい（別の場所に飛んだ）',
    issueT_spotsBad: 'スポットの内容が不適切・少なすぎる',
    issueT_routeWeird: 'ルートが変（遠回り・通れない道など）',
    issueT_streetviewEmpty: 'ストリートビュー写真が出ない',
    issueT_pdfBroken: 'PDFが正しく出力されない',
    issueT_photoUpload: '写真のアップロード・タグがおかしい',
    issueT_reportEdit: 'たんけんノートの編集で困った',
    issueT_other: 'その他',
    issueDetailPh: '詳しく書きたい場合はこちらに自由に記入してください（任意）',
    btnSubmit: '送信',

    // 動的カウント・単位
    suffPhotos: '枚',
    suffPhotosTagged: '枚（うち{n}枚にタグあり）',
    suffPhotosIncluded: '枚（ノートに載せる: {n}枚）',
    suffPoints: '点',
    distanceFromStation: '駅から',

    // 都市・タブ
    cityOther: 'その他',

    // カテゴリ（CAT.label）
    catLabel_historic: '史跡・文化財',
    catLabel_sweets:   'スイーツ・菓子店',
    catLabel_nature:   '公園・自然',
    catLabel_toy:      '玩具・おもちゃ',
    catLabel_museum:   '美術館・博物館',
    catLabel_science:  '科学館・自然史',
    catLabel_dagashi:  '駄菓子屋',
    catLabel_other:    'その他',

    // STEP 2 関連
    badgeRequired: '必ず1つ',
    hintHistoricRequired: '🏯 史跡（ピンク枠）から1つ以上選んでね',
    routePreviewCalcing: '⏳ 計算中…',
    routePreviewFmt: '約 {dist} / {min}分',
    routePreviewFail: '⚠️ 計算失敗',

    // 動的状態テキスト
    statusSearching: '検索中…',
    statusMakingRoute: 'ルート作成中…',
    statusRestoringRoute: 'ルート復元中…',
    statusReady: '準備中…',
    statusGeneratingPdf: '📄 PDF生成中…',
    statusUploading: '📤 アップロード中… {i}/{n}',
    statusUploaded: '✅ {n}枚追加しました',
    statusCheckingHours: '営業時間を確認中… ({i}/{n})',
    statusLoadingSpots: 'スポットを検索中…',
    statusSavingScore: '送信中…',
    statusSavingReport: '保存中…',
    statusSavedReport: '✅ 保存しました',

    // 地名由来プレフィックス
    originStoryPrefix: '🗣️ たんけん博士より：',

    // STEP 3 統計
    statsTotalDistance: '総距離',
    statsEstTime: '推定時間',
    statsSpotCount: 'スポット数',
    suffSpots: '件',
    approxMin: '約{n}分',          // "約30分"
    approxMinKm: '約 {min}分・{km}', // 区間
    approxMinDot: '約 {min}分',
    kidsTimeNote: '（子供の歩く速さで計算）', // ja モードでは表示しない（呼び出し側で LANG 判定）
    legAboutMin: '約{n}分',
    routeWarningTpl: '⚠️ <strong>このコースは約{n}分かかります。</strong> 1時間以内が目安だよ。スポットを減らすか、別の駅で試してみよう！',
    btnReduceSpots: 'スポットを減らす',
    btnDifferentStation: '別の駅にする',
    routeFlowStart: '🚉 <strong>{name}駅</strong>（スタート）',
    routeFlowGoal:  '🚉 <strong>{name}駅</strong>（ゴール）',

    // PDF (地図PDF)
    pdfStationLabel: '{name} 探検マップ',
    pdfSecRoute: 'たんけんルート',
    pdfSecTurnpoints: '曲がるところ・目印',
    pdfTurnHint: 'ストリートビューの写真を目印にしてね。実際の景色とすこし違うこともあります。',
    pdfFlowStart: '🚉 <strong>{name}駅</strong>（スタート）',
    pdfFlowGoal:  '🚉 <strong>{name}駅</strong>（ゴール）',
    pdfStartCardTitle: '{name}駅',
    pdfStartCardSubtitle: 'スタート — ここから探検をはじめよう',
    pdfGoalCardTitle: '{name}駅',
    pdfGoalCardSubtitle: 'ゴール — おつかれさま！',
    pdfNextDirection: '→ 次は{name}方面',
    pdfFooter: 'たんけんラリー — {name} 探検マップ',
    pdfNoTurns: '曲がる場所はありません。まっすぐ進んでね。',
    pdfNoApiKey: '（地図画像はAPIキー未設定のため省略）',
    pdfSegmentHeaderFmt: '🚶 区間 {from}（{fromName}） → {to}（{toName}）',
    pdfSegmentNoTurns: '曲がり角なし — まっすぐ進んでね',

    // 進捗ラベル / 単位
    suffMin: '分',
    suffKm: 'km',
    suffM: 'm',

    // ===== A. 動的状態テキスト =====
    btnLoadingResume: '読み込み中…',
    routePreviewCalcWait: '⏳ 計算中…',
    routePreviewResultFmt: '約 {dist} / {min}分',
    routePreviewFailMsg: '⚠️ 計算失敗',
    routeBtnTitleHistoricRequired: '史跡を1つ以上選んでね',
    btnMakeRouteIdle: 'ルートをつくる →',
    btnStartExploreIdle: '探検スタート！ →',
    markerStationFmt: '{name}駅',

    // ===== B. Drive セッション情報パネル =====
    driveCreatingFolder: '📂 Google Driveにフォルダを作成中…',
    driveFolderSavedFmt: '📂 保存先: <a href="{url}" target="_blank" style="color:#2e7d32">{name}</a><br/>🔑 再開パスワード: <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;font-family:monospace">{sessionId}</code>（メモしておこう）',
    driveErrorPhotosLocalFmt: '⚠️ Drive接続エラー（写真はローカルのみ）: {err}',
    driveSessionInfoNoGas: '📸 写真を撮って探検の記録をのこそう！（GAS未設定のためローカルのみ）',
    sessionResumedHeader: '📂 <strong>セッション再開:</strong>',
    sessionVisitedLabel: '📍 行った場所:',
    sessionStatsFmt: '写真 {photos} 枚 / スポット {spots} 件',
    sessionWarnSpotsFmt: '⚠️ スポット情報の復元に失敗（{reason}）— GAS の権限承認またはデプロイ更新を確認してください',
    sessionWarnNotFound: '⚠️ Sheet に該当 sessionId のセッション情報が見つかりませんでした',

    // ===== C. 写真タグ・ノート編集 =====
    photoTagAdd: '➕ タップしてタグ付け',
    photoTagInclude: 'ノートに載せる',
    photoTagExclude: 'ノートから外す',
    photoTagless: '📍 タグなし',
    reportStationFmt: '{name}駅',
    reportNoPhotos: '📷 ノートに載せる写真がありません。STEP 4 で写真を撮るか、外した写真を戻そう。',
    reportPdfHeaderFmt: '📖 たんけんノート — {name}',
    pdfStationExitFmt: '🚪 駅から出るときは {exit} を使ってね',

    // ===== D. スコア・ランキング =====
    mood_master: '🌟 たんけんマスター！',
    mood_great: '✨ たんけん上手！',
    mood_good: '🎉 おつかれさま！',
    mood_almost: '🌱 もう少しでハイスコア！',
    mood_keepgoing: '🌱 また来てね！',
    region_tokyo: '東京', region_nagoya: '名古屋', region_osaka: '大阪',
    region_kobe: '神戸', region_kyoto: '京都', region_shizuoka: '静岡', region_other: 'その他',
    regionAreaFmt: '{region}エリア',
    rankFirstFmt: '🥇 1位！ {name} さん、おめでとう！<br/><strong>{score}</strong> 点 / {region}エリア',
    rankYourFmt: '🎉 {name} さんは <strong>{n}位</strong>！<br/>{score} 点 / {region}エリア',
    rankNoplaceFmt: '🎉 {name} さん、お疲れさま！<br/>{score} 点を記録しました（{region}エリア）',
    rankNoRecords: 'まだ記録がありません',
    rankNoName: '名無し',
    rankYou: '(あなた)',

    // ===== E. alert / confirm =====
    errEnterStation: '駅名を入力してください',
    errGeneric: 'エラーが発生しました',
    confirmDeleteSpotFmt: '「{name}」を結果から削除します。\n同じ場所は今後の検索でも表示されません。よろしいですか？',
    errRouteFailed: 'ルートの生成に失敗しました',
    errStartFailedFmt: 'スタートに失敗しました: {err}',
    errEnterSessionId: 'セッションIDを入力してね。',
    errDriveDisabledResume: 'Drive 連携が無効です（GAS未設定）。再開機能は使えません。',
    errResumeFailed: '再開に失敗しました',
    errRankingDriveDisabled: 'Drive 連携が無効のため、ランキングに送信できません（GAS未設定）。',
    errRankingSendFailedFmt: 'ランキング送信に失敗しました: {err}',
    errReportDriveDisabled: 'Drive 連携が無効です（GAS未設定）。レポートのDrive保存は使えません。',
    errReportSaveFailedFmt: 'Drive 保存に失敗しました: {err}',
    errPdfFailedFmt: 'PDF生成に失敗しました: {err}',
    errRestoreRouteFmt: 'ルートの復元に失敗しました: {err}',
    notifyIssueThanks: '🐛 報告ありがとうございました！\n開発者がこの情報をもとに改善していきます。',
    spotDeleteTitle: 'この場所を結果から削除（次回以降も非表示）',
    spotDeleteLabel: '削除',
    photoCommentPlaceholder: 'この写真について気づいたこと・思ったこと（任意・1行でもOK）',
  },


  // ============ English ============
  en: {
    appTitle: 'Tanken Rally',
    headerSub: 'Explore your town from the station',

    step1Title: 'Pick a station to explore',
    step2Title: 'Choose places you want to visit',
    step3Title: 'Check your exploration map',
    step4Title: 'Take photos while exploring',
    step5Title: "Let's make your exploration note",

    disclaimer: '⚠️ <strong>We do not guarantee that every station has a good walkable route.</strong> Some stations may have few spots or take more than the 60-min target. If something feels off, try another station.',
    resumeSummary: '🔑 Open your previous exploration (password)',
    resumeHint: 'Paste the random string at the end of the Drive folder name created during your previous exploration (e.g. <code>lwgvzs6b9k2</code>) to load those photos and continue your note.',
    resumeInputPh: 'Paste the session ID...',
    btnResume: 'Open previous →',
    labelLine: 'Line',
    labelStation: 'Station',
    optLineEmpty: '── Pick a line ──',
    optStationEmpty: '── Pick a line first ──',
    optStationPick: '── Pick a station ──',
    btnSearchSelect: 'Search this station →',
    stationInputPh: 'e.g. Koenji, Kamakura, Asakusa ...',
    btnSearch: 'Search',
    filterSummary: '🔍 Advanced filter (optional)',
    filterHint: 'When you set a date and time, <strong>places that are not open during that window are removed</strong> from the results.',
    filterDate: '📅 Date',
    filterStart: '⏰ Start',
    filterEnd: '⏰ End',
    filterDisclaimer: '⚠️ Opening-hours information <strong>depends on Google Maps data</strong> and is not guaranteed to be accurate. Always check the official site or call the venue before visiting.',

    catFilterLabel: '🏷️ Filter by category:',
    btnBackStation: '← Change station',
    btnMakeRoute: 'Make route →',

    btnBackSpots: '← Change spots',
    btnDownloadPdf: '📄 Download map PDF',
    btnReverseRoute: '🔄 Reverse route',
    btnReverseRouteCalc: '🔄 Reversing…',
    btnStartExplore: 'Start exploring! →',

    photoUploadLabel: '📷 Take / pick a photo',
    photoCameraLabel: '📷 Take a photo',
    photoGalleryLabel: '🖼️ Pick from gallery',
    photoHint: '💡 After taking a photo, tap it to add a location tag (optional).',
    btnWizardPrev: '← Back',
    btnWizardNext: 'Next →',
    btnWizardSkip: 'Skip ↪',
    wizardProgressFmt: '{n} / {total}',
    wizardStartTitleFmt: '🚉 {name} Sta. (Start)',
    wizardGoalTitleFmt: '🏁 {name} Sta. (Goal)',
    wizardSpotTitleFmt: '📍 {label}. {name}',
    wizardHintStart: 'A photo to start! 🚉\nCapture the station front or anything that marks the beginning of your exploration.',
    wizardHintGoal: 'You made it back! 🎉\nTake one more photo to remember the end of your trip.',
    wizardHintSpotFmt: 'What interesting or surprising thing did you find here?\nSnap a photo of it!',
    wizardNoPhotosYet: 'No photos here yet. Try taking one!',
    wizardPhotosTakenFmt: '{n} photo(s) here',
    btnBackRoute: '← Back to map',
    btnFinishExplore: 'Done! → Note',

    reportIntro: '✏️ Write what you felt, found, and wondered about, in your own words. When exported as PDF, this becomes a B3 poster-size exploration note.',
    reportTitleH1: '🗺 Exploration Note',
    reportDate: '📅 Date',
    reportAuthor: '✏️ Author',
    reportAuthorPh: '(your name)',
    reportStation: '🚉 Station explored',
    reportSecOverview: '🌟 What you thought about the exploration',
    reportOverviewPh: 'Write your thoughts freely. What was the most fun? Anything that surprised you?',
    reportSecPhotos: '📷 Photos and memories',
    reportPhotosHint: 'Photos are arranged in visit order. Use STEP 4 to remove ones you do not want in the note. You can write a comment for each photo (optional).',
    reportSecAfterword: '✏️ Reflecting on writing this note',
    reportAfterwordPh: 'Did writing this note give you new ideas or things you want to look up?',
    btnBackPhotos: '← Back to photos',
    btnSaveReport: '💾 Save',
    btnSubmitScore: '🏆 Score',
    btnReportPdf: '📄 Export PDF',

    tagModalTitle: '📍 Add tag',
    tagModalDesc: 'Choose where this photo was taken (optional).',
    tagModalEmpty: '── No tag ──',
    btnCancel: 'Cancel',
    btnSave: 'Save',

    scoreModalTitle: '🏆 Exploration score',
    scoreNameLabel: '✏️ Name (nickname OK)',
    scoreNamePh: '(explorer name)',
    scoreDesc: 'Submit to the ranking to compare your score with others in the same region.',
    scoreHowtoSummary: '💡 How is the score decided?',
    scoreHowtoList: '<li>🚶 Walk a lot</li><li>📍 Visit many spots</li><li>📷 Take many photos</li><li>🏷️ Tag photos with the spot they belong to</li><li>📝 Write impressions and photo comments</li><li>⏱️ Finish within 60 minutes</li><li>🎯 Pace close to Google\'s estimated time</li>',
    scoreAdviceTitle: '🌱 Try these to push your score higher!',
    adviceMorePhotos: '📷 Take a few more photos ({n} so far — aim for 5+)',
    adviceTagPhotos: '🏷️ Tag your photos with their spot ({n}/{total} tagged)',
    adviceMoreComments: '📝 Try writing a comment on each photo ({n}/{total} commented)',
    adviceLongerOverview: '✏️ Write a bit more in the overview ({n} chars so far)',
    adviceUnder60: '⏱️ Finishing within 60 min gives a big bonus (this time: {min} min)',
    adviceMoreDistance: '🚶 Try walking a bit more (this time: {km} km)',
    advicePace: '🎯 Match Google\'s estimated pace (too fast or too slow loses points)',
    advicePerfect: '🌟 No weak spots — a great exploration!',
    btnClose: 'Close',
    btnSubmitRanking: 'Submit ranking →',
    rankingTitle: '🏆 <span id="ranking-station-name"></span> Ranking (top 10)',

    btnReportIssue: '🐛 Report an issue',
    issueTitle: '🐛 Report an issue',
    issueDesc: 'Tell us about problems or unexpected behavior.<br />The dev uses this info to keep improving the app.',
    issueT_stationLocation: 'Station location is wrong (jumped elsewhere)',
    issueT_spotsBad: 'Spots are inappropriate / too few',
    issueT_routeWeird: 'Route is strange (detour / impassable etc.)',
    issueT_streetviewEmpty: 'Street View images do not appear',
    issueT_pdfBroken: 'PDF does not export correctly',
    issueT_photoUpload: 'Photo upload / tagging is buggy',
    issueT_reportEdit: 'Trouble editing the exploration note',
    issueT_other: 'Other',
    issueDetailPh: 'Free-form details (optional)',
    btnSubmit: 'Submit',

    suffPhotos: ' photos',
    suffPhotosTagged: ' photos ({n} tagged)',
    suffPhotosIncluded: ' photos ({n} in note)',
    suffPoints: ' pts',
    distanceFromStation: 'from station',

    cityOther: 'Other',

    catLabel_historic: 'Historic Sites',
    catLabel_sweets:   'Sweets & Bakery',
    catLabel_nature:   'Parks & Nature',
    catLabel_toy:      'Toy Shops',
    catLabel_museum:   'Museums & Galleries',
    catLabel_science:  'Science Museums',
    catLabel_dagashi:  'Dagashi (Penny Candy)',
    catLabel_other:    'Other',

    badgeRequired: 'Pick ≥ 1',
    hintHistoricRequired: '🏯 Pick at least 1 historic site (pink border)',
    routePreviewCalcing: '⏳ Calculating...',
    routePreviewFmt: '~ {dist} / {min} min',
    routePreviewFail: '⚠️ Calculation failed',

    statusSearching: 'Searching...',
    statusMakingRoute: 'Making route...',
    statusRestoringRoute: 'Restoring route...',
    statusReady: 'Preparing...',
    statusGeneratingPdf: '📄 Generating PDF...',
    statusUploading: '📤 Uploading {i}/{n}...',
    statusUploaded: '✅ Added {n} photos',
    statusCheckingHours: 'Checking hours... ({i}/{n})',
    statusLoadingSpots: 'Searching spots...',
    statusSavingScore: 'Submitting...',
    statusSavingReport: 'Saving...',
    statusSavedReport: '✅ Saved',

    originStoryPrefix: '🗣️ From Explorer Doctor: ',

    // STEP 3 統計
    statsTotalDistance: 'Total distance',
    statsEstTime: 'Estimated time',
    statsSpotCount: 'Spots',
    suffSpots: '',
    approxMin: '~ {n} min',
    approxMinKm: '~ {min} min · {km}',
    approxMinDot: '~ {min} min',
    kidsTimeNote: '(for kids)',
    legAboutMin: '~ {n} min',
    routeWarningTpl: '⚠️ <strong>This route takes about {n} minutes.</strong> 60 min is the target. Try removing spots, or pick another station!',
    btnReduceSpots: 'Remove spots',
    btnDifferentStation: 'Pick another station',
    routeFlowStart: '🚉 <strong>{name} Sta.</strong> (Start)',
    routeFlowGoal:  '🚉 <strong>{name} Sta.</strong> (Goal)',

    pdfStationLabel: '{name} Exploration Map',
    pdfSecRoute: 'Exploration Route',
    pdfSecTurnpoints: 'Turn points & Landmarks',
    pdfTurnHint: 'Use the Street View photos as landmarks. The actual scenery may differ slightly.',
    pdfFlowStart: '🚉 <strong>{name} Sta.</strong> (Start)',
    pdfFlowGoal:  '🚉 <strong>{name} Sta.</strong> (Goal)',
    pdfStartCardTitle: '{name} Sta.',
    pdfStartCardSubtitle: 'Start — let your exploration begin here',
    pdfGoalCardTitle: '{name} Sta.',
    pdfGoalCardSubtitle: 'Goal — well done!',
    pdfNextDirection: '→ next: toward {name}',
    pdfFooter: 'Tanken Rally — {name} Exploration Map',
    pdfNoTurns: 'No turns. Go straight ahead.',
    pdfNoApiKey: '(Map image omitted: API key not set)',
    pdfSegmentHeaderFmt: '🚶 Leg {from} ({fromName}) → {to} ({toName})',
    pdfSegmentNoTurns: 'No turns — go straight',

    suffMin: ' min',
    suffKm: 'km',
    suffM: 'm',

    btnLoadingResume: 'Loading...',
    routePreviewCalcWait: '⏳ Calculating...',
    routePreviewResultFmt: '~ {dist} / {min} min',
    routePreviewFailMsg: '⚠️ Calculation failed',
    routeBtnTitleHistoricRequired: 'Pick at least 1 historic site',
    btnMakeRouteIdle: 'Make route →',
    btnStartExploreIdle: 'Start exploring! →',
    markerStationFmt: '{name} Sta.',

    driveCreatingFolder: '📂 Creating folder on Google Drive...',
    driveFolderSavedFmt: '📂 Saved to: <a href="{url}" target="_blank" style="color:#2e7d32">{name}</a><br/>🔑 Resume password: <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;font-family:monospace">{sessionId}</code> (note this down!)',
    driveErrorPhotosLocalFmt: '⚠️ Drive error (photos local only): {err}',
    driveSessionInfoNoGas: '📸 Take photos to record your exploration! (Local only — GAS not configured)',
    sessionResumedHeader: '📂 <strong>Session resumed:</strong>',
    sessionVisitedLabel: '📍 Places visited:',
    sessionStatsFmt: '{photos} photos / {spots} spots',
    sessionWarnSpotsFmt: '⚠️ Failed to restore spots ({reason}) — check GAS authorization or redeploy',
    sessionWarnNotFound: '⚠️ Session metadata not found in Sheet for the given session ID',

    photoTagAdd: '➕ Tap to add tag',
    photoTagInclude: 'Include in note',
    photoTagExclude: 'Exclude from note',
    photoTagless: '📍 No tag',
    reportStationFmt: '{name} Sta.',
    reportNoPhotos: '📷 No photos to put in the note. Take photos in STEP 4, or restore excluded ones.',
    reportPdfHeaderFmt: '📖 Tanken Note — {name}',
    pdfStationExitFmt: '🚪 Use {exit} when leaving the station',

    mood_master: '🌟 Exploration Master!',
    mood_great: '✨ Great explorer!',
    mood_good: '🎉 Well done!',
    mood_almost: '🌱 Almost a high score!',
    mood_keepgoing: '🌱 Come back again!',
    region_tokyo: 'Tokyo', region_nagoya: 'Nagoya', region_osaka: 'Osaka',
    region_kobe: 'Kobe', region_kyoto: 'Kyoto', region_shizuoka: 'Shizuoka', region_other: 'Other',
    regionAreaFmt: '{region} area',
    rankFirstFmt: '🥇 1st place! Congratulations, {name}!<br/><strong>{score}</strong> pts / {region} area',
    rankYourFmt: '🎉 {name}, you are <strong>#{n}</strong>!<br/>{score} pts / {region} area',
    rankNoplaceFmt: '🎉 Well done, {name}!<br/>You scored {score} pts ({region} area)',
    rankNoRecords: 'No records yet',
    rankNoName: 'Anonymous',
    rankYou: '(you)',

    errEnterStation: 'Please enter a station name',
    errGeneric: 'An error occurred',
    confirmDeleteSpotFmt: 'Remove "{name}" from results.\nThis place will not appear in future searches. Continue?',
    errRouteFailed: 'Failed to generate route',
    errStartFailedFmt: 'Failed to start: {err}',
    errEnterSessionId: 'Please enter a session ID.',
    errDriveDisabledResume: 'Drive integration disabled (GAS not configured). Resume is unavailable.',
    errResumeFailed: 'Failed to resume',
    errRankingDriveDisabled: 'Drive integration disabled. Cannot submit ranking (GAS not configured).',
    errRankingSendFailedFmt: 'Failed to submit ranking: {err}',
    errReportDriveDisabled: 'Drive integration disabled (GAS not configured). Report saving is unavailable.',
    errReportSaveFailedFmt: 'Failed to save to Drive: {err}',
    errPdfFailedFmt: 'PDF generation failed: {err}',
    errRestoreRouteFmt: 'Failed to restore route: {err}',
    notifyIssueThanks: '🐛 Thanks for reporting!\nThe dev will use this to keep improving the app.',
    spotDeleteTitle: 'Remove this place from the results (and hide next time)',
    spotDeleteLabel: 'Remove',
    photoCommentPlaceholder: 'What did you notice or feel about this photo? (optional, even one line is fine)',
  },


  // ============ Elementary（漢字＋ふりがな併記、G2以下は併記なし） ============
  elementary: {
    appTitle: 'たんけんラリー',
    headerSub: '駅から街（まち）を探検（たんけん）しよう',

    step1Title: '探検（たんけん）する駅をえらぼう',
    step2Title: '行きたい場所をえらぼう',
    step3Title: '探検（たんけん）マップを確認（かくにん）しよう',
    step4Title: '探検（たんけん）しながら写真（しゃしん）をとろう',
    step5Title: 'たんけんノートをつくろう',

    disclaimer: '⚠️ <strong>すべての駅で、ちゃんとしたコースが用意（ようい）されていることを約束（やくそく）していません。</strong> スポットが少なかったり、目安（めやす）の時間（やく60分）におさまらないこともあります。気（き）になったら別（べつ）の駅もためしてみてね。',
    resumeSummary: '🔑 前のたんけんを開（ひら）く（パスワード入力）',
    resumeHint: '前の探検（たんけん）のときに Drive につくられたフォルダ名（めい）のおわりにあるランダムな文字（もじ）（れい：<code>lwgvzs6b9k2</code>）を入力（にゅうりょく）すると、そのときの写真（しゃしん）を読（よ）みこんで「たんけんノート」のつづきを書（か）けます。',
    resumeInputPh: 'セッションIDをはりつけ...',
    btnResume: '前のをひらく →',
    labelLine: '路線（ろせん）',
    labelStation: '駅',
    optLineEmpty: '── 路線（ろせん）をえらんでね ──',
    optStationEmpty: '── 先（さき）に路線（ろせん）をえらんでね ──',
    optStationPick: '── 駅をえらんでね ──',
    btnSearchSelect: 'この駅でさがす →',
    stationInputPh: 'れい：高円寺（こうえんじ）、鎌倉（かまくら）、浅草（あさくさ） ...',
    btnSearch: 'さがす',
    filterSummary: '🔍 詳（くわ）しくしぼりこむ（任意（にんい））',
    filterHint: '探検（たんけん）する日（ひ）と時間（じかん）を入（い）れると、<strong>その時間に開（あ）いていないお店（みせ）やしせつは結果（けっか）から自動（じどう）でのぞきます</strong>。',
    filterDate: '📅 日にち',
    filterStart: '⏰ 開始（かいし）',
    filterEnd: '⏰ 終了（しゅうりょう）',
    filterDisclaimer: '⚠️ 営業（えいぎょう）時間（じかん）の情報（じょうほう）は <strong>Google マップの情報（じょうほう）にたよっています</strong>。正確（せいかく）であることを約束（やくそく）するものではありません。じっさいに行く前（まえ）に、お店（みせ）やしせつの公式（こうしき）サイトや電話（でんわ）で必（かなら）ずたしかめてください。',

    catFilterLabel: '🏷️ しゅるいでしぼりこむ:',
    btnBackStation: '← 駅をかえる',
    btnMakeRoute: 'ルートをつくる →',

    btnBackSpots: '← スポットをかえる',
    btnDownloadPdf: '📄 地図PDFをダウンロード',
    btnReverseRoute: '🔄 逆（ぎゃく）の順（じゅん）にする',
    btnReverseRouteCalc: '🔄 入（い）れかえ中…',
    btnStartExplore: '探検（たんけん）スタート！ →',

    photoUploadLabel: '📷 写真（しゃしん）をとる / えらぶ',
    photoCameraLabel: '📷 写真（しゃしん）をとる',
    photoGalleryLabel: '🖼️ 写真（しゃしん）をえらぶ',
    photoHint: '💡 撮影（さつえい）したあとに写真（しゃしん）をタップして、場所のタグ（任意（にんい））をつけられるよ。',
    btnWizardPrev: '← 前（まえ）へ',
    btnWizardNext: '次（つぎ）へ →',
    btnWizardSkip: 'スキップ ↪',
    wizardProgressFmt: '{n} / {total}',
    wizardStartTitleFmt: '🚉 {name}駅（えき）（スタート）',
    wizardGoalTitleFmt: '🏁 {name}駅（えき）（ゴール）',
    wizardSpotTitleFmt: '📍 {label}. {name}',
    wizardHintStart: '出発（しゅっぱつ）の写真（しゃしん）を一枚（いちまい）！🚉\n駅前（えきまえ）のようすや、これから探検（たんけん）する町のはじまりをのこしてね',
    wizardHintGoal: 'おかえり！🎉\n探検（たんけん）のさいごを記念（きねん）にいちまい撮（と）ろう',
    wizardHintSpotFmt: 'ここで気（き）になったもの、面白（おもしろ）いとおもったものを写真（しゃしん）にのこそう！\nどんな発見（はっけん）があったかな？',
    wizardNoPhotosYet: 'まだここでの写真（しゃしん）はないよ。とってみよう！',
    wizardPhotosTakenFmt: 'ここで {n} 枚（まい）とったよ',
    btnBackRoute: '← マップにもどる',
    btnFinishExplore: '探検（たんけん）おわり！ノートへ →',

    reportIntro: '✏️ 自分（じぶん）のことばで、感（かん）じたこと・見（み）つけたこと・気（き）になったことを書（か）いてみよう。PDFにして印刷（いんさつ）すると、B3ポスターサイズのたんけんノートになるよ。',
    reportTitleH1: '🗺 たんけんノート',
    reportDate: '📅 たんけん日',
    reportAuthor: '✏️ きろくした人',
    reportAuthorPh: '（あなたの名前）',
    reportStation: '🚉 たんけんした駅',
    reportSecOverview: '🌟 たんけんをおえて思（おも）ったこと',
    reportOverviewPh: 'ここに自由（じゆう）に感想（かんそう）を書（か）こう。一番（いちばん）たのしかったこと、びっくりしたこと、気（き）になったこと…',
    reportSecPhotos: '📷 とった写真（しゃしん）と思（おも）い出（で）',
    reportPhotosHint: '行（い）った順（じゅん）にならべてあるよ。ノートにのせたくない写真（しゃしん）は STEP 4 ではずしておこう。写真（しゃしん）ごとに思（おも）ったこと・気（き）づいたことを書（か）きこめます（任意（にんい））。',
    reportSecAfterword: '✏️ ノートを書（か）いてみて',
    reportAfterwordPh: 'ノートを書（か）いてみて、新（あたら）しく気（き）づいたことや、もっと知（し）りたくなったことがあれば書（か）こう',
    btnBackPhotos: '← 写真（しゃしん）にもどる',
    btnSaveReport: '💾 保存（ほぞん）',
    btnSubmitScore: '🏆 スコア',
    btnReportPdf: '📄 PDFにだす',

    tagModalTitle: '📍 タグをつける',
    tagModalDesc: 'この写真（しゃしん）をとった場所をえらんでね（任意（にんい））。',
    tagModalEmpty: '── タグなし ──',
    btnCancel: 'キャンセル',
    btnSave: '保存（ほぞん）',

    scoreModalTitle: '🏆 たんけんスコア',
    scoreNameLabel: '✏️ 名前（ニックネームでもOK）',
    scoreNamePh: '（探検（たんけん）する人の名前）',
    scoreDesc: 'ランキングに登録（とうろく）すると、同（おな）じ地域（ちいき）でたんけんした他（ほか）の人と点数（てんすう）をくらべられます。',
    scoreHowtoSummary: '💡 点数（てんすう）はどう決（き）まるの？',
    scoreHowtoList: '<li>🚶 たくさん歩（ある）く</li><li>📍 いろんなスポットに行（い）く</li><li>📷 写真（しゃしん）をたくさん撮（と）る</li><li>🏷️ 写真にスポットの名前（なまえ）タグを付（つ）ける</li><li>📝 感想（かんそう）や写真のコメントを書（か）く</li><li>⏱️ 1時間（じかん）いないにおわらせる</li><li>🎯 Googleの時間（じかん）に近（ちか）いペースで歩（ある）く</li>',
    scoreAdviceTitle: '🌱 こうするともっと点（てん）がのびるかも！',
    adviceMorePhotos: '📷 写真（しゃしん）をもう少（すこ）し撮（と）ってみよう（{n}まい → 5まい以上（いじょう）が目安（めやす））',
    adviceTagPhotos: '🏷️ 写真（しゃしん）にスポットのタグを付（つ）けると点（てん）がのびるよ（タグつき {n}/{total}まい）',
    adviceMoreComments: '📝 写真（しゃしん）の感想（かんそう）を書（か）いてみよう（コメント {n}まい／{total}まい）',
    adviceLongerOverview: '✏️ 「ぜんたいの感想（かんそう）」をもう少（すこ）し書（か）いてみよう（いま {n}文字（もじ））',
    adviceUnder60: '⏱️ 1時間（じかん）いないにおわらせると大（おお）きなボーナスがあるよ（今回（こんかい） {min}分（ふん））',
    adviceMoreDistance: '🚶 もっと歩（ある）いてみよう（今回（こんかい） {km}km）',
    advicePace: '🎯 Googleの時間（じかん）に近（ちか）いペース（はやすぎ・おそすぎは減点（げんてん））',
    advicePerfect: '🌟 弱点（じゃくてん）なし！すばらしいたんけんでした',
    btnClose: 'とじる',
    btnSubmitRanking: 'ランキングにおくる →',
    rankingTitle: '🏆 <span id="ranking-station-name"></span> ランキング (上位（じょうい）10名（めい）)',

    btnReportIssue: '🐛 不具合（ふぐあい）を報告（ほうこく）',
    issueTitle: '🐛 不具合（ふぐあい）を報告（ほうこく）',
    issueDesc: '困（こま）ったことや、おかしな動（うご）きがあったらおしえてください。<br />開発者（かいはつしゃ）がこの情報（じょうほう）をもとに、すこしずつよくしていきます。',
    issueT_stationLocation: '駅の場所がおかしい（別の場所にとんだ）',
    issueT_spotsBad: 'スポットの内容（ないよう）がふさわしくない・少（すく）なすぎる',
    issueT_routeWeird: 'ルートが変（へん）（遠回（とおまわ）り・通（とお）れない道（みち）など）',
    issueT_streetviewEmpty: 'ストリートビュー写真（しゃしん）が出（で）ない',
    issueT_pdfBroken: 'PDFが正（ただ）しく出（で）ない',
    issueT_photoUpload: '写真（しゃしん）のアップロード・タグがおかしい',
    issueT_reportEdit: 'たんけんノートの編集（へんしゅう）でこまった',
    issueT_other: 'そのほか',
    issueDetailPh: 'くわしく書（か）きたいときはこちらに自由（じゆう）に書（か）いてね（任意（にんい））',
    btnSubmit: 'おくる',

    suffPhotos: 'まい',
    suffPhotosTagged: 'まい（うち{n}まいにタグあり）',
    suffPhotosIncluded: 'まい（ノートにのせる: {n}まい）',
    suffPoints: '点（てん）',
    distanceFromStation: '駅から',

    cityOther: 'そのほか',

    catLabel_historic: '史跡（しせき）・文化財（ぶんかざい）',
    catLabel_sweets:   'スイーツ・菓子店（かしてん）',
    catLabel_nature:   '公園・自然（しぜん）',
    catLabel_toy:      '玩具（がんぐ）・おもちゃ',
    catLabel_museum:   '美術館（びじゅつかん）・博物館（はくぶつかん）',
    catLabel_science:  '科学館（かがくかん）・自然史（しぜんし）',
    catLabel_dagashi:  '駄菓子屋（だがしや）',
    catLabel_other:    'そのほか',

    badgeRequired: 'ひとつは えらぼう',
    hintHistoricRequired: '🏯 史跡（しせき）（ピンクのわく）から1つえらんでね',
    routePreviewCalcing: '⏳ 計算（けいさん）中…',
    routePreviewFmt: 'やく {dist} / {min}分',
    routePreviewFail: '⚠️ 計算（けいさん）できなかった',

    statusSearching: 'さがしています…',
    statusMakingRoute: 'ルート作成（さくせい）中…',
    statusRestoringRoute: 'ルート復元（ふくげん）中…',
    statusReady: 'じゅんび中…',
    statusGeneratingPdf: '📄 PDFを作（つく）っています…',
    statusUploading: '📤 アップロード中… {i}/{n}',
    statusUploaded: '✅ {n}まいついかしました',
    statusCheckingHours: '営業（えいぎょう）時間（じかん）を確認（かくにん）中… ({i}/{n})',
    statusLoadingSpots: 'スポットを検索（けんさく）中…',
    statusSavingScore: '送信（そうしん）中…',
    statusSavingReport: '保存（ほぞん）中…',
    statusSavedReport: '✅ 保存（ほぞん）しました',

    originStoryPrefix: '🗣️ たんけん博士（はかせ）より：',

    statsTotalDistance: '総距離（そうきょり）',
    statsEstTime: '推定時間（すいていじかん）',
    statsSpotCount: 'スポット数（すう）',
    suffSpots: '件（けん）',
    approxMin: '約（やく）{n}分',
    approxMinKm: '約（やく） {min}分・{km}',
    approxMinDot: '約（やく） {min}分',
    kidsTimeNote: '（子（こ）どもの歩（ある）く速（はや）さで計算（けいさん））',
    legAboutMin: '約（やく）{n}分',
    routeWarningTpl: '⚠️ <strong>このコースは約（やく）{n}分かかります。</strong> 1時間（じかん）以内（いない）が目安（めやす）だよ。スポットを減（へ）らすか、別（べつ）の駅でためしてみよう！',
    btnReduceSpots: 'スポットを減（へ）らす',
    btnDifferentStation: '別（べつ）の駅にする',
    routeFlowStart: '🚉 <strong>{name}駅</strong>（スタート）',
    routeFlowGoal:  '🚉 <strong>{name}駅</strong>（ゴール）',

    pdfStationLabel: '{name} 探検（たんけん）マップ',
    pdfSecRoute: 'たんけんルート',
    pdfSecTurnpoints: '曲（ま）がるところ・目印（めじるし）',
    pdfTurnHint: 'ストリートビューの写真（しゃしん）を目印（めじるし）にしてね。実際（じっさい）の景色（けしき）とすこし違（ちが）うこともあります。',
    pdfFlowStart: '🚉 <strong>{name}駅</strong>（スタート）',
    pdfFlowGoal:  '🚉 <strong>{name}駅</strong>（ゴール）',
    pdfStartCardTitle: '{name}駅',
    pdfStartCardSubtitle: 'スタート — ここから探検（たんけん）をはじめよう',
    pdfGoalCardTitle: '{name}駅',
    pdfGoalCardSubtitle: 'ゴール — おつかれさま！',
    pdfNextDirection: '→ 次（つぎ）は{name}方面（ほうめん）',
    pdfSegmentHeaderFmt: '🚶 区間（くかん） {from}（{fromName}） → {to}（{toName}）',
    pdfSegmentNoTurns: '曲（ま）がり角（かど）なし — まっすぐ進（すす）んでね',
    pdfFooter: 'たんけんラリー — {name} 探検（たんけん）マップ',
    pdfNoTurns: '曲（ま）がる場所はありません。まっすぐ進（すす）んでね。',
    pdfNoApiKey: '（地図画像（がぞう）はAPIキー未設定（みせってい）のため省略（しょうりゃく））',

    suffMin: '分',
    suffKm: 'km',
    suffM: 'm',

    btnLoadingResume: '読（よ）み込（こ）み中…',
    routePreviewCalcWait: '⏳ 計算（けいさん）中…',
    routePreviewResultFmt: '約（やく） {dist} / {min}分',
    routePreviewFailMsg: '⚠️ 計算（けいさん）できなかった',
    routeBtnTitleHistoricRequired: '史跡（しせき）を1つ以上（いじょう）えらんでね',
    btnMakeRouteIdle: 'ルートをつくる →',
    btnStartExploreIdle: '探検（たんけん）スタート！ →',
    markerStationFmt: '{name}駅',

    driveCreatingFolder: '📂 Google Driveにフォルダを作成（さくせい）中…',
    driveFolderSavedFmt: '📂 保存先（ほぞんさき）: <a href="{url}" target="_blank" style="color:#2e7d32">{name}</a><br/>🔑 再開（さいかい）パスワード: <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;font-family:monospace">{sessionId}</code>（メモしておこう）',
    driveErrorPhotosLocalFmt: '⚠️ Drive接続（せつぞく）エラー（写真（しゃしん）はローカルのみ）: {err}',
    driveSessionInfoNoGas: '📸 写真（しゃしん）をとってたんけんの記録（きろく）をのこそう！（GAS未設定（みせってい）のためローカルのみ）',
    sessionResumedHeader: '📂 <strong>セッション再開（さいかい）:</strong>',
    sessionVisitedLabel: '📍 行（い）った場所:',
    sessionStatsFmt: '写真（しゃしん）{photos} 枚 / スポット {spots} 件（けん）',
    sessionWarnSpotsFmt: '⚠️ スポット情報（じょうほう）の復元（ふくげん）に失敗（しっぱい）（{reason}）— GASの権限（けんげん）承認（しょうにん）かデプロイ更新（こうしん）を確認（かくにん）してください',
    sessionWarnNotFound: '⚠️ Sheetに該当（がいとう）sessionIdのセッション情報（じょうほう）が見つかりませんでした',

    photoTagAdd: '➕ タップしてタグつけ',
    photoTagInclude: 'ノートにのせる',
    photoTagExclude: 'ノートからはずす',
    photoTagless: '📍 タグなし',
    reportStationFmt: '{name}駅',
    reportNoPhotos: '📷 ノートにのせる写真（しゃしん）がありません。STEP 4 で写真（しゃしん）をとるか、はずした写真（しゃしん）をもどそう。',
    reportPdfHeaderFmt: '📖 たんけんノート — {name}',
    pdfStationExitFmt: '🚪 駅（えき）から出（で）るときは {exit} を使（つか）ってね',

    mood_master: '🌟 たんけんマスター！',
    mood_great: '✨ たんけん上手（じょうず）！',
    mood_good: '🎉 おつかれさま！',
    mood_almost: '🌱 もうすこしでハイスコア！',
    mood_keepgoing: '🌱 また来（き）てね！',
    region_tokyo: '東京（とうきょう）', region_nagoya: '名古屋（なごや）', region_osaka: '大阪（おおさか）',
    region_kobe: '神戸（こうべ）', region_kyoto: '京都（きょうと）', region_shizuoka: '静岡（しずおか）', region_other: 'そのほか',
    regionAreaFmt: '{region}エリア',
    rankFirstFmt: '🥇 1位！ {name} さん、おめでとう！<br/><strong>{score}</strong> 点（てん） / {region}エリア',
    rankYourFmt: '🎉 {name} さんは <strong>{n}位</strong>！<br/>{score} 点（てん） / {region}エリア',
    rankNoplaceFmt: '🎉 {name} さん、おつかれさま！<br/>{score} 点（てん）を記録（きろく）しました（{region}エリア）',
    rankNoRecords: 'まだ記録（きろく）がありません',
    rankNoName: 'なまえなし',
    rankYou: '（あなた）',

    errEnterStation: '駅名（えきめい）を入力（にゅうりょく）してください',
    errGeneric: 'エラーが起（お）きました',
    confirmDeleteSpotFmt: '「{name}」を結果（けっか）から削除（さくじょ）します。\n同（おな）じ場所はこれからの検索（けんさく）でも表示（ひょうじ）されません。よろしいですか？',
    errRouteFailed: 'ルートの作成（さくせい）に失敗（しっぱい）しました',
    errStartFailedFmt: 'スタートに失敗（しっぱい）しました: {err}',
    errEnterSessionId: 'セッションIDを入力（にゅうりょく）してね。',
    errDriveDisabledResume: 'Drive連携（れんけい）が無効（むこう）です（GAS未設定（みせってい））。再開（さいかい）機能（きのう）は使（つか）えません。',
    errResumeFailed: '再開（さいかい）に失敗（しっぱい）しました',
    errRankingDriveDisabled: 'Drive連携（れんけい）が無効（むこう）のため、ランキングに送信（そうしん）できません（GAS未設定（みせってい））。',
    errRankingSendFailedFmt: 'ランキング送信（そうしん）に失敗（しっぱい）しました: {err}',
    errReportDriveDisabled: 'Drive連携（れんけい）が無効（むこう）です（GAS未設定（みせってい））。レポートのDrive保存（ほぞん）は使（つか）えません。',
    errReportSaveFailedFmt: 'Drive保存（ほぞん）に失敗（しっぱい）しました: {err}',
    errPdfFailedFmt: 'PDF作成（さくせい）に失敗（しっぱい）しました: {err}',
    errRestoreRouteFmt: 'ルートの復元（ふくげん）に失敗（しっぱい）しました: {err}',
    notifyIssueThanks: '🐛 報告（ほうこく）ありがとうございました！\n開発者（かいはつしゃ）がこの情報（じょうほう）をもとに、すこしずつよくしていきます。',
    spotDeleteTitle: 'この場所（ばしょ）を結果（けっか）から消（け）す（次（つぎ）からも非表示（ひひょうじ））',
    spotDeleteLabel: '消（け）す',
    photoCommentPlaceholder: 'この写真（しゃしん）について気（き）づいたこと・思（おも）ったこと（任意（にんい）・1行（ぎょう）でもOK）',
  },
};

// クエリ・ハッシュから言語を判定
export function getLangFromUrl() {
  const params = new URLSearchParams(location.search);
  let raw = params.get('lang');
  if (!raw && location.hash) raw = location.hash.replace(/^#/, '');
  const lower = (raw || '').trim().toLowerCase();
  if (lower === 'en' || lower === 'english') return 'en';
  if (lower === 'elementary' || lower === 'kids' || lower === 'easy') return 'elementary';
  return 'ja';
}

export const LANG = getLangFromUrl();

// 翻訳取得
export function t(key, fallback) {
  const dict = TRANSLATIONS[LANG] || TRANSLATIONS.ja;
  if (dict[key] !== undefined) return dict[key];
  if (TRANSLATIONS.ja[key] !== undefined) return TRANSLATIONS.ja[key];
  return fallback !== undefined ? fallback : key;
}

// data-i18n / data-i18n-html / data-i18n-placeholder / data-i18n-title を一括適用
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const text = t(el.dataset.i18n);
    if (typeof text === 'string') el.textContent = text;
  });
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    const text = t(el.dataset.i18nHtml);
    if (typeof text === 'string') el.innerHTML = text;
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const text = t(el.dataset.i18nPlaceholder);
    if (typeof text === 'string') el.setAttribute('placeholder', text);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const text = t(el.dataset.i18nTitle);
    if (typeof text === 'string') el.setAttribute('title', text);
  });
  // <html lang="..."> も切り替え（'elementary' は CSS では ja 扱い）
  document.documentElement.lang = LANG === 'elementary' ? 'ja' : LANG;
}

// Elementary（ひらがな）モードでは Google が返す移動時間を「子供の歩行ペース」に合わせて
// 約1.5倍に補正して表示する。スコア計算（calculateScore）では補正前の値を使うこと。
export const KIDS_TIME_FACTOR = 1.5;
export function adjustMinForKids(min) {
  const n = Number(min);
  if (!isFinite(n) || n <= 0) return min;
  return LANG === 'elementary' ? Math.max(1, Math.round(n * KIDS_TIME_FACTOR)) : min;
}

// Google Maps / Places / Geocoding / Directions / Static Maps / Street View 全 API
// および OpenAI で使う言語コード。
//   en          → 'en' （結果も全部英語：Tokyo Station, Senso-ji Temple ...）
//   ja          → 'ja'
//   elementary  → 'ja' （振り仮名は UI 側で表記。Google には日本語で返してもらう）
//
// 補足: 過去に `ja-Hrkt` を試したが、Google Places/Geocoding は
// テキスト結果（施設名・住所）には反映してくれなかった（地図タイル上の
// 街路名のみカタカナ化）。よって `ja` に戻している。
export function apiLang() {
  return LANG === 'en' ? 'en' : 'ja';
}

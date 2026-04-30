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
    btnStartExplore: '探検スタート！ →',

    // STEP 4
    photoUploadLabel: '📷 写真を撮る / 選ぶ',
    photoHint: '💡 撮影あとに写真をタップして、場所のタグ（任意）を付けられるよ。',
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
    btnStartExplore: 'Start exploring! →',

    photoUploadLabel: '📷 Take / pick a photo',
    photoHint: '💡 After taking a photo, tap it to add a location tag (optional).',
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
    btnStartExplore: '探検（たんけん）スタート！ →',

    photoUploadLabel: '📷 写真（しゃしん）をとる / えらぶ',
    photoHint: '💡 撮影（さつえい）したあとに写真（しゃしん）をタップして、場所のタグ（任意（にんい））をつけられるよ。',
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

// Google Maps / Places / Geocoding / Directions / Static Maps / Street View 全 API
// および OpenAI で使う言語コード。
//   en          → 'en' （結果も全部英語：Tokyo Station, Senso-ji Temple ...）
//   ja          → 'ja'
//   elementary  → 'ja' （振り仮名は UI 側で表記。Google には日本語で返してもらう）
export function apiLang() {
  return LANG === 'en' ? 'en' : 'ja';
}

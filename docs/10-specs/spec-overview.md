# [[たんけんラリー]]（テクタン） システム仕様書 v1.2

> 対象実装: APP_VERSION `1.2.0`（src/version.js） / 改訂日: 2026-07-30
> 本書は **実装準拠**。過去の企画段階仕様（v0.2, 2026-04-26）はサーバ集約型の別構成を想定していたため、現行コードに合わせて全面改訂した。旧仕様との主な乖離は §15 に記す。

子どもが駅を起点に周辺スポットを探検し、写真・音声メモで記録し、[[AR]]で土地の[[キャラクター]]を捕獲、探検の実績に応じて[[AIキャラクター自動生成]]でオリジナルキャラを1体もらえる Web アプリ。成果は「たんけんノート（PDF）」と「[[図鑑]]」に残る。

---

## 1. システム構成（実際）

ビルドを持たない純バニラ [[JavaScript]] ESモジュール。フロントは [[GitHub Pages]] から静的配信し、外部APIとデータ永続化はすべて [[Google Apps Script]]（[[GAS]]）プロキシ経由で行う。専用のバックエンドサーバ・DBは持たない。

```
[プレーヤー端末（スマホ/PC ブラウザ）]
   │  ES Modules（src/main.js を <script type="module"> で読込）
   │  状態 = src/state.js（単一 state オブジェクト）＋ localStorage
   │
   ├─ ブラウザ直：Google Maps JS / Geocoding / Places / Directions / Static Maps / Street View
   │              （GOOGLE_MAPS_API_KEY・HTTPリファラ制限）
   ├─ ブラウザ直：Wikipedia MediaWiki API（史実フォールバック・CORS可）
   │
   └─ HTTPS POST（action名）→ [GAS: gas/Code.gs]  ← APIキーはScript Property・非露出
          ├─ Drive：写真/生成キャラ画像の保存・取得
          ├─ Sheets：セッション/ランキング/図鑑/生成キャラ/ユーザー/キャッシュ
          ├─ OpenAI（gpt-4o-mini / whisper-1）：文章生成・文字起こし
          └─ Gemini（gemini-3-pro-image=NanoBanana Pro / gemini-2.5-flash+検索）：キャラ画像生成・史実グラウンディング
```

設定は `config.js`（`GAS_URL` / `GAS_SECRET` / `GOOGLE_MAPS_API_KEY`）。`GAS_URL` 未設定時は `drive=null` となり、サーバ依存機能（写真アップロード・ランキング・生成キャラのサーバ保存・履歴の端末横断）が自動的にオフになりローカル動作へフォールバックする。キャッシュバスターの `?v=` はデプロイ時に GitHub Actions がコミットSHAへ自動置換する（手動更新不要）。

---

## 2. 画面と動線

`showStep()`（main.js）が切り替えるのは6つの `.step` セクションのみ。それ以外はすべてモーダル（オーバーレイ）。

| 種別 | ID | 役割 |
|---|---|---|
| step | step-home | ホーム（3+1入口） |
| step | step-station | 駅を決める |
| step | step-spots | 行く場所を選ぶ |
| step | step-route | ルート確認 |
| step | step-photos | 撮影ウィザード（駅→各スポット→駅→写真管理） |
| step | step-report | たんけんノート |
| modal | login-gate / welcome-modal | 入場（ログイン）と歓迎演出 |
| modal | resume-ask-modal | 中断セッションの再開確認（つづき／新規／他の探検） |
| modal | chargen-pick-modal / chargen-modal | キャラ自動生成（すき選択→3体シルエット→登場→命名） |
| modal | score-modal | スコア発表 |
| modal | grow-modal | 「育てる」ティーザー（**未実装**の予告） |
| modal | history-modal / zukan-modal | 探検履歴 / 図鑑 |
| modal | where-modal / tag-modal / voice-memo-modal | いまどこ？ / 写真タグ付け / 音声メモ |
| modal | ar-captured-modal | ARキャラ捕獲成功 |
| modal | admin-modal / test-mode-modal | 管理パネル / テストモード（admin専用） |
| modal | report-issue-modal | 不具合報告 |

**動線**：起動 → ログインゲート（未ログインは入れない）→ 新規なら[[スターターキャラ]]付与＋歓迎演出 → ホーム。ホームの「たんけんスタート」で中断セッションがあれば再開確認、無ければ 駅→スポット→ルート→撮影→ノート と進む。撮影ウィザードは「スタート駅 → 各スポット → ゴール駅 → 写真一覧管理」の各ステージ制。ノート画面でスコア発表とキャラ自動生成が起こる。

---

## 3. 機能一覧（実装済み）

### 3-1. 駅・スポット検索
- 都市タブ（東京/名古屋/大阪/神戸/京都/その他）＋路線チップ＋駅チップ、または自由入力。初期選択は名古屋・桜通線。
- Geocoding で駅→座標、Places の nearbySearch（キーワード別14種）＋textSearch でスポット取得。検索半径 800m。
- 塾・予備校等の不適切スポットは `blocked.js` で自動除外（学習型）。
- 地名の由来を OpenAI（GAS経由）で生成表示。

### 3-2. スポット選択・ルート
- カテゴリ（史跡/スイーツ/公園自然/玩具/美術博物/科学/駄菓子/その他）でフィルタしチェック選択。
- 選択が変わるたびルート試算をプレビュー。最近傍法で順序最適化し Directions で徒歩ルート描画。逆順ボタンあり。

### 3-3. 撮影ウィザード・写真管理
- ステージごとに Static Map / Street View の静止画と現在地オーバーレイを提示。
- 「写真を撮る」で通常カメラ or AR捕獲へ。EXIF（撮影時刻・GPS）を exifr で抽出。写真は Drive にアップロード（サムネイル/フル解像度を都度取得）。
- 写真ごとに「いまどこ？」位置タグ・カテゴリタグ・音声メモを付与可能。

### 3-4. たんけんノート（レポート）・PDF
- 写真・コメント・概要・あとがきを編集。音声メモは OpenAI で整形（元メモを保持しやり直し可）。
- jsPDF でA4ノートPDFを生成（1ページ目4枚・以降6枚）。

### 3-5. スコア・ランキング
- 探検実績からスコアを算出し発表（§10）。ランキングは地域・駅単位で Sheets に送信/取得（日本語版のみ）。

### 3-6. ARキャラ捕獲
- カメラ＋GPS＋コンパスで、半径50m・方位±30°以内に土地キャラが出現。合成写真で捕獲し図鑑に記録。
- スタート駅キャラ（lookie/colorey）、ゴール駅レア出現（確率0.25）等の演出制御あり。手描きキャラは6段バリアント（normal/mini/jumbo/shiny/gold/rainbow）を重み抽選。

### 3-7. 図鑑・履歴
- 図鑑：捕獲キャラ＋自動生成キャラを一覧・詳細表示（画像は遅延ロード）。
- 履歴：過去セッションを一覧、再開・削除。

### 3-8. AIキャラクター自動生成
- 探検実績が条件を満たすと、オリジナルキャラを3体生成し1体選んで図鑑に登録（§4）。

---

## 4. AIキャラクター自動生成システム

キャラは **モチーフ × フォルム × フィーチャー** の三層で組み立てる（src/data/archetypes.js・vocab.js・utils/chargen.js）。

- **フォルム** `AXIS_BODY`（14種：round/quadruped/upright/squat/bird/bigwing/critter/eared/tailed/dragon/serpent/aqua/bug/multilimb）
- **フィーチャー** `AXIS_FEATURE`（14種：耳・尻尾・角・翼・ヒレ等、相性フォルムを持つ）
- **モチーフ→原型** `MOTIF_ARCHETYPE`：`archetypeForMotif(motif)` がモチーフから `[フォルム, 特徴]` を導出。非動物モチーフは中立フォルムへ逃がし特徴なし。装飾はフォルムから導出（`decorationForBody`）。
- **語彙DB** vocab.js：6論点（type/motif/texture/expression/decoration/atmosphere）を「被りやすい(app_auto)」と「個性(user_selectable)」に分けて保持。

### 4-1. レア度（生成キャラ）
`RARITY_TIERS`＝ common(0km/☆1) / rare(1.5km/☆2) / epic(3km/☆3) / legend(5km/☆4)。`rarityForDistance(km)` で距離→ティア、`bumpRarity()` で1段引き上げ（legend上限）。
※これは生成キャラのレア度。手描きARキャラの6段バリアントとは**別系統**。

### 4-2. 生成ゲート（`evaluateEligibility`）
実行スコア `execScore ≥ 250`、写真付きスポット `≥ 2`、距離 `≥ 0.3km`、かつ「GPS2点以上 または 写真スポット3以上」を全て満たすと生成可能。距離に応じたレア度を返す。

### 4-3. 3体保証と生成
`startGeneration()` が語彙・フォルム・特徴を変えた3体を並行生成（プロンプト→GAS `generateCharacters`（NanoBanana Pro）→背景透過化 `cutoutBackground` で検証）。最大3ラウンドで欠けたスロットのみ再生成し、それでも足りなければ既存絵の色替えモックで必ず3体に埋める。命名候補は駅名カナ×モチーフ×レア度語尾で4件提示。

### 4-4. レア度の上書き優先順位（main.js `maybeStartCharGen`）
1. [[早期特典]]（`EARLY_BIRD_ACTIVE`）→ **epic 確定**（ゲート免除・最優先）
2. 「いまどこ？」未使用 → `bumpRarity` で1段UP（自力ボーナス）
3. それ以外 → 距離ベース

---

## 5. データモデル（実際）

サーバ側DBは持たず、**localStorage ＋ Google Sheets/Drive** で永続化する。

### 5-1. 実行時状態 `state`（src/state.js）
駅・座標・都市、スポット/選択/表示カテゴリ、ルート順・Directions・統計・地図、セッションID・Driveフォルダ・アップロード写真・選択写真、AR捕獲配列（`{characterId,variantId,spotName,photoFileId,capturedAt,lat,lng}`）、レポート（date/author/overview/afterword/photoComments/photoCommentsRaw/excludedPhotoIds）。

### 5-2. localStorage キー
| キー | 内容 |
|---|---|
| `tanken_collection_v1__<explorerId>` | 図鑑（`{ [key]: {count, firstAt, lastAt} }`） |
| `tanken_generated_v1__<explorerId>` | 自動生成キャラ |
| `tanken_explorer_id` / `tanken_auth` / `tanken_local_users` | 端末ID / ログイン情報 / ローカルユーザー |
| `tekutan_active_session_<id>` | 中断中セッション |
| `tekutan_earlybird_used_<explorerId>` | 早期特典の使用済みフラグ（1アカウント1回） |
| `tanken_admin_override` / `tanken-rally:blocked-spots:v1` / `tanken-rally:issue-reports:v1` | 管理上書き / 除外スポット学習 / 不具合ローカル控え |

`explorerId` は、ログイン時は userId、未ログイン時は端末ID。ログイン初回に無記名図鑑を引き継ぐ。

### 5-3. Sheets タブ（GAS）
`セッション`（日時/sessionId/駅名/プレーヤー名/フォルダURL/スポット数/詳細JSON/距離/推定時間/userId/写真枚数）、`ランキング`（地域/駅/名前/スコア/訪問数/距離/写真数/文字数）、`captures`（explorerId別 図鑑集計）、`generated`（生成キャラ台帳）、`users`（なまえ+PINハッシュ）、`ground_guard`（グラウンディング月次呼数上限）、スポット検索キャッシュ、不具合報告。

---

## 6. GAS API（action 一覧）

`gas/Code.gs` の `doPost` が action 名でディスパッチ。フロントは `src/utils/drive.js` の `DriveClient` から呼ぶ（自動リトライあり）。

セッション：`createSession / resumeSession / saveSession / updateSessionPhotoCount / deleteSession / loadSession`
レポート：`saveReportData / loadReportData`
写真：`uploadPhoto / listPhotos / getPhotoData / getPhotoThumbnail / updatePhotoTag`
不具合：`saveIssueReport / submitIssueReport`
スコア：`saveRanking / getRanking`
図鑑：`saveCaptures / getCaptures`
ユーザー：`registerUser / loginUser / getUserHistory`
キャッシュ：`getSpotsCache / saveSpotsCache`
生成キャラ：`generateCharacters / saveGeneratedCharacter / getGeneratedCharacters / getGeneratedImage`
AI：`geminiGroundSpot / openaiChat / openaiTranscribe`

---

## 7. 外部API

| API | 用途 | 経路 |
|---|---|---|
| Google Maps JS（places, geometry） | 地図描画・Places | ブラウザ直 |
| Geocoding | 駅名→座標 | ブラウザ直 |
| Places（nearby/text/details/opening_hours/editorial） | スポット検索・営業時間 | ブラウザ直＋GASキャッシュ |
| Directions | ルート | ブラウザ直 |
| Static Maps / Street View | ステージ静止画・史跡ヒント | 画像URL直 |
| OpenAI gpt-4o-mini | 地名由来・物語・キャラ説明融合・メモ整形 | GAS `openaiChat` |
| OpenAI whisper-1 | 音声メモ文字起こし | GAS `openaiTranscribe` |
| Gemini gemini-3-pro-image（NanoBanana Pro） | キャラ3体生成 | GAS `generateCharacters`（月額上限ロジック） |
| Gemini gemini-2.5-flash＋Google検索 | スポット史実の出典つき取得 | GAS `geminiGroundSpot`（月4500回上限） |
| Wikipedia MediaWiki | 史実フォールバック | ブラウザ直（CORS可） |

OpenAI/Gemini のキーは GAS の Script Property に置きブラウザへ露出しない。Maps系のみブラウザ直（HTTPリファラ制限で保護）。

---

## 8. スコアリング（実際の式）

`calculateScore()`（main.js）は加点式の生スコアを内部計算し、**計画点＋実行点**の2系統で表示する。旧仕様の「訪問30/距離10/写真10/写真質20/レポート30」とは一致しない（AIによる写真・レポートの質採点は現状**未使用**）。

内部内訳：
- visit＝訪問スポット数×100、distance＝round(距離km×30)
- photo＝写真枚数×10、tagged＝タグ付き写真×5
- cmtNum＝写真コメント数×20、cmtChar＝min(総コメント文字数, 500)
- within60＝総経過時間≤60分で200、pace＝Google推定移動時間との比で200/100/50
- capture＝捕獲数×40＋ユニーク種×40＋レア捕獲150

表示：
- **計画点** = visit + distance を0〜100正規化（ルート密度＝スポット数×滞在10分＋移動で満点ハードルを動的化）
- **実行点** = photo+tagged+cmtNum+cmtChar+within60+pace+capture（生）
- **ランキング/表示スコア** = 計画点(0-100) ＋ 実行点

「いまどこ？」の使用は減点しない。代わりに未使用だと生成キャラのレア度が1段上がる。`buildScoreAdvice()` が弱点を1つ提示。滞在/移動時間はEXIF撮影時刻を優先して算出。

---

## 9. 認証（簡易）

起動時にログインゲートがあり、未ログインでは利用できない（`isLoggedIn()`）。ただし本格認証ではなく「図鑑を守るひみつのことば」程度の位置づけ。方式は **なまえ ＋ あいことば（6字以上）**で、PINは SHA-256 ハッシュ化して送信（平文非送信）。サーバは GAS `registerUser/loginUser`（`users` タブ・試行回数制限）。`GAS_URL` 未設定や旧GAS時は localStorage `tanken_local_users` にフォールバック。ログイン統合フロー（`onLoginSubmit`）は login→失敗時 register を自動試行し、新規なら[[スターターキャラ]]付与＋歓迎演出。名前 `hisatakaadmin` は admin（生成ゲート免除・図鑑全開放等のテスト用、非adminには無効）。

---

## 10. 多言語・機能フラグ

`src/utils/i18n.js` に **ja / en / elementary（小学生向け・ふりがな）** の3辞書。`?lang=` で切替、既定 ja。`applyI18n()` が `data-i18n` を一括置換。elementary は「漢字（かな）」表記を `<ruby>` ルビへ自動変換（MutationObserver で動的テキストも網羅）し、移動時間を×1.5表示。

動作差分（数値・ON/OFF）は `src/config-features.js` に集約：
- 日本語/elementary：スコア・ランキング・撮影ウィザード・AR すべてON、検索半径800m。
- **英語版：スコア・ランキング・スコアアドバイスはOFF**（撮影・ARはON）。

設計方針＝文字列差分は i18n、動作差分は config-features、見た目差分は `body.lang-XX`＋CSS。

---

## 11. ローンチ・キャンペーン（`src/config-campaign.js`）

- `STARTER_CHARACTER_ID='lookie'`：新規登録で図鑑にノーマル付与（冪等）。
- `EARLY_BIRD_ACTIVE=true` / `EARLY_BIRD_RARITY_ID='epic'`：100アカウント到達までの特典。初回探検完了で生成ゲートを免除し、必ずエピックを1回もらえる。到達時に手動で false 化して再デプロイ。

---

## 12. 非機能・プライバシー

- 対応：iOS Safari / Android Chrome。PDFはダウンロード後オフライン閲覧可。
- APIキー保護：OpenAI/Gemini は GAS プロキシで非露出。Maps はHTTPリファラ制限。
- 位置情報・GPSはシステム内部利用のみ（ランキング公開値は地域・駅・名前・スコア等に限定）。
- 不適切スポット除外（blocked.js）。不具合報告は report-issue から GAS 経由で Drive/Sheet に記録。
- 音声・写真は Drive に保存。セッションはGAS側の自動削除トリガー（既定7日）で古いものをゴミ箱へ。

---

## 13. 主要モジュール対応表

| 領域 | フロント | GAS action |
|---|---|---|
| 地図・検索 | utils/maps.js | getSpotsCache/saveSpotsCache |
| AI文章 | utils/ai.js | openaiChat/openaiTranscribe |
| キャラ生成 | utils/chargen.js, data/vocab.js, data/archetypes.js | generateCharacters/saveGeneratedCharacter/geminiGroundSpot |
| 手描きAR | utils/characters.js, utils/ar.js | saveCaptures/getCaptures, uploadPhoto |
| 図鑑 | utils/collection.js | getCaptures/saveCaptures |
| PDF | utils/pdf.js | getPhotoData |
| 永続化 | utils/drive.js | （全action） |
| 認証 | utils/auth.js | registerUser/loginUser |
| UIシェル・ガイド | utils/shell.js, utils/guides.js | — |
| 画像処理 | utils/imagefx.js | — |
| 音声 | utils/voice.js | openaiTranscribe |

---

## 14. 未実装・注意点

- **「育てる」機能は未実装**（home-grow は予告ティーザーのみ）。
- 写真・レポートの **AI質採点はスコアに未使用**（旧仕様の想定のみ残存）。
- `issues.js` のサーバ送信は未実装（ローカル控え。現行報告UIは GAS 側）。
- 生成キャラのレア度（4段）と手描きARキャラのバリアント（6段）は別系統。混同しないこと。
- `src/utils/maps.js.bak`、`src/assets/characters/others/`、`metadataのコピー.json` 等は使用外の残骸。

---

## 15. 旧仕様（v0.2, 2026-04-26）からの主な乖離

| 項目 | 旧仕様 v0.2 | 現行実装 v1.2 |
|---|---|---|
| アーキテクチャ | Next.js + Node(Fastify) + PostgreSQL/PostGIS + S3 | バニラJS静的（GitHub Pages）＋ GAS/Drive/Sheets |
| バックエンドAPI | 独自REST（/api/spots 等） | GASの action ディスパッチ |
| 認証 | Supabase Auth、保護者メール・COPPA同意 | なまえ＋あいことばの簡易ログイン（メール収集なし） |
| データモデル | User/Adventure/Spot/Photo/Report/Score の正規化DB | state＋localStorage＋Sheetsタブ |
| キャラ自動生成 | 記載なし | 中核機能（三層構成・レア度・3体保証・Gemini画像） |
| 図鑑・AR捕獲 | 記載なし | 実装済み（手描きキャラ・バリアント・GPS/コンパス出現） |
| スコア | 訪問30/距離10/写真10/写真質20/レポート30・AI採点 | 計画点＋実行点の加点式（AI質採点は未使用） |
| ランキングの公開設計 | LEGO Life準拠の詳細な公開/非公開ルール | 地域・駅単位の簡易ランキング（日本語版のみ） |
| 多言語 | 日本語のみ（v1） | ja/en/elementary の3系統＋機能フラグ差別化 |
| キャンペーン | 記載なし | スターターキャラ・早期特典（エピック確定） |

---

*本書は現行コードから起こした実装準拠仕様。機能追加時は本書と `docs/20-plans/dev-log.md`・`docs/40-tests/test-spec.md` を併せて更新すること。*

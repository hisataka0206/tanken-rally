# [[たんけんラリー]] — PoC

駅名を入力して周辺スポットを探検する子ども向け Web アプリのプロトタイプ。

## ローカルで動かす手順

### 1. APIキーを設定する

```bash
cp config.example.js config.js
```

`config.js` を開いて以下を入力：

- `GOOGLE_MAPS_API_KEY` … Google Cloud Console で発行
- `OPENAI_API_KEY` … OpenAI の API キー（地名由来生成に使用）
- `GAS_URL` … 写真を Google Drive に保存する [[Apps Script]] のデプロイURL（任意。未設定でもアプリは動作）
- `GAS_SECRET` … `gas/Code.gs` の `SHARED_SECRET` と同値

### 2. ローカルサーバーを起動する

`index.html` を直接開くと ES Modules の CORS エラーが出るためサーバが必要。

```bash
# Python 3 の場合（一番手軽）
cd tanken-rally
python3 -m http.server 8080

# Node.js の場合
npx serve .
```

ブラウザで `http://localhost:8080` を開く。

### 3. 使い方

1. **STEP 1**: 駅名を入力して「さがす」
2. **STEP 2**: スポット一覧から行きたい場所を選ぶ（史跡カテゴリは必須選択）
3. **STEP 3**: 「ルートをつくる」でルート地図を生成 → 「📄 地図PDFをダウンロード」でPDF出力
4. **STEP 4**: 「探検スタート！」で写真撮影モードへ → スマホカメラから撮影／画像選択でアップロード（GAS設定時は Drive に自動保存）

## ディレクトリ構成

```
tanken-rally/
├── index.html              # メインHTML（GitHub Pages が直下から配信）
├── config.js               # APIキー設定（.gitignore対象）
├── config.example.js       # 設定テンプレート
├── src/                    # アプリ本体（ESモジュール）
│   ├── main.js             # メインロジック・イベントバインド
│   ├── style.css           # スタイル
│   ├── data/               # 都市・駅・語彙・アーキタイプ等の静的データ
│   └── utils/              # maps / ai / pdf / drive / chargen / collection ほか
├── gas/
│   └── Code.gs             # Google Apps Script（Drive 写真保存・ランキング Sheets）
├── tools/                  # 分析スクリプト（キャラ複雑度・シルエットクラスタ・UI文字量計測）
├── docs/                   # 事業・仕様・計画・調査・テスト（→ docs/README.md が地図）
│   ├── 00-business/        # 企画・価値提案・公開計画・CM
│   ├── 10-specs/           # 仕様・要求分類・キャラ生成/UI設計
│   ├── 20-plans/           # 開発日誌・改善計画
│   ├── 30-research/        # ポケモン分析・taxonomy・postmortem・トライアルFB
│   └── 40-tests/           # テスト仕様書・テスト結果報告書
├── research/               # データ重めの調査プロジェクト
│   ├── anime-pilgrimage/          # 聖地巡礼データ（AniTabi由来・CC-NC）
│   └── character-silhouette-study/ # キャラシルエット研究（旧 thesis/）
└── _local/                 # ローカル専用の生成物（.gitignore対象・再生成可能）
    ├── analysis-images/    # char-lab 検証の分析PNG
    ├── gen1/ pokemon_all/  # ポケモン分析用スプライトdump
    └── *_metrics.csv       # 分析結果CSV
```

### ドキュメントの地図

| 見たいもの | 行き先 |
|---|---|
| **事業としての全体像** | [[docs/00-business/product-proposal.md]] |
| **仕様の全体** | [[docs/10-specs/spec-overview.md]] |
| **これから何を作るか・現在地** | [[docs/20-plans/dev-log.md]] |
| **キャラ自動生成の設計** | docs/10-specs/character-auto-generation-spec.md |
| **UI改善の設計** | docs/10-specs/ui-text-minimization-design.md |
| **テスト仕様/結果** | docs/40-tests/ |
| ドキュメント全体の地図 | docs/README.md |

## Google Cloud の設定（有効化が必要なAPI）

- Maps JavaScript API
- Places API
- Directions API
- Geocoding API
- **Maps Static API**（PDF の地図画像生成に使用）

すべて同じ API キーで利用可能。

## Google Apps Script デプロイ手順（写真機能を使う場合のみ）

1. [script.google.com](https://script.google.com) で新規プロジェクトを作成
2. `gas/Code.gs` の内容を貼り付け
3. **スクリプトプロパティを設定**（プロジェクトの設定 → スクリプトプロパティ。実値はリポジトリに載せない方針）
   - `ROOT_FOLDER_ID` … 写真/生成キャラ画像の保存先 Drive フォルダID（自分の Drive でフォルダ作成→URL末尾がID。GAS実行ユーザーがアクセス可能なこと）
   - `LOG_SHEET_ID` … セッション/ランキング等の蓄積 Spreadsheet ID
   - `GAS_SHARED_SECRET` … `config.js` の `GAS_SECRET` と同値（合言葉）
   - `GEMINI_API_KEY` … キャラ自動生成（画像）用（任意）
   - `OPENAI_API_KEY` … 地名由来・メモ整形・音声用（任意）
4. 「デプロイ」→「新しいデプロイ」→ 種類: ウェブアプリ
5. 実行ユーザー: 自分 / アクセスできるユーザー: 全員
6. 発行された URL を `config.js` の `GAS_URL` に設定
7. `config.js` の `GAS_SECRET` を、上の `GAS_SHARED_SECRET` と同値にする
8. **自動削除トリガーの登録**: GAS エディタで関数 `setupAutoCleanup` を一度だけ手動実行
   - 6時間ごとに `cleanupOldSessions` が走り、`SESSION_RETENTION_DAYS`（既定 7日）より古いセッションフォルダをゴミ箱へ移動
   - 初回実行時に Drive へのアクセス許可ダイアログが出るので承認

GAS が提供する API（POST `action`）：

| action | 概要 |
|---|---|
| `createSession` | 探検セッション用フォルダを Drive に作成 |
| `uploadPhoto`   | 写真を base64 で受け取り Drive に保存 |
| `listPhotos`    | フォルダ内の写真一覧 |
| `saveRanking`   | スコアを Sheets に追記 |
| `getRanking`    | スコアを Sheets から取得 |
| `saveCaptures`  | ARキャラ捕獲記録を Sheets「captures」タブにマージ保存（図鑑用） |
| `getCaptures`   | 端末ローカルID（explorerId）の図鑑コレクションを取得 |
| `getSpotsCache` | 駅単位のスポット検索キャッシュを取得（Sheets「spots_cache」タブ、TTL 1年。Places API 課金削減） |
| `saveSpotsCache`| スポット検索結果をキャッシュに upsert 保存 |

## PoC の対象機能

- [x] STEP 1: 駅名入力 → スポット検索 → 地図表示
- [x] STEP 2: スポット選択（史跡必須）
- [x] STEP 3: 最短ルート生成 → 地図表示 → PDF出力（日本語対応／Static Maps）
- [x] 地名由来の生成（OpenAI）
- [x] STEP 4: 写真アップロード → Google Drive 保存（GAS経由）
- [ ] 探検レポート生成（次フェーズ）
- [ ] スコアリング / ランキング（次フェーズ）

## デプロイ（本番公開）

本番公開は **[[Netlify]] のブランチデプロイ**で運用する（案B改）。設計・切替手順の詳細は `docs/20-plans/deploy-operations.md`。

| 用途 | ブランチ | URL | コスト |
|---|---|---|---|
| 公開版 | `live` | `https://live--tekutan.netlify.app` | ブランチデプロイ＝**無料・更新無制限** |
| テスト | `beta` | `https://beta--tekutan.netlify.app` | 同上（無料） |
| （production branch） | `main` | `tekutan.netlify.app`（使わない） | **1デプロイ=15クレジット**のため**凍結**（触らない） |

- **開発は `beta`、公開は `live`**。`beta` で確認 → `live` に merge → 公開更新。`main` には push しない。
- ビルドは `netlify.toml`（command=`bash netlify-build.sh` / publish=`dist`）。**環境変数**（Netlify: Site settings → Environment variables）に `GOOGLE_MAPS_API_KEY` / `GAS_URL` / `GAS_SECRET` を登録。ビルド時に `config.js` を生成し（git 非コミット）、`?v=` はコミットSHAへ自動スタンプ。
- **OpenAI / Gemini キーはクライアントに出さない**（GAS の Script Property に保持）。
- **Google Maps キーの HTTPリファラー**に `https://live--tekutan.netlify.app/*` と `https://beta--tekutan.netlify.app/*` を追加（未設定だと地図が真っ白）。

> 旧: GitHub Pages（`.github/workflows/deploy.yml`）は**廃止予定**。repo を private 化すると無料の Pages 公開は不可のため、Netlify に一本化する。

### [[キャッシュバスター]]は自動（手動で `?v=` を上げる必要なし）

各モジュール/CSSは `?v=...` 付きで読み込んでキャッシュを制御していますが、この番号は**デプロイ時に GitHub Actions が自動でコミットSHAへ書き換えます**（`.github/workflows/deploy.yml` の「Stamp cache-busting version」ステップ）。そのため、コードを変えるたびに手で `?v=105 → 106` のように上げる必要はありません。ソース内の `?v=` は固定のプレースホルダのままで構いません（デプロイ時に上書きされます）。

- 効果: push するたびに全アセットの `?v=` がその時のSHAに揃い、ブラウザキャッシュが確実に更新される（ユーザーはハードリロード不要）。
- ローカル確認（`python3 -m http.server`）でキャッシュが気になる場合のみ、ブラウザの「スーパーリロード（Cmd+Shift+R）」か DevTools の "Disable cache" を使ってください。

### 🔒 API キー漏洩対策（必読）

**Netlify も静的ホスティングなので、デプロイ後の `config.js` はブラウザから誰でも読めます。** 必ず以下の制限をかけてください：

#### Google Maps API キー
[Google Cloud Console](https://console.cloud.google.com/apis/credentials) でキーを開き、**アプリケーションの制限**を設定：

- **HTTPリファラー** で許可するドメインを限定:
  - `https://live--tekutan.netlify.app/*`（公開版）
  - `https://beta--tekutan.netlify.app/*`（テスト）
  - `http://localhost:8080/*`（ローカル開発用）
- **APIの制限** で必要な API のみ許可（Maps JavaScript API / Places API / Directions API / Geocoding API / Maps Static API）

これでキー文字列が漏れても他ドメインでの利用を防げます。

#### OpenAI API キー
**OpenAI には GoogleMaps 相当の HTTPリファラ制限がない** ため、キーが漏れると他人が課金できてしまいます。安全に運用するなら：

- **推奨**: OpenAI 呼び出しを GAS (Code.gs) 側にプロキシして、ブラウザにキーを露出させない（リファクタ要）
- **暫定**: OpenAI ダッシュボードで月次の利用上限額を低く設定する（例: $5/月）
- **回避**: `OPENAI_API_KEY` を Secrets に入れない（地名由来機能は無効化されるが他は動く）

#### GAS_URL / GAS_SECRET
- GAS_SECRET は実質「ファイル送信トークン」程度の役割。漏れても任意のファイルを Drive ルートフォルダに上げられる程度のリスク。
- 重要なら GAS 側で IP 制限や Origin チェックを追加することを検討。

## 既知の制限事項（PoC）

- OpenAI / Google Maps の **API キーがブラウザに露出** している。本番では必ずサーバ側プロキシを置くこと。
- ルート最適化は最近傍法による近似（Held-Karp 等の厳密解は未実装）。
- 写真の EXIF 撮影日時は `File.lastModified` で代替（本来は `exif-parser` 等で抽出するのが望ましい）。

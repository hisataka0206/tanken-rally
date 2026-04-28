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
├── index.html              # メインHTML
├── config.js               # APIキー設定（.gitignore対象）
├── config.example.js       # 設定テンプレート
├── src/
│   ├── main.js             # メインロジック・イベントバインド
│   ├── style.css           # スタイル
│   └── utils/
│       ├── maps.js         # Google Maps（Geocode / Places / Directions / 距離計算）
│       ├── ai.js           # OpenAI API 呼び出し
│       ├── pdf.js          # 地図PDF生成（HTML→html2canvas→jsPDF）
│       └── drive.js        # GAS 経由の Google Drive 連携クライアント
├── gas/
│   └── Code.gs             # Google Apps Script（Drive 写真保存・ランキング Sheets）
└── docs/
    ├── 企画書.md
    └── 仕様書.md
```

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
3. **写真保存先の Drive フォルダ ID を `ROOT_FOLDER_ID` に設定**（既定値: `10EzCggGS5BcZ2LJXOnbfd1WLhSh7MECH`）
   - 自分の Drive で右クリック「新しいフォルダ」→ 作成 → そのフォルダを開いた URL の末尾が ID
   - GAS 実行ユーザーが Drive 上でこのフォルダにアクセスできる必要あり
4. 「デプロイ」→「新しいデプロイ」→ 種類: ウェブアプリ
5. 実行ユーザー: 自分 / アクセスできるユーザー: 全員
6. 発行された URL を `config.js` の `GAS_URL` に設定
7. `Code.gs` の `SHARED_SECRET` と `config.js` の `GAS_SECRET` を同値にする
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

## PoC の対象機能

- [x] STEP 1: 駅名入力 → スポット検索 → 地図表示
- [x] STEP 2: スポット選択（史跡必須）
- [x] STEP 3: 最短ルート生成 → 地図表示 → PDF出力（日本語対応／Static Maps）
- [x] 地名由来の生成（OpenAI）
- [x] STEP 4: 写真アップロード → Google Drive 保存（GAS経由）
- [ ] 探検レポート生成（次フェーズ）
- [ ] スコアリング / ランキング（次フェーズ）

## [[GitHub Pages]] への自動デプロイ

main ブランチに push すると `.github/workflows/deploy.yml` が走って公開されます。

### 1. リポジトリ設定（初回のみ）

1. GitHub リポジトリの **Settings → Pages**
2. "Source" を **GitHub Actions** に切り替え

### 2. Secrets 登録（初回のみ）

**Settings → Secrets and variables → Actions → New repository secret** で以下4つを登録：

| Secret 名 | 内容 |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Google Cloud Console で発行した Maps JS / Places / Directions / Geocoding / Maps Static API キー |
| `OPENAI_API_KEY` | OpenAI の API キー（未設定なら空文字でも可。地名由来生成は失敗してスキップされる） |
| `GAS_URL` | GAS デプロイURL（未設定なら空文字。写真アップロードはローカル保存にフォールバック） |
| `GAS_SECRET` | GAS の `SHARED_SECRET` と同じ値 |

ワークフローはこれらを使って `config.js` をデプロイ時に生成します。`config.js` 自体は git にコミットしません（`.gitignore` 済み）。

### 3. デプロイ

```bash
git push origin main
```

数分後に `https://<ユーザー名>.github.io/tanken-rally/` で公開されます（プロジェクト名がリポジトリ名）。

### 🔒 API キー漏洩対策（必読）

**GitHub Pages は静的ホスティングなので、デプロイ後の `config.js` はブラウザから誰でも読めます。** 必ず以下の制限をかけてください：

#### Google Maps API キー
[Google Cloud Console](https://console.cloud.google.com/apis/credentials) でキーを開き、**アプリケーションの制限**を設定：

- **HTTPリファラー** で許可するドメインを限定:
  - `https://<ユーザー名>.github.io/tanken-rally/*`
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

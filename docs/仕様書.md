# たんけんラリー（仮称）
## システム仕様書 v0.2
> 作成日: 2026-04-26 / 更新: 2026-04-26（写真アップ仕様・プライバシー設計を追記）

---

## 1. システム全体構成

```
[プレーヤー端末（スマホ/PC）]
        │
        │ HTTPS
        ▼
[フロントエンド]
  - Web アプリ（PWA対応でスマホでも使いやすく）
        │
        │ API呼び出し
        ▼
[バックエンド API サーバー]
  ├─ スポット検索モジュール
  ├─ ルート生成モジュール
  ├─ PDF生成モジュール
  ├─ 写真管理モジュール
  ├─ レポート生成モジュール（AI）
  └─ スコアリング・ランキングモジュール
        │
        ├─ [外部API]
        │    ├─ Google Maps API（地図・ルート・施設検索）
        │    ├─ OpenAI API（スポット説明生成・レポート骨格生成・スコアリング）
        │    └─ 地名・文化財DB（文化庁文化財情報API等）
        │
        └─ [データストア]
             ├─ ユーザーDB（プレーヤー情報・スコア）
             ├─ 探検記録DB（ルート・訪問履歴）
             ├─ 写真ストレージ（S3互換）
             └─ ランキングDB
```

---

## 2. 機能一覧

### 2-1. 駅名入力・スポット検索

| 機能ID | 機能名 | 概要 |
|---|---|---|
| F-01 | 駅名入力 | テキスト入力 + サジェスト（全国駅名対応） |
| F-02 | スポット検索 | 駅周辺の史跡・菓子店・地名由来スポットを検索・取得 |
| F-03 | 地名由来説明生成 | AIが地名の由来をわかりやすく説明 |
| F-04 | スポット一覧表示 | カテゴリ別・地図上へのピン表示 |

### 2-2. スポット選択・ルート生成

| 機能ID | 機能名 | 概要 |
|---|---|---|
| F-05 | スポット選択 | プレーヤーが訪問スポットをチェックボックスで選択 |
| F-06 | ルート最適化 | 選択スポットを最短距離で結ぶ徒歩ルートを生成 |
| F-07 | 地図表示 | ルートを地図上に描画。各スポットに番号付きピン |
| F-08 | PDF生成 | 地図＋スポット説明をA4 PDF化してダウンロード提供 |

### 2-3. 現地探検・写真管理

| 機能ID | 機能名 | 概要 |
|---|---|---|
| F-09 | 探検開始 | 探検セッションを開始（タイムスタンプ記録） |
| F-10 | 写真撮影・即時アップロード | スマホのカメラを直接起動し、撮影と同時にサーバーへアップロード。EXIF（撮影時刻・GPS）を自動取得 |
| F-10b | オフライン対応 | 圏外時は端末にキャッシュし、電波が回復次第自動アップロード |
| F-11 | 訪問自動記録 | 写真のGPS座標がスポットの半径100m以内なら訪問済みとして自動記録。GPS取得不可の場合は手動チェックイン |
| F-12 | 写真一覧表示 | 撮影した写真を時系列で一覧表示。スポットごとにグループ表示も可 |
| F-13 | 写真選択 | レポートに使う写真を選択（複数選択可） |

### 2-4. 探検レポート生成

| 機能ID | 機能名 | 概要 |
|---|---|---|
| F-14 | レポート骨格生成 | 写真・時刻・移動データからAIがレポート構成を自動作成 |
| F-15 | コメント入力 | 各写真・スポットへのコメントをプレーヤーが記入 |
| F-16 | レポートプレビュー | 完成イメージをリアルタイムでプレビュー |
| F-17 | レポートPDF出力 | 完成レポートをPDFで出力・保存・シェア |

### 2-5. スコアリング・ランキング

| 機能ID | 機能名 | 概要 |
|---|---|---|
| F-18 | スコア算出 | 訪問率・移動距離・写真・レポートを総合評価 |
| F-19 | ランキング登録 | スコアをプレーヤー名と共に公開ランキングに登録 |
| F-20 | ランキング閲覧 | 駅別・全国・週間ランキングの閲覧 |

### 2-6. ユーザー管理・プライバシー設計

> **設計方針：LEGO Life に準拠した子ども向けコミュニティ設計**
> LEGO Life は13歳未満でも安全に使える子ども向け SNS として COPPA 準拠。実名・顔写真・位置情報を公開せず、ニックネームとアバターのみで参加できる設計が参考になる。

| 機能ID | 機能名 | 概要 |
|---|---|---|
| F-21 | プレーヤー登録 | ニックネーム（表示名）+ 保護者メールアドレス。13歳未満は保護者の同意メール必須 |
| F-21b | アバター選択 | プリセットのキャラクターアバターから選択（実写プロフィール写真は不可） |
| F-22 | 探検履歴 | 過去の探検記録・レポート・スコアを一覧で確認（本人のみ閲覧） |
| F-23 | プロフィール（公開） | **公開情報はニックネーム・アバター・累計スコア・訪問駅数のみ**。年齢・本名・メール等は非公開 |

#### 公開・非公開の明示ルール（LEGO Life 準拠）

| 情報 | 公開範囲 | 備考 |
|---|---|---|
| ニックネーム | 全体公開 | 実名禁止。登録時にシステムが実名っぽい文字列を警告 |
| アバター | 全体公開 | プリセットのみ。実写画像は使用不可 |
| スコア | 全体公開 | ランキングに表示 |
| 訪問駅・訪問数 | 全体公開 | |
| 探検レポート | **デフォルト非公開**。プレーヤーが明示的に公開設定した場合のみ公開 | |
| 写真 | **デフォルト非公開**。公開レポートに含まれる場合のみ公開 | |
| GPS・位置情報 | **非公開**（システム内部でのみ使用） | 外部には一切出さない |
| メールアドレス | 非公開 | |
| 年齢・生年月日 | 非公開 | |

#### コメント・テキスト入力の安全設計

| 項目 | 設計 |
|---|---|
| 使用可能文字 | 日本語・英数字・絵文字のみ |
| NGワードフィルター | 暴言・個人情報（電話番号・住所等のパターン）を自動検出・ブロック |
| AIモデレーション | レポートのコメントはAIが不適切表現を確認してから公開 |
| ダイレクトメッセージ | **実装しない**（LEGO Life と同方針） |
| コメント欄 | **実装しない**（ランキングへのリアクションはスタンプのみ） |

---

## 3. 画面設計（ページ一覧）

| ページ | パス | 概要 |
|---|---|---|
| トップ / 駅入力 | `/` | 駅名入力フォーム・最近の探検・ランキングへのリンク |
| スポット選択 | `/explore/:stationId` | スポット一覧（地図＋リスト）・選択UI |
| マップ確認 / PDF | `/route/:sessionId` | 最適ルート地図表示・PDF生成ボタン |
| 探検中 | `/adventure/:sessionId` | 写真アップ・訪問チェックイン・進捗表示 |
| 写真選択 | `/photos/:sessionId` | 撮影写真一覧・レポート用写真セレクト |
| レポート作成 | `/report/:sessionId` | コメント入力・プレビュー・PDF出力 |
| スコア / ランキング | `/score/:sessionId` | スコア結果・ランキング順位・シェアボタン |
| ランキング一覧 | `/ranking` | 駅別・全国・週間ランキング |
| マイページ | `/mypage` | 探検履歴・プロフィール |

---

## 4. データモデル

### 4-1. User（ユーザー）

```
User {
  id: UUID
  nickname: String         // 公開ニックネーム
  email: String            // 非公開
  avatar_url: String?
  total_score: Int         // 累計スコア
  visited_stations: Int    // 訪問駅数
  created_at: DateTime
}
```

### 4-2. Adventure（探検セッション）

```
Adventure {
  id: UUID
  user_id: UUID
  station_name: String     // 駅名
  station_code: String     // 駅コード
  selected_spots: Spot[]   // 選択したスポット
  route_data: JSON         // ルート情報（座標リスト）
  total_distance_m: Int    // 移動距離（メートル）
  started_at: DateTime
  completed_at: DateTime?
  score: Int?
  status: Enum(planning, in_progress, completed)
}
```

### 4-3. Spot（スポット）

```
Spot {
  id: UUID
  adventure_id: UUID
  name: String
  category: Enum(historic, sweets, origin, nature, other)
  address: String
  lat: Float
  lng: Float
  description: String      // AI生成の説明文
  origin_story: String?    // 地名由来の場合のストーリー
  visited_at: DateTime?    // 訪問時刻
  order_in_route: Int      // ルート上の順番
}
```

### 4-4. Photo（写真）

```
Photo {
  id: UUID
  adventure_id: UUID
  user_id: UUID
  url: String              // ストレージURL
  taken_at: DateTime       // 撮影時刻（EXIFから取得）
  lat: Float?              // GPS座標
  lng: Float?
  spot_id: UUID?           // 紐づくスポット
  is_selected: Boolean     // レポートに使用するか
  ai_quality_score: Float? // AI評価スコア（0.0〜1.0）
}
```

### 4-5. Report（探検レポート）

```
Report {
  id: UUID
  adventure_id: UUID
  user_id: UUID
  title: String
  photo_comments: JSON     // { photo_id: String, comment: String }[]
  spot_comments: JSON      // { spot_id: String, comment: String }[]
  closing_message: String
  pdf_url: String?         // 生成されたPDFのURL
  word_count: Int
  created_at: DateTime
}
```

### 4-6. Score（スコア）

```
Score {
  id: UUID
  adventure_id: UUID
  user_id: UUID
  station_name: String
  visit_completion_rate: Float  // 訪問完了率（0.0〜1.0）
  distance_bonus: Int
  photo_count_score: Int
  photo_quality_score: Int
  report_quality_score: Int
  total_score: Int
  rank_station: Int?            // 駅別順位
  rank_global: Int?             // 全国順位
  created_at: DateTime
}
```

---

## 5. API設計（主要エンドポイント）

### スポット検索

```
GET /api/spots?station={駅名}&lat={緯度}&lng={経度}
Response: {
  station: { name, lat, lng },
  origin_story: String,
  spots: Spot[]
}
```

### ルート生成

```
POST /api/route
Body: { spot_ids: UUID[] }
Response: {
  route: { polyline, total_distance_m, estimated_minutes },
  ordered_spots: Spot[]
}
```

### PDF生成（マップ）

```
POST /api/pdf/map
Body: { adventure_id: UUID }
Response: { pdf_url: String }
```

### 写真アップロード

```
POST /api/photos
Body: FormData { file, adventure_id, spot_id? }
Response: Photo
```

### レポート骨格生成

```
POST /api/report/generate
Body: { adventure_id: UUID, selected_photo_ids: UUID[] }
Response: {
  title_suggestion: String,
  photo_captions: { photo_id: UUID, caption: String }[],
  spot_summaries: { spot_id: UUID, summary: String }[]
}
```

### PDF生成（レポート）

```
POST /api/pdf/report
Body: { report_id: UUID }
Response: { pdf_url: String }
```

### スコア算出

```
POST /api/score
Body: { adventure_id: UUID, report_id: UUID }
Response: Score
```

### ランキング取得

```
GET /api/ranking?type={station|global|weekly}&station={駅名}
Response: { rankings: { rank, nickname, score, station, date }[] }
```

---

## 6. スコアリングロジック詳細

### 6-1. 訪問完了率（最大30点）
```
score = (訪問済みスポット数 / 選択スポット数) × 30
```

### 6-2. 移動距離ボーナス（最大10点）
```
score = min(総移動距離km × 2, 10)
例: 3km歩いたら6点、5km以上で満点10点
```

### 6-3. 写真枚数（最大10点）
```
score = min(写真枚数 × 1, 10)
10枚以上で満点
```

### 6-4. 写真の質（最大20点）
```
AIが評価（OpenAI Vision API）
- 構図の良さ（0〜5点）
- 明るさ・ピントの適切さ（0〜5点）
- スポットとの関連性（0〜5点）
- 独自性・面白さ（0〜5点）
選択した写真の平均 × 4点 で計算
```

### 6-5. レポートの質（最大30点）
```
AIが評価（OpenAI API）
- 文字数（100字以上で5点、300字以上で10点）
- コメントの充実度（各スポットにコメントあり: +3点/スポット、最大15点）
- オリジナリティ（AI評価: 0〜5点）
```

---

## 7. 技術スタック（案）

| レイヤー | 技術 | 理由 |
|---|---|---|
| フロントエンド | Next.js (React) + TypeScript | PWA対応・SEOしやすい |
| スタイリング | Tailwind CSS | 開発速度 |
| 地図 | Google Maps JavaScript API | ルート・施設検索との統合 |
| バックエンド | Node.js (Fastify) + TypeScript | 軽量・型安全 |
| DB | PostgreSQL（+ PostGIS） | 位置情報クエリ対応 |
| 写真ストレージ | AWS S3 or Cloudflare R2 | コスト・スケーラビリティ |
| AI | OpenAI API (GPT-4o + Vision) | 説明生成・レポート生成・採点 |
| PDF生成 | Puppeteer or @react-pdf/renderer | 柔軟なレイアウト |
| 認証 | Supabase Auth or Auth.js | 実装コスト削減 |
| デプロイ | Vercel (Front) + Railway / Fly.io (API) | 小規模でのコスト効率 |

---

## 8. 非機能要件

| 項目 | 要件 |
|---|---|
| レスポンスタイム | スポット検索: 3秒以内、ルート生成: 5秒以内 |
| スマホ対応 | iOS Safari / Android Chrome で動作すること |
| オフライン対応 | PDFをダウンロード後は圏外でも地図を閲覧できること |
| 個人情報 | LEGO Life 準拠。ニックネーム＋保護者メールのみ収集。13歳未満は保護者同意必須（COPPA対応） |
| 写真の権利 | アップロードした写真の権利はユーザーに帰属。公開レポートへの掲載は明示的同意制 |
| 写真モデレーション | アップロード時にAIで不適切画像（顔写真・個人を特定できる画像）を検出し警告 |
| ダイレクト通信 | ユーザー間のDM・コメント機能は実装しない（LEGO Life 方針に準拠） |
| 言語 | 日本語のみ（v1）。英語対応は v2 以降 |

---

## 9. 開発フェーズ案

| フェーズ | 内容 | 目安期間 |
|---|---|---|
| **Phase 1（MVP）** | 駅入力→スポット表示→ルート生成→PDF出力 | 1〜2ヶ月 |
| **Phase 2** | 写真アップ→レポート生成→スコア算出 | 1〜2ヶ月 |
| **Phase 3** | ランキング・ユーザー登録・公開機能 | 1ヶ月 |
| **Phase 4** | AI評価精度向上・UI磨き込み・自治体連携 | 継続 |

---

## 10. 未決定事項・今後の検討事項

- [ ] アプリ名の決定
- [ ] キャラクターデザイン（たんけん博士）
- [ ] スポット検索の精度担保（地名由来DBの選定）
- [ ] 写真アップロードの容量制限・モデレーション方針（未成年保護）
- [ ] スコアリングのAI評価基準の詳細定義
- [ ] ランキングの不正防止設計（同一スポットの何度も訪問等）
- [ ] Google Maps API の費用試算

---

*v0.1 — 初稿。企画書と合わせて随時更新*

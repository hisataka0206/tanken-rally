# [[たんけんラリー]] 改善バックログ

> 2026-04-26 作成 / 動作確認後に洗い出した改善候補を記録

---

## # 優先度: 🔴 高（実害あり・近日対応）

### [[Maps API deprecation]] 対応
- `google.maps.places.PlacesService` → `google.maps.places.Place` クラスへ移行
  - 2025/3/1 以降の新規顧客は PlacesService が使えない警告あり
  - 移行ガイド: https://developers.google.com/maps/documentation/javascript/places-migration-overview
- `google.maps.Marker` → `google.maps.marker.AdvancedMarkerElement` へ移行
  - 2024/2/21 から deprecated
  - 影響箇所: `src/main.js` の駅マーカー / スポット番号マーカー / ルート画面マーカー
- Maps JS API のロード方式を `loading=async` に変更（`src/utils/maps.js`）

### ~~[[PDF地図]] が直線パス~~ → 2026-04-28 解消

### Phase 2 機能の本実装
- [[STEP4 写真機能]] の動作確認（GAS 設定後）
- [[探検レポート生成]]（OpenAI で写真キャプション・スポットコメント・全体まとめ）
- [[スコアリング]]・[[ランキング]] UI

---

## # 優先度: 🟡 中（UX 改善）

### [[エラーUI]] の改善
- `alert()` を画面内のトースト/バナーに置き換え
- 影響箇所: `onMakeRoute`, `onStartExplore`, `onPhotoInputChange`, `onDownloadPdf`, `finish-explore-btn` ハンドラ

### 「[[探検おわり]]」ボタン
- 現状 alert のみ → STEP5 レポート画面へ遷移する正式実装

### [[STEP3→1 戻り]] 動作の確認
- 現状: 「← 駅を変える」で `state.selectedSpotIds.clear()` のみ。`resetSearchState` 経由でないので一部 state 残存の可能性
- 仕様確定 → リセット範囲を統一

### [[駅サジェスト]]
- 現状: テキスト自由入力。誤字で `〇〇駅が見つかりませんでした` になる
- 改善: Google Places Autocomplete で駅名サジェスト

### [[ローディング]] 表示の充実
- 現状: 「検索中…」「ルート作成中…」のテキストのみ
- 改善: スピナー / プログレスバー

---

## # 優先度: 🟢 低（仕様策定が要る）

### [[PWA対応]]
- service worker / manifest.json
- オフラインで PDF 閲覧（仕様書 §8 記載）

### [[モバイル対応]] の検証
- iOS Safari / Android Chrome での実機確認
- カメラ起動（`capture="environment"`）の動作

### [[プレーヤー名入力UI]]
- 現状: `'たんけんたろう'` ハードコード（`src/main.js` onStartExplore）
- 改善: 初回起動時にニックネーム入力（仕様書 F-21 準拠）

### [[アバター選択]] (LEGO Life 準拠)
- プリセットアバターから選択

### [[NGワードフィルター]] / AI モデレーション
- 写真コメント・レポートテキスト
- 仕様書 §2-6 「コメント・テキスト入力の安全設計」

### [[コース推薦]] アルゴリズム改善
- 現状: 駅から最近傍法で順に並べる
- 改善: スポットの評価/人気度を加味した並べ方
- 子ども向けの「歩きやすさ」重視（坂道・大通り回避）

### [[セキュリティ]]
- OpenAI / Google Maps API キーがブラウザに露出
- 本番ではサーバ側プロキシ必須
- 影響箇所: `src/utils/ai.js`, `src/utils/maps.js`

---

## # 既知の小さい指摘

- `src/utils/drive.js` の `extractExifDate` は `File.lastModified` で代用 → 本来は `exif-parser` 等で EXIF DateTimeOriginal を読むべき
- `src/utils/maps.js` の `optimizeRoute` は単純な最近傍法（Held-Karp 等の厳密解は未実装）
- `src/utils/ai.js` の `enrichSpotDescription` は定義済みだが未使用

---

## # Done（完了履歴）

- 2026-04-26 [[PDF日本語化]]（HTML→html2canvas→jsPDF 方式）
- 2026-04-26 駅再検索時の [[state リセット]]
- 2026-04-26 STEP1 地図の二重初期化を1回に統一
- 2026-04-26 [[スポット重複除去]]（place_id ベース）
- 2026-04-26 DirectionsRenderer の [[suppressMarkers]] + カスタム番号マーカー
- 2026-04-26 写真アップ時の [[blob URL 解放]]
- 2026-04-26 未使用 `.cat-origin` クラス削除
- 2026-04-26 PDFボタンラベル HTML/JS 統一
- 2026-04-26 README 更新（STEP4・gas/・Maps Static API・ディレクトリ構成）
- 2026-04-26 `src/state.js` 切り出しリファクタ
- 2026-04-26 `showStep` の CSS specificity バグ修正（`!important` 対応）
- 2026-04-26 `config.js` の API キーを `.env` の最新キーに更新
- 2026-04-28 [[fitBounds]] で地図ズーム自動調整（zoom固定をやめて全マーカーが入るように）
- 2026-04-28 [[60分超え警告バナー]]＋「スポットを減らす／別の駅にする」ボタン
- 2026-04-28 [[史跡選択ルール]]変更: 全自動必須 → 「最低1件選択必須」（推奨表示は維持）
- 2026-04-28 [[ルートプレビュー]]: スポット選択時に500ms debounce で距離・時間バッジ更新（60分超は赤）
- 2026-04-28 [[カード番号バッジ]]: 左カードに地図マーカー対応の番号バッジ追加
- 2026-04-28 [[カテゴリ識別色]]: 茶=史跡 / ピンク=スイーツ / 緑=公園 / 黄=選択中。地図マーカーとカード番号バッジ連動
- 2026-04-28 [[都市・路線・駅セレクタ]]: STEP1 にタブ式UI（東京/名古屋/大阪/神戸/京都/その他）。`src/data/cities.js` に主要路線データ
- 2026-04-28 ESM キャッシュ対策で全 import に `?v=12` 付与
- 2026-04-28 [[名古屋市営地下鉄]] 全6線データ追加（東山・名城・名港・上飯田・鶴舞・桜通）
- 2026-04-28 [[PDF徒歩経路]]: Static Maps の path に Directions API の encoded polyline を渡す方式に変更（直線→カーブ）
- 2026-04-28 [[ループルート]]: 駅 → スポット → ... → 駅 に変更（destination=origin）。総距離・時間も自動でループ込みに
- 2026-04-28 [[区間時間表示]]: STEP3 の route-spots に各区間の徒歩時間・距離を点線バーで挟み込み表示
- 2026-04-28 [[PDF区間表示]]: PDF の「たんけんルート」セクションも S駅→区間→スポット→...→G駅 のループ＋区間時間表示
- 2026-04-28 [[PDF地図大型化]]: Static Maps を 640x640、PDF内表示を約178mm四方の正方形に。ヘッダー/統計はコンパクト化

---

*backlog 形式: `[登録日] [カテゴリ] 内容 — 出典/ファイル参照`*

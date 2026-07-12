# [[地図PDF]] パフォーマンス退行 ポストモーテム（学び）

## 概要

スマホの [[Chrome]] で [[地図PDF]] が「描画中…」で**フリーズ**する問題を修正した際、その修正一式（`src/utils/pdf.js`）を境に、**生成が一気に遅くなる退行**が発生した。本ドキュメントは、その差分を分析して根本原因を特定し、再発防止の学びとして残すものである。

- 対象ファイル: `src/utils/pdf.js`（[[generateMapPdf]]）
- 症状（修正前）: スマホで [[html2canvas]] が「描画中」で固まる（1スポットでも発生）
- 症状（修正後の退行）: フリーズは解消したが、生成に一気に時間がかかるようになった

---

## 今回入れた差分（要約）

1. [[detectConstrainedDevice]] を追加し `_pdfConstrained`（スマホ/低メモリ）を判定
2. 制約端末では [[html2canvas]] の解像度予算（`MAX_PIXELS`/`scale`）を大幅ダウン
3. スマホではキャラの [[イースターエッグ]] を出さない（後に10%で復帰）
4. ページ書き出しループに `await setTimeout(0)` の [[yield]] とスライスキャンバス解放を追加
5. [[html2canvas]] に保険タイムアウト（Promise.race）を追加
6. **[[bakeCrossOriginImages]]** を追加：描画前に別ドメイン画像（Google の [[Static Maps]] / [[Street View]]）を [[toDataURL]] で **data URL 化**して差し替え（クロスオリジン画像で html2canvas が固まる問題の回避）

このうち、フリーズを直した本命は 6 の [[bakeCrossOriginImages]] だった。しかし、これが同時に**退行の主因**にもなった。

---

## 根本原因

### 主因1：bake がフル解像度で「二重処理」を追加している

[[bakeCrossOriginImages]] は、各クロスオリジン画像を **ナチュラル解像度のまま** canvas に `drawImage` し、`toDataURL('image/jpeg', 0.85)` で符号化してから差し替えている。

- `toDataURL` は **同期（メインスレッドブロッキング）** かつ CPU 負荷の高い JPEG エンコード処理。
- 特に [[Static Maps]] は `size=640x640&scale=2` = **1280×1280（約160万px）** と大きく、これを毎回フル解像度でエンコードしている。
- その後 [[html2canvas]] が data URL を**再デコード**する。
- 結果として、1枚あたり「デコード（元画像）＋エンコード（bake）＋再デコード（html2canvas）」と処理が増え、描画前に無視できない同期処理が積み上がる。

→ フリーズ（クロスオリジン画像で html2canvas がハング）は消えたが、その代償として**画像処理量がおよそ倍増**した。ミティゲーションが「必要十分」ではなく「過剰（フル解像度）」だった。

### 主因2：deviceMemory の判定が普通のPCまで“非力端末”扱いにしていた

```js
const lowMem = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4;
return isMobile || lowMem;
```

- [[navigator.deviceMemory]] は**上限8・2のべき乗に丸められる粗い指標**で、4〜6GB 級のマシンは `4` を返す。
- そのため `deviceMemory <= 4` は **ごく普通のノートPC/デスクトップまで `_pdfConstrained = true`** にしてしまう。
- 結果、本来「速い経路（bake なし・scale=2）」で通っていたPCが、「遅い経路（bake あり・低scale）」に流れ込み、**PCでも一気に遅く**なった。

### 副次的要因（軽微）

- スライスループの `await setTimeout(0)` は最小4msクランプがあるが、ページ数ぶんなので影響は軽微。
- タイムアウトの Promise.race 自体に実行コストはない。

---

## 学び（再発防止の原則）

1. **ハングを「前処理の追加」で直すと、フリーズを“遅さ”に付け替えてしまう。** ミティゲーションは必ず**必要十分な規模に**する。今回なら bake は**縮小して**行うべきで、フル解像度でやってはいけない（[[toDataURL]] は同期・高コスト）。
2. **`navigator.deviceMemory` は粗く上限が低い指標。`<= 4` は普通のPCを巻き込む。** 端末ヒューリスティクスは、能力のあるマシンを「安全だが遅い経路」に誤って流さないよう、しきい値を保守的にする（例: `<= 2` か、`isMobile` を主軸にする）。
3. **`toDataURL` / `drawImage` は同期でメインスレッドを止める。** 大きい画像をフル解像度で通すと体感フリーズになる。使うなら小さくしてから。
4. **「直った」と「速い」は別。** 退行検知のため、`console.time('[pdf] bakeImages')` / `[pdf] content=…x… scale=…` のような**ステージ計測ログ**を残し、前後で比較する。

---

## 修正方策（本ポストモーテムに基づく対応）

1. **端末判定を厳格化**：`deviceMemory` のしきい値を `<= 4` → `<= 2` に下げ、普通のPCが bake 経路に入らないようにする（`isMobile` を主軸に）。
2. **bake を縮小して実行**：`bakeCrossOriginImages` で長辺の上限（例 1024px）を設け、それより大きい画像は縮小してから `toDataURL` する。[[Static Maps]] の 1280px を縮小することで、エンコード・再デコード・メモリを大きく削減する。
3. （さらなる余地・任意）モバイルでは [[Static Maps]] を `scale=1` で要求し、ネットワーク取得自体も軽くする。

上記 1・2 を実施済み。3 は必要に応じて追加検討。

---

## 追記: 「1回目は失敗、2回目は一瞬で成功」の落とし穴 ＝ [[html2canvas]] が clone に [[Google Fonts]] の `<link>` を読み込んで固まる（**確定・解決済み**）

### 症状
[[地図PDF]] 作成が **1回目だけ失敗（描画タイムアウト90秒）** し、**2回目は一瞬で成功**する。**スマホ版のみ**発生（PC は露見せず）。

### 切り分け（画面内診断トレースで確定）
コンソールの見えないスマホでも位置を特定できるよう、`generateMapPdf` に各段階の到達時刻を記録し失敗アラートに出す診断を仕込んだ。実測は次のとおり：

```
start c=true@0ms > html imgs=10@20ms > imagesWaited@555ms
> baked n=10 baked=10 hidden=0 extLeft=0@650ms
> renderStart 794x3774 s=1.00@650ms
> ERROR 描画タイムアウト@90770ms
```

- **画像は完全にシロ**：10枚すべて data URL 化され、外部URL残は 0（`extLeft=0`）。→ 画像は原因ではない。
- ハングは `renderStart` の後、つまり **html2canvas の内部**。しかも `imageTimeout:15000`（画像用）を入れても90秒ハング → **画像ロード経路ではない**。
- この時点で残る唯一の別ドメイン資源は **[[Google Fonts]]**（`index.html` の `fonts.googleapis.com` / `fonts.gstatic.com` の `<link>`）だけだった。

### 根本原因（確定）
[[html2canvas]] は描画時、**元ページを iframe に clone し、その `<head>` の `<link>`（CSS/フォント）ごとコピーして「clone の読み込み完了」を待つ**。スマホの1回目（キャッシュが冷たい）は、この clone 内での [[Google Fonts]] のコールドfetchが解決せず **clone の ready が返らない → `RENDER_TIMEOUT_MS`（90秒）に到達して失敗**。2回目はブラウザキャッシュ済みで clone の読み込みが即完了 → 一瞬で成功する。

ポイントは **PDF本文はシステムフォント指定**（`'Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif`）で、**Google Fonts は PDF では一切使っていない**こと。つまり「使ってもいない別ドメインフォント」を clone が読みに行って固まっていた。

### 対策（実施済み・これで解決）
- html2canvas の **`onclone` コールバックで、clone 側の別ドメイン `<link>`（Google Fonts / preconnect など、origin が異なる link）を全て除去**する。→ clone の別ドメイン読込がゼロになり、ハングが原理的に消える。PDF はシステムフォント指定なので**見た目は不変**。
- 併せて、失敗位置を即特定するための**画面内診断トレース**（`mark()` と bake 統計 `n/baked/hidden/extLeft`、`onclone` の `linkRemoved`）を残置。

### 学び
- **「N回目だけ成功」はキャッシュ起因のレースを疑う。** 失敗＝生成不能ではなく「1回目は間に合っていないだけ」。
- **html2canvas は画像だけでなく、ページの `<link>`（CSS/フォント）を clone に丸ごと持ち込み、その読み込みを待つ。** `useCORS`/`imageTimeout` は画像用で、**フォント/CSS の別ドメイン読込ハングには効かない**。clone から不要な別ドメイン資源を落とすのが確実。
- **憶測で対策を重ねない。** 本件は先に「別ドメイン画像の再取得」「bake の取りこぼし」と2回誤診した。**画面内に診断トレースを出して実測**したことで、`extLeft=0`＝画像シロ、ハングは font と即断でき、一発で解決した。スマホなど**コンソールが見えない環境の不具合は、まず"失敗時に状態を吐く計測"を仕込む**のが最短。

（補足）先に入れた bake の堅牢化（`ensureImageLoaded` で未ロードを待つ・焼けない外部画像を隠す・外部URL残の最終スイープ）は本件の直接原因ではなかったが、**別ドメイン画像を html2canvas に渡さない**という点で有効なので defense-in-depth として残置している。

---

## 追記2: フォント/画像はシロなのに描画90秒 ＝ [[html2canvas]] の box-shadow / transform / filter が重い（2026-07-12・スマホ実機トレースで確定）

### 症状
[[地図PDF]]（長めルート）作成が、画像もフォントも解決済みなのに描画90秒でタイムアウト。iPhone/5G 実機。

### 実測トレース（画面内診断）
```
start c=true@0ms > html imgs=19@17ms > imagesWaited@577ms
> baked n=16 baked=16 hidden=0 extLeft=0@695ms
> renderStart 794x4994 s=0.87@695ms
> ERROR 描画タイムアウト@90782ms
```
- `extLeft=0`＝外部画像残ゼロ、フォントlink除去（追記1）も適用済み → 画像でもフォントでもない。
- ハングは `renderStart` 後＝**html2canvas 内部のラスタライズ**。content 794×4994（超縦長）を s=0.87 で描く途中で90秒到達。

### 根本原因
html2canvas は **box-shadow / transform(回転) / filter / text-shadow** のラスタライズが極端に重い。装飾（カードの影・写真のマステ回転・グラデ）を盛った縦長DOMをモバイルGPU/JSで描くと、ピクセル数以上に時間が伸びて90秒を超える。

### 対策（2026-07-12 実施）
- `onclone` で **描画クローンにだけ** `#pdf-render-root *{ box-shadow/text-shadow/filter/transform/transition/animation: none !important }` を注入（`_pdfConstrained`＝モバイル時のみ）。**背景グラデ(background-image)は見出し帯の視認性に必要なので残す**＝見た目はほぼ不変で描画だけ軽量化。
- モバイルの `MAX_PIXELS` を 3.0M→2.2M に圧縮（scale をさらに下げて総ピクセルを削減）。
- 診断トレースは残置。まだ超える場合の次手＝①street-view ターンカードをモバイルで削減/省略、②縦スライス分割で html2canvas を複数回に分ける、③サーバ側(GAS)でPDF生成。

### 学び
- **「画像もフォントもシロ」でも描画は固まりうる。** 次に疑うのは html2canvas が苦手な CSS（影・変形・フィルタ）。**描画時だけ onclone で装飾を外す**のが低リスク高効果。

### 追記2の続報（2026-07-12）: CSS軽量化だけでは不足 → モバイルはストリートビュー節を省く
onclone での box-shadow/transform/filter 除去＋MAX_PIXELS圧縮（scale 0.87→0.74）を入れても、**794×4994・SV16枚のルートは iPhone 実機で依然90秒タイムアウト**（`renderStart … s=0.74 > ERROR@90762ms`）。html2canvas はこのDOM規模自体が重い。
→ **対策: `_pdfConstrained`（スマホ）では曲がり角のストリートビュー節（`buildTurnPointsHtml`＝SV16枚・高さの大半）を丸ごと省き、「PC版でつきます」の一言に置換。** 地図全体像＋区間フロー＋スポット一覧の核は維持。これで画像20→~4枚・高さ大幅減となり描画が現実的な時間に収まる。SV写真が要る場合はPCでDL。

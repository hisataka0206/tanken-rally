# キャラ複雑さ実測ツール（[[ポケモン]]Gen1 × [[テクタン]]比較）

「デザインの複雑さ」を**実画像から数値化**し、**役割バケットごとに集計**するツール一式。
[[ポケモン]]151体を役割別に測って"格↔複雑さの連動"を実測し、[[テクタン]]の[[キャラ生成]]（レア度別の情報量設計）の目標値にする。

## ファイル
- `character_complexity.py` … 実測本体（PIL + numpy のみ／scipy不要）。
- `gen1_roles.csv` … Gen1(151) の**役割マップ**（dex, name, role, stage, bst）。role は zako/bug_fast/cute/cool/starter/solo/pseudo/legend/gag。
- `tekutan_baseline_metrics.csv` … テクタン既存キャラ（discoveryポーズ）の実測値＝**自分側の基準**。

## 測る指標（各画像・透過PNG推奨）
| 指標 | 意味 |
|---|---|
| occupancy | キャラ面積÷画像（大きさ） |
| eff_colors | 有効色数（面積1%以上の色・k=64量子化） |
| regions / small_regions | 塗り分け領域数（粗パレットの連結成分）／細パッチ数 |
| contour | 輪郭複雑度 = 周囲長 / (2√(π·面積))　真円=1.0、突起で>1 |
| solidity | 面積÷凸包（1.0=単純な凸／翼・角で低下）＝**可読性ガード**に使う |
| symmetry | 左右対称スコア（0〜1） |
| edge_density | 内部エッジ密度（線の多さ） |
| complexity | 総合スコア（上記を正規化した加重和・目安） |

## 使い方

### 1) テクタン自身を測る（基準値）
```
python3 tools/character_complexity.py src/assets/characters --out tekutan.csv
```

### 2) ポケモンGen1を「役割バケット」で実測する
PokéAPIの**公式アートワーク**（透過PNG・フラット寄りで最適）を151枚ダウンロードして測る。
※ ダウンロードはお使いのMacで実行（curlはローカルなら自由）。

```
mkdir -p gen1
for i in $(seq 1 151); do
  curl -sL "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/$i.png" -o "gen1/$i.png"
done
python3 tools/character_complexity.py gen1 --roles tools/gen1_roles.csv --out gen1_metrics.csv
```
→ 末尾に**役割バケット別の平均**（zako/cute/cool/…/legend）が出る。`gen1_metrics.csv` に全151の実測値。

## 読み方（テクタン設計への落とし込み）
- **役割が上がる（zako→legend）ほど eff_colors・regions・contour が上がる**はず＝"格↔複雑さの連動"を実測で確認できる。この階段を[[レア度]]（common→legend）の目標帯に写す。
- **solidity（可読性）は格が上がっても下げすぎない**のがポケモン流（"丸い芯"）。テクタンのlegendも同様に。
- `tekutan_baseline_metrics.csv` と Gen1 の数値を並べ、**テクタンが各役割帯に対して"盛りすぎ/シンプルすぎ"どちらか**を判定して調整する。

※ 役割分類（gen1_roles.csv）はデザイン観点の判断を含む（例: Gengar=cool, Magikarp=gag）。異論があれば role 列を書き換えれば集計に即反映される。

## measure-visible-text.js — 画面の文字数をブラウザ実測する

`docs/ui-text-minimization-design.md` の目標判定に使う計測ツール。
ソース解析ではなく**実DOMに問い合わせる**ため、JS が実行時に書いた文字・折りたたみ・
条件表示をすべて正しく扱える。

使い方:
1. 計測したい画面をブラウザで開く（beta 環境で可）
2. DevTools のコンソールにファイルの中身を貼って実行
3. 画面ごとの表と合計が出る。画面を切り替えたら `tekutanMeasure()` を再実行

出力には駅名・スポット名などの固有名詞が含まれる。目標判定では固有名詞と
ユーザー入力を除外して数えること（Doc §3-2）。

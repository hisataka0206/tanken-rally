# [[thesis]] — 生成AIキャラクリの限界と人手設計ロスターの比較研究

このディレクトリは、[[テクタン]]（[[たんけんラリー]]）のキャラ生成改善のために行った研究一式。

> ## ★研究の記録は `research-log.md` にある
> 仮説・目的・実験計画・結果・判定・次の仮説は、**すべて `research-log.md`** に1回1エントリで記録する。
> **本ファイル（README）はルールとディレクトリ構成のみ**を扱う。研究の中身は書かない。

---

## 1. 研究の進め方（このプロジェクトの規律）

本プロジェクトは**仮説駆動**で進める。思いつきで施策を実装しない。

```
研究主題（AIで素晴らしいキャラを生み出し続ける）
  ↓
① 主題を支える【仮説】を1つ立てる
  ↓
② その仮説を検証する【実験計画】を立てる
   ・測定する量、判定基準、必要サンプル数を【事前に】決める
   ・是のとき／非のとき、それぞれ次に何を問うかも【事前に】決めておく
  ↓
③ 実験を実施し【是 / 非 / 判定不能】を判定する
  ↓
④ 結果を踏まえて【次の仮説】を立てる
   ・是 → その成立を前提に、一段深い問いへ
   ・非 → 否定された内容を踏まえ、別の説明を問う
   ・判定不能 → 検出力・交絡を直して問い直す（新しい問いに逃げない）
  ↓
①へ戻る（主題に到達するまで反復）
```

### 守る規則

1. **事前登録**: 判定基準・必要nは実験の前に書く。結果を見てから基準を決めない。
2. **分岐の事前設計**: 是／非の両方について、次の仮説を先に書く。後付けの正当化を防ぐ。
3. **判定不能を是と呼ばない**: 検出力不足は「効果なし」でも「効果あり」でもない。
4. **未検証の代理指標を最適化しない**: 代理を使うなら、先にその妥当性を検証する。
5. **否定結果を残す**: 反証された仮説は消さず、判定と根拠を記録する。
6. **交絡を先に潰す**: ランダム化した2群をそのまま比べない。1軸だけ振る。
7. **指標を変えたら過去の判定を再計算する**: 測定側のバグは判定を反転させうる（実例あり）。
8. **記録は `research-log.md` に集約する**: 新しいMDファイルを増やさない。詳細分析は付録に置いてよいが、**結論と判定は必ず research-log.md へ書き戻す**。

### 記録のフォーマット（`research-log.md`）

1回の検証につき1エントリ。**そのエントリだけ読めば完結する**ように書く（冗長でよい）。

```
# L-00N ／ YYYY-MM-DD ／ タイトル
## 位置づけ      … どの主仮説・下位仮説か／なぜ今これをやるのか
## 仮説          … 検証する命題
## 目的          … 何が分かると何が前に進むか
## 実験計画      … 測定する量／手続き／必要n／判定基準／是・非それぞれの分岐（事前登録）
## 実施          … 実際に何をしたか
## 結果          … 数値
## 判定          … 是 / 非 / 判定不能 ＋ 理由
## そこから決めたこと … 次の仮説／却下した案とその理由
## 材料          … スクリプト・データのパス
```

### 提案・議論のトーン

施策の提案は必ず「**どの仮説を検証するためか**」から始める。
「次は◯◯を実装しましょう」ではなく「**主仮説A/B/C のどれを進めるために、下位仮説◯を検証する。そのための実験が◯◯**」の形にする。

---

## 2. ディレクトリ構成

```
research/character-silhouette-study/
├── README.md                  # 本ファイル（ルールとディレクトリ構成のみ）
├── research-log.md            # ★研究の正本（主仮説・全記録・現在地）
│
├── research-thesis.md         # 付録: 研究主題と「素晴らしさ」の6基準・杉森建の哲学
├── ai-vs-creator-gap.md       # 付録: 障壁の分析と残差測定の設計
│
├── paper/
│   ├── draft-outline.md       # 論文骨子（構成・タイトル案・投稿実務メモ）
│   └── draft-full.md          # 英語フルドラフト＋日本語要約 ※引用は[TODO-CITE]のまま
│
├── analysis/                  # 参照ロスターの分析
│   ├── reference-standard.md  # 1025体の統計解析（基準の確立）
│   ├── embedding-validation-memo.md # 否定結果の記録
│   ├── measure_roster.py      # 1025体の指標測定
│   ├── stats_battery{,2,3}.py # 検定バッテリー
│   ├── recompute_canonical.py # 全ランを統一手法で再測定
│   ├── rarity_control_check.py# レア度交絡の分解
│   ├── make_silhouettes.py    # 正規化シルエット生成
│   └── embed_analysis.py / embed_followup.py # 埋め込み距離の分析
│
├── experiment/                # 測定装置と実験
│   ├── README.md              # 実験の操作手順
│   ├── silhouette-quiz.html   # 人間用の測定装置（3択・記憶テスト）
│   ├── machine_quiz.py / run_machine_quiz.py # 機械用の測定装置（検索課題）
│   ├── make_stimuli.py        # 刺激生成
│   ├── select_memory_set.py   # 固定項目セットの層化抽出
│   ├── memorability_proxies.py# 記憶可能性の候補指標
│   ├── analyze_quiz.py        # 人間データの分析
│   ├── results-machine-quiz.md# 機械クイズの結果
│   ├── stimuli/ results/ work/ results_machine/  # 生成物（一部gitignore）
│   └── memory_set.json        # 固定項目セット
│
└── data/
    ├── manifest.json          # 各実験の条件・n数・レア度構成・エラー・プロンプト版
    ├── canonical_metrics.json # ★全ランを統一手法で測り直した正データ
    ├── roster_metrics.csv     # 参照1025体の測定値
    ├── runs/<実験名>/results.json   # 生の測定結果（指標・プロンプト全文）
    ├── silhouettes/<実験名>/  # 正規化シルエット（gitignore・再生成可能）
    └── zip/                   # char-lab の生成結果ZIP（gitignore・約319MB）
```

### リポジトリ内の関連ファイル（重複を避けるため移動していない）

| パス | 役割 |
|---|---|
| `../char-lab.html` | **生成ハーネス**（生成→cutout→シルエット→指標をブラウザで実行） |
| `../docs/30-research/char-lab-howto.md` | char-lab の操作手順・sweep設計 |
| `../docs/10-specs/character-form-first-design.md` | 介入の設計原則（14フォルム・形に出る特徴） |
| `../docs/30-research/pokemon-character-design-analysis.md` | 参照ロスターの役割分担分析 |
| `../docs/10-specs/character-image-generation-rules.md` | negation backfire の一次記録 |
| `../tools/character_complexity.py` | 形状・表面指標の実装（Python版） |
| `../tools/silhouette_cluster.py` | 1025体シルエットのクラスタリング → 14フォルム導出 |
| `../tools/gen1_roles.csv` | 公式アート151点の役割ラベル |
| `../docs/30-research/character-taxonomy/` | 記述語彙DB・5軸分析（公式体型・rarity・色・タイプ） |

---

## 3. 再現手順

```bash
# 参照ロスター1025体の測定 → 統計解析
python3 analysis/measure_roster.py
python3 analysis/stats_battery.py && python3 analysis/stats_battery2.py && python3 analysis/stats_battery3.py

# 全ランを統一手法で測り直す（指標を変えたら必ず実行）
python3 analysis/recompute_canonical.py

# 実験刺激の生成 → 機械クイズ（人手不要）
cd experiment
python3 make_stimuli.py --ref-n 40 --min-dex 650
python3 run_machine_quiz.py --name reference --color ../../pokemon_all --sil work/ref_sil   # 完了まで数回実行
python3 run_machine_quiz.py --name generated --color work/gen_color --sil work/gen_sil

# 記憶可能性の候補指標 → 固定項目セット
python3 memorability_proxies.py
python3 select_memory_set.py --n-study 50 --seed 0

# 人間用の測定装置（ローカルサーバ経由で開く）
cd ../..
python3 -m http.server 8080
#   → http://localhost:8080/research/character-silhouette-study/experiment/silhouette-quiz.html
python3 research/character-silhouette-study/experiment/analyze_quiz.py 'research/character-silhouette-study/experiment/results/*.json'
```

依存: `numpy`, `Pillow`（指標）／ `torch`, `timm`（埋め込み）／ `scipy`, `scikit-learn`（検定）

---

## 4. [[IP]]・倫理上の取り扱い

- 参照ロスター（ポケモン）の**著作物イラストはコミットせず、論文にも転載しない**。公開するのは**導出した統計値**と**自作の生成物**のみ。
- 実験刺激（参照由来のシルエット）も再配布しない。`make_stimuli.py` を配れば第三者が同じ刺激を再現できる。
- 生成に使ったスプライト類・ZIPは `.gitignore` でローカル限定（`gen1/`, `pokemon_all/`, `research/character-silhouette-study/data/zip/`, `research/character-silhouette-study/experiment/stimuli/`）。
- 子ども向けサービス由来のため、生成物のモデレーション方針は論文の Ethics 節で言及する。
- **投稿前の必須条件**: `paper/draft-full.md` の `[TODO-CITE]` を実在文献で埋めること。**捏造しない。**

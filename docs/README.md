# [[たんけんラリー]] ドキュメント地図

`docs/` は番号付きカテゴリで整理している（englishLearningApp と同じ方式）。データ重めの調査は直下の `research/` に、ローカル専用の生成物は `_local/` にある。

## 00-business — 事業・企画

| ファイル | 内容 |
|---|---|
| product-proposal.md | [[企画書]]（旧 企画書.md） |
| value-proposition.md | 価値提案 |
| public-release-plan.md | 一般公開計画 |
| cm-howto-storyboard.md | CM 絵コンテの作り方 |
| cm-video-storyline.md | CM 動画のストーリーライン |

## 10-specs — 仕様・設計

| ファイル | 内容 |
|---|---|
| spec-overview.md | [[仕様書]]（旧 仕様書.md） |
| requirements-classification.md | [[要求分類表]]（旧 要求分類表.md） |
| character-auto-generation-spec.md | キャラ自動生成の仕様 |
| character-image-generation-rules.md | キャラ画像生成ルール |
| character-form-first-design.md | フォルム起点の設計 |
| character-generation-flow.mermaid | 生成フロー図 |
| characters-story.md | キャラのストーリー設定 |
| ar-character-capture-spec.md | ARキャラ捕獲の仕様 |
| ui-character-guide-spec.md | UIキャラ案内の仕様 |
| ui-redesign-concept.md | UI再設計の全体構想 |
| ui-text-minimization-design.md | [[UI文字量最小化]]の設計 |
| tanken_rally_fr_nfr_chart.png | 機能/非機能要件チャート |
| tekutan_character_catalog_by_rarity.pdf | レア度別キャラカタログ |

## 20-plans — 計画・進捗

| ファイル | 内容 |
|---|---|
| dev-log.md | [[開発日誌]]（旧 開発日誌.md） |
| IMPROVEMENTS.md | 改善計画 |

## 30-research — 調査・分析

| ファイル | 内容 |
|---|---|
| pokemon-character-design-analysis.md | ポケモンのキャラデザ分析 |
| character-taxonomy/ | キャラ分類（語彙DB・5軸分析） |
| pdf-map-performance-postmortem.md | 地図PDF性能の[[ポストモーテム]] |
| char-lab-howto.md | char-lab ツールの使い方 |
| trial-feedback-2026-07-12.md | トライアルの[[ユーザーフィードバック]] |

## 40-tests — テスト

| ファイル | 内容 |
|---|---|
| test-spec.md | [[テスト仕様書]]（§0 運用フロー〜§14） |
| test-report-2026-07-20.md | [[テスト結果報告書]]（build 8acfef75） |

---

## 関連（docs 外）

- `research/anime-pilgrimage/` — [[聖地巡礼]]データ（AniTabi由来・CC-NC・非商用）
- `research/character-silhouette-study/` — キャラ[[シルエット研究]]（旧 thesis/）
- `_local/` — 分析PNG・スプライトdump 等のローカル専用生成物（.gitignore対象）

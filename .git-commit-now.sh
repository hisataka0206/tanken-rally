#!/bin/bash
# Cowork セッションで残った git ロックを解除して
# 累積した変更をコミット & push する一発スクリプト
set -e
cd "$(dirname "$0")"

if [ -f .git/index.lock ]; then
  echo "Removing stale .git/index.lock..."
  rm -f .git/index.lock
fi

# すべての変更をステージ
git add -A
git status --short

git commit -m "feat: たんけんノート(STEP5)・カテゴリ拡張・ブロック機能ほか多数の改善

UI / UX:
- デフォルト都市タブを名古屋市・桜通線に変更
- 駅選択画面に免責事項を追加
- カテゴリ拡張：玩具・美術館・博物館・科学館 を追加
- スポット一覧にカテゴリチップ式フィルタUIを追加
- スポットカードに削除ボタンを追加（不適切な場所をブロック）
- フォントを子供向け（Yusei Magic + Klee One）に変更

たんけんノート機能 (STEP 5):
- B3 用紙、写真ハガキサイズ envelope (148mm)
- 写真の縦横比を JS で mm 指定して PDF崩れを防止
- 横長写真は写真下にコメント（CSS landscape クラス）
- 2列グリッド配置で視認性アップ
- 行った順に並ぶ写真リスト
- 写真ごとの 1行コメント欄（resize: vertical）
- 冒頭の感想欄、末尾の振り返り欄
- 日時（手入力）・記載者・駅メタ情報
- jsPDF + html2canvas で B3 PDF出力（複数ページ自動分割）
- document.fonts.ready 待機で Webフォントを確実にPDFへ反映
- PDF出力時のみエディタUI（チェックボックス・ヒント等）を非表示

写真機能:
- 撮影後にタップでタグ付け（モーダル）
- STEP 4 で取捨選択トグル（✅⬜）。除外写真はノートに含まれない
- 「タグなし」表記は PDF では非表示

検索の信頼性向上:
- 駅名検索に都市名・路線名コンテキストを付与
  (例: 名古屋市の吹上駅 vs 東京の吹上駅 を区別)
- 不適切スポット (学習塾・予備校 等) のブロック機能
  - localStorage 永続化 (utils/blocked.js)
  - デフォルトNGキーワードを内蔵
  - ユーザーが個別に削除した場所も今後の検索で除外

バグ修正:
- onStartExploreでselectedPhotoIds.clear()漏れ
- Drive uc?id= URL の CORS 問題で html2canvas が失敗していた件:
  ローカル blob URL を保持し続けて表示 / PDF生成に使用

エラーハンドリング:
- gas/Code.gs: getRootFolder / createSession に詳細エラー
- main.js: drive クライアント状態と CONFIG.GAS_URL を console に出力

キャッシュバスター: ?v=17 → ?v=30, style.css ?v=8 → ?v=19

Refs: todo.md"

git push origin main
echo "✅ コミット & push 完了"

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

git commit -m "feat: たんけんノート(STEP5)・ブロック機能・GitHub Pages 自動デプロイ

UI / UX:
- デフォルト都市タブを名古屋市・桜通線に変更
- 駅選択画面に免責事項を追加
- カテゴリ拡張：玩具・美術館・博物館・科学館 を追加
- スポット一覧にカテゴリチップ式フィルタUIを追加
- スポットカードに削除ボタンを追加
- フォントを子供向け（Yusei Magic + Klee One）に変更

たんけんノート機能 (STEP 5):
- B3 用紙、写真ハガキサイズ envelope (148mm) で 2列グリッド配置
- 写真の縦横比を JS で mm 指定し、PDF崩れを防止
- 写真ごとの 1行コメント欄、感想欄、振り返り欄
- 日時・記載者・駅メタ情報
- jsPDF + html2canvas で B3 PDF出力（複数ページ自動分割）
- document.fonts.ready 待機で Webフォントを確実にPDFへ反映
- PDF時のみエディタUI（チェックボックス等）を非表示

写真機能:
- 撮影後にタップでタグ付け（モーダル）
- STEP 4 で取捨選択トグル（✅⬜）
- Drive uc?id= の CORS 問題を blob URL 維持で回避

検索の信頼性向上:
- 駅名検索に都市名・路線名コンテキストを付与
  (例: 名古屋の吹上駅 vs 東京の吹上駅 を区別)
- 不適切スポット (学習塾・予備校 等) のブロック機能
  - localStorage 永続化 (utils/blocked.js)
  - デフォルトNGキーワード内蔵
  - ユーザー個別削除も今後の検索で除外

GitHub Pages 自動デプロイ:
- .github/workflows/deploy.yml を追加
  - main への push で自動デプロイ
  - GitHub Secrets から config.js を生成
- .nojekyll 追加
- README に GitHub Pages 手順 + APIキー漏洩対策を追記
- ai.js: OPENAI_API_KEY 空時の早期リターン

その他:
- gas/Code.gs: 詳細エラー
- main.js: drive クライアント状態を console 出力
- onStartExploreでselectedPhotoIds.clear()漏れ修正
- キャッシュバスター: ?v=17 → ?v=30, style.css ?v=8 → ?v=19

Refs: todo.md"

git push origin main
echo "✅ コミット & push 完了"
echo ""
echo "📌 GitHub Pages を有効化するには:"
echo "  1. GitHub で Settings → Pages → Source を 'GitHub Actions' に切替"
echo "  2. Settings → Secrets and variables → Actions で4つの Secret を登録:"
echo "     GOOGLE_MAPS_API_KEY / OPENAI_API_KEY / GAS_URL / GAS_SECRET"
echo "  3. Settings → Pages の URL でデプロイ完了を確認"
echo ""
echo "🔒 必読: README.md の 'API キー漏洩対策' セクションで"
echo "   Google Maps キーの HTTPリファラ制限を必ず設定してください。"

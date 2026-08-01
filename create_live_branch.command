#!/bin/bash
# create_live_branch.command
# tanken-rally: beta を起点に live ブランチを作成して origin へ push する。
# 目的: Netlify のブランチデプロイ live--tekutan.netlify.app を発行する。
# 起点: origin/beta（現在の最新開発版）。main は凍結（触らない）。
# 実行: Finder でダブルクリック、または `bash create_live_branch.command`

set -euo pipefail

REPO="/Users/hisatakamac/work/tanken-rally"
BASE="beta"      # 起点ブランチ（先行している最新版）
TARGET="live"    # 作成する公開用ブランチ

cd "$REPO"

echo "==> repo: $REPO"
echo "==> リモート最新を取得 (fetch)"
git fetch origin --prune

# origin/beta が存在するか確認
if ! git show-ref --verify --quiet "refs/remotes/origin/$BASE"; then
  echo "!! origin/$BASE が見つかりません。中止します。"
  exit 1
fi

# live が既にある場合の扱い
if git show-ref --verify --quiet "refs/remotes/origin/$TARGET"; then
  echo "!! origin/$TARGET は既に存在します。既存を尊重して何もしません。"
  echo "   （作り直したい場合は手動で削除してから再実行してください）"
  exit 0
fi

echo "==> origin/$BASE を起点に $TARGET を作成"
if git show-ref --verify --quiet "refs/heads/$TARGET"; then
  echo "   ローカルに $TARGET が既にあります。origin/$BASE に合わせて作り直します。"
  git branch -f "$TARGET" "origin/$BASE"
else
  git branch "$TARGET" "origin/$BASE"
fi

echo "==> $TARGET を origin へ push（upstream 設定）"
git push -u origin "$TARGET"

echo ""
echo "==> 完了。現在のブランチ:"
git branch --show-current
echo ""
echo "確認:"
echo "  - Netlify が live のビルドを開始 → https://live--tekutan.netlify.app"
echo "  - beta は既存: https://beta--tekutan.netlify.app"
echo ""
echo "注意: この後 Google Maps API キーの HTTP リファラーに以下を追加してください（未追加だと地図が真っ白）:"
echo "  https://live--tekutan.netlify.app/*"
echo "  https://beta--tekutan.netlify.app/*"

read -n 1 -s -r -p "Enter/任意のキーで閉じます..."
echo ""

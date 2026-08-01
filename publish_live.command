#!/bin/bash
# publish_live.command
# tanken-rally: 公開フロー「beta → live」を1操作で実行する。
#   1. beta を push（開発の最新をリモートへ）
#   2. live に切替えて beta を反映し push（= live--tekutan.netlify.app が更新・無料）
#   3. 必ず beta に戻して終了（普段は beta だけで作業できるように）
# main（本番・15クレジット）には一切触れない。
# 実行: Finder でダブルクリック、または `bash publish_live.command`

set -euo pipefail

REPO="/Users/hisatakamac/work/tanken-rally"
DEV="beta"     # 開発ブランチ（普段ここで作業）
PUB="live"     # 公開ブランチ（live--tekutan.netlify.app）

cd "$REPO"

# --- どんな終わり方をしても beta に戻す ---
return_to_dev() {
  git checkout "$DEV" >/dev/null 2>&1 || true
}
trap return_to_dev EXIT

echo "==> repo: $REPO"

# 1. 未コミットの変更があれば中止（ブランチ切替の事故防止）
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "!! 未コミットの変更があります。先に beta でコミットしてください。中止します。"
  echo "--- 変更中のファイル ---"
  git status --short
  exit 1
fi

echo "==> リモート最新を取得 (fetch)"
git fetch origin --prune

# 2. beta を最新化して push
git checkout "$DEV"
echo "==> beta を push"
git push origin "$DEV"

# 3. live に反映
echo "==> live に切替えて beta を反映"
git checkout "$PUB"
git pull --ff-only origin "$PUB" 2>/dev/null || true   # 既存の live を取り込む（あれば）

if git merge --ff-only "$DEV" 2>/dev/null; then
  echo "   fast-forward で反映"
else
  echo "   fast-forward 不可 → マージコミットで反映"
  if ! git merge --no-edit "$DEV"; then
    echo "!! マージ競合が発生しました。中止して beta に戻ります。"
    echo "   競合を解消してから再実行してください。"
    git merge --abort 2>/dev/null || true
    exit 1
  fi
fi

echo "==> live を push"
git push origin "$PUB"

# 4. beta に戻る（trap でも保証しているが明示）
git checkout "$DEV"

echo ""
echo "==> 公開完了。ビルド後に反映されます（無料・無制限）:"
echo "    https://live--tekutan.netlify.app"
echo ""
echo "現在のブランチ:"
git branch --show-current

read -n 1 -s -r -p "Enter/任意のキーで閉じます..."
echo ""

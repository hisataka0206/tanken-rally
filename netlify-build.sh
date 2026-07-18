#!/usr/bin/env bash
# Netlify ビルド：実行ファイルだけを dist/ に集め、config.js を環境変数から生成し、
# キャッシュバスター ?v= をコミットSHA(8桁)へ統一する。
# GitHub Actions(deploy.yml) の役割を Netlify 側に移したもの。
set -euo pipefail

DIST="dist"
rm -rf "$DIST"
mkdir -p "$DIST"

# --- 1) 公開する実行ファイルだけをコピー（ソース/検証ファイルは含めない） ---
#   含める : index.html / policy.html / 404.html / src/（アプリ本体）
#   含めない: gas/ docs/ config.example.js README.md requirements.md todo.md
#            test-gen.html variant-preview.html LICENSE .github/  ← 公開しない
cp index.html policy.html 404.html "$DIST"/
cp -r src "$DIST"/src

# --- 2) config.js を Netlify 環境変数から生成（GitHub Actions と同等・リポジトリには残さない） ---
cat > "$DIST/config.js" << EOF
// Auto-generated during Netlify build. Do NOT commit.
export const CONFIG = {
  GOOGLE_MAPS_API_KEY: '${GOOGLE_MAPS_API_KEY}',
  GAS_URL: '${GAS_URL}',
  GAS_SECRET: '${GAS_SECRET}',
};
// OpenAI/Gemini キーはクライアントに出さない（GAS Script Property に保持）。
EOF
echo "config.js generated from env vars"

# --- 3) 全アセットの ?v=... をこのデプロイのコミットSHA(8桁)へ書き換え ---
SHA="${COMMIT_REF:-manual}"
SHA="${SHA:0:8}"
find "$DIST" -type f \( -name '*.js' -o -name '*.html' -o -name '*.css' \) -print0 \
  | xargs -0 --no-run-if-empty sed -i "s/?v=[0-9A-Za-z._-]*/?v=${SHA}/g"
echo "Stamped all assets with ?v=${SHA}"

echo "Build complete → $DIST"

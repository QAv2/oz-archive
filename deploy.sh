#!/usr/bin/env bash
# Deploy oz-archive to Neocities (oz-archive.neocities.org)
# Requires NEOCITIES_API_KEY in ~/.env

set -euo pipefail

source ~/.env

if [ -z "${NEOCITIES_API_KEY:-}" ]; then
  echo "ERROR: NEOCITIES_API_KEY not set in ~/.env"
  exit 1
fi

API="https://neocities.org/api"
AUTH="Authorization: Bearer $NEOCITIES_API_KEY"

upload() {
  local file="$1"
  echo "  uploading $file ..."
  curl -s -F "$file=@$file" -H "$AUTH" "$API/upload"
}

cd "$(dirname "$0")"

echo "=== Deploying oz-archive to Neocities ==="

# Upload HTML
upload "index.html"

# Upload CSS
for f in css/*.css; do
  upload "$f"
done

# Upload JS
for f in js/*.js; do
  upload "$f"
done

# Upload shaders
for f in js/shaders/*.js; do
  upload "$f"
done

# Upload fonts
for f in fonts/*; do
  upload "$f"
done

# Upload textures
for f in textures/*; do
  upload "$f"
done

echo ""
echo "=== Deploy complete: https://oz-archive.neocities.org ==="

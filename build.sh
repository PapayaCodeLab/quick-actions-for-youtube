#!/usr/bin/env bash
# Packt genau die Dateien, die in den Chrome Web Store hochgeladen werden.
# Aufruf:  ./build.sh   ->  dist/quick-actions-for-youtube-<version>.zip
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/quick-actions-for-youtube-$VERSION.zip"

FILES=(
  manifest.json
  bridge.js content.js i18n.js emoji-data.js
  icons.json
  options.html options.js
  styles.css
  icons
  assets
  THIRD-PARTY.md
)

for f in "${FILES[@]}"; do
  [ -e "$f" ] || { echo "FEHLT: $f" >&2; exit 1; }
done

mkdir -p dist && rm -f "$OUT"
zip -r -q -X "$OUT" "${FILES[@]}" -x '*.DS_Store'
echo "$OUT  ($(du -h "$OUT" | cut -f1))"
unzip -Z1 "$OUT" | sed 's/^/  /'

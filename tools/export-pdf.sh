#!/usr/bin/env bash
# One 16:9 PDF page per slide, via headless Chrome.
#
# The deck's print stylesheet does the work: each .slide becomes a
# 13.333in x 7.5in page, arrival animations are frozen in their finished
# state, every build step is fully built, and the presentation chrome is
# dropped. Charts re-render on beforeprint so they are drawn, not blank.
#
#   ./tools/export-pdf.sh            the deck
#   ./tools/export-pdf.sh library    the pattern library
set -euo pipefail

TARGET="${1:-deck}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/$TARGET/$TARGET.pdf"

CHROME=""
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)"
do
  if [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; break; fi
done

if [ -z "$CHROME" ]; then
  echo "No Chrome, Edge or Chromium found. Install one, or print to PDF from the browser." >&2
  exit 1
fi

# Served over http, not file://, so the fonts and JSON chart configs load
# under the same origin rules the deck uses when presenting.
PORT=8931
python3 -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
sleep 1

"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=12000 \
  --print-to-pdf="$OUT" \
  "http://localhost:$PORT/$TARGET/" >/dev/null 2>&1

echo "Wrote $OUT"

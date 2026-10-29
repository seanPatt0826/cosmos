#!/bin/sh
# Deploys the last commit to Cloudflare.
#
#   sh tools/deploy.sh          deploy
#   sh tools/deploy.sh dev      the same build, served locally on :8787
#
# It exports HEAD into a temporary folder and deploys from there, so files
# that are edited but not committed (someone else's work in progress) never
# go live. Commit first, then deploy. Needs `npx wrangler@4.146.0 login` once.
#
# Only the paths in SITE are published (into dist/, see wrangler.jsonc). A new
# top-level page or file, such as ads.txt, has to be added here.

set -e
SITE="index.html about.html privacy.html src assets"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

mkdir "$OUT/dist"
# The worker also needs the docking rules and the palette they use, which
# live with the site's scripts.
git -C "$ROOT" archive HEAD worker wrangler.jsonc src/dock src/config.js | tar -x -C "$OUT"
git -C "$ROOT" archive HEAD $SITE | tar -x -C "$OUT/dist"
cd "$OUT"
echo "Building $(git -C "$ROOT" log --oneline -1)"
if [ "$1" = dev ]; then
  npx --yes wrangler@4.146.0 dev --port 8787
else
  npx --yes wrangler@4.146.0 deploy
fi

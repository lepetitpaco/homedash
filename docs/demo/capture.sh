#!/bin/sh
# Captures de docs/screenshots/ : la vraie page sur une instance de démo, données fictives.
# Tout dans Docker (rien à installer) ; tes données ne sont pas touchées.
#
#   sh docs/demo/capture.sh                   toutes
#   ONLY=accueil,github sh docs/demo/capture.sh
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEMO=homedash-demo
docker rm -f $DEMO >/dev/null 2>&1 || true
# L'instance de démo : serveur + Vite, sur une copie de docs/demo/data
docker run -d --name $DEMO -v "$ROOT":/app -w /app \
  -e DATA_DIR=/tmp/demo-data -e PORT=7791 -e HOST=127.0.0.1 -e HOMEDASH_API=http://127.0.0.1:7791 -e TZ=Europe/Paris \
  node:24-alpine sh -c "rm -rf /tmp/demo-data && cp -r docs/demo/data /tmp/demo-data && \
    (node server/main.ts & npx vite --host 127.0.0.1 --port 7790 --strictPort)" >/dev/null
trap 'docker rm -f $DEMO >/dev/null' EXIT
# Chromium dans le même réseau que l'instance
docker run --rm --network container:$DEMO -e ONLY -v "$ROOT":/app -w /tmp mcr.microsoft.com/playwright:v1.50.0-noble sh -c '
  npm i -s playwright@1.50.0 >/dev/null 2>&1
  for i in $(seq 60); do curl -sf http://localhost:7790/ >/dev/null && break; sleep 1; done
  cp /app/docs/demo/*.mjs /tmp/ && sed -i "s#path.join(HERE, .\.\.., .screenshots.)#\"/app/docs/screenshots\"#" /tmp/capture.mjs
  node /tmp/capture.mjs'

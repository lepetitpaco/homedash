#!/bin/sh
# Assemble desktop/app/ : tout ce que contient l'appli.
#   main.js, preload.js, guest-preload.js, server.js, updater.js, package.json
#   server/   le serveur compilé (tsc → dist-server/), modules ESM
#   public/   le front compilé (vite → dist/), et les captures du guide sous guide/
#   CHANGELOG.md, GUIDE.md
# Le front et le serveur doivent être construits avant : `npm run build` à la racine.
set -eu
cd "$(dirname "$0")"
ROOT=..
[ -f "$ROOT/dist/index.html" ] || { echo "✗ front absent : npm run build à la racine"; exit 1; }
[ -f "$ROOT/dist-server/host.js" ] || { echo "✗ serveur absent : npm run build à la racine"; exit 1; }
rm -rf app build && mkdir -p app/server app/public build
cp main.js preload.js guest-preload.js server.js updater.js release.js app/
# package.json de l'appli : sans dépendances, seulement ce qu'Electron lit.
node -e "const p=require('./package.json');require('fs').writeFileSync('app/package.json',JSON.stringify({name:p.name,productName:p.productName,version:p.version,description:p.description,main:p.main,author:p.author,homepage:p.homepage},null,2))"
cp "$ROOT"/dist-server/*.js app/server/
printf '{ "type": "module" }\n' > app/server/package.json
cp -R "$ROOT"/dist/. app/public/
mkdir -p app/public/guide && cp -R "$ROOT"/docs/screenshots/. app/public/guide/ 2>/dev/null || true
cp "$ROOT"/CHANGELOG.md "$ROOT"/GUIDE.md app/
cp "$ROOT"/public/icon-512.png build/icon.png
# aussi dans l'appli : icône près de l'horloge (Windows) et du Dock
cp "$ROOT"/public/icon-512.png app/icon.png
echo "✓ desktop/app assemblée (version $(node -p "require('./package.json').version"))"

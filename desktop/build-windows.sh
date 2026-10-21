#!/bin/sh
# Construit l'appli de bureau pour Windows (x64), depuis un Mac ou un Linux :
# tout passe par Docker (Node, NSIS), aucune machine Windows nécessaire.
#
#   sh desktop/build-windows.sh   → desktop/dist.noindex/homedash-<version>-win-x64-setup.exe
#                                   et homedash-<version>-win-x64.zip (sans installation)
#
# L'installateur s'installe pour l'utilisateur seul (pas de droits admin), avec
# un raccourci dans le menu Démarrer et un désinstalleur. Non signé : Windows
# affiche « Windows a protégé votre ordinateur » au premier lancement
# (Informations complémentaires → Exécuter quand même).
set -eu
cd "$(dirname "$0")"
ELECTRON=$(sed -n 's/.*"electron": "\([^"]*\)".*/\1/p' package.json)
APP_VERSION=${APP_VERSION:-$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' package.json)}

# Icône : le PNG de la PWA en plusieurs tailles, réunies dans un .ico.
rm -rf build-win && mkdir -p build-win/ico build-win/app
for s in 16 24 32 48 64 128 256; do
  if command -v sips >/dev/null 2>&1; then
    sips -z $s $s ../public/icon-512.png --out "build-win/ico/$s.png" >/dev/null
  else
    convert ../public/icon-512.png -resize ${s}x${s} "build-win/ico/$s.png"
  fi
done
python3 - <<'EOF'
# .ico = un en-tête, puis une entrée par taille pointant vers un PNG (accepté
# par Windows depuis Vista) : rien à installer pour le fabriquer.
import struct
sizes = [16, 24, 32, 48, 64, 128, 256]
pngs = [open(f"build-win/ico/{s}.png", "rb").read() for s in sizes]
out = struct.pack("<HHH", 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
for s, data in zip(sizes, pngs):
    out += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
open("build-win/icon.ico", "wb").write(out + b"".join(pngs))
EOF

# Seuls ces fichiers vont dans l'appli (comme pour le Mac).
cp main.js preload.js guest-preload.js package.json build-win/app/
cp installer.nsi build-win/

docker run --rm -v "$PWD":/b -w /b -e ELECTRON="$ELECTRON" -e APP_VERSION="$APP_VERSION" node:22-bookworm sh -c '
  set -e
  npx -y @electron/packager@18 build-win/app homedash --platform=win32 --arch=x64 \
    --electron-version=$ELECTRON --app-version=$APP_VERSION --icon=build-win/icon.ico \
    --out=build-win/out --overwrite \
    --win32metadata.CompanyName=homedash --win32metadata.ProductName=homedash \
    --win32metadata.FileDescription=homedash
  apt-get update -qq >/dev/null && apt-get install -y -qq nsis zip >/dev/null
  mkdir -p dist.noindex
  makensis -V2 -DVERSION=$APP_VERSION -DSRC=/b/build-win/out/homedash-win32-x64 \
    -DICON=/b/build-win/icon.ico -DOUT=/b/dist.noindex/homedash-$APP_VERSION-win-x64-setup.exe build-win/installer.nsi
  rm -f dist.noindex/homedash-$APP_VERSION-win-x64.zip
  (cd build-win/out && zip -qr ../../dist.noindex/homedash-$APP_VERSION-win-x64.zip homedash-win32-x64)
'
echo "✓ $(pwd)/dist.noindex/homedash-$APP_VERSION-win-x64-setup.exe"
echo "✓ $(pwd)/dist.noindex/homedash-$APP_VERSION-win-x64.zip"

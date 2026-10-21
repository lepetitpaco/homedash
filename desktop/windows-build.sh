#!/bin/sh
# Construction Windows, DANS le container node:22-bookworm (dossier desktop/
# monté sur /b) : rien d'autre que Docker sur la machine, qu'elle soit un Mac,
# un Linux ou un Windows. Lancé par build-windows.sh ou build-windows.ps1.
set -eu
cd /b
ELECTRON=$(sed -n 's/.*"electron": "\([^"]*\)".*/\1/p' package.json)
APP_VERSION=${APP_VERSION:-$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' package.json)}

apt-get update -qq >/dev/null
apt-get install -y -qq imagemagick nsis zip >/dev/null 2>&1

# Icône : le PNG de la PWA (monté sur /public) en plusieurs tailles, réunies
# dans un .ico : un en-tête, puis une entrée par taille pointant vers un PNG
# (accepté par Windows depuis Vista).
rm -rf build-win && mkdir -p build-win/ico build-win/app
for s in 16 24 32 48 64 128 256; do
  convert /public/icon-512.png -resize ${s}x${s} "build-win/ico/$s.png"
done
python3 - <<'EOF'
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
cp main.js preload.js guest-preload.js updater.js package.json build-win/app/
npx -y @electron/packager@18 build-win/app homedash --platform=win32 --arch=x64 \
  --electron-version="$ELECTRON" --app-version="$APP_VERSION" --icon=build-win/icon.ico \
  --out=build-win/out --overwrite \
  --win32metadata.CompanyName=homedash --win32metadata.ProductName=homedash \
  --win32metadata.FileDescription=homedash

mkdir -p dist.noindex
makensis -V2 -DVERSION="$APP_VERSION" -DSRC=/b/build-win/out/homedash-win32-x64 \
  -DICON=/b/build-win/icon.ico -DOUT="/b/dist.noindex/homedash-$APP_VERSION-win-x64-setup.exe" installer.nsi
rm -f "dist.noindex/homedash-$APP_VERSION-win-x64.zip"
(cd build-win/out && zip -qr "../../dist.noindex/homedash-$APP_VERSION-win-x64.zip" homedash-win32-x64)
echo "✓ desktop/dist.noindex/homedash-$APP_VERSION-win-x64-setup.exe"
echo "✓ desktop/dist.noindex/homedash-$APP_VERSION-win-x64.zip"

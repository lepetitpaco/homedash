#!/bin/sh
# Construit l'appli de bureau sur ce Mac, sans Node ni GitHub : l'empaquetage
# tourne dans Docker (comme le front), puis l'appli est signée « ad hoc »
# (obligatoire sur Apple Silicon) avec codesign, présent sur tout Mac.
#
#   sh desktop/build-local.sh            → desktop/dist/homedash.app
#   sh desktop/build-local.sh --install  → et la copie dans /Applications
set -eu
cd "$(dirname "$0")"
ARCH=$(uname -m)                       # arm64 (Apple Silicon) ou x86_64
[ "$ARCH" = x86_64 ] && ARCH=x64
VERSION=$(sed -n 's/.*"electron": "\([^"]*\)".*/\1/p' package.json)

# Icône : le PNG de la PWA converti en .icns avec les outils de macOS.
rm -rf build/icon.iconset && mkdir -p build/icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s ../public/icon-512.png --out "build/icon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [ $d -le 512 ] && sips -z $d $d ../public/icon-512.png --out "build/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns
cp ../public/icon-512.png build/icon.png

# Seuls ces trois fichiers vont dans l'appli.
rm -rf build/app && mkdir -p build/app
cp main.js preload.js package.json build/app/
docker run --rm -v "$PWD":/b -w /b node:22-bookworm \
  npx -y @electron/packager@18 build/app homedash --platform=darwin --arch="$ARCH" \
    --electron-version="$VERSION" --icon=build/icon.icns --out=dist --overwrite \
    --app-bundle-id=com.github.davidgennaoui.homedash

APP="dist/homedash-darwin-$ARCH/homedash.app"
codesign --force --deep -s - "$APP"
echo "✓ $(pwd)/$APP"
if [ "${1:-}" = --install ]; then
  rm -rf /Applications/homedash.app
  cp -R "$APP" /Applications/
  echo "✓ installée dans /Applications"
fi

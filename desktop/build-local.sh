#!/bin/sh
# Construit l'appli de bureau sur ce Mac. L'empaquetage passe par Node s'il
# est installé (la CI GitHub), sinon par Docker (comme le front : rien à
# installer de plus). L'appli est ensuite signée « ad hoc » (obligatoire sur
# Apple Silicon) avec codesign, présent sur tout Mac.
#
#   sh desktop/build-local.sh            → desktop/dist.noindex/homedash-darwin-<arch>/homedash.app
#   sh desktop/build-local.sh --install  → et la copie dans /Applications
#   ARCH=x64 sh desktop/build-local.sh   → pour un Mac Intel (release.sh fait les deux)
#
# Une appli construite sur la machine n'est pas bloquée par macOS au premier
# lancement : seuls les fichiers téléchargés le sont.
set -eu
cd "$(dirname "$0")"
ARCH=${ARCH:-$(uname -m)}              # arm64 (Apple Silicon) ou x86_64
[ "$ARCH" = x86_64 ] && ARCH=x64
ELECTRON=$(sed -n 's/.*"electron": "\([^"]*\)".*/\1/p' package.json)
APP_VERSION=${APP_VERSION:-$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' package.json)}

# Icône : le PNG de la PWA converti en .icns avec les outils de macOS.
rm -rf build && mkdir -p build/icon.iconset build/app
for s in 16 32 128 256 512; do
  sips -z $s $s ../public/icon-512.png --out "build/icon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [ $d -le 512 ] && sips -z $d $d ../public/icon-512.png --out "build/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns

# Seuls ces fichiers vont dans l'appli.
cp main.js preload.js guest-preload.js package.json build/app/
PACK="npx -y @electron/packager@18 build/app homedash --platform=darwin --arch=$ARCH \
  --electron-version=$ELECTRON --app-version=$APP_VERSION --icon=build/icon.icns --out=dist.noindex --overwrite \
  --app-bundle-id=com.github.davidgennaoui.homedash --extend-info=Info.extra.plist"
if command -v npx >/dev/null 2>&1; then
  $PACK
else
  docker run --rm -v "$PWD":/b -w /b node:22-bookworm $PACK
fi

APP="dist.noindex/homedash-darwin-$ARCH/homedash.app"
codesign --force --deep -s - "$APP"
echo "✓ $(pwd)/$APP"
if [ "${1:-}" = --install ]; then
  rm -rf /Applications/homedash.app
  cp -R "$APP" /Applications/
  echo "✓ installée dans /Applications : lance homedash depuis le Launchpad ou Spotlight"
fi

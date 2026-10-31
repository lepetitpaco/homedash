#!/bin/sh
# Construit l'appli 2.0 sur ce Mac, pour tester avant une Release. Tout passe
# par Docker (pas de Node sur le Mac) ; seule la signature « ad hoc » (codesign,
# présent sur tout Mac) se fait ici. Les vraies versions sont construites par
# GitHub Actions (.github/workflows/release.yml).
#
#   sh desktop/build-local.sh            → desktop/dist.noindex/homedash-darwin-<arch>/homedash.app (appli normale)
#   sh desktop/build-local.sh --install  → et la copie dans /Applications (l'ancienne est remplacée)
#   ARCH=x64 sh desktop/build-local.sh   → pour un Mac Intel
#   sh desktop/build-local.sh --dev --install
#        → « homedash dev » : éclair orange, toujours ouverte sur le Docker de dev
#          (http://localhost:7778), avec son propre profil
#
# Une appli construite sur la machine n'est pas bloquée par macOS : seuls les
# fichiers téléchargés le sont.
set -eu
cd "$(dirname "$0")/.."
DEV=; INSTALL=
for a in "$@"; do
  case "$a" in
    --dev) DEV=1 ;;
    --install) INSTALL=1 ;;
  esac
done
ARCH=${ARCH:-$(uname -m)}
[ "$ARCH" = x86_64 ] && ARCH=x64
ELECTRON=$(sed -n 's/.*"electron": "\([^"]*\)".*/\1/p' desktop/package.json)
VERSION=$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' desktop/package.json)
# L'appli de dev porte un autre nom et un autre identifiant : elle cohabite avec l'appli normale.
NAME=homedash; BUNDLE=com.lepetitpaco.homedash
[ -n "$DEV" ] && { NAME='homedash dev'; BUNDLE=com.lepetitpaco.homedash.dev; }

docker run --rm -v "$PWD":/app -w /app node:24-alpine sh -c "
  npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null && sh desktop/assemble.sh &&
  if [ -n '$DEV' ]; then
    node scripts/icon-dev.mjs public/icon-512.png desktop/build/icon-dev.png >/dev/null &&
    cp desktop/build/icon-dev.png desktop/app/icon.png &&
    printf '{ \"devUrl\": \"http://localhost:7778\", \"repoDir\": \"$PWD\" }\n' > desktop/app/dev.json
  fi &&
  cd desktop && npx -y @electron/packager@18 app '$NAME' --platform=darwin --arch=$ARCH \
    --electron-version=$ELECTRON --app-version=$VERSION --out=dist.noindex --overwrite \
    --app-bundle-id=$BUNDLE --extend-info=Info.extra.plist"

# Icône : le PNG converti en .icns avec les outils de macOS (orange pour l'appli de dev).
cd desktop
ICON=../public/icon-512.png
[ -n "$DEV" ] && ICON=build/icon-dev.png
rm -rf build/icon.iconset && mkdir -p build/icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s "$ICON" --out "build/icon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [ $d -le 512 ] && sips -z $d $d "$ICON" --out "build/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns
APP="dist.noindex/$NAME-darwin-$ARCH/$NAME.app"
cp build/icon.icns "$APP/Contents/Resources/electron.icns"
codesign --force --deep -s - "$APP"
echo "✓ $(pwd)/$APP"
if [ -n "$INSTALL" ]; then
  rm -rf "/Applications/$NAME.app"
  cp -R "$APP" /Applications/
  echo "✓ installée dans /Applications"
fi

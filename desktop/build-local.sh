#!/bin/sh
# Construit l'appli 2.0 sur ce Mac, pour tester avant une Release. Tout passe
# par Docker (pas de Node sur le Mac) ; seule la signature « ad hoc » (codesign,
# présent sur tout Mac) se fait ici. Les vraies versions sont construites par
# GitHub Actions (.github/workflows/release.yml).
#
#   sh desktop/build-local.sh            → desktop/dist.noindex/homedash-darwin-<arch>/homedash.app
#   sh desktop/build-local.sh --install  → et la copie dans /Applications (l'ancienne est remplacée)
#   ARCH=x64 sh desktop/build-local.sh   → pour un Mac Intel
#
# Une appli construite sur la machine n'est pas bloquée par macOS : seuls les
# fichiers téléchargés le sont.
set -eu
cd "$(dirname "$0")/.."
ARCH=${ARCH:-$(uname -m)}
[ "$ARCH" = x86_64 ] && ARCH=x64
ELECTRON=$(sed -n 's/.*"electron": "\([^"]*\)".*/\1/p' desktop/package.json)
VERSION=$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' desktop/package.json)

docker run --rm -v "$PWD":/app -w /app node:24-alpine sh -c "
  npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null && sh desktop/assemble.sh &&
  cd desktop && npx -y @electron/packager@18 app homedash --platform=darwin --arch=$ARCH \
    --electron-version=$ELECTRON --app-version=$VERSION --out=dist.noindex --overwrite \
    --app-bundle-id=com.lepetitpaco.homedash --extend-info=Info.extra.plist"

# Icône : le PNG converti en .icns avec les outils de macOS.
cd desktop
rm -rf build/icon.iconset && mkdir -p build/icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s ../public/icon-512.png --out "build/icon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [ $d -le 512 ] && sips -z $d $d ../public/icon-512.png --out "build/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns
APP="dist.noindex/homedash-darwin-$ARCH/homedash.app"
cp build/icon.icns "$APP/Contents/Resources/electron.icns"
codesign --force --deep -s - "$APP"
echo "✓ $(pwd)/$APP"
if [ "${1:-}" = --install ]; then
  rm -rf /Applications/homedash.app
  cp -R "$APP" /Applications/
  echo "✓ installée dans /Applications"
fi

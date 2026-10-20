#!/bin/sh
# Publie l'appli de bureau : .dmg arm64 et x64, déposés dans la release GitHub
# `desktop-vX.Y.Z` (hors de l'historique git, téléchargeable par qui a accès
# au repo). Lancé par la GitHub Action sur un tag `desktop-v*` ; à la main en
# secours (il faut alors Docker ou Node, et `gh auth login`).
#
#   sh desktop/release.sh 1.0.0               → construit et publie
#   sh desktop/release.sh 1.0.0 --no-publish  → construit seulement (desktop/dist/)
#
# Seulement si la coquille change (main.js, preload.js, version d'Electron) :
# l'interface, elle, vient du container.
set -eu
cd "$(dirname "$0")"
V=${1:?usage : sh desktop/release.sh X.Y.Z [--no-publish]}
TAG="desktop-v$V"
PUBLISH=true
[ "${2:-}" = --no-publish ] && PUBLISH=false
if $PUBLISH && gh release view "$TAG" >/dev/null 2>&1; then
  echo "✗ la release $TAG existe déjà" >&2
  exit 1
fi

for ARCH in arm64 x64; do
  ARCH=$ARCH APP_VERSION=$V sh build-local.sh
  # .dmg : l'appli et un raccourci vers Applications, à glisser dessus.
  STAGE="dist/dmg-$ARCH"
  rm -rf "$STAGE" && mkdir -p "$STAGE"
  cp -R "dist/homedash-darwin-$ARCH/homedash.app" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname homedash -srcfolder "$STAGE" -ov -format UDZO \
    "dist/homedash-$V-$ARCH.dmg" >/dev/null
  rm -rf "$STAGE"
  echo "✓ dist/homedash-$V-$ARCH.dmg"
done

$PUBLISH || exit 0
gh release create "$TAG" "dist/homedash-$V-arm64.dmg" "dist/homedash-$V-x64.dmg" \
  --title "Appli de bureau $V" \
  --notes "homedash dans sa fenêtre (Mac). **arm64** = Apple Silicon (M1…), **x64** = Intel.

Le container reste nécessaire : l'appli l'affiche. Premier lancement : Réglages Système → Confidentialité et sécurité → Ouvrir quand même (appli non signée par Apple). Détails : GUIDE.md, « L'appli de bureau »."
echo "✓ release $TAG publiée"

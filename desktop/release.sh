#!/bin/sh
# Publie l'appli de bureau : .dmg arm64 et x64, et pour Windows l'installateur
# .exe et un .zip (build-windows.sh, par Docker), déposés dans la release GitHub
# `desktop-vX.Y.Z` (hors de l'historique git, téléchargeable par qui a accès
# au repo). Lancé par la GitHub Action sur un tag `desktop-v*` ; à la main en
# secours (il faut alors Docker ou Node, et `gh auth login`).
#
#   sh desktop/release.sh 1.0.0               → construit et publie
#   sh desktop/release.sh 1.0.0 --no-publish  → construit seulement (desktop/dist.noindex/)
#   WINDOWS=0 sh desktop/release.sh 1.0.0     → sans Windows (la CI le construit à part, sur Linux)
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
  STAGE="dist.noindex/dmg-$ARCH"
  rm -rf "$STAGE" && mkdir -p "$STAGE"
  cp -R "dist.noindex/homedash-darwin-$ARCH/homedash.app" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname homedash -srcfolder "$STAGE" -ov -format UDZO \
    "dist.noindex/homedash-$V-$ARCH.dmg" >/dev/null
  rm -rf "$STAGE"
  echo "✓ dist.noindex/homedash-$V-$ARCH.dmg"
done

WIN=""
if [ "${WINDOWS:-1}" != 0 ]; then
  APP_VERSION=$V sh build-windows.sh
  WIN="dist.noindex/homedash-$V-win-x64-setup.exe dist.noindex/homedash-$V-win-x64.zip"
fi

$PUBLISH || exit 0
# shellcheck disable=SC2086
gh release create "$TAG" "dist.noindex/homedash-$V-arm64.dmg" "dist.noindex/homedash-$V-x64.dmg" $WIN \
  --title "Appli de bureau $V" \
  --notes "homedash dans sa fenêtre.

- **Mac** : \`-arm64.dmg\` = Apple Silicon (M1…), \`-x64.dmg\` = Intel. Premier lancement : Réglages Système → Confidentialité et sécurité → Ouvrir quand même (appli non signée par Apple).
- **Windows** : \`-win-x64-setup.exe\` (installateur), ou le \`.zip\` sans installation. Premier lancement : « Windows a protégé votre ordinateur » → Informations complémentaires → Exécuter quand même (appli non signée).

Le container reste nécessaire : l'appli l'affiche. Détails : GUIDE.md, « Appli de bureau »."
echo "✓ release $TAG publiée"

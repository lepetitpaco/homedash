#!/bin/sh
# Construit l'appli de bureau pour Windows (x64) depuis un Mac ou un Linux.
# Tout se passe dans Docker (desktop/windows-build.sh) ; sous Windows, même
# chose avec build-windows.ps1.
#
#   sh desktop/build-windows.sh   → desktop/dist.noindex/homedash-<version>-win-x64-setup.exe
#                                   et homedash-<version>-win-x64.zip (sans installation)
#
# L'installateur s'installe pour l'utilisateur seul (pas de droits admin), avec
# un raccourci dans le menu Démarrer et un désinstalleur. Non signé : un .exe
# TÉLÉCHARGÉ affiche « Windows a protégé votre ordinateur » au premier
# lancement (Informations complémentaires → Exécuter quand même) ; construit
# sur le PC même, non.
set -eu
cd "$(dirname "$0")"
docker run --rm -v "$PWD":/b -v "$PWD/../public":/public:ro -e APP_VERSION="${APP_VERSION:-}" \
  node:22-bookworm sh /b/windows-build.sh

---
status: pending
---

# Instruction: Releases GitHub et mise à jour

## Architecture projection

```txt
.
├── .github/workflows/release.yml  ✅ tag vX.Y.Z → build front + serveur → electron-builder mac (arm64, x64) + win → Release
├── desktop/electron-builder.yml   ✅ dmg + zip (mac), nsis (win), publish github, extraResources (public, server, CHANGELOG, GUIDE)
├── desktop/updater.js             ✏️ Windows: electron-updater ; Mac: zip + sha512 de latest-mac.yml + swapAndRelaunch ; sauvegarde avant
├── server/updates.ts              ✏️ version disponible = dernière Release (sans jeton si dépôt public, jeton sinon)
├── desktop/build-local.sh         ✏️ construit l'appli autonome localement (dépannage)
└── desktop/build-windows.*, installer.nsi, windows-build.sh  ❌ remplacés par electron-builder
```

## User Journey

```mermaid
flowchart TD
  A[git tag v2.0.1 && push] --> B[Actions: build mac + win]
  B --> C[Release: dmg, zip, setup.exe, latest*.yml]
  C --> D[Appli: mise à jour disponible]
  D --> E[Un clic: téléchargement, vérification, sauvegarde, relance]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    Release fictive (latest-mac.yml + zip) servie localement => prête: 5: system
  section Happy path
    vérification de mise à jour => sha512 correct => appli remplacée et relancée: 5: system
  section Edge case - empreinte fausse
    zip altéré => mise à jour refusée, appli intacte: 1: system
  section Teardown
    suppression des fichiers téléchargés => état initial: 5: system
```

## Tasks to do

### `1)` Workflow

> Permissions `contents: write` seulement ; actions figées par SHA ; matrice macos-latest / windows-latest.

### `2)` Mise à jour

> Annonce par `updates.ts` (CHANGELOG de la Release) ; installation par l'appli ; `data/` sauvegardé avant.

### `3)` Plus tard (2.1, hors 2.0.0) : mises à jour légères

> Paquet front + serveur (quelques Mo) téléchargé, vérifié, rangé dans les données de l'appli, version minimale de coquille, retour à la version embarquée s'il ne démarre pas. Décidé avec Paco le 2026-10-29 : utile vu la cadence de versions, mais après une mise à jour complète solide.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Un tag produit une Release avec .dmg, .zip (arm64, x64), setup.exe et latest*.yml |
| 2 | Empreinte fausse = refus ; empreinte juste = nouvelle version lancée, données sauvegardées avant |

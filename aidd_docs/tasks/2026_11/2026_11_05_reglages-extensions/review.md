# Review: réglages des extensions dans homedash

- **Verdict**: approve
- **Diff**: `preprod...paco/feature/reglages-extensions` (+ branches des trois extensions, non commitées)
- **Axes run**: code, functional, relevancy
- **Date**: 2026_11_05
- **Findings**: 0 critical, 0 warning, 1 minor

## Phases

### Phase 1 — homedash : ⚙ réglages d'une extension

- [x] ⚙ ouvre la popup de l'extension dans une fenêtre — desktop/main.js `openExtSettings`, vérifié dans homedash dev (3 extensions)
- [x] Un 2e clic la ramène devant, pas de doublon — `extWindows`, vérifié (3 fenêtres après 4 clics)
- [x] Un lien web part dans le navigateur — essayé : la fenêtre reste sur l'extension, aucune fenêtre ouverte (`setWindowOpenHandler`, `will-navigate`)
- [x] Pas de ⚙ sans popup ni options, ni dans une appli ancienne — `settingsPage()` vide, `settingsAvailable()` ; logique lue, pas d'extension sans popup sous la main
- [x] La doc dit où sont les réglages et leur limite (comptes) — GUIDE.md, SetExtensions.tsx, CLAUDE.md

### Phase 2 — AniList Helper : repli sur storage.local

- [x] Dans Electron, la popup affiche ses réglages et les garde — banc Electron 44.9.1 (8 champs, réglage gardé à la réouverture)
- [x] Dans Chrome, rien ne change — Chromium (Playwright 1.56) : `settings` dans storage.sync

### Phase 3 — Embed Link Copier : repli sur storage.local

- [x] Dans Electron, plus d'erreur et le choix des services est gardé — banc Electron, réglage gardé
- [x] Dans Chrome, rien ne change — Chromium : `services` dans storage.sync ; CRLF conservés

### Phase 4 — Basecamp User Highlighter : permissions absentes

- [x] Plus d'erreur `contains` dans Electron ; Chrome et Firefox inchangés — banc Electron sans erreur ; Chromium sans erreur

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟢 minor | fit | 1 | desktop/main.js taille des popups | Hauteur fixe de 600 : une popup courte (Highlighter) a du vide dessous | Accepté : la taille « préférée » de Chromium fige la fenêtre sous Electron 44 (essayé) |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (9/9) |
| Files checked | desktop/main.js, desktop/preload.js, src/lib/desktop.ts, src/components/SetExtensions.tsx, src/styles/custom-tabs.css, src/lib/whatsNew.ts, GUIDE.md, ARCHITECTURE.md, CLAUDE.md, AniList-Helper/src/{settings,bridge,bookmarks}.js, Embed-Link-Copier/storage.js, basecamp-user-highlighter/popup.js |
| Unchecked     | none |
| Unplanned     | src/lib/whatsNew.ts (carte Extensions mentionne ⚙), src/styles/custom-tabs.css (colonne du bouton) |

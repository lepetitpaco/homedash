# Review: Réglages clairs

- **Verdict**: approve
- **Diff**: `preprod...paco/feature/reglages-clairs (non commité)`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_11_02
- **Findings**: 0 critical, 0 warning, 3 minor

## Phases

### Phase 1 — La recherche trouve les Réglages

- [x] Chaque mot du test mène à sa page ; une fonctionnalité coupée n'a pas d'entrée — src/lib/settingsIndex.ts, tests-ts/settingsindex.test.ts (15 tests), vérifié dans le navigateur (sauvegarde, jeton → GitHub › Compte, veille → repli ouvert, disposition, erreurs)

### Phase 2 — Menu des Réglages et vue d'ensemble

- [x] La vue d'ensemble montre l'état réel de chaque service et mène à sa page — src/components/SetOverview.tsx
- [x] Le menu a 13 entrées (15 avant, 11 visés) ; les anciens identifiants ouvrent la bonne page — help-errors, set-docker, set-repos, help-news vérifiés

### Phase 3 — Pages allégées

- [x] Chaque sous-onglet GitHub tient sur un écran — 0,5 écran
- [x] Sauvegardes et Affichage tiennent sur un écran — 0,5 et 0,9 ; Mes sites 1,4 (liste de 16 sites), Diagnostic 1,8 (journal d'erreurs)

### Phase 4 — Défauts

- [x] Sans choix, dossier ⚡ ; un choix enregistré l'emporte ; Docker caché quand absent — src/App.tsx, SettingsPage `dockerHere`

### Phase 5 — Lexique et finitions

- [x] Le relevé des textes ne montre plus les doublons de l'audit — menus « Ce site », « Supprimer le site… », « ni compteur ni notifs », Comptes, Local, Activité, boutons à majuscule
- [x] « ? » ouvre le Guide ; CLAUDE.md porte le lexique et la règle

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟢 | fit | 2 | src/components/SettingsPage.tsx (SECTIONS) | 13 entrées au lieu des 11 visées : Fonctionnalités et Vue d'ensemble restent séparées | Accepté : Fonctionnalités se coupe et se recoche rarement, la Vue d'ensemble y renvoie |
| 🟢 | rot | - | src/components/SetBackups.tsx (reasonOf) | Raison de sauvegarde brute (`avant-retrait-depots`) | Corrigé : tirets remplacés par des espaces |
| 🟢 | conform | - | CLAUDE.md « Fonctionnalités principales » | Les Réglages et le défaut ⚡ changent pour toute l'équipe (feu vert de Paco : « tout ») | Commit : `Touche : Réglages, Affichage (⚡ en dossier par défaut)` |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (8/8) |
| Files checked | src/lib/settingsIndex.ts, src/components/SetOverview.tsx, src/components/SettingsPage.tsx, src/components/SetBackups.tsx, src/components/SetDisplay.tsx, src/components/TopBar.tsx, src/hooks/useContextMenus.ts, src/App.tsx, CLAUDE.md, GUIDE.md, CHANGELOG-dev.md |
| Unchecked     | none |
| Unplanned     | Vue d'ensemble en 🏠 (doublon d'icône avec Barres et onglets) ; recherche qui ouvre le repli visé (`set-tabs:more`) ; Diagnostic avec le journal de performance replié |

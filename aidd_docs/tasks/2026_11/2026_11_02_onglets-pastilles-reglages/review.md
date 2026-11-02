# Review: Onglets pastilles, menu Disposition et rangement des Réglages

- **Verdict**: approve
- **Diff**: `preprod...paco/feature/onglets-pastilles (non commité)`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_11_02
- **Findings**: 0 critical, 0 warning, 1 minor (4 minor corrigés : observateur de la barre, commentaires, aide du bloc)

## Phases

### Phase 1 — Rangement des Réglages

- [x] Dans l'appli, Général montre l'accès navigateur ; Affichage ne le montre plus — src/components/SettingsPage.tsx:717
- [x] Aide liste « Journal de performance » même vide, avec la case en tête ; Affichage ne la montre plus — src/components/SettingsPage.tsx:322, 920
- [x] La colonne des noms de catégorie de Raccourcis a la largeur de `ui.railWidth` — src/App.tsx:2449, src/styles/links.css:142 (mesuré 180 px = config)
- [x] Le GUIDE nomme les nouveaux emplacements — GUIDE.md:122, 316-321, 353

### Phase 2 — Style des onglets

- [x] Sans réglage, pastilles ; le choix tient au rechargement — src/App.tsx:461
- [x] Soulignés : actif souligné, rangées sans défilement horizontal, dans les deux thèmes — src/styles/github.css (`.tabs.is-underline`)
- [x] Le GUIDE décrit le choix — GUIDE.md:54

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟢 | conform | - | CLAUDE.md « Fonctionnalités principales » | Le défaut d'affichage des onglets change pour tous (validé par Paco) | Message de commit : `Touche : Affichage (onglets du haut en pastilles)` |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (7/7) |
| Files checked | src/App.tsx, src/components/Tabs.tsx, src/components/Rail.tsx, src/components/RailLayoutPicker.tsx, src/components/SettingsPage.tsx, src/components/SetPerf.tsx, src/styles/github.css, src/styles/custom-tabs.css, src/styles/rail.css, src/styles/links.css, src/styles/changelog.css, GUIDE.md, CHANGELOG-dev.md |
| Unchecked     | Accès navigateur dans Général — vérifié seulement à la lecture (bloc réservé à l'appli de bureau, page testée dans un navigateur) |
| Unplanned     | Travail des demandes précédentes de la session (pastilles, menu Disposition, tailles, dossiers, masquage auto, ⚡ en dossier, alignement Petit), tracé dans CHANGELOG-dev.md |

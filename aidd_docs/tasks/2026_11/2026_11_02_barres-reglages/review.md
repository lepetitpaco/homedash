# Review: Barres et onglets, réglages clarifiés

- **Verdict**: approve
- **Diff**: `0cc44d9...paco/feature/onglets-pastilles (non commité)`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_11_02
- **Findings**: 0 critical, 0 warning, 2 minor

## Phases

### Phase 1 — Formulaire des barres clarifié

- [x] Le menu montre d'abord « Les onglets » ; les options de l'autre mode n'apparaissent pas — src/components/BarLayoutForm.tsx:73 (h3 mesurés : gauche = Les onglets, Disposition, Taille des icônes, Onglets du haut ; haut = Les onglets, Onglets du haut)
- [x] Sans barre de gauche, aucun bouton ni entrée de menu ne la fait revenir hors du choix de disposition — src/App.tsx:1483, 2206 (» et entrée retirés, 0 trouvé)

### Phase 2 — ⚡ : clic droit et repli

- [x] Le clic droit sur ⚡ change la place des onglets de homedash, l'actuelle cochée — src/App.tsx:1460, src/components/Rail.tsx (✓ mesuré)
- [x] En dossier, ⚡ s'ouvre et se ferme au clic, et le reste après rechargement — src/components/Rail.tsx (`HOME_FOLDER` dans `homedash:rail-closed`)

### Phase 3 — Page Réglages « Barres et onglets »

- [x] La page applique chaque choix immédiatement ; Affichage n'a plus le bouton — src/components/SettingsPage.tsx (`set-bars`)
- [x] Le GUIDE décrit le clic droit sur ⚡, le repli et la page — GUIDE.md:45-58, 318

### Phase 4 — Affichage en choix visuels

- [x] Chaque choix enregistré change la page comme annoncé ; les défauts sont entourés sur une config neuve — src/components/SetDisplay.tsx (Centrée = 60 % mesuré, 3 colonnes mesurées, config de dev reconnue sans « personnalisé »)
- [x] Affichage n'a plus aucun champ chiffré ni préréglage d'écran — src/components/SettingsPage.tsx (0 champ, 0 préréglage)

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟢 | fit | 1 | src/App.tsx (railMenu) | « Cacher la barre » reste au clic droit de la barre de gauche : un clic passe en mode haut, alors que le retour n'a plus de raccourci | À trancher par Paco : le garder (sortie rapide) ou le retirer pour que tout passe par le choix de disposition |
| 🟢 | code | - | src/App.tsx:479 | `bars` est recréé à chaque rendu de App | Accepté : objet léger, seuls le menu ouvert et la page Réglages le lisent |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (8/8) |
| Files checked | src/App.tsx, src/components/BarLayoutForm.tsx, src/components/RailLayoutPicker.tsx, src/components/Rail.tsx, src/components/SettingsPage.tsx, src/styles/rail.css, src/styles/settings-page.css, GUIDE.md, CHANGELOG-dev.md |
| Unchecked     | none |
| Unplanned     | Retours de Paco en cours de route : options du haut cachées en mode barre de gauche (symétrie), « Masquer automatiquement » remonté sous le choix du mode ; espace sous les tailles |

# Review: Fenêtre unique tâche/carte, validation

- **Verdict**: approve
- **Diff**: `paco/feature/perf-ux...arbre de travail`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_10_31
- **Findings**: 0 critical, 0 warning, 1 minor

## Phases

### Phase 1 — Images et pièces jointes

- [x] Pièce jointe image Trello affichée — mesure dans l'appli de dev (largeur 512)
- [x] Image Basecamp affichée — mesure dans l'appli de dev (largeur 512)
- [x] Image de description Trello à adresse valide — seconde vérification

### Phase 2 — Entrées : recherche, cloche, copie

- [x] Voir et créer depuis la recherche, Basecamp et Trello — parcours CDP
- [x] Recherche d'un commentaire — parcours CDP
- [x] Cloche, Rapport prêt, liste Issues du service — parcours CDP
- [x] Copier la commande et le prompt, presse-papiers relu — issue de test #75

### Phase 3 — Liste Issues et kanban

- [x] Liste vide et terminées alignées entre les deux services — `src/components/TrelloView.tsx`
- [x] Kanban : longue colonne, 25 cartes, aucun débordement — capture relue

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟢 | code | 2 | `src/components/IssueComposer.tsx` | Message d'échec de copie jamais déclenché en test réel | Accepté : lié au refus du navigateur, branche simple |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (9/9) |
| Files checked | IssueComposer.tsx, IssueHost.tsx, TrIssueHost.tsx, TrelloView.tsx |
| Unchecked     | none |
| Unplanned     | none |

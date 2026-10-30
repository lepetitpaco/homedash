# Review: Design du tableau Trello

- Rounds: 1
- Started: 2026-10-29

## Round 1 · r-4e2b

- Date: 2026-10-29
- By: pjpoirson
- Diff: `main...HEAD` plus the working tree
- Axes: code, functional, relevancy
- Verdict: approve
- Score: 1/4 met, 0 unmet, 3 unverified at runtime, 0 out of the diff

### Criteria

- [x] Une issue se lit en ligne, titre dans la couleur du texte. La ligne n'a pas le fond ni la largeur d'une colonne. — `src/styles/trello.css` `.tr-issue`, `src/components/TrelloView.tsx` classe `tr-issue`
- Unverified at runtime: CZ - ALPHA montre son image de fond, un autre hôte est ignoré, le jeton ne part pas avec l'image. — l'écran et le chargement réel
- Unverified at runtime: Les colonnes sont des panneaux sombres dans l'ordre Trello, les cartes des pavés sombres au texte clair, sans ajout ni déplacement. — ce que l'écran montre
- Unverified at runtime: À traiter reprend les mêmes pavés, ou le message vide, sans colonne. — ce que l'écran montre

### Findings

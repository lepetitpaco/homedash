---
status: done
---

# Instruction: À traiter et les issues, au même langage

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
├── ✏️ src/components/TrelloView.tsx
└── ✏️ src/styles/trello.css
```

## User Journey

```mermaid
flowchart TD
  A[Onglet Trello] --> B[À traiter]
  B --> C[Les mêmes cartes, en une pile]
  A --> D[Issues GitHub]
  D --> E[Une liste d'issues, pas des colonnes]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    Ouvrir l'onglet Trello, tableau déjà chargé, au moins une carte à échéance proche et une issue liée => À traiter et Issues sont accessibles: 5: browser
  section Happy path
    Ouvrir À traiter => les cartes dues utilisent la même carte que le tableau, en une seule pile, avec le titre lisible: 5: browser
    Ouvrir Issues GitHub => chaque issue est une ligne, le titre n'est pas un lien bleu souligné, publier et écarter sont toujours là: 5: browser
  section Edge case - rien à traiter
    Aucune carte due => À traiter montre l'état vide déjà prévu, pas une colonne vide de tableau: 1: browser
```

## Wireframe

```txt
┌──────────────────────────────────────────────┐
│ (1) À traiter                                 │
├──────────────┬───────────────────────────────┤
│ (2) nav      │ (3) pile                      │
│              │ ┌───────────────────────────┐ │
│              │ │ (4) carte                 │ │
│              │ └───────────────────────────┘ │
│              │ ┌───────────────────────────┐ │
│              │ │ (4) carte                 │ │
│              │ └───────────────────────────┘ │
└──────────────┴───────────────────────────────┘
```

```txt
┌──────────────────────────────────────────────┐
│ (1) Issues                                    │
├──────────────┬───────────────────────────────┤
│ (2) nav      │ (5) ligne d'issue             │
│              │ (5) ligne d'issue             │
│              │ (6) terminées                 │
└──────────────┴───────────────────────────────┘
```

1. En-tête de la vue : À traiter, ou les issues.
2. La même navigation que sur un tableau.
3. Pile : les cartes dues, les unes sous les autres, pas en colonnes de listes.
4. La carte définie pour le tableau.
5. Ligne d'issue : dépôt, numéro, titre, actions déjà là.
6. Les issues terminées, repliées comme aujourd'hui.

## Tasks to do

### `1)` À traiter

> Les cartes dues reprennent la carte sombre du tableau, sans devenir un second tableau.

1. Réutiliser le bloc carte de la phase 1, dans une seule pile.
2. Garder le tri par échéance. Ne pas afficher « toi » : tout est déjà à soi.
3. L'état vide reste le message actuel, pas une colonne.

### `2)` Issues

> La liste d'issues n'hérite pas du chrome d'une carte de tableau, et perd le lien bleu par défaut.

1. Séparer la classe de la ligne d'issue de celle de la carte de tableau.
2. Titre en `--text`, sans soulignement. Les actions (prompt, publier, écarter, rétablir) restent visibles, pas au survol.

## Test acceptance criteria

| Task | Acceptance criteria              |
| ---- | -------------------------------- |
| 1 | À traiter montre les cartes dues comme les pavés sombres du tableau, en une pile triée par échéance. Sans carte due, le message vide actuel s'affiche, pas une colonne. |
| 2 | Une issue se lit en ligne, titre dans la couleur du texte, en thème clair et sombre. Prompt, publier, écarter et rétablir restent affichés sans survol. La ligne ne reprend pas le fond ni la largeur d'une colonne de tableau. |

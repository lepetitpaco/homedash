---
status: done
---

# Instruction: La recherche trouve les Réglages

## Architecture projection

```txt
.
├── src/lib/settingsIndex.ts        ✅ pages et réglages : libellé, partie, mots-clés (synonymes)
├── src/App.tsx                     ✏️ chaque entrée devient une action de recherche qui ouvre sa partie
└── tests-ts/settingsindex.test.ts  ✅ les mots courants trouvent leur page
```

## User Journey

```mermaid
flowchart TD
  A[Taper « sauvegarde »] --> B[Réglages › Sauvegardes]
  B --> C[Entrée : la page s'ouvre]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Happy path
    Taper « sauvegarde », « jeton », « veille », « disposition », « notifications » => une entrée Réglages › … en tête des actions: 5: browser
    Entrée sur l'une => la bonne page des Réglages s'ouvre: 5: browser
  section Edge case - fonctionnalité coupée
    Basecamp coupé => taper « basecamp » => pas d'entrée vers ses réglages: 1: browser
```

## Tasks to do

### `1)` Index

1. Une entrée par page et par réglage qu'on cherche (jeton, repos, équipe, restaurer, export, compteur, disposition, en haut, masquer, largeur, colonnes, veille, comptes, dossiers, Docker, accès navigateur, journal, guide, nouveautés).
2. App : actions `Réglages › …`, masquées si la fonctionnalité est coupée.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Chaque mot du test mène à sa page ; une fonctionnalité coupée n'a pas d'entrée |

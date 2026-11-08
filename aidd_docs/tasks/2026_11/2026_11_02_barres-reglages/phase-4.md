---
status: done
---

# Instruction: Affichage en choix visuels

## Architecture projection

```txt
.
├── src/components/SetDisplay.tsx    ✅ largeur de page, densité de l'accueil, colonnes GitHub/Local, tuiles, voyants : des miniatures et des boutons
├── src/components/SettingsPage.tsx  ✏️ Affichage = Ce qui s'affiche + SetDisplay ; plus de préréglages d'écran ni de champs chiffrés
├── src/lib/config.ts                ✏️ DISPLAY_PRESETS retiré s'il ne sert plus
├── src/styles/settings-page.css     ✏️ miniatures de page et de densité
└── GUIDE.md, CHANGELOG-dev.md       ✏️
```

## User Journey

```mermaid
flowchart TD
  A[Réglages → Affichage] --> B[Largeur de la page : toute, large, centrée, étroite]
  A --> C[Densité de Raccourcis : compacte, normale, aérée]
  A --> D[Cartes GitHub et Local : auto, 1, 2, 3 colonnes]
  A --> E[Tuiles 4/8/12/16, voyants 30 s/1 min/5 min/jamais]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    Config de dev, valeurs par défaut => Affichage ouvert: 5: browser
  section Happy path
    Ouvrir Affichage => aucun champ chiffré, choix par défaut entourés (Centrée, Normale, 2 colonnes, 12, 1 min): 5: browser
    Choisir Toute la largeur puis Enregistrer => la page prend toute la largeur: 5: browser
    Choisir 3 colonnes puis Enregistrer => GitHub sur 3 colonnes: 5: browser
  section Edge case - valeurs personnalisées
    Config avec des valeurs hors choix => ouvrir Affichage => aucun choix entouré, mention « personnalisé »: 1: browser
  section Teardown
    Revenir aux valeurs de départ et Enregistrer => état initial: 5: browser
```

## Tasks to do

### `1)` Choix visuels

1. `SetDisplay` : cinq rangées de choix ; un choix = des valeurs de `ui` (mêmes clés qu'avant, défauts inchangés).
2. Valeur hors choix : rien d'entouré, « personnalisé ».

### `2)` Nettoyage

1. Retirer préréglages et champs chiffrés de SettingsPage ; GUIDE et CHANGELOG-dev.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Chaque choix enregistré change la page comme annoncé ; les défauts sont entourés sur une config neuve |
| 2 | Affichage n'a plus aucun champ chiffré ni préréglage d'écran |

---
objective: "Ouvrir un tableau Trello dans homedash montre le même tableau que la capture Trello : fond, colonnes sombres, cartes sombres, sans rien écrire de plus sur Trello."
status: implemented
---

# Plan: Design du tableau Trello

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Le tableau ouvert ressemble à la capture Trello, pas à la liste de liens bleus. |
| **Source** | Actuel : `Capture d'écran 2026-10-29 à 09.10.08.png` (liens bleus). Cible : capture Trello du tableau CZ - ALPHA (fond photo, colonnes et cartes sombres, compte dans la tête de colonne). |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ---------------------------- |
| 1   | Tableau      | [`phase-1.md`](./phase-1.md) |
| 2   | Autres vues  | [`phase-2.md`](./phase-2.md) |

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| La zone du tableau reprend la capture Trello : fond du tableau, colonnes sombres, cartes sombres au texte clair. Le thème clair de homedash ne rééclaire pas cette zone. | La cible est cette capture, pas une variante claire des jetons de la page. |
| Le fond affiché est celui du tableau, seulement si l'adresse est `https` et l'hôte `trello-backgrounds.s3.amazonaws.com`. La page le charge elle-même, sans le jeton. | Les six tableaux ont une image sur cet hôte. Un autre hôte ne doit pas recevoir le jeton, ni être posé dans la page. |
| Pas de menu « … » de liste, pas de « Ajouter une carte », pas de glisser-déposer. | Ces contrôles écrivent sur Trello. Le reste de la capture (fond, colonne, carte, compte) se fait sans eux. |

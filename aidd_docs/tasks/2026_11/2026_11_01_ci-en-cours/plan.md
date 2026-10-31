---
objective: "L'onglet GitHub montre ce qui tourne sur les repos suivis, et rien quand rien ne tourne."
status: implemented
---

# Plan: Carte « En cours » de l'onglet GitHub

## Overview

| Field      | Value                                         |
| ---------- | --------------------------------------------- |
| **Goal**   | Voir les workflows en cours et leurs jobs     |
| **Source** | lepetitpaco/homedash#86                       |

## Phases

| #   | Phase                  | File                         |
| --- | ---------------------- | ---------------------------- |
| 1   | Serveur, carte et doc  | [`phase-1.md`](./phase-1.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| Carte posée en tête de `GithubView`, hors du `layout` | Pas de nouveau jeton de config : une config existante n'a rien à migrer et la carte apparaît chez tout le monde |
| API Actions (`actions/runs`, puis `jobs` des seuls runs en cours) | Voit toutes les branches d'un repo ; cache ETag, donc 304 gratuits quand rien ne bouge |
| Aucun événement | Demandé : pas de cloche, `diff` n'est pas touché |

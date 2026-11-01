---
objective: "Les issues #102, #103 et #104 sont livrées, chacune sur sa branche, testées et sans commit."
status: implemented
---

# Plan: changer de site au clavier, noms dans la barre, liens Docker

> Livré en 2.4.0. La suite des essais a changé des choix de ce plan : disposition et taille en phase 2, une ligne par projet
> en phase 3. Le code et `GUIDE.md` font foi.

## Overview

| Field      | Value                                                 |
| ---------- | ----------------------------------------------------- |
| **Goal**   | Trois améliorations de la barre des sites, une branche par issue |
| **Source** | lepetitpaco/homedash#102, #103, #104 et précisions de Paco du 2026-11-01 |

## Phases

| #   | Phase                                                   | File                         |
| --- | ------------------------------------------------------- | ---------------------------- |
| 1   | Ctrl+Tab (`paco/feature/changer-site-clavier`)          | [`phase-1.md`](./phase-1.md) |
| 2   | Afficher les noms (`paco/feature/barre-noms`)           | [`phase-2.md`](./phase-2.md) |
| 3   | Liens Docker (`paco/feature/liens-docker`)              | [`phase-3.md`](./phase-3.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| Un arbre de travail par branche | CLAUDE.md : une branche par sujet, et Forge ne commite pas. |
| Docker lu par une seule route GET fixe, `/containers/json` | Le socket donne le contrôle total de la machine : aucune écriture possible par ce code. |
| Sites Docker hors de `config.tabs` | Ils sont calculés : ils ne doivent jamais être écrits dans la config. |
| Ctrl+Tab intercepté par `before-input-event` dans `main.js` | Seul moyen de le voir quand le focus est dans un site. Cmd+Tab et Alt+Tab appartiennent au système. |

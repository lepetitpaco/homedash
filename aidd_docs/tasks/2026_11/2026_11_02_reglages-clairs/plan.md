---
objective: "On ne se perd plus dans homedash : les Réglages se trouvent par la recherche, tiennent en peu de pages claires avec un vocabulaire unique, et les bons défauts évitent d'avoir à y aller."
status: reviewed
---

# Plan: Réglages clairs

## Overview

| Field      | Value |
| ---------- | ----- |
| **Goal**   | Appliquer l'audit UX du 2026-11-02 : recherche des Réglages, menu resserré avec une vue d'ensemble, pages allégées, bons défauts, lexique unique |
| **Source** | Audit mené avec Paco le 2026-11-02 (mesures des pages, menus, recherche, termes) ; /forge « tout » |

## Phases

| #   | Phase | File |
| --- | ----- | ---- |
| 1   | La recherche trouve les Réglages | [`phase-1.md`](./phase-1.md) |
| 2   | Menu des Réglages et vue d'ensemble | [`phase-2.md`](./phase-2.md) |
| 3   | Pages allégées | [`phase-3.md`](./phase-3.md) |
| 4   | Défauts | [`phase-4.md`](./phase-4.md) |
| 5   | Lexique et finitions | [`phase-5.md`](./phase-5.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| Les anciens identifiants de parties (`set-docker`, `help-errors`, `help-perf`, `help-news`) restent valides et mènent à leur nouvelle place | Liens internes, menu de l'appli de bureau et parties mémorisées ne cassent pas |
| Aucune clé de config ne change | Règle absolue 9 : format de données jamais cassé |
| Un lexique écrit dans CLAUDE.md, avec la règle « un réglage seulement sans bon défaut » | Empêcher la dérive qui a produit le désordre |

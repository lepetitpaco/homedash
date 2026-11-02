---
objective: "Les Réglages sont rangés sans doublon et le style des onglets (pastilles par défaut, ou soulignés) se choisit dans Disposition et taille."
status: reviewed
---

# Plan: Rangement des Réglages et style des onglets

## Overview

| Field      | Value |
| ---------- | ----- |
| **Goal**   | Appliquer la revue des Réglages (accès navigateur, journal de performance, variable CSS) et rendre le style des onglets réglable |
| **Source** | Demande de Paco du 2026-11-02 (« tout ça stp ») sur le rapport de la branche `paco/feature/onglets-pastilles` ; défaut « pastilles » validé par Paco |

## Phases

| #   | Phase                 | File                         |
| --- | --------------------- | ---------------------------- |
| 1   | Rangement des Réglages | [`phase-1.md`](./phase-1.md) |
| 2   | Style des onglets     | [`phase-2.md`](./phase-2.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| La disposition des barres reste propre à l'écran (localStorage), pas dans la config | `data/` est déjà propre à chaque machine : la config ne ferait rien « suivre » d'une machine à l'autre, et les autres choix de la barre (taille, disposition) vivent déjà là |
| `ui.railWidth` garde son nom dans la config ; seule la variable CSS locale devient `--cat-w` | Renommer la clé changerait le format de données (règle absolue 9) pour un gain purement interne |

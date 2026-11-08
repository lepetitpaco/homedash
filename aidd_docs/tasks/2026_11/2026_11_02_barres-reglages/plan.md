---
objective: "Les barres se règlent sans confusion : un menu par mode, ⚡ au clic droit et repliable, tout aussi dans une page Réglages dédiée, sans clic accidentel qui ramène la barre de gauche."
status: reviewed
---

# Plan: Barres et onglets, réglages clarifiés

## Overview

| Field      | Value |
| ---------- | ----- |
| **Goal**   | Restructurer le choix de disposition, déplacer le choix ⚡ sur son icône, rendre le dossier ⚡ repliable, et tout reprendre dans Réglages → Barres et onglets |
| **Source** | Retours de Paco du 2026-11-02 (/forge) sur la branche `paco/feature/onglets-pastilles` |

## Phases

| #   | Phase                         | File                         |
| --- | ----------------------------- | ---------------------------- |
| 1   | Formulaire des barres clarifié | [`phase-1.md`](./phase-1.md) |
| 2   | ⚡ : clic droit et repli        | [`phase-2.md`](./phase-2.md) |
| 3   | Page Réglages « Barres et onglets » | [`phase-3.md`](./phase-3.md) |
| 4   | Affichage en choix visuels | [`phase-4.md`](./phase-4.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| Un seul formulaire (`BarLayoutForm`) sert le menu flottant et la page Réglages | Deux copies des mêmes choix finiraient par diverger |
| Ces choix restent propres à l'écran et s'appliquent sans « Enregistrer » | Même stockage qu'avant (localStorage) ; la page le dit |
| Sans barre de gauche, on n'y revient que par le choix de disposition (menu ou Réglages) | Demande de Paco : plus de clic accidentel (» et menu de la barre du haut) |

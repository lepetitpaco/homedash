---
objective: "Les réglages (popup ou page d'options) de chaque extension s'ouvrent depuis homedash, et les trois extensions de Paco y marchent sans storage.sync ni permissions.contains."
status: pending
---

# Plan: réglages des extensions dans homedash

## Overview

| Field      | Value |
| ---------- | ----- |
| **Goal**   | Bouton ⚙ par extension dans Réglages → Mes sites → Extensions (fenêtre Electron sur la session commune des sites), et correctifs storage.sync / permissions dans AniList Helper, Embed Link Copier, Basecamp User Highlighter |
| **Source** | Demande de Paco (« tout ça », 2026-11-05) après l'essai Electron 44.9.1 sous xvfb : les trois popups s'ouvrent dans une BrowserWindow, storage.local marche, storage.sync et permissions.contains non |

## Phases

| #   | Phase | File |
| --- | ----- | ---- |
| 1   | homedash : ⚙ réglages d'une extension | [`phase-1.md`](./phase-1.md) |
| 2   | AniList Helper : repli sur storage.local | [`phase-2.md`](./phase-2.md) |
| 3   | Embed Link Copier : repli sur storage.local | [`phase-3.md`](./phase-3.md) |
| 4   | Basecamp User Highlighter : permissions absentes | [`phase-4.md`](./phase-4.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| Réglages ouverts sur la session commune (`persist:homedash-tabs`) seulement | Le stockage d'une extension est propre à chaque session ; une fenêtre par compte multiplierait les réglages sans besoin réel. Limite dite dans la page. |
| Correctifs dans les extensions plutôt qu'un faux `storage.sync` injecté par homedash | Electron n'offre pas de moyen propre de remplacer une API d'extension ; le repli sert aussi aux navigateurs qui coupent sync. |

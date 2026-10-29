---
objective: "homedash s'installe et se met à jour comme une appli Mac/Windows autonome (Electron + backend TypeScript embarqué, sans port, sans Docker), avec export/import complet chiffré."
status: in-progress
---

# Plan: homedash 2.0 — appli de bureau autonome

## Overview

| Field      | Value |
| ---------- | ----- |
| **Goal**   | Remplacer le backend Python + Docker par un backend TypeScript lancé par l'appli Electron, servi par `homedash://`, distribué en Releases GitHub avec mise à jour en un clic. |
| **Source** | Issues lepetitpaco/homedash#47, #61, #63, #64, plan validé par Paco le 2026-10-29 (conversation) |

## Phases

| #   | Phase | File |
| --- | ----- | ---- |
| 1   | Socle TS : cœur HTTP indépendant du transport, store/backup/errlog/events/updates/perf/favicons/localfile, Vitest, dev Docker :7778 | [`phase-1.md`](./phase-1.md) |
| 2   | Onglet Local : gitread + localgit en TS, lecture seule absolue | [`phase-2.md`](./phase-2.md) |
| 3   | GitHub, comptes, Basecamp en TS + script de parité Python/TS ; retrait du backend Python | [`phase-3.md`](./phase-3.md) |
| 4   | Appli Electron autonome : utilityProcess, protocole homedash://, données, Windows en arrière-plan, Basecamp intercepté, mode dev, accès navigateur facultatif, raccourcis ⌘R/⇧⌘R (#63), ancien nom du dépôt (#64) | [`phase-4.md`](./phase-4.md) |
| 5   | Export/import complet chiffré (#61) et reprise des données au premier lancement | [`phase-5.md`](./phase-5.md) |
| 6   | Construction et Releases (GitHub Actions, electron-builder) + mise à jour (electron-updater Windows, maison Mac) | [`phase-6.md`](./phase-6.md) |
| 7   | Docs et version 2.0.0 | [`phase-7.md`](./phase-7.md) |

## Resources

| Source | Verified |
| ------ | -------- |
| https://www.electronjs.org/docs/latest/api/protocol | `protocol.registerSchemesAsPrivileged` (standard, secure, supportFetchAPI, corsEnabled, stream) avant `ready` ; `protocol.handle` par session (`session.protocol`) pour les webviews |
| https://www.electronjs.org/docs/latest/api/utility-process | `utilityProcess.fork()` + `process.parentPort` (messages structurés), ESM pris en charge |
| https://nodejs.org/api/zlib.html | `inflateSync(buf, { info: true })` → `engine.bytesWritten` = octets compressés consommés (packs git) |
| https://www.electron.build/auto-update | electron-updater : NSIS sans signature OK ; macOS exige une appli signée → updater maison sur Mac |
| https://www.electron.build/configuration | cibles `dmg`+`zip` (mac, arm64/x64), `nsis` (win), `latest*.yml` avec sha512 |

## Decisions

| Decision | Why |
| -------- | --- |
| Le serveur TS expose `handle(req) → res` indépendant du transport ; deux transports : `node:http` (dev :7778, option « accès navigateur ») et messages `utilityProcess` ↔ `protocol.handle` | Un seul code d'API, aucun port en usage normal, contrôles Host/Origin conservés pour le transport HTTP |
| Node stdlib seulement au runtime (http, fs, zlib, crypto, fetch) ; TS « effaçable » lancé tel quel en dev (`node --experimental-strip-types` / Node ≥ 22.18), compilé par `tsc` pour l'appli | Garde l'esprit « zéro dépendance au runtime » sans Python |
| Mêmes fichiers JSON dans `data/` (formats inchangés) | Reprise des données v1 = simple copie ; règle absolue 10 |
| Données de l'appli dans `<userData>/data` (`~/Library/Application Support/homedash/data`, `%APPDATA%\homedash\data`) | `userData` contient déjà les sessions Electron (connexions des sites conservées) |
| Sessions des webviews : protocole limité à `/api/file` (GET) | Un site tiers chargé dans une webview ne doit jamais atteindre l'API |
| Pas de signature ; Mac = updater maison (zip + sha512) | Décision de Paco, pas de compte Apple |

---
objective: "La PR #65 (Trello sur la 2.0) est prête à fusionner en 2.1.0 : un seul appel GitHub par repo, des repos choisis pour Basecamp et pour Trello, essayée sur un vrai compte Trello."
status: pending
---

# Plan: Finir Trello sur la 2.0 (PR #65)

## Overview

| Field      | Value                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| **Goal**   | Corriger, compléter (#26 : repos par outil) et vérifier Trello, puis livrer la 2.1.0        |
| **Source** | PR #65 (`vague/trello-v2`), issue #26, revue du 2026-10-30 dans la conversation             |

## Phases

| #   | Phase                                        | File                         |
| --- | -------------------------------------------- | ---------------------------- |
| 1   | GitHub : une seule lecture des issues        | [`phase-1.md`](./phase-1.md) |
| 2   | Repos par outil (Basecamp / Trello, #26)     | [`phase-2.md`](./phase-2.md) |
| 3   | Retouches : images plafonnées, règles à jour | [`phase-3.md`](./phase-3.md) |
| 4   | Essai guidé sur un vrai compte Trello        | [`phase-4.md`](./phase-4.md) |
| 5   | Livraison 2.1.0                              | [`phase-5.md`](./phase-5.md) |

## Resources

| Source                                                                                         | Verified                                                                                                  |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| https://community.developer.atlassian.com/t/update-authenticated-access-to-s3/43681            | Les pièces jointes se lisent par la route `/download/` avec l'en-tête `Authorization: OAuth …`            |
| https://community.developer.atlassian.com/t/download-attachments-with-api/72386                | `api.trello.com/1/cards/{id}/attachments/{id}/download/{nom}` renvoie le fichier avec l'en-tête OAuth     |
| https://community.atlassian.com/t5/Trello-questions/trello-REST-API-getting-401-unauthorized-when-downloading/qaq-p/1775167 | Certains comptes doivent passer par `api.trello.com` au lieu de `trello.com` : à vérifier en phase 4 |

## Decisions

| Decision                                                                                  | Why                                                                                                  |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Repos par outil = clés facultatives `basecamp.repos` et `trello.repos` (`propriétaire/repo`), absentes ou vides = tous les repos suivis | Aucune migration : une config ancienne marche telle quelle (règle 10), défaut inchangé pour tout le monde |
| Le serveur impose ce choix à la création d'issue (`/api/github/issue`), pas seulement la page | La page ne décide pas d'une écriture vers GitHub (règle 4)                                          |
| Une seule liste d'issues par repo, triée ensuite entre Basecamp et Trello                 | Le doublon actuel double les appels GitHub de chacun (cache ETag, quota)                             |

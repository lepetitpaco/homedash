---
objective: "Un onglet Trello reprend le parcours Basecamp (cartes en lecture, cloche, recherche, issue GitHub, rapport publié au clic) sans changer le comportement de Basecamp."
status: implemented
---

# Plan: Onglet Trello

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Cartes Trello assignées, comme les tâches Basecamp : lecture, cloche, recherche, issue, rapport au clic. |
| **Source** | Texte : « à l'instar de la fonctionnalité Basecamp, exactement la même chose mais pour Trello ». |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ---------------------------- |
| 1   | Connexion    | [`phase-1.md`](./phase-1.md) |
| 2   | Mes cartes   | [`phase-2.md`](./phase-2.md) |
| 3   | Cloche       | [`phase-3.md`](./phase-3.md) |
| 4   | Fiche carte  | [`phase-4.md`](./phase-4.md) |
| 5   | Recherche    | [`phase-5.md`](./phase-5.md) |
| 6   | Issue et rapport | [`phase-6.md`](./phase-6.md) |

## Resources

| Source | Verified          |
| ------ | ----------------- |
| https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/ | Clé d'API liée à un Power-Up ; jeton via `1/authorize` (`response_type=token`, `expiration` dont `never`, `scope` `read` / `write` / `account`). `account` seul permet de marquer les notifs lues. Jeton révoqué = HTTP 401 `invalid token`. En-tête `Authorization: OAuth oauth_consumer_key=…, oauth_token=…` accepté. Origines autorisées inutiles sans `return_url`. |
| https://developer.atlassian.com/cloud/trello/rest/api-group-members/ | `GET /1/members/{id}/cards` = cartes dont le membre est membre. `GET /1/members/{id}/notifications` existe. |
| https://developer.atlassian.com/cloud/trello/guides/rest-api/nested-resources/ | Une ressource imbriquée (`/1/members/me/cards`, `/1/members/me/notifications`) ne compte pas dans le quota strict de `/1/members`. `filter` des cartes : `open` (défaut documenté `visible` sur les cartes imbriquées). Champs `due`, `dueComplete`, `closed`, `shortUrl`, `idBoard`, `idList`, `badges`. |
| https://developer.atlassian.com/cloud/trello/guides/rest-api/rate-limits/ | 100 requêtes / 10 s par jeton, 300 / 10 s par clé. `/1/search` a un quota plus strict, sans chiffre publié. 429 = ralentir. Webhooks proposés à la place du sondage, mais ils exigent une URL publique. |
| https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/ | `GET /1/search?query=` renvoie actions, tableaux, cartes, membres, organisations. |
| https://developer.atlassian.com/cloud/trello/rest/api-group-cards/ | `POST /1/cards/{id}/actions/comments` ajoute un commentaire (`text`, 1 à 16 384 caractères). `checklists=all` et `attachments` se lisent avec la carte. |

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| Module jumeau `trello.py`, composants et feuille `tr-*` à part. Aucune généralisation de `basecamp.py`, `TaskHost` ni `IssueHost`. | Basecamp est une fonctionnalité principale : son comportement, ses marqueurs et ses textes restent ceux d'aujourd'hui. |
| Connexion par clé d'API + jeton collé (`expiration=never`, `scope=read,write`, sans `account`). Les deux vivent dans `secrets.json` sous `trello`. Le jeton ne revient dans aucune réponse. Les appels passent par l'en-tête `Authorization`, pas par `?token=`. | Trello n'a pas l'échange de code OAuth 2 de Launchpad. Coller le jeton évite de configurer une origine de redirection. Sans scope `account`, le jeton ne peut pas marquer une notif lue. L'en-tête empêche le jeton de finir dans une URL de journal. |
| Sondage toutes les 60 s, pas de webhook. | homedash n'écoute que le réseau local : Trello ne peut pas l'appeler. Deux GET par cycle (cartes, notifs) restent loin du quota. |
| Marqueurs `homedash:tr` et `homedash:tr-report`, état publié dans `data/tr_posted.json`. | Une issue déjà liée à une tâche Basecamp (`homedash:bc`) ne change pas de sens. `bc_posted.json` et `bc_issues()` restent intacts. |
| « À traiter » = échéance en retard ou sous 7 jours, cartes ouvertes seulement. Pas d'équivalent d'Up Next. | Trello n'a pas la priorité Basecamp. Une carte archivée (`closed`) n'est pas une tâche en cours. |

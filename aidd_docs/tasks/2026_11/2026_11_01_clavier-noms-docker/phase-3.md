---
status: done
---

# Instruction: liens vers les containers Docker (#104)

## Architecture projection

```txt
server/docker.ts             ✅ lecture seule du socket
server/app.ts                ✏️ route GET /api/docker
src/lib/docker.ts            ✅ sondage et sites calculés
src/components/SetDocker.tsx ✅ réglages
src/components/SettingsPage.tsx ✏️ section
src/components/Rail.tsx      ✏️ dossier Docker
src/App.tsx                  ✏️ branchement
src/types.ts                 ✏️ config.docker
docker-compose.dev.yml       ✏️ socket monté pour le dev
tests-ts/docker.test.ts      ✅ tests
ARCHITECTURE.md, GUIDE.md, PRIVACY.md, CHANGELOG-dev.md ✏️ doc
```

## User Journey

```mermaid
flowchart TD
  A[Réglages : activer Docker] --> B[Dossier Docker dans la barre]
  B --> C[Clic : le site du container s'ouvre]
  A --> D[Décocher un container : il disparaît]
```

## Test Scope

```mermaid
journey
  section Happy path
    Activer => les containers avec un port web apparaissent: 5: browser
    Décocher un container => il disparaît: 5: browser
  section Edge case - désactivé
    Option absente => le socket n'est jamais contacté: 1: api
  section Edge case - Docker absent
    Pas de socket => aucun dossier, message clair dans Réglages: 1: api
  section Edge case - lecture seule
    Toute lecture => seul GET /containers/json part: 1: api
```

## Tasks to do

### `1)` Serveur

1. Trouver le socket, GET fixe, délai court, réponse limitée, liens déduits.

### `2)` Page

1. Réglage désactivé par défaut, choix des containers, dossier dans la barre.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Sans activation, aucun accès au socket ; une seule requête GET possible. |
| 2 | Le dossier suit les vrais containers et n'écrit aucun site dans la config. |

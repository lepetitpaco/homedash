---
status: pending
---

# Instruction: Docs et version 2.0.0

## Architecture projection

```txt
.
├── README.md        ✏️ installer depuis les Releases ; dev en Docker
├── GUIDE.md         ✏️ Aide → mise à jour, export complet, accès navigateur
├── CLAUDE.md        ✏️ règles : serveur TS, protocole, plus de Docker utilisateur, pièges
├── ARCHITECTURE.md  ✏️ server/, desktop/, transports
├── AGENTS.md / .cursor/rules ✏️ renvois à jour
└── CHANGELOG.md     ✏️ entrée 2.0.0 (action requise : installer l'appli une fois)
```

## User Journey

```mermaid
flowchart TD
  A[README] --> B[Télécharger le .dmg / setup.exe]
  B --> C[Premier lancement: reprendre ses données]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Happy path
    lecture du README => installation sans Docker décrite: 5: system
    Réglages → Aide => pages Guide à jour: 5: browser
```

## Tasks to do

### `1)` Docs

> Tout ce qui décrit Docker/Python comme mode d'utilisation passe en mode dev.

### `2)` CHANGELOG 2.0.0

> Entrée en tête, `Appli de bureau : 2.0.0`, action requise décrite.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Aucune doc ne demande Docker ou Python pour utiliser homedash |
| 2 | La version affichée par la page est 2.0.0 |

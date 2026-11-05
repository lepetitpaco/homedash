---
status: pending
---

# Instruction: Basecamp User Highlighter, permissions absentes

## Architecture projection

```txt
.
└── popup.js ✏️ permissions.contains absent ou en erreur : on considère l'accès accordé (déclaré dans le manifest)
```

## User Journey

```mermaid
flowchart TD
  A[Popup ouverte] --> B{permissions.contains existe ?}
  B -- oui --> C[comme avant]
  B -- non --> D[pas d'erreur, la popup se remplit]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    extension chargée dans Electron 44 sous xvfb => popup ouverte: 5: system
  section Happy path
    ouvrir la popup => aucune erreur, sections et options affichées: 5: system
```

## Tasks to do

### `1)` Garde

1. Avant `permissions.contains`, tester qu'il existe ; sinon (ou sur erreur) passer la demande d'accès.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Plus d'erreur `contains` à l'ouverture dans Electron ; Chrome et Firefox inchangés |

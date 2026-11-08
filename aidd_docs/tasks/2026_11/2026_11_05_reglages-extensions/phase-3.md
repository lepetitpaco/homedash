---
status: pending
---

# Instruction: Embed Link Copier, repli sur storage.local

## Architecture projection

```txt
.
└── storage.js ✏️ zone choisie : sync seulement si elle répond, sinon local (CRLF gardé)
```

## User Journey

```mermaid
flowchart TD
  A[Popup ou content script lit les réglages] --> B{storage.sync marche ?}
  B -- oui --> C[sync, comme avant]
  B -- non --> D[storage.local]
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
    ouvrir la popup => ses réglages s'affichent: 5: system
    changer un réglage puis rouvrir => le réglage est gardé: 5: system
  section Edge case - Chrome
    storage.sync disponible => lecture => réglages de sync comme avant: 1: system
```

## Tasks to do

### `1)` Repli

1. Lire et écrire via un helper : `storage.sync`, et sur erreur `storage.local`.
2. Pas de perte pour Chrome et Firefox : sync reste le premier choix.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Dans Electron, la popup affiche ses réglages et les garde ; dans Chrome, rien ne change |

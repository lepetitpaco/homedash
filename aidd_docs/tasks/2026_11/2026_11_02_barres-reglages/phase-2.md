---
status: done
---

# Instruction: ⚡ — clic droit et repli

## Architecture projection

```txt
.
├── src/components/Rail.tsx  ✏️ clic droit sur ⚡ → `onHomeMenu` ; en dossier, clic sur ⚡ ouvre/ferme
└── src/App.tsx              ✏️ menu ⚡ : onglets de homedash en haut / dans la barre (✓ sur l'actuel), Disposition et taille…
```

## User Journey

```mermaid
flowchart TD
  A[Clic droit sur ⚡] --> B{Onglets de homedash}
  B -->|En haut de la page| C[⚡ ouvre homedash, onglets en haut]
  B -->|Dans la barre, sous ⚡| D[Dossier ⚡]
  D --> E[Clic sur ⚡ : fermé, compteur total ; rouvert au clic]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    Barre de gauche, onglets de homedash en haut => état de départ: 5: browser
  section Happy path
    Clic droit sur ⚡ => menu avec les deux places, ✓ sur « En haut »: 5: browser
    Choisir « Dans la barre » => dossier ⚡ ouvert avec Raccourcis, GitHub…: 5: browser
    Clic sur ⚡ => dossier fermé, ⚡ seul avec le total des compteurs: 5: browser
    Recharger puis cliquer ⚡ => rouvert: 5: browser
  section Teardown
    Clic droit sur ⚡ → En haut => onglets en haut: 5: browser
```

## Tasks to do

### `1)` Menu ⚡

1. `onContextMenu` sur ⚡ (les deux modes) ; App ouvre un menu titré « homedash ».

### `2)` Repli

1. En dossier, clic sur ⚡ = `toggle('⚡')` (même mémoire que les autres dossiers) ; fermé : badge total, actif si un onglet de homedash est affiché.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Le clic droit sur ⚡ change la place des onglets de homedash, l'actuelle cochée |
| 2 | En dossier, ⚡ s'ouvre et se ferme au clic, et le reste après rechargement |

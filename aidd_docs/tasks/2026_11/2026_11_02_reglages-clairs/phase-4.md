---
status: done
---

# Instruction: Défauts

## Architecture projection

```txt
.
├── src/App.tsx              ✏️ ⚡ en dossier quand rien n'est choisi
└── src/components/SetTabs.tsx or SettingsPage.tsx ✏️ bloc Docker seulement si Docker est là ou déjà activé
```

## User Journey

```mermaid
flowchart TD
  A[Nouvel écran] --> B[⚡ en dossier : Raccourcis, GitHub… à un clic]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Happy path
    Stockage vide => la barre montre le dossier ⚡ ouvert: 5: browser
    Docker absent et coupé => Mes sites sans bloc Docker: 5: browser
  section Edge case - choix déjà fait
    homedash:dash-place = top => onglets en haut, inchangé: 1: browser
```

## Tasks to do

### `1)` Défauts

1. ⚡ en dossier par défaut ; un choix enregistré reste respecté.
2. Docker proposé seulement s'il est détecté ou déjà activé.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Sans choix, dossier ⚡ ; un choix enregistré l'emporte ; Docker caché quand absent |

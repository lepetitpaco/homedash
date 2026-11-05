---
status: done
---

# Instruction: Style des onglets

## Architecture projection

```txt
.
├── src/components/Tabs.tsx              ✏️ prop `look` : pastilles ou soulignés (classe sur la barre)
├── src/components/RailLayoutPicker.tsx  ✏️ choix « Style des onglets »
├── src/App.tsx                          ✏️ pref homedash:tab-style (défaut pastilles)
├── src/styles/github.css                ✏️ variante soulignée (ancien rendu, passage à la ligne gardé)
├── GUIDE.md                             ✏️ le choix
└── CHANGELOG-dev.md                     ✏️ la branche
```

## User Journey

```mermaid
flowchart TD
  A[Clic droit sur une barre] --> B[Disposition et taille]
  B --> C{Style des onglets}
  C -->|Pastilles, défaut| D[Pastilles arrondies]
  C -->|Soulignés| E[Onglets soulignés, comme avant]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    localStorage vide => style par défaut: 5: browser
  section Happy path
    Ouvrir la page => onglets en pastilles: 5: browser
    Choisir Soulignés dans Disposition et taille => onglets soulignés, actif souligné en bleu, sans défilement horizontal: 5: browser
    Recharger => le choix tient: 5: browser
  section Edge case - onglets en haut
    Barre de gauche cachée => choisir Soulignés => tous les onglets et dossiers soulignés sur plusieurs rangées: 1: browser
  section Teardown
    Revenir à Pastilles => rendu par défaut: 5: browser
```

## Wireframe

```txt
┌ Disposition ──────────────┐
│ [1] dispositions…         │
│ [2] Style des onglets     │
│     (●pastilles) (souligné)│
│ [3] Taille / masquage     │
└───────────────────────────┘
1 inchangé · 2 deux choix à miniature · 3 inchangé
```

## Tasks to do

### `1)` Pref et choix

1. App : `tabStyle` lu/écrit dans `homedash:tab-style`, `pills` par défaut.
2. Picker : section « Style des onglets », deux choix.
3. Tabs : classe `is-underline` sur la barre quand soulignés.

### `2)` Rendu souligné

1. CSS : sans fond ni contour arrondi, bordure basse, actif souligné en bleu ; duo, dossier, compte, éphémère cohérents.

### `3)` Doc

1. GUIDE et CHANGELOG-dev.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Sans réglage, pastilles ; le choix tient au rechargement |
| 2 | Soulignés : actif souligné, rangées sans défilement horizontal, dans les deux thèmes |
| 3 | Le GUIDE décrit le choix |

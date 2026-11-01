---
status: done
---

# Instruction: changer de site au clavier (#102)

## Architecture projection

```txt
desktop/main.js              ✏️ intercepte Ctrl+Tab et le relâchement de Ctrl
desktop/preload.js           ✏️ mot `site-switcher`, abonnement onSiteSwitch
src/lib/desktop.ts           ✏️ type du pont
src/lib/siteSwitch.ts        ✅ ordre récent et pas suivant, purs
src/components/SiteSwitcher.tsx ✅ liste à l'écran
src/styles/rail.css          ✏️ style de la liste
src/App.tsx                  ✏️ branchement
tests-ts/siteswitch.test.ts  ✅ tests
GUIDE.md, CHANGELOG-dev.md   ✏️ doc
```

## User Journey

```mermaid
flowchart TD
  A[Ctrl+Tab] --> B[Liste des sites, ordre récent]
  B --> C[Tab ou Maj+Tab déplacent la sélection]
  C --> D[Ctrl relâché : le site s'ouvre]
```

## Test Scope

```mermaid
journey
  section Happy path
    Ctrl+Tab puis relâcher => retour au site précédent: 5: system
    Deux Tab avant de relâcher => troisième site le plus récent: 5: system
  section Edge case - focus dans un site
    Focus dans une webview => Ctrl+Tab => la liste s'ouvre: 1: system
  section Edge case - Echap
    Liste ouverte => Echap => on reste sur le site: 1: system
```

## Tasks to do

### `1)` Logique pure

1. Ordre récent, sites absents retirés, nouveaux ajoutés à la fin.

### `2)` Coquille et page

1. `before-input-event` sur la fenêtre et chaque webview.
2. Liste affichée, ouverture au relâchement, annulation par Échap ou perte de focus.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Les tests de `siteSwitch` passent. |
| 2 | Ctrl+Tab change de site, y compris le focus dans un site, dans l'appli de dev. |

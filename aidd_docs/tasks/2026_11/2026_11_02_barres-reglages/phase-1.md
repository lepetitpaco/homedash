---
status: done
---

# Instruction: Formulaire des barres clarifié

## Architecture projection

```txt
.
├── src/components/BarLayoutForm.tsx     ✅ les choix : où sont les onglets, puis les options du mode, masquage auto
├── src/components/RailLayoutPicker.tsx  ✏️ simple fenêtre flottante autour du formulaire
├── src/App.tsx                          ✏️ un objet `bars` (valeurs + setters) ; plus de » ni « Afficher la barre de gauche »
└── src/styles/rail.css                  ✏️ styles du formulaire hors de la fenêtre flottante ; » retiré
```

## User Journey

```mermaid
flowchart TD
  A[Clic droit sur une barre] --> B[Disposition et taille]
  B --> C{Les onglets}
  C -->|Barre de gauche| D[Disposition 6 choix, taille des icônes]
  C -->|En haut| E[Style des onglets, taille des onglets]
  B --> F[Style des onglets du haut, masquage auto]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    localStorage vide, barre de gauche => état par défaut: 5: browser
  section Happy path
    Ouvrir Disposition et taille => voir « Les onglets » puis seulement les options de la barre de gauche: 5: browser
    Choisir En haut => la barre de gauche disparaît, le menu montre style et taille des onglets: 5: browser
    Chercher un » ou « Afficher la barre de gauche » => aucun: 5: browser
    Choisir Barre de gauche dans le menu => elle revient: 5: browser
```

## Wireframe

```txt
┌ Disposition et taille ─────────────┐
│ [1] Les onglets                    │
│     (▮ Barre de gauche) (▬ En haut) │
│ [2] Options du mode choisi          │
│     gauche : 6 dispositions, taille │
│     haut   : —                      │
│ [3] Onglets du haut : style, taille │
│ [4] ☐ Masquer automatiquement       │
└────────────────────────────────────┘
1 deux grands choix · 2 seulement le mode actif · 3 pastilles/soulignés + taille · 4 case
```

## Tasks to do

### `1)` Formulaire

1. `BarLayoutForm` : section « Les onglets » (deux choix), puis disposition et taille d'icônes si barre de gauche, puis « Onglets du haut » (style, taille), puis la case.
2. `RailLayoutPicker` n'est plus que la fenêtre flottante (placement, fermeture).

### `2)` Plus de retour accidentel

1. Retirer le bouton » et l'entrée « Afficher la barre de gauche ».

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Le menu montre d'abord « Les onglets » ; les options de l'autre mode n'apparaissent pas |
| 2 | Sans barre de gauche, aucun bouton ni entrée de menu ne la fait revenir hors du choix de disposition |

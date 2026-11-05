# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/fix/site-bord-a-bord

- Site affiché : il va bord à bord (6 px autour, plus de largeur de page ni de cadre) et prend toute la hauteur
  qui reste, mesurée au lieu d'un forfait. Son en-tête (nom, ← → ↻) monte dans la barre du haut aussi quand
  les onglets sont en haut ou masqués : avant, barres masquées donnait le rendu le plus gaspilleur. Sur 1600×1000,
  tout masqué : 1350×811 → 1588×909 px. Issue #129.

## paco/feature/cloche-par-type

- Cloche : une version Renovate publiée sur plusieurs dépôts ne fait plus qu'une ligne (« ×6 », les autres dépôts
  dessous), dans la cloche comme dans l'historique, et le compteur compte des lignes, pas des événements.
- Réglages → Notifications → *Ce qui compte dans la cloche* : pour chaque type d'événement, *Compter* (défaut,
  comme avant), *Discret* (dans la liste, sans compteur ni notification) ou *Masqué*. Issue #131.

## paco/fix/dates-github

- GitHub (Branches actives, PRs ouvertes, Mergées, Renovate) : les dates sont à l'heure locale et lisibles, « 14:12 »
  aujourd'hui, « hier 14:12 », « 3 nov. 14:12 », la date complète en bulle, au lieu de `11-05T14:12` à l'heure UTC.
  Issue #140.

## paco/fix/demo-data

- Outillage (rien de visible) : `docs/demo/data/`, la config fictive de l'instance de démo, est enfin versionnée
  (`.gitignore` l'excluait avec tous les `data/`) ; `sh docs/demo/capture.sh` refait de nouveau les captures. Issue #136.

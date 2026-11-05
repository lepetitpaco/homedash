# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/fix/dates-github

- GitHub (Branches actives, PRs ouvertes, Mergées, Renovate) : les dates sont à l'heure locale et lisibles, « 14:12 »
  aujourd'hui, « hier 14:12 », « 3 nov. 14:12 », la date complète en bulle, au lieu de `11-05T14:12` à l'heure UTC.
  Issue #140.

## paco/fix/demo-data

- Outillage (rien de visible) : `docs/demo/data/`, la config fictive de l'instance de démo, est enfin versionnée
  (`.gitignore` l'excluait avec tous les `data/`) ; `sh docs/demo/capture.sh` refait de nouveau les captures. Issue #136.

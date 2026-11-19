# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/feature/vue-scindee

- **Vue scindée** (#160) : 2 à 4 sites côte à côte dans un seul onglet (les sites déjà ouverts sont placés par CSS dans leur panneau, sans rechargement), 6 dispositions, séparateurs glissables, panneau agrandi. Deux modes, Classic (tous les sons, aucune touche interceptée) et Scroll (le son suit la souris, raccourcis, actions par site (J'aime, Enregistrer, Repartager, Commenter ; pas de Suivre), table de mixage (remplace J K, N P, Z et les actions), scroll synchronisé), définis par des cases à cocher (`ui.split`, Réglages → Vue scindée). Clavier AZERTY / QWERTY (données `PRESETS`).
- Logique pure dans `src/lib/splitView.ts` (tests : `tests-ts/splitview.test.ts`) ; relais des touches, du survol et de la molette dans `desktop/` (`homedash:split-*`, `guest-preload.js` inactif vue fermée) ; actions par site dans `desktop/site-adapters.js`.
- **Pause des vidéos** (#168) : en Scroll, les vidéos des panneaux qui n'ont pas le son sont mises en pause et reprennent avec lui (case *Pause : les panneaux inactifs*).
- **Vues scindées enregistrées** (#169, touche Mes sites) : *Garder cette vue* (nom, disposition, sites) la range dans la barre de gauche avec son compteur ; clic = ouvre, clic droit = renommer / supprimer ; sélecteur de panneau avec le nom du compte (« X · pro »), compte déjà pris grisé ; site retiré = panneau vide. Clé `splitViews` de `config.json` (absente = aucune vue, validée avant écriture, reprise par sauvegardes et export). Pas encore : dossiers et ordre, onglet temporaire dans un panneau, proportions rejouées (#172).
- Pas encore : copie dans un onglet temporaire, mesures de performance (Mac, Windows), « Quoi de neuf » (à la version).


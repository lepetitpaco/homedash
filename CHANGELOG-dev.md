# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/feature/vue-scindee

- **Vue scindée** (#160) : 2 à 4 sites côte à côte dans un seul onglet (les sites déjà ouverts sont placés par CSS dans leur panneau, sans rechargement), 6 dispositions, séparateurs glissables, panneau agrandi. Deux modes, Classic (tous les sons, aucune touche interceptée) et Scroll (le son suit la souris, raccourcis, actions par site (J'aime, Enregistrer, Repartager, Commenter ; pas de Suivre), table de mixage (remplace J K, Z et les actions), scroll synchronisé), définis par des cases à cocher (`ui.split`, Réglages → Vue scindée). Clavier AZERTY / QWERTY (données `PRESETS`).
- Logique pure dans `src/lib/splitView.ts` (tests : `tests-ts/splitview.test.ts`) ; relais des touches, du survol et de la molette dans `desktop/` (`homedash:split-*`, `guest-preload.js` inactif vue fermée) ; actions par site dans `desktop/site-adapters.js`.
- **Pause des vidéos** (#168) : en Scroll, les vidéos des panneaux qui n'ont pas le son sont mises en pause et reprennent avec lui (case *Pause : les panneaux inactifs*).
- Pas encore : copie dans un onglet temporaire, mesures de performance (Mac, Windows), « Quoi de neuf » (à la version).


# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/fix/site-bord-a-bord

- Site affiché : il va bord à bord (6 px autour, plus de largeur de page ni de cadre) et prend toute la hauteur
  qui reste, mesurée au lieu d'un forfait. Son en-tête (nom, ← → ↻) monte dans la barre du haut aussi quand
  les onglets sont en haut ou masqués : avant, barres masquées donnait le rendu le plus gaspilleur. Sur 1600×1000,
  tout masqué : 1350×811 → 1588×909 px. Issue #129.

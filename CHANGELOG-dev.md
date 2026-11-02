# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/feature/onglets-pastilles

- Barre d'onglets du haut en pastilles arrondies, toutes à la même hauteur ; quand la place manque elles passent à la
  ligne au lieu de défiler en largeur. Onglet affiché : pastille bleutée ; compte de connexion : contour à sa couleur ;
  éphémère : contour pointillé ; GitHub ⇄ Local : une pastille double. Un site affiché dessous suit sa hauteur.
- *Disposition et taille…* (clic droit sur une barre) et la nouvelle page *Réglages → Barres et onglets* : d'abord où
  sont les onglets (barre de gauche ou en haut) et, juste dessous, *Masquer automatiquement* (la barre revient au
  survol du bord) ; puis seulement les options du mode choisi : disposition et taille des icônes, ou style (pastilles
  par défaut, ou soulignés comme avant) et taille des onglets. Propre à chaque écran, appliqué tout de suite.
- Onglets en haut : un dossier de sites est une pastille (somme de ses non-lus) qui montre ses sites au clic ; Docker
  aussi. Plus de languette » ni d'entrée de menu pour revenir d'un clic à la barre de gauche : ça passe par le choix de
  disposition.
- Clic droit sur ⚡ : Raccourcis, GitHub, Local… en haut de la page, ou dans un dossier ⚡ de la barre de gauche (un seul
  clic ; Raccourcis y prend 🔗). Le dossier ⚡ se replie au clic, avec le total des compteurs.
- Barre de gauche, taille Petit : l'icône d'un dossier ouvert est alignée sur ses sites (elle était décalée de 4 px).
- Le choix de disposition ne sort plus de l'écran (à droite ou en bas).
- Réglages rangés : *Accès depuis le navigateur* passe d'Affichage à Fonctionnalités ; l'activation du journal de
  performance passe d'Affichage à *Aide → Journal de performance*, page désormais toujours listée.

## paco/feature/issue-sections-basecamp

- Issue liée à Basecamp ou Trello (#116) : le corps a une section par source, *🎯 Mon besoin* (tes précisions),
  *Carte* (la description, reprise telle quelle) et *💬 Échanges* ; une section vide n'apparaît pas.
- Plus aucun `@` devant un nom (GitHub notifiait le compte de ce nom) ; les e-mails et adresses web sont épargnés.
- Les lignes indentées ne s'affichent plus en bloc de code, les sauts de ligne de Basecamp sont gardés ; ce qui suit
  une ligne de tirets est replié.
- La consigne pour Claude Code nomme les trois sections : la carte est la demande d'origine, *Mon besoin* prime en cas d'écart.

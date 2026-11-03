# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».



## paco/fix/reglages-finitions

- Cartes GitHub et Local : le nombre de colonnes choisi devient un maximum ; sur un écran étroit, une carte ne descend
  plus sous 360 px (à 800 px, deux colonnes faisaient des cartes de 290 px aux en-têtes coupés).
- Réglages → Affichage : à 1 024 px, *Plus de réglages* ne déborde plus de sa carte ; les modèles passent à la ligne.
- Local : « synchro il y a… » reste sur une ligne, c'est le chemin qui se raccourcit.
- Réglages sur écran étroit : la bande du menu des parties a une barre de défilement fine.
- Éditeur de note : « Supprimer » et « Fermer » avec majuscule.

## paco/feature/reglages-clairs

- **La recherche trouve les Réglages** : chaque page et les réglages qu'on cherche (« veille », « sauvegarde », « jeton »,
  « disposition »…) ouvrent directement la bonne page, GitHub sur le bon sous-onglet.
- **Réglages plus courts** : *Vue d'ensemble* en tête (ce qui est branché, ce qui manque, la dernière sauvegarde, un bouton
  vers chaque page) ; groupes Général, Services, La page, Données, Aide ; 13 entrées au lieu de 15. Docker passe dans
  *Mes sites* et n'est proposé que si Docker tourne ; journal d'erreurs et de performance réunis dans *Diagnostic* ;
  *Nouveautés* reste au bouton de version (et au menu de l'appli). Les anciens liens mènent à la nouvelle place.
- **Pages allégées** : GitHub en sous-onglets (*Compte*, *Repos suivis*, *Équipe*, *Ce que montre l'onglet*, Renovate sous
  *Avancé*) ; Sauvegardes : les 5 dernières, *Voir tout* pour faire le ménage, export complet replié ; Affichage, Mes
  sites et Diagnostic : le secondaire replié sous *Plus de réglages*.
- *Réglages → Barres et onglets* : une ligne par réglage (le nom et sa phrase à gauche, le contrôle à droite, tous
  alignés) ; *Masquer automatiquement* devient un interrupteur ; deux ou trois options = un sélecteur segmenté ; les six
  dispositions de la barre en une rangée de miniatures. Basculer barre de gauche / en haut ajoute ou retire des lignes,
  rien ne saute. Tient sans défilement dès 1 137 × 777 ; le menu flottant garde le même ordre, en une colonne.
- **Défaut** : Raccourcis, GitHub, Local… dans le dossier ⚡ de la barre (un clic) tant qu'on n'a rien choisi.
- **Un vocabulaire** : site (plus « onglet » pour une icône de la barre), compteur (plus « pastille » pour un nombre),
  compte, Activité, Local ; boutons avec majuscule, Basecamp et Trello formulés pareil. Lexique dans `CLAUDE.md`.
- **?** en haut à droite ouvre le Guide ; le menu d'un lien a ses icônes ; plus de *Cacher la barre* au clic droit (le
  choix se fait dans *Disposition et taille…*).

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
- *Réglages → Affichage* : plus de chiffres à taper ni de préréglages d'écran, des modèles à miniature : largeur de la
  page (toute la largeur, large, centrée, étroite), densité de Raccourcis (compacte, normale, aérée), cartes GitHub et
  Local (auto, 1 à 3 colonnes), tuiles (4 à 16), test des voyants (30 s à jamais). Mêmes valeurs par défaut ; une
  valeur réglée à la main avant reste appliquée, signalée « personnalisé ».
- Réglages rangés : *Accès depuis le navigateur* passe d'Affichage à Fonctionnalités ; l'activation du journal de
  performance passe d'Affichage à *Aide → Journal de performance*, page désormais toujours listée.

## paco/feature/issue-sections-basecamp

- Issue liée à Basecamp ou Trello (#116) : le corps a une section par source, *🎯 Mon besoin* (tes précisions),
  *Carte* (la description, reprise telle quelle) et *💬 Échanges* ; une section vide n'apparaît pas.
- Plus aucun `@` devant un nom (GitHub notifiait le compte de ce nom) ; les e-mails et adresses web sont épargnés.
- Les lignes indentées ne s'affichent plus en bloc de code, les sauts de ligne de Basecamp sont gardés ; ce qui suit
  une ligne de tirets est replié.
- La consigne pour Claude Code nomme les trois sections : la carte est la demande d'origine, *Mon besoin* prime en cas d'écart.

## paco/feature/stats-basecamp

- Basecamp (#118) : panneau *📊 Stats*, qui a créé combien de tâches et cartes (et combien sont faites), par personne
  ou par projet, détail par mois, périodes (7/30 j, mois, 3/12 mois, personnalisée), tri par colonne, plein écran ;
  sur les projets dont on est membre. Réserve d'un an dans `data/bc_stats.json` (cache), puis seulement ce qui a changé.
- Réglages → Basecamp : *Stats en arrière-plan* (désactivé par défaut) : un an rempli par tranches d'une minute, puis
  mise à jour toutes les 15 min ; tour complet chaque semaine.
- Lecture conforme à l'API Basecamp : pages suivies par `Link`, 3 requêtes/s au plus, `Retry-After` sur 429, nouvel
  essai sur 5xx, ETag sur les mises à jour.

## paco/feature/issue-plusieurs-repos

- Issue liée à Basecamp ou Trello : *Autres repos concernés*, à cocher parmi les repos suivis. L'issue reste dans un
  seul repo et cite les autres (*🔗 Repos concernés*) ; la consigne et le prompt demandent une pull request par repo
  et un seul rapport. Aucune écriture dans les autres repos.

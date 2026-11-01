# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/feature/barre-noms

- Barre de gauche, nouveau panneau *Disposition et taille…* dans son clic droit : icônes, icônes et titres, titres, ou tuiles sur 1 à 3 colonnes ; petit, normal ou grand. Un bouton réduit la barre aux icônes et la redéplie. Les anciens réglages sont repris (#103).

## paco/feature/changer-site-clavier

- Ctrl+Tab et Ctrl+Maj+Tab changent de site dans l'appli, du plus récent au plus ancien, même quand le focus est dans un site : un appui rapide revient au site d'avant, Ctrl gardé affiche les sites en tuiles, à choisir au clavier ou au clic (#102).

## david/fix/basecamp-auteurs

- Basecamp, fenêtre d'une tâche (#100) : on voit qui l'a créée et quand (« Description · créée par … ») ; les
  @mentions s'affichent en **@Prénom Nom** au lieu de « 📎 pièce jointe » suivi de code ; chaque échange montre
  l'heure, plus seulement le jour. Plus lisible : chaque personne a sa couleur (avatar, nom, barre de ses messages),
  nom et heure mis en avant, « Créée par » en en-tête de la description, mentions en pastille, jours séparés par un trait.

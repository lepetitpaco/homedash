# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».


## paco/fix/test-full-2-5-0

- Basecamp, 📊 Stats : *Plein écran* couvre enfin la fenêtre (le panneau se vidait), et le détail par mois défile au
  lieu de couper la colonne Total.
- Réglages → Notifications : chaque icône a sa place, les emoji ne collent plus au texte. Barres et onglets :
  « Icônes + titres » ne passe plus sur trois lignes.
- La recherche des Réglages trouve aussi *Liens qui ouvrent un nouvel onglet*, *Onglets temporaires gardés* et
  *Repos où créer les issues* (Basecamp, Trello).
- Mots justes : « Local » au lieu de « Dépôts locaux », Docker dans *Réglages → Mes sites*, GitHub non connecté mène à
  *Réglages → GitHub*.
- Un site pas encore prêt ne laisse plus d'erreur « The WebView must be attached… » au journal d'erreurs.
- Doc : Guide (paragraphe Docker remis d'aplomb, ⌘⇧F, Extensions dans le tableau des Réglages), PRIVACY (extensions),
  ARCHITECTURE, captures `github` et `cloche` refaites, cas de la 2.5.0 dans la liste de `/test-app full`.

## paco/feature/quoi-de-neuf

- **✨ Quoi de neuf** : après une mise à jour, une fenêtre présente les nouveautés, une carte chacune, avec une capture
  quand elle parle d'elle-même et *Essayer* qui mène au bon endroit. Une seule fois par version, jamais à la première
  installation ; à revoir depuis le numéro de version, en haut à droite. Touche : Mise à jour.

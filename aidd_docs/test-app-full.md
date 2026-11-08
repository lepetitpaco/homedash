# Liste de `/test-app full`

Chaque écran aux tailles et thèmes de la commande. Un bug trouvé ajoute sa ligne ici.

## Partout

- Barre de gauche, barre du haut, recherche, cloche, thème, pied de page.
- Aucune barre de défilement double, aucun débordement horizontal.
- Cloche : Renovate sur plusieurs dépôts = une ligne « ×N » ; Réglages → Notifications, chaque type en Compter, Discret, Masqué.

## Raccourcis

- Tuiles, Notes (repli, nouvelle note, note ouverte depuis la recherche), Infos (repli, copier), catégories.

## Mes sites

- Démarrage échelonné et anneaux ; onglet ouvert, précédent et suivant ; onglet temporaire, le garder.
- `Ctrl+Tab` : appui rapide, `Ctrl` gardé, chiffres, clic, Échap, focus dans un site, barre cachée.
- Barre : chaque disposition et taille, Réduire, Masquer automatiquement, avec compteurs (non-lus, onglets, son, veille) et deux comptes.
- Onglets en haut : pastilles et soulignés, chaque taille, passage à la ligne, dossier de sites, Docker ; ⚡ en haut ou dans la barre.
- Dossiers, 🐳 compris : glisser devant un site, un dossier, en bas ; regrouper ou supprimer le site à côté.
- Réglages : mémoire, Libérer, Plus d'options, Catalogue, Configuration recommandée.
- `⌘K` : actions par site.
- Site bord à bord : en-tête ← → ↻ dans la barre du haut, chaque disposition, barres masquées comprises.
- Mode focus : ⤢ et ⌘⇧F (aussi en tapant dans le site), barres au bord, sortie par ⤡, ⌘⇧F ou en quittant le site.
- Barres masquées : sites à non-lus à gauche de la cloche (3 au plus, puis +N), un clic ouvre le site.
- Compteurs : clic droit sur Local, Basecamp, Trello (ce qu'il compte, le masquer) ; clic droit sur ⚡ (fermer les onglets ouverts).
- Extensions (appli) : ajouter un dossier, recharger les sites, l'extension agit, ⚙ Réglages (fenêtre à la largeur de sa popup, sans barre horizontale, un 2e clic la ramène, un lien part dans le navigateur, un réglage gardé à la réouverture), la retirer (sa fenêtre se ferme).

## GitHub et Local

- Comptes, branches, PR, CI, carte En cours (si un workflow tourne), Renovate ; verdicts de Local, commandes à copier.
- ↗ ouvrir les N (branche sur plusieurs repos) : dans l'appli et dans un navigateur qui bloque les fenêtres.
- Local à 800 px : le nom de la branche reste visible, les pastilles ne se chevauchent pas.
- Dates GitHub : « 14:12 », « hier 14:12 », « 3 nov. 14:12 » à l'heure locale, la date complète au survol.

## Basecamp

- À traiter, To-dos, Kanban (colonne au nom long, 25 cartes), compteur Kanban ; clic droit sur l'onglet : Masquer le compteur.
- 📊 Stats : par personne et par projet, chaque période, tri, plein écran ; Stats en arrière-plan.
- Fenêtre : lecture, image, Échap, clic dehors.

## Trello

- À traiter, tableau, cartes grosses et fines, étiquettes, échéances, photos, thème clair.
- Liste Issues vide et terminées : une ligne ne passe pas en plein écran.
- Fenêtre : description, étapes, pièce jointe, conversation du plus ancien au plus récent.

## Créer une issue (Basecamp et Trello)

- Tout inclure, Rien inclure, un seul message, description cochée ou non, aperçu sans en-tête.
- Sections Mon besoin, Carte, Échanges (vide = absente), aucun `@` ; Autres repos concernés.
- Depuis le titre, le clic droit, la recherche, un message.
- À 800 px : rien ne se superpose.
- Formulaire GitHub, Copier la commande et le prompt (focus simulé), Voir sur GitHub.
- Sur le repo de test : créer, rapport, publier, fermer.

## Quoi de neuf

- Après une mise à jour (`data/version.json` à une version plus ancienne, puis relance) : s'ouvre une fois, pas au rechargement suivant ; jamais après une première installation.
- Cartes et captures recadrées, deux colonnes puis une seule sous 860 px, Échap, ✕, clic dehors, *Essayer* mène au bon endroit.
- Rouverte par le numéro de version et par la page Nouveautés (recherche « nouveautés ») ; une fonctionnalité coupée n'a pas sa carte.

## Réglages

- Vue d'ensemble, chaque page (tient sur un écran), Enregistrer, Annuler, sauvegardes ; la recherche ouvre la bonne page.

## Appli

- Menu Branche : changer, refus si modifications, récupérer, nettoyer, journal du dev.

## Docker

- Désactivé par défaut, lignes par projet, éteints fades sans clic, un container qui démarre ou s'arrête change de ligne (homedash ne fait que lire), autres ports au clic droit.
- Appli installée : le socket est trouvé. Docker coupé : le message le dit.

## Bugs trouvés à revérifier

- Une action `⌘K` qui change de nom après usage : relancer la même recherche peut tomber sur le résultat Google.
- Réglages → Affichage à 1024×700 (deux thèmes) : « Plus de réglages » déborde de 26 px à droite de sa carte, bord coupé (colonnes de 118 px mini dans 532 px). Corrigé en 2.5.0.
- Éditeur de note : boutons « supprimer » et « fermer » sans majuscule (lexique de CLAUDE.md). Corrigé en 2.5.0.
- Réglages à 800×600 : la bande du menu des parties montre une grosse barre de défilement système. Corrigé en 2.5.0.
- Local à 800×600 avec 2 colonnes réglées : l'en-tête de carte se coupe (« synchro il y a / 3 min »). Corrigé en 2.5.0.
- (2026-11-02) L'action `⌘K` qui change de nom : ne se reproduit plus (« thème » deux fois → Thème clair puis Thème sombre).
- (2026-11-05) Basecamp → 📊 Stats → ⤢ Plein écran : le panneau se vide, son contenu part sous la page. `.bc-stats-overlay` et `.bc-stats.is-full` n'ont aucune règle CSS (`BcStats.tsx:346`). 1280×720, clair (rien de propre au thème). Corrigé en 2.5.0.
- (2026-11-05) Basecamp → 📊 Stats → 📅 détail par mois à 1280×720 : la colonne Total est coupée à droite (tableau de 804 px dans 756, `.bc-stats-scroll` sans défilement). Corrigé en 2.5.0 (défile).
- (2026-11-05) Réglages → Notifications, *Ce qui compte dans la cloche* : pas d'espace entre l'emoji et le texte (« 🎉PR et branches mergées », « 🤖Renovate… »), même chose sur « 🐙Créer une issue ». Deux thèmes, toutes tailles. Vu de près (écran Retina), l'espace est là : c'était surtout la capture en 1×. Les icônes ont quand même leur colonne en 2.5.0.
- (2026-11-05) Réglages → Barres et onglets à 1024×700 : « Icônes + titres » passe sur 3 lignes dans sa miniature. Corrigé en 2.5.0 (2 lignes).
- (2026-11-05) Onglet Local : « Dépôts locaux » en tête de carte (lexique : Local). Corrigé en 2.5.0.
- (2026-11-05) Journal d'erreurs de la prod (2.4.1, le 01/11 et le 05/11) : « The WebView must be attached to the DOM… », en anglais dans Diagnostic. Un appel à la webview avant `dom-ready` sans garde (`CustomTabView.tsx` : `getURL`, `getTitle`, `canGoBack`…). Corrigé en 2.5.0 : la relecture des non-lus attend `dom-ready` ; à revérifier dans le journal après quelques jours.

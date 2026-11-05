# Liste de `/test-app full`

Chaque écran aux tailles et thèmes de la commande. Un bug trouvé ajoute sa ligne ici.

## Partout

- Barre de gauche, barre du haut, recherche, cloche, thème, pied de page.
- Aucune barre de défilement double, aucun débordement horizontal.

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

## GitHub et Local

- Comptes, branches, PR, CI, carte En cours (si un workflow tourne), Renovate ; verdicts de Local, commandes à copier.
- ↗ ouvrir les N (branche sur plusieurs repos) : dans l'appli et dans un navigateur qui bloque les fenêtres.
- Local à 800 px : le nom de la branche reste visible, les pastilles ne se chevauchent pas.

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

## Réglages

- Vue d'ensemble, chaque page (tient sur un écran), Enregistrer, Annuler, sauvegardes ; la recherche ouvre la bonne page.

## Appli

- Menu Branche : changer, refus si modifications, récupérer, nettoyer, journal du dev.

## Docker

- Désactivé par défaut, lignes par projet, éteints fades sans clic, démarrage et arrêt, autres ports au clic droit.
- Appli installée : le socket est trouvé. Docker coupé : le message le dit.

## Bugs trouvés à revérifier

- Une action `⌘K` qui change de nom après usage : relancer la même recherche peut tomber sur le résultat Google.
- Réglages → Affichage à 1024×700 (deux thèmes) : « Plus de réglages » déborde de 26 px à droite de sa carte, bord coupé (colonnes de 118 px mini dans 532 px). Corrigé en 2.5.0.
- Éditeur de note : boutons « supprimer » et « fermer » sans majuscule (lexique de CLAUDE.md). Corrigé en 2.5.0.
- Réglages à 800×600 : la bande du menu des parties montre une grosse barre de défilement système. Corrigé en 2.5.0.
- Local à 800×600 avec 2 colonnes réglées : l'en-tête de carte se coupe (« synchro il y a / 3 min »). Corrigé en 2.5.0.
- (2026-11-02) L'action `⌘K` qui change de nom : ne se reproduit plus (« thème » deux fois → Thème clair puis Thème sombre).

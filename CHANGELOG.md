# Changelog

Une version par livraison visible, la plus récente en haut (règles : `CLAUDE.md`). Chaque version est
aussi un tag git `vX.Y.Z`. Affiché en cliquant sur le numéro de version, en haut à droite ; une version
plus récente sur GitHub déclenche la notification « mise à jour disponible ».

## 1.8.0 — 2026-10-13

- Réglages → Repos suivis : la pastille « Carte » devient **GitHub** et **Accueil**. Chaque repo choisit
  s'il apparaît dans la carte Repos de l'onglet GitHub (une ligne, avec ses branches et PRs), dans celle
  de Raccourcis, ou les deux. Par défaut : onglet GitHub seulement.

## 1.7.1 — 2026-10-13

- Fenêtre du changelog : la commande de mise à jour est toujours affichée en haut, prête à coller dans
  n'importe quel terminal (avec le `cd` vers le dossier du projet).

## 1.7.0 — 2026-10-13

- Réglages → Affichage : **presets** Ultra-wide 49", Ultra-wide 34" et MacBook Pro ; un clic remplit les
  réglages.
- Valeurs par défaut taillées pour un 49" : page centrée à 60 %, GitHub et Local sur 2 colonnes. La page ne
  descend jamais sous 1 400 px, donc rien ne change sur un portable.
- Réglages : les champs d'une même rangée sont alignés.

## 1.6.1 — 2026-10-13

- Réglages → Affichage : une taille à 0 ou vide reprend sa valeur par défaut (une colonne de titres ou un
  lien à 0 px cassait la mise en page), et chaque taille a un minimum.
- La page ne peut plus défiler en largeur.
- Changelog : le `code` s'affiche comme du code.

## 1.6.0 — 2026-10-13

- La recherche trouve aussi les **PRs** (titre, `#numéro`, branche), les **branches actives** et les
  **dépôts locaux**, chacun avec sa carte.
- La carte d'un repo montre aussi son état **sur ton disque** (branche courante, fichiers modifiés,
  branches à supprimer, commande à copier).
- Réglages → Affichage : « Largeur d'une carte » expliquée avec un exemple.

## 1.5.0 — 2026-10-13

- **Recherche** : la carte complète de l'élément sélectionné s'affiche à côté des résultats (raccourci,
  repo avec ses PRs et branches, info, note), avec ses actions.
- Les **repos** sont trouvables dans la recherche.
- Le changelog s'ouvre dans une fenêtre centrée.

## 1.4.2 — 2026-10-13

- Le changelog quitte les onglets : un clic sur le **numéro de version**, en haut à droite, l'affiche. Il
  passe en bleu quand une mise à jour est disponible.

## 1.4.1 — 2026-10-13

- Réglages : la barre du compte, la carte et la barre « Enregistrer » ont la même largeur.

## 1.4.0 — 2026-10-13

- **Changelog** : les nouveautés de chaque version.
- Notification quand une nouvelle version est disponible sur GitHub, avec la commande pour mettre à jour.
- Tes données sont sauvegardées automatiquement avant chaque mise à jour.

## 1.3.4 — 2026-10-13

- Pied de page collé en bas de l'écran.

## 1.3.3 — 2026-10-13

- Réglages : une partie à la fois, le menu de gauche change de partie.

## 1.3.2 — 2026-10-13

- Réglages → Affichage : chaque paramètre explique ce qu'il change.

## 1.3.1 — 2026-10-13

- Largeur de la page réglée en **% de l'écran**.

## 1.3.0 — 2026-10-13

- Mise en page réglable (Réglages → Affichage) : largeur de la page, colonnes des onglets GitHub et Local.

## 1.2.0 — 2026-10-13

- Panneau **Infos** modifiable depuis la page : clic droit, bouton ＋, valeurs secrètes.

## 1.1.0 — 2026-10-13

- **Sécurité** : un autre site ouvert dans le navigateur ne peut plus lire ni modifier homedash. Pour
  l'ouvrir au réseau, il faut désormais déclarer ses noms dans `HOMEDASH_HOSTS`.
- Le jeton GitHub se colle uniquement dans Réglages (`GH_TOKEN` et `.env` ne sont plus lus).
- Onglet Local : une branche jamais fetchée s'affiche « non comparée » au lieu d'un faux « à jour ».

## 1.0.2 — 2026-10-13

- La page utilise toute la largeur de l'écran.

## 1.0.1 — 2026-10-13

- Barre du haut collée en haut de l'écran.

## 1.0.0 — 2026-10-13

- Première version partagée, et début du dépôt git.
- Tout se règle dans la page : jeton GitHub, repos suivis, équipe, dossiers de dépôts. Plus aucun script
  ni fichier à éditer.
- **Plusieurs comptes GitHub** dans une même page, avec un sélecteur dans l'onglet GitHub.
- **Sauvegardes** : instantané quotidien, export, restauration.
- L'onglet Activité devient la **cloche** de la barre du haut ; notifications système en sourdine par
  défaut, non-lus affichés dans l'onglet du navigateur.
- Vraies fenêtres de confirmation, onglets par dossier dans l'onglet Local.

<!-- Versions 0.x : reconstituées après coup, à partir des dates de création des fichiers. Le dépôt git
     ne commence qu'à la 1.0.0 : ces versions n'ont pas de tag. -->

## 0.6.0 — 2026-10-01

- Carte **PRs ouvertes** dans l'onglet GitHub.
- **Notifications système** pour les événements du journal.
- Onglet Local revu : verdict par branche, commandes de ménage à copier.

## 0.5.0 — 2026-08-28

- **Journal d'activité** tenu par le serveur : CI cassée ou réparée, PR mergée, branche à nettoyer.

## 0.4.0 — 2026-08-26

- Onglet **Local** : relit les `.git` de tes clones (sans jamais lancer git) et repère les branches
  mergées qui traînent.

## 0.3.0 — 2026-08-25

- Serveur Python à la place de Node ; notes et compteurs stockés côté serveur.
- Onglet **GitHub** (reprise de ghboard) : branches actives, PRs mergées, Renovate.

## 0.2.0 — 2026-08-03

- **homedash** : page d'accueil du navigateur. Raccourcis et tuiles, recherche unifiée, infos à copier,
  notes, voyants en ligne / hors ligne, modification au clic droit.

## 0.1.0 — 2026-04-23

- **ghboard**, l'ancêtre : tableau de bord GitHub en Python (branches, PRs, CI), page HTML générée.

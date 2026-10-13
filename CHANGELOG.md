# Changelog

Une version par livraison visible, la plus récente en haut (règles : `CLAUDE.md`). Chaque version est
aussi un tag git `vX.Y.Z`. Affiché en cliquant sur le numéro de version, en haut à droite ; une version
plus récente sur GitHub déclenche la notification « mise à jour disponible ».

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

- Première version partagée.
- Raccourcis, infos à copier, notes, recherche.
- Onglet **GitHub** : branches actives, PRs, CI, Renovate ; plusieurs comptes.
- Onglet **Local** : branches mergées qui traînent dans tes clones, en lecture seule.
- Cloche d'activité, sauvegardes automatiques, tout se règle dans la page.

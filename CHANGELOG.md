# Changelog

Une version par livraison visible, la plus récente en haut (règles : `CLAUDE.md`). Chaque version est
aussi un tag git `vX.Y.Z`. Affiché en cliquant sur le numéro de version, en haut à droite ; une version
plus récente sur GitHub déclenche la notification « mise à jour disponible ».

## 1.14.0 — 2026-10-20

- **Barre de gauche**, façon Discord : ⚡ pour homedash et ses onglets, puis une icône par onglet perso
  avec sa pastille de non-lus, et **⚙ Réglages** en bas. Un site ouvert depuis la barre a toute la page
  (la barre d'onglets de homedash revient avec ⚡). Barre réduite aux icônes, avec les noms, ou cachée :
  les onglets perso reviennent alors en haut.
- **Dossiers** comme Discord : glisse une icône sur une autre pour créer un dossier (nom et couleur), sur
  un dossier pour l'y ranger ; replié, il montre ses icônes en miniature et le total des non-lus. Clic
  droit pour le reste.
- Appli de bureau : **des comptes de connexion**, comme les conteneurs de Firefox. Un compte (nom +
  couleur) a sa propre connexion, partagée par ses onglets : deux onglets Claude (ou Gmail, YouTube…)
  connectés à deux comptes différents, côte à côte. Clic droit sur une icône → *Nouveau compte…*, ou
  Réglages → Onglets perso. Le compte se voit partout : sa lettre et un liseré de sa couleur sur l'icône,
  un trait sous l'onglet quand il est en haut, une étiquette dans son en-tête.
- Appli de bureau : **les liens restent dans homedash**. Un lien X reçu dans Google Chat s'ouvre dans
  ton onglet X (idem pour tout site qui a son onglet ; `twitter.com`, `youtu.be` compris, et d'autres
  domaines au choix dans Réglages). **Clic droit dans les sites** : ouvrir un lien dans un onglet, dans
  un **onglet éphémère** avec le compte de ton choix, ou dans le navigateur ; copier, coller, copier
  une image, précédent / suivant.
- Appli de bureau : **`⌘R`** recharge tout homedash (« ↻ homedash rechargé » le confirme), **`⇧⌘R`**
  seulement le site ouvert, avec un trait de chargement.
- Les icônes des onglets perso ont toutes la même taille (recadrées automatiquement), et un site privé
  inconnu du service de favicons affiche quand même la sienne.
- Réglages → Onglets perso refait : un onglet par ligne (dossier et compte en étiquettes), un clic pour
  le modifier dans un éditeur clair ; dossiers et comptes en étiquettes à côté. Le ＋ de la barre de
  gauche ouvre directement un nouvel onglet à remplir, affiché par défaut dans homedash.
- Comptes, liens, clic droit, `⌘R` et `⇧⌘R` demandent l'appli de bureau 1.1.0
  ([la télécharger](https://github.com/davidgennaoui/homedash/releases/latest), ou
  `sh desktop/build-local.sh --install`).

## 1.13.2 — 2026-10-20

- Onglets perso : sans emoji choisi, l'onglet prend **l'icône du site**. Dans l'appli de bureau, c'est
  celle que le site affiche en direct (Gmail, Chat…).

## 1.13.1 — 2026-10-20

- Basecamp : la notification « You've got Boosts! » ouvre Basecamp au lieu d'une page introuvable.

## 1.13.0 — 2026-10-20

- **Appli de bureau** pour Mac (facultative) : homedash dans sa propre fenêtre, dans le Dock. Les onglets
  perso y affichent **tous les sites**, Gmail et Google Chat compris : tu t'y connectes une fois. Le nombre
  de non-lus de chaque site devient une **pastille** sur son onglet et sur l'icône du Dock. Le container
  reste nécessaire : l'appli l'affiche. Installation dans le GUIDE (`.dmg` dans les releases
  `desktop-v…`, ou `sh desktop/build-local.sh --install`).

## 1.12.0 — 2026-10-20

- **Onglets perso** : le **＋** au bout de la barre d'onglets ajoute un onglet vers un site ou un fichier /
  dossier de ton disque (PDF, image, texte…). Au choix, il s'affiche **dans homedash** ou s'**ouvre à
  part** dans le navigateur. Gmail, Google Chat et la plupart des grands sites refusent l'affichage
  intégré : pour eux, « ouvrir à part ».
- Réglages : le menu de gauche range les parties par thème (GitHub, Connexions, La page, Données).

## 1.11.0 — 2026-10-20

- homedash s'installe comme une **appli** (PWA) : icône dans le Dock ou la barre des tâches, fenêtre à
  part, raccourcis GitHub, Local et Basecamp au clic droit sur l'icône. Elle s'ouvre même serveur arrêté
  (les données reviennent dès qu'il redémarre).
- **Installer** : dans **Safari**, va sur `localhost:7777` puis *Fichier → Ajouter au Dock*. Lance
  homedash depuis le Dock : les liens s'ouvrent dans ton **navigateur par défaut** (Firefox, Chrome…).
  Installée depuis Chrome (icône ⊕ « Installer » dans la barre d'adresse), l'appli ouvre ses liens dans
  Chrome, quel que soit ton navigateur par défaut.
- Deux onglets ouverts ne s'écrasent plus : si la config a changé ailleurs depuis le chargement de la
  page, l'enregistrement est refusé et la page propose de recharger, au lieu d'effacer l'autre
  modification sans prévenir.

## 1.10.0 — 2026-10-20

- Tuiles **📌 Épinglés** : glisse une tuile (poignée ⠿ au survol) pour changer leur ordre ; un trait montre
  où elle va tomber. Enregistré dans la config.
- Onglet Basecamp : le menu de gauche s'élargit en glissant sa poignée (double-clic = largeur par défaut),
  et les titres (tâches, cartes, colonnes, menu) reviennent à la ligne au lieu d'être coupés par « … ».

## 1.9.1 — 2026-10-20

- Réglages → Basecamp : **Mon site de callback**. Tu saisis juste un domaine à toi (vide = example.com),
  l'adresse exacte à mettre dans Launchpad s'affiche dessous (`https://<domaine>/oauth`). Changer ce
  site ne te déconnecte plus de Basecamp.

## 1.9.0 — 2026-10-20

- Nouvel onglet **🏕 Basecamp**, en lecture seule : tes tâches assignées, avec un menu à gauche comme
  dans Réglages (projets, puis leurs tableaux kanban et to-dos, retards comptés sur chaque ligne) et une
  vue **🔥 À traiter** (en retard ou dû dans les 7 jours, tous projets). Chaque tâche est un lien qui
  l'ouvre dans Basecamp ; rien n'est jamais modifié dans Basecamp. Des pastilles choisissent les projets
  affichés. Pas-à-pas de connexion dans Réglages → Basecamp.
- Bouton **🏕** dans la barre du haut : tes notifications Basecamp non lues, avec leur nombre en
  pastille. Les nouvelles notifs et tâches arrivent aussi dans la cloche 🔔.
- Onglets GitHub et Local : les cartes se rangent en colonnes indépendantes, une carte courte
  ne laisse plus de trou à côté d'une longue.
- Barre d'onglets : GitHub et Local forment un seul bloc (⇄), Basecamp vient juste après.
- Cloche 🔔 : bouton **vider** directement dans le panneau, sans passer par « Tout voir ».

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

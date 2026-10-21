# Changelog

Une version par livraison visible, la plus récente en haut (règles : `CLAUDE.md`). Chaque version est
aussi un tag git `vX.Y.Z`. Affiché en cliquant sur le numéro de version, en haut à droite ; une version
plus récente sur GitHub déclenche la notification « mise à jour disponible ».

## 1.23.2 — 2026-10-21

- **L'onglet Local ne fait plus disparaître la page** quand aucun dossier de dépôts n'est choisi : il
  explique quoi faire (*Réglages → Dépôts locaux*) et la barre d'onglets, la cloche et les menus restent
  là. Même correction pour la recherche, qui pouvait planter de la même façon.

## 1.23.1 — 2026-10-21

Appli de bureau : 1.5.4

- **Discord (et les autres) ne déconnectent plus après un rechargement** : avant de recharger homedash,
  de quitter, de se relancer après une mise à jour ou de mettre un onglet en veille, l'appli ferme
  proprement chaque site, comme un navigateur ferme ses onglets. Discord n'enregistre sa connexion qu'à
  ce moment-là : détruit net, il la perdait.
- Discord reçoit de nouveau l'identité de Chrome (il se croyait sinon dans sa propre appli).

## 1.23.0 — 2026-10-21

Appli de bureau : 1.5.2

- **Les captchas Cloudflare passent dans les onglets** (wiki-masters et les autres) : l'appli se présente
  désormais telle qu'elle est, et ne se fait passer pour Chrome qu'auprès de Google, qui l'exige pour la
  connexion. Le maquillage général faisait refuser tout captcha Turnstile, même coché à la main.
- **Effacer les données d'un site** : clic droit sur son icône → *Effacer les données de ce site*
  (cookies, stockage, cache, dans le compte de l'onglet). Pour tout un compte : *Réglages → Onglets
  perso → Comptes de connexion*. Utile quand un site boude.

## 1.22.1 — 2026-10-21

- **Journal de performance : temps de chargement fiables.** Seul le chargement de la page d'un site est
  mesuré, plus celui de chacun de ses cadres internes (Google Chat en comptait des dizaines par heure,
  et sa moyenne n'avait plus de sens).

## 1.22.0 — 2026-10-21

- **Aide réécrite et regroupée** : trois entrées (Nouveautés, Guide, Journal d'erreurs) au lieu d'une
  douzaine ; les parties du guide se choisissent en pastilles. Pages plus courtes et sans redites,
  captures à jour, tableau des raccourcis clavier Mac et Windows.
- **Journal de performance dans l'Aide** (quand il est activé) : mémoire et CPU de l'appli et du
  serveur jour par jour, chaque site avec sa mémoire, son pic et son temps de chargement, les pics et
  les opérations lentes, avec les sites à mettre en veille pour gagner de la mémoire, et *Copier pour une
  issue*.
- **⟳ « Tout actualiser »** (à côté de la cloche) : GitHub, Basecamp, dépôts locaux, la cloche et les
  non-lus de tous les sites d'un coup ; les sites en veille sont réveillés pour l'occasion. Il ne
  servait qu'à retester les liens surveillés (il le fait toujours).
- Le nom d'un onglet trop long (un éphémère, par exemple) est coupé avec « … » au lieu de passer sur
  les boutons ← →.

## 1.21.1 — 2026-10-21

- Derniers messages techniques reformulés : confirmations de suppression (« tu peux revenir en arrière
  depuis Réglages → Sauvegardes »), catégorie masquée, restauration d'un fichier qui n'est pas une
  sauvegarde, infobulles de l'onglet Local et des notifications.

## 1.21.0 — 2026-10-21

Appli de bureau : 1.5.1

- **Fini le faux « config.json illisible »** : quand homedash redémarre (mise à jour, réveil du Mac), la
  page affiche « Connexion à homedash… » et se recharge toute seule dès qu'il répond, sans rien toucher.
- **Réglages vraiment abîmés** (une virgule de trop après une modification à la main) : la page le dit
  clairement, avec la ligne fautive, et propose de **revenir à la dernière sauvegarde** d'un clic. La
  version abîmée est gardée à côté.
- **Des messages d'erreur en français courant** : plus de noms de fichiers, de codes HTTP ni de
  « Failed to fetch ».
- **Journal d'erreurs** (Réglages → Aide) : ce qui a raté, le message affiché et son détail technique,
  gardé 30 jours, avec *Copier pour une issue*.

- **Rien sur l'icône du Dock ?** macOS n'y affiche les non-lus que si *Pastilles de l'app* est activé
  pour homedash. Une carte le propose au premier lancement de l'appli, et Réglages → Affichage a un lien
  qui **ouvre directement la bonne page des réglages** du Mac (ou de Windows).

## 1.20.0 — 2026-10-21

Appli de bureau : 1.5.0

- **Menu Aide de l'appli de bureau** (barre de menus du Mac, Alt sous Windows) : nouveautés, guide,
  *Vérifier les mises à jour*, *Mettre à jour maintenant*, *Forcer la mise à jour* (tout reconstruire
  pour dépanner), signaler un problème, issues, dépôt GitHub. *Réglages…* au `⌘,`. Menus en français et
  réduits à l'utile (#7).
- **Plus d'appli à télécharger** : elle se construit sur ta machine, une fois ; ensuite, *Mettre à jour*
  la reconstruit toute seule quand une version le demande. Plus de blocage « appli non vérifiée » au
  premier lancement.

## 1.19.0 — 2026-10-21

Appli de bureau : 1.4.0

- **Mettre à jour d'un clic depuis l'appli de bureau** : bouton *Mettre à jour maintenant* dans la
  fenêtre de version (et Réglages → Aide → Nouveautés). L'appli demande confirmation, lance `git pull` et
  `docker compose up -d --build`, montre ce qu'elle fait, puis recharge la page. Si l'appli elle-même a
  changé, elle se reconstruit, se ferme et se relance toute seule. Il faut l'appli 1.4.0 : à installer
  une dernière fois à la main.
- **Une seule barre en haut quand un site est ouvert** : son icône et son nom (l'adresse au survol),
  puis ← → ↻ ↗ ⚙, à côté de la recherche ; le site gagne une rangée de hauteur. **→ (page suivante)** fait
  son apparition (#2).
- **Barre du haut épurée** : plus de logo ni de nom (⚡ de la barre de gauche ramène à homedash), la
  recherche prend la place.
- **Pastille de l'icône de l'appli au choix** : non-lus des onglets, notifications de la cloche, ou les
  deux (Réglages → Affichage & notifications) (#4).
- **Fini les vieux merges dans la cloche** : une branche locale dont la PR a été mergée il y a plus de
  2 jours, découverte tard par le scan, n'est plus annoncée ; un dépôt ajouté non plus (#5).
- **Icônes des onglets** : si homedash ne peut pas les récupérer (réseau, proxy), le navigateur les
  demande lui-même ; la raison s'affiche dans `docker logs homedash` (#3).
- **Telegram** : pastille de non-lus (comme Telegram, sourdines exclues), et « Open in new tab » ouvre
  un onglet éphémère au lieu de ne rien faire ; pareil pour tout site qui ouvre un lien vers lui-même (#1).
- **Le ＋ « nouvelle catégorie » quitte la barre du haut** : clic droit sur une catégorie, la recherche
  (« nouvelle catégorie »), ou le bouton qui apparaît quand il n'y en a aucune (#6).
- Le changelog indique les versions qui demandent une **nouvelle appli de bureau** (« 💻 appli 1.4.0
  requise »), et la fenêtre de version prévient si la tienne est trop ancienne.
- **homedash s'installe sur Windows** : le serveur démarre même sans variable `HOME` (le dossier personnel
  de Windows est pris à la place). Pas d'effet sur Mac.
- Sous Windows, la commande de mise à jour et celle de l'appli de bureau s'affichent **pour PowerShell**.
- **Favicons des liens ajoutés à la main** : une adresse tapée sans `https://` (`notion.so`) le reçoit
  automatiquement ; sans lui, le lien était cassé et n'avait pas d'icône. Les liens déjà enregistrés sont
  réparés à la mise à jour.
- Si le service d'icônes est bloqué par le navigateur (bloqueur, proxy), homedash va chercher l'icône
  lui-même.
- **L'appli de bureau se construit sur un PC Windows** comme sur un Mac : `desktop\build-windows.ps1
  -Install` (Docker suffit, et Windows ne la bloque pas au premier lancement). Pas à pas dans le README.

## 1.18.1 — 2026-10-21

- **Raccourcis affichés selon ton système** : `Ctrl+K`, `Ctrl+S`… sur Windows et Linux, `⌘K`, `⌘S` sur Mac.
- La fenêtre de version et le guide expliquent l'**appli de bureau pour Windows** (installateur `.exe`),
  disponible à sa prochaine publication.

## 1.18.0 — 2026-10-21

- **＋ de la barre de gauche : une fenêtre d'ajout** (adresse, nom, où l'ouvrir, dossier, compte, sites
  courants en un clic), sans passer par Réglages.
- **Barre de gauche épurée** : en bas, seulement ＋ et ⚙, plus grands. Éphémère, largeur et « cacher »
  passent au clic droit sur la barre.
- **Largeur « super réduite »** : petites icônes, en plus d'« étendue » et « réduite ».
- **Onglets perso par ordre alphabétique** dans Réglages.
- **« Modifier… » ouvre l'onglet dans Réglages**, son éditeur déplié.
- **Couper les notifications d'un onglet** : clic droit sur son icône, ou 🔕 dans Réglages → Onglets
  perso. Plus de pastille (ni dans le total du Dock), et le site ne peut plus afficher de notification.
- **Réglages → Aide** : les nouveautés (ce changelog) et un guide illustré, une page par sujet, avec un
  lien pour signaler un problème.
- **Sauvegardes : ménage en quelques clics** : cases à cocher, *tout*, *les automatiques* ou *plus de
  7 jours*, puis une seule suppression.
- **Mises à jour détectées en 10 min** au lieu de 6 h : la cloche et le numéro de version préviennent
  presque tout de suite qu'une nouvelle version est publiée.

## 1.17.1 — 2026-10-21

- **Pastilles des onglets gardées** : elles survivent au redémarrage de l'appli, à la mise en veille et au
  rechargement d'un site, au lieu de disparaître jusqu'au prochain non-lu.
- **Google Chat a sa pastille** : son titre ne compte rien, le nombre de non-lus est donc lu dans la page.
- **Pastilles effacées dès la lecture** : un message lu dans l'onglet fait disparaître sa pastille
  aussitôt (elle pouvait rester, surtout pour Gmail).

## 1.17.0 — 2026-10-20

- **Icône d'onglet par lien** : dans Réglages → Onglets perso, le champ *Icône* accepte le lien d'une
  image (`https://…/logo.png`), remise à l'échelle des autres icônes, en plus d'un emoji. Aperçu à côté
  du champ.
- Chaque onglet montre ses réglages en **pastilles sur sa ligne** : ▣ homedash / ↗ navigateur,
  💤 veille (*5 min* ou *jamais*), ⚡ chargement au démarrage, 🔗 liens captés. Un clic bascule, sans
  ouvrir l'onglet.
- **Liens dans homedash** (appli de bureau) : les liens des raccourcis, de GitHub, de Basecamp et de
  la recherche s'ouvrent dans l'onglet du site, sinon dans un onglet éphémère. ⌘-clic : le navigateur.
  Réglable dans Réglages → Onglets perso (*Liens de homedash*). **Clic droit** sur un lien (raccourcis,
  GitHub, Basecamp, recherche…) : choisir où l'ouvrir — dans l'onglet du site, dans un éphémère (avec
  le compte de ton choix) ou dans le navigateur.
- **La recherche devient une barre d'adresse** : tape une adresse pour l'ouvrir, `gh …`, `yt …`, `w …`,
  `maps …` pour chercher sur ces sites, sinon *Rechercher sur Google* en bas. Elle trouve aussi tes
  onglets, des actions (Réglages, thème, nouvel éphémère…) et les pages déjà vues dans tes onglets.
- Délai de mise en veille en un clic : 5 min, 15 min, 30 min, 1 h.
- **Précédent / suivant** : les boutons latéraux de la souris (MX Master comprise), ⌘[ / ⌘] et
  ⌘← / ⌘→ reculent dans les pages du site ouvert, puis d'onglet en onglet. Pour les sites et la MX
  Master, il faut la nouvelle appli de bureau.

## 1.16.2 — 2026-10-20

- Fenêtre de version (le numéro en haut à droite) : sous la commande de mise à jour, l'**appli de
  bureau** : le lien vers sa dernière version, ou la commande pour la construire sur ton Mac.
- Notes de version : l'italique et les liens s'affichent (ils apparaissaient avec leurs `*` et `[…](…)`).

## 1.16.1 — 2026-10-20

- Onglets en haut : avec beaucoup d'onglets, les noms restent sur une ligne (ils passaient sur deux ou
  trois) et la barre défile en largeur ; même chose pour l'en-tête de la cloche.
- Clic droit sur un onglet, rangé comme celui des liens : *Ranger* (dossier), *Compte* (connexion) en
  pastilles, l'actuel en évidence, puis *Onglet* (son, veille, modifier). Idem pour les éphémères.

## 1.16.0 — 2026-10-20

- **Mise en veille des onglets** (au choix, par onglet : clic droit ou Réglages) : un onglet laissé de
  côté plus de 5 min (réglable) est déchargé pour libérer la mémoire, grisé avec 💤, et rechargé au
  clic. Pas par défaut : un onglet en veille ne reçoit plus notifications ni non-lus.
- **Éphémères gardés** : clic droit sur un onglet éphémère → *Garder ouvert*, il survit au redémarrage
  (rangé avec les éphémères, il rouvre sur la page où tu l'as gardé ; *Garder cette page* la met à
  jour). *Ajouter à mes onglets* en fait un onglet perso.
- **Catalogue** dans Réglages → Onglets perso : mails, messageries, réseaux sociaux, IA, outils, en un
  clic.
- **Une seule cloche** 🔔 : l'activité de homedash et les notifications Basecamp ensemble, avec un
  filtre *Tout / Activité / Basecamp* ; la pastille compte les deux.
- Appli de bureau : **🔊 sur l'onglet qui joue du son** (clic dessus pour couper), et *Couper le son* au
  clic droit, comme dans un navigateur.
- **Journal de performance** (désactivé par défaut, Réglages → Affichage) : mémoire et CPU du
  serveur, de l'appli et de chaque onglet, actions lentes et pics, un fichier par jour dans
  `data/perf/` ; la place prise s'affiche, avec un avertissement au-delà de 50 Mo.
  `python3 scripts/perf-report.py` en fait le résumé.
- **Plus léger** :
  - Dans l'appli, seuls les sites à non-lus (mails, messageries, réseaux sociaux) sont chargés au
    démarrage, les autres au premier clic (réglable par onglet). Chaque site chargé pèse 100 à 400 Mo.
  - Fenêtre cachée, la page ne sonde plus GitHub, Local ni les liens surveillés ; le serveur relit
    GitHub toutes les 3 min pour la cloche.
  - L'onglet Local ne relit plus tout le disque après chaque passage sur GitHub.
  - La page ne se redessine plus quand un sondage ne rapporte rien de neuf.
- Clic droit dans un site, mieux rangé : le lien en titre, une section *Ouvrir* (l'onglet de ce site
  avec son compte, l'onglet éphémère avec une pastille par compte, le navigateur), puis *Copier le lien* ;
  idem pour le texte, les champs et les images.
- Barre de gauche cachée : les onglets du haut font tout ce que font les icônes — clic droit, glisser
  pour réordonner, ✕ pour fermer un onglet éphémère, ⧉ pour en ouvrir un.

## 1.15.0 — 2026-10-20

- Appli de bureau : **onglet éphémère vierge** avec **⧉** en bas de la barre de gauche (compte au choix),
  et une **barre d'adresse** dans l'en-tête des onglets éphémères : une adresse ou une recherche.
- L'onglet ouvert se voit mieux : anneau lumineux à la couleur de son compte, les autres icônes en
  retrait, icône et nom du site en grand dans l'en-tête.
- **⚡ depuis Réglages** ramène bien aux onglets de homedash (il restait sur Réglages).
- Appli de bureau : un clic dans un site ou Échap ferme le menu du clic droit (et les autres panneaux).

## 1.14.1 — 2026-10-20

- Appli de bureau : le clic droit dans un site ouvre son menu sous la souris (il apparaissait décalé),
  un lien reçu dans Google Chat ou Gmail s'ouvre dans l'onglet de son site (X, YouTube…) au lieu de
  l'onglet Chat, et les boutons précédent / suivant de la souris marchent dans les sites. Il faut
  l'appli de bureau 1.1.0.

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

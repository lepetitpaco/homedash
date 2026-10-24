# Changelog

Une version par livraison visible, la plus récente en haut (règles : `CLAUDE.md`). Chaque version est
aussi un tag git `vX.Y.Z`. Affiché en cliquant sur le numéro de version, en haut à droite ; une version
plus récente sur GitHub déclenche la notification « mise à jour disponible ».

## 1.33.1 — 2026-10-24

- **Onglet Local en mots simples** : « effacée de GitHub », « jamais envoyée », « à envoyer »,
  « intégrée à master puis supprimée sur GitHub : plus rien à garder ici »… au lieu de « distant »,
  « origin/master », « ref », « sha » (#44).
- **Activité** : mêmes filtres que la cloche (Tout, GitHub & Local, Basecamp), plus « Problèmes ».

## 1.33.0 — 2026-10-24

- **Un site = un seul endroit** : un lien vers un de tes sites (Gmail, Chat, GitHub, Discord…) l'ouvre
  dans ce site, avec son compte, au lieu de le charger une deuxième fois en onglet ; une page déjà ouverte
  est simplement réaffichée. Fini les trois Gmail ouverts pour deux clics (#52).
- **Tu vois où s'ouvre un onglet** : la barre de gauche défile jusqu'au nouvel onglet et le signale d'un
  halo ; le titre de la fenêtre suit l'onglet affiché (#53).
- **⚡ recliqué ramène à Raccourcis** (#54).
- **Clic droit « Ouvrir » plus simple** : *Dans <ton site>*, *Nouvel onglet temporaire*, *Dans le
  navigateur*. « Éphémère » devient « temporaire » partout (#55).
- **Catégories masquées retrouvées** : un lien en bas de Raccourcis les réaffiche (avant, une catégorie
  masquée était perdue de vue) (#57).
- **Accueil allégé** : « Les plus ouverts » ne double plus les tuiles « Les plus utilisés » (#56).
- **Plus clair pour tout le monde** : onglet Local sans jargon (commande globale repliée, « 22 de retard »
  au lieu de « 22↓ »), onglet GitHub sans compteurs techniques ni étiquettes inutiles, titres de PR avec
  leurs émojis (✨ au lieu de `:sparkles:`), réglages en mots simples, nouveautés sans commande terminal
  quand tu es à jour, bulle du Dock seulement sur l'accueil (#44, #58).
- **Corrections** : « Plus de réglages… » garde le site tapé, une note se supprime après confirmation, la
  recherche ne remonte plus de résultats sans rapport, l'en-tête de la cloche n'est plus coupé, le pied de
  page n'apparaît que sur Raccourcis (#58).

## 1.32.0 — 2026-10-24

- **Pour commencer** : au premier lancement, une carte en haut de Raccourcis liste ce qu'il reste à
  brancher (tes sites, GitHub, tes dossiers de code, Basecamp, la taille de ton écran). Chaque bouton
  mène au bon réglage ; une étape faite se coche toute seule, et la carte disparaît quand tout est fait
  (ou avec *Masquer* ; *Réglages → Affichage* la remet) (#44).
- **Connecter GitHub et Basecamp, pas à pas** : l'aide pour créer le jeton GitHub est ouverte d'office,
  en étapes qui reprennent les mots de la page GitHub. Celle de Basecamp passe avant les champs à
  remplir et explique la page vide après l'autorisation (#44).
- **Repos partagés avec toi** : *Réglages → GitHub → Repos suivis* propose aussi les repos d'un collègue
  où tu es collaborateur, dans l'onglet *Partagés avec toi* (#51).
- **Plus de réglages perdus** : quitter Réglages sans enregistrer te propose d'enregistrer ; *Plus tard*
  garde tes modifications en brouillon, retrouvées au retour (#49).
- **Cloche** : une erreur passagère de GitHub ne fait plus annoncer comme nouvelles des PRs mergées la
  veille (#50).
- Onglet Local sans dossier : « Choisis tes dossiers de code », au lieu d'un message rouge d'erreur.

## 1.31.2 — 2026-10-24

- **La barre de gauche est toujours là**, même sans aucun site : son **＋** ajoute le premier (#45).
- **Journal d'erreurs : plus de fausses erreurs quand homedash redémarre** (mise à jour, redéploiement).
  Pendant la coupure, la page dit « homedash ne répond pas pour le moment » au lieu de « homedash a
  rencontré un problème » (#42).
- **Journal de performance : une mise en veille de l'ordinateur ne passe plus pour une lenteur.**
  Une opération de plus de 5 minutes est mise à part (« machine en veille ? ») au lieu de fausser le
  pire et la moyenne (#43).

## 1.31.1 — 2026-10-24

- **Le dépôt a déménagé** : il est maintenant sur `lepetitpaco/homedash` (toujours privé, ton accès est
  conservé). La vérification des mises à jour et les liens « ouvrir une issue » y pointent. Facultatif,
  l'ancienne adresse redirige : `git remote set-url origin https://github.com/lepetitpaco/homedash.git`
  (#48).

## 1.31.0 — 2026-10-23

- **Recherche : choisis où chercher.** Clic sur la loupe, à gauche de la barre : *Partout* (comme
  avant), *Raccourcis*, *Mes sites*, *GitHub & Local*, *Basecamp* ou *Le web*. La loupe s'allume tant
  que la recherche est limitée.
- **Une recherche faite depuis un site s'ouvre à part**, en onglet éphémère dans la barre de gauche, et
  non plus en onglet de ce site.
- **Cloche plus claire** : une seule liste, filtres *Tout* · *GitHub & Local* · *Basecamp*. Les notifs
  Basecamp non lues sont en tête ; celles déjà lues **restent** dans la liste, pour y revenir.
- **Branche mergée annoncée une seule fois**, même après une mise à jour, et en une ligne quand elle
  est dans plusieurs dépôts.
- **Réglages → GitHub** : *Compte & équipe*, *Repos suivis* et *Onglet GitHub* réunis en une page, en
  blocs (connexion, repos suivis, équipe, ce que montre l'onglet), pour le compte choisi en haut.
- La fenêtre d'ajout d'un site s'appelle *Ajouter un site*.

## 1.30.0 — 2026-10-23

Appli de bureau : 1.5.6

- **« Onglets perso » devient « Mes sites »**, et ses réglages se rangent en deux : *Réglages → Mes sites*
  (tes sites, dossiers, comptes) et *Réglages → Liens & onglets* (où s'ouvrent les liens, onglets
  ouverts par un lien, mise en veille).
- **Réglages plus lisibles** : *Affichage & notifications* devient deux parties, *Affichage* et
  *Notifications*, rangées en blocs avec un titre et une phrase qui dit à quoi chacun sert, et des textes
  plus grands et plus contrastés.
- **Partager un onglet** : le bouton partager, en haut à côté de ↗, copie l'adresse de la page affichée,
  sans l'ouvrir dans le navigateur (aussi : clic droit sur l'onglet → *Copier le lien*).
- **Supprimer un site depuis son clic droit**, sous *Modifier…*, après confirmation.
- **Liens : le clic par défaut au choix, ⌘clic fait l'inverse.** *Réglages → Liens & onglets → Liens qui
  ouvrent un nouvel onglet* vaut maintenant aussi pour les liens d'un site qui ouvrent un nouvel onglet
  (la navigation dans le site ne change pas). ⌘clic (Ctrl+clic sous Windows, ou ⇧clic) fait l'inverse
  du réglage : par défaut, ⌘clic sur un lien ouvre donc le navigateur, y compris dans un site. Le clic
  droit sur un lien met en tête ce que fait le clic.

## 1.29.0 — 2026-10-23

- **Onglet Local : tes clones peuvent être n'importe où**, plus seulement dans ton dossier personnel.
  *Réglages → Dépôts locaux → + ajouter un dossier* propose 🏠 ton dossier personnel et 💽 le disque
  (`C:` sous Windows, les disques externes sur Mac). Toujours en lecture seule.

## 1.28.0 — 2026-10-23

- **Couper ce dont tu ne te sers pas** : *Réglages → 🧩 Fonctionnalités*. GitHub, Local ou Basecamp
  décoché disparaît de la page (onglet, recherche, cartes de l'accueil, réglages, cloche et
  notifications, même passées) et homedash cesse de le lire. Rien n'est effacé : recoche pour tout retrouver. Par défaut, tout reste activé.

## 1.27.0 — 2026-10-23

- **Un lien s'ouvre en onglet, là où tu es** (appli de bureau) : cliqué dans le dash, il s'ouvre en
  onglet à côté de *Raccourcis*, *GitHub*, *Basecamp* ; cliqué dans un site (X, Chat…), en onglet en haut
  de ce site. Fini les allers-retours dans la barre de gauche. Connecté avec le compte de l'onglet perso
  du site s'il en a un ; le titre de la page sert de nom ; ✕ ou clic molette pour fermer.
- **⚡ ramène au dash là où tu l'avais laissé**, onglet ouvert par un lien compris.
- **Garder ces onglets** : clic droit → *Garder ouvert* (rouvert à la relance), ou tous d'office dans
  *Réglages → Onglets perso → Onglets ouverts par un lien*.
- **Basecamp → 🐙 Issues GitHub** : chaque issue dit où elle en est (*rapport publié sur Basecamp*,
  *écartée*, *fermée sans rapport*…) ; une issue déjà publiée n'affiche plus « rapport prêt ».

## 1.26.0 — 2026-10-23

- **La recherche fouille aussi Basecamp** (`/` ou `⌘K`) : tes tâches tout de suite, puis tout Basecamp
  un instant après ta frappe (to-dos, cartes, messages, commentaires, documents ; sans les archivés).
  Extrait, échéance et auteur dans la carte à droite ; Entrée l'ouvre dans Basecamp.
- **Depuis un résultat Basecamp** : **🐙 Créer une issue** tout de suite, et **Voir dans le dash** pour
  une de tes tâches (son tableau dans l'onglet Basecamp, la tâche mise en évidence).
- **▶ prompt de départ** sur chaque issue ouverte (Basecamp → 🐙 Issues GitHub) : recopie ce qui est
  copié à la création (la commande qui lance Claude Code dans ton clone, sinon le prompt), si tu ne l'as
  pas collé tout de suite.
- **Fiche d'une tâche Basecamp, sans quitter homedash** : description, étapes, issues liées et tous les
  échanges, **captures comprises, affichées dans la fiche**. 💬 au survol d'une tâche (ou clic droit),
  ou **💬 Voir la tâche** depuis la recherche, y compris sur un commentaire trouvé (la fiche s'ouvre
  dessus).
- **Une issue sur un échange précis** : 🐙 sur un commentaire (fiche ou recherche) ; il devient la
  demande de l'issue, la tâche son contexte.
- **Tu choisis les échanges repris dans l'issue** : une case par commentaire, les 5 plus récents cochés
  (les sujets réglés depuis longtemps n'encombrent plus l'issue). Tous les échanges sont lus, plus
  seulement les 20 derniers.
- **La recherche tolère les fautes de frappe** : mots dans n'importe quel ordre, une faute par mot
  (« shopping diag » trouve « Assistant Shoping interne (Diag) »).

## 1.25.0 — 2026-10-23

- **📝 rapport final** sur chaque issue en cours (Basecamp → 🐙 Issues GitHub) : tes précisions
  (facultatives), puis un prompt copié qui demande à Claude Code de tout vérifier et de poster le
  rapport final, puis de fermer l'issue. Un nouveau rapport remplace le précédent, et redevient publiable sur Basecamp même si
  l'ancien l'a été.
- **Claude Code étiquette l'issue** (bug, amélioration…), parmi les étiquettes du repo, sans en créer.

## 1.24.1 — 2026-10-23

- **Les captures d'une tâche ne disparaissent plus de l'issue** : chacune devient un lien vers Basecamp
  (🖼 *nom de la capture*), au lieu de son seul nom entre parenthèses.
- **Claude Code commence par traduire le besoin en technique** : une tâche Basecamp est souvent une
  conversation décousue ; il en tire le vrai besoin et la solution retenue, en commentaire de l'issue
  si ce n'est pas limpide, avant de coder.
- **Formulaire GitHub et issue créée s'ouvrent aussi dans le navigateur** depuis l'appli de bureau
  (**↗ navigateur**, à côté d'*Ouvrir le formulaire* et de *Voir sur GitHub*).

## 1.24.0 — 2026-10-22

- **Basecamp → issue GitHub → rapport** : **🐙＋** au survol d'une tâche (ou clic droit). Le besoin est
  repris de la tâche (description, étapes, échanges) et l'issue est créée sur GitHub avec le lien vers
  la tâche, sans être connecté à github.com (ou formulaire GitHub pré-rempli, au choix). Le repo choisi
  est retenu par projet Basecamp, et une issue déjà ouverte sur la tâche est signalée.
- **Claude Code en un collage** : à la création, la commande qui le lance dans ton clone du repo, l'issue
  confiée, est copiée (le prompt seul si le repo n'est pas cloné).
- **Le rapport revient sur Basecamp** : quand Claude Code a posté son rapport sur l'issue, la cloche
  sonne (*📤 Rapport prêt*) et **📤 publier sur BC** apparaît à côté de la tâche ; un clic (et une confirmation) le publie en
  commentaire de la tâche, à ton nom. ✕ écarte une issue sans rien publier ; fermée sans rapport,
  elle l'est d'office. Nouveau menu **🐙 Issues GitHub** dans l'onglet Basecamp.
- Le jeton GitHub doit pouvoir lire les issues (*Issues : Read-only*), et les écrire pour les créer
  d'ici (*Read and write* ; un jeton classic `repo` le peut déjà).

## 1.23.5 — 2026-10-22

- **Onglet Local : `git pull` quand ta branche est en retard** sur sa version en ligne, main/master
  compris (on te proposait un merge sur main).
- **Rattraper main/master depuis une branche, c'est toujours fetch + merge** : le rebase proposé aux
  branches jamais poussées disparaît.

## 1.23.4 — 2026-10-21

Appli de bureau : 1.5.5

- **Connexion Google possible avec un compte Gmail perso** : Google la refusait (« ce navigateur ou cette
  application ne sont peut-être pas sécurisés »). Un compte pro passait déjà.
- **Quitter l'appli la ferme vraiment** sur Mac : elle restait ouverte sans fenêtre, et un clic sur son
  icône affichait « Object has been destroyed ».

## 1.23.3 — 2026-10-21

- **Un lien ouvert dans un onglet perso arrive bien sur la bonne page**, même au premier clic : un lien
  de repo (PRs, Branches…) ouvert dans ton onglet GitHub encore fermé, en veille ou en cours de
  chargement (juste après un démarrage ou une mise à jour) affichait la page d'accueil de l'onglet au
  lieu du lien.

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

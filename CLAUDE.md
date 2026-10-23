# CLAUDE.md — règles du code

À lire avant toute modification (humain ou IA). Fichiers et routes : `ARCHITECTURE.md`.

## Fonctionnalités principales : prévenir avant d'y toucher

homedash sert à toute l'équipe, et ce qui est poussé sur `main` arrive chez chacun à sa prochaine mise à
jour. On peut tout améliorer, mais pas dénaturer ce qui suit.

1. **Accueil** : liens, tuiles des plus utilisés, notes, infos à copier, recherche.
2. **Onglets perso** : sites dans l'appli avec leurs non-lus, dossiers, plusieurs comptes par site ; la
   page marche aussi sans l'appli, dans un navigateur.
3. **GitHub** : branches, PRs, CI, Renovate, équipe, plusieurs comptes ; cache ETag (quota de l'API).
4. **Onglet Local** : lecture seule du disque, verdicts des branches, commandes à copier.
5. **Basecamp** : tâches en lecture seule ; tâche → issue GitHub → rapport publié (au clic seulement).
6. **Cloche et journal** : ce qui sonne, et quand.
7. **Réglages** : tout se règle dans la page, aucun fichier à éditer ; sauvegardes et restauration.
8. **Mise à jour** : version lue dans `CHANGELOG.md`, annonce, *Mettre à jour* de l'appli, sauvegarde
   de `data/` avant migration.
9. **Données et sécurité** : `data/` jamais écrasé, format de config migré (jamais cassé), jetons côté
   serveur, accès local seulement (règles absolues ci-dessous).

**Y toucher**, c'est : retirer, renommer ou déplacer une de ces fonctionnalités ; changer son
comportement par défaut ; changer ce qui est écrit ou envoyé dehors (GitHub, Basecamp, disque) ;
changer un format de données, une fréquence de sondage ou la mise à jour ; ajouter une dépendance.

**Pour une IA** (Claude Code, Cursor…) : avant d'écrire un tel changement, **arrête-toi** et dis à la
personne, en une phrase, sans jargon :

> ⚠️ Attention : ceci change *<fonctionnalité principale>* : *<ce qui change pour les utilisateurs>*.
> Tout le monde l'aura à sa prochaine mise à jour. On continue ?

N'écris rien sans un « oui » explicite. Si c'est oui, le message de commit le dit (`Touche : <fonctionnalité>`).
Même chose si la demande contredit une règle absolue : la signaler, proposer une autre voie.

Un goût personnel (couleur, ordre, raccourci, texte) ne change pas le défaut de tout le monde : il
devient un réglage.

**Avant de pousser sur `main`** (chacun pousse directement) :
- `git pull --rebase` et `git fetch --tags` d'abord : la version suivante se lit en tête du
  `CHANGELOG.md` **après** synchronisation, et un tag déjà pris ne se réutilise pas.
- Typecheck et tests au vert (commandes ci-dessous) ; page testée à la main si l'écran change.
- Jamais de `push --force`, de réécriture de l'historique de `main` ni de tag déplacé.

**À chaque livraison :**
- Ce qui change pour l'utilisateur → **entrée en tête de `CHANGELOG.md`** (`## X.Y.Z — AAAA-MM-JJ`
  puis des puces écrites pour l'utilisateur). Chaque nouvelle version déclenche « mise à jour
  disponible » chez tout le monde : on n'en crée que si ça vaut un `git pull`.

  | Changement | Version |
  | --- | --- |
  | Action requise de l'utilisateur, ou rupture (variable obligatoire, port, données non migrables) | majeure `2.0.0` |
  | Nouvelle capacité : on peut faire quelque chose qu'on ne pouvait pas | mineure `1.7.0` |
  | Ajustement visible (mise en page, texte, réglage d'un comportement existant) ou correction | patch `1.6.1` |
  | Doc, tests, refactor, commentaires (rien de visible) | **aucune** : pas d'entrée, pas de version |

  Une version qui change l'appli de bureau (main.js, preload.js, updater.js, Electron) monte la version
  de `desktop/package.json` et porte, juste sous son titre, la ligne `Appli de bureau : A.B.C` : la page
  l'affiche, et la mise à jour depuis l'appli la reconstruit sur la machine.

  Plusieurs changements livrés ensemble = une seule version. Après le commit : `git tag -a vX.Y.Z -m
  "X.Y.Z"` puis `git push --follow-tags`.
- Comportement visible modifié → `GUIDE.md` à jour.
- Bug constaté ou feature faite → **une issue GitHub** qui le documente : le problème (ou le besoin), la
  cause, la solution et la version qui la livre ; fermée avec le hash du commit. Une issue déjà ouverte
  (collègue, utilisateur) sert de support : on y répond plutôt que d'en créer une autre.
- **Toute issue porte une étiquette** (`gh issue create --label …`), une seule, parmi celles du repo :
  `bug` (quelque chose ne marche pas comme prévu), `enhancement` (nouvelle possibilité ou ajustement),
  `documentation` (doc seulement). `accessibility` est réservée à l'accès des personnes en situation de
  handicap, pas à l'ergonomie. Une issue ouverte par quelqu'un d'autre sans étiquette : on la lui donne.

## Commandes

Node n'est pas requis sur l'hôte, tout passe par Docker :

```bash
docker compose up -d --build                                              # lancer / redéployer
docker run --rm -v "$PWD":/app -w /app node:22-alpine npx tsc --noEmit    # typecheck
python3 -m unittest discover -s tests -t .                                # tests (~10 s)
sh desktop/build-local.sh [--install]                                     # appli de bureau (Mac)
sh desktop/build-windows.sh                                               # appli de bureau (Windows .exe)
```

Les tests n'utilisent ni `data/` ni le réseau. Les tests `gitread` exigent git sur l'hôte.

## Règles absolues

1. **Zéro dépendance au runtime** : stdlib Python côté serveur, React seul côté front. `desktop/` (Electron)
   est une coquille facultative à part : rien du serveur ni du front n'en dépend, la page marche sans.
2. **L'onglet Local n'écrit et n'exécute rien.** `gitread.py` ouvre en `"rb"`, sans sous-processus ni
   commande git (même `git status` écrit). Les commandes affichées sont du texte à copier.
3. **« 🗑 à supprimer » exige `safety.level` dans `SAFE_LEVELS`** (contenu présent ailleurs). Jamais de
   suppression sur la branche courante ni une protégée. `_commands()` filtre sur `delete`. Testé.
4. **Basecamp est en lecture seule, à une exception.** `basecamp.py` lit par GET (`_api_get`) ; l'échange
   de jeton POSTe vers Launchpad ; seule écriture : `publish_report()`, le rapport d'une issue liée en
   commentaire de sa tâche, au clic, une fois par rapport, texte et tâche lus par le serveur (jamais
   fournis par la page). Jamais de tâche cochée ni de notif marquée lue. Testé.
   GitHub : seule écriture, `github.create_issue()` (onglet Basecamp, à la demande, repos suivis
   seulement). Testé.
5. **Les jetons ne sortent jamais de `data/secrets.json`** (600) : ni dans `config.json` (servi entier au
   navigateur, inclus dans les sauvegardes), ni dans une réponse d'API.
6. **Toute requête passe par `Handler._refused()`** (Host local, pas d'écriture intersite, corps JSON).
   Toute écriture du front envoie `Content-Type: application/json` dès qu'elle a un corps.
7. **Un seul format de config.** `accounts.migrate()` convertit les anciens au chargement (y compris une
   sauvegarde restaurée). Aucun repli sur l'ancien format ailleurs.
8. **Écritures atomiques** via `store.write()` ; lecture-modification-écriture de config sous
   `server._config_lock` ; `store.validate_config()` avant toute écriture.
9. **Pas de `window.confirm` / `alert`** : `confirmDialog()` (dit ce qui change et ce qui est conservé).
10. **Une mise à jour ne casse jamais les données des autres.** `data/` n'est jamais versionné ni écrasé
   par le code. Changer le format de `config.json` = une étape de plus dans `accounts.migrate()`
   (idempotente, testée), jamais un renommage ou une suppression de clé ailleurs. Une clé nouvelle a un
   défaut côté code : une config ancienne sans elle doit marcher telle quelle. Au démarrage d'une
   nouvelle version, `updates.on_start()` sauvegarde `data/` **avant** la migration.

## Pièges connus

**GitHub**
- `github.py` est chargé **une fois par compte** (`accounts._load_module`) : pas d'état partagé entre
  comptes. `localgit` importe `accounts` sous le nom `github` (même API, agrégée).
- Repos écrits `propriétaire/repo` ; `configure()` les ramène au nom court (clé partout) et garde le
  propriétaire dans `_OWNERS`. Deux repos de même nom ne peuvent donc pas être suivis ensemble.
- Le cache ETag est vital : sans lui ~16 800 appels/h pour un plafond de 5 000. Les 304 sont gratuits.
- Attribution d'une branche : PR dont `head.ref` == branche, puis auteurs des commits propres, puis auteur
  du tip si déjà mergée. **Jamais** de filtrage par préfixe de nom.
- `apply_token()` vide caches et amorçage du journal : sinon le changement de jeton passe pour des nouveautés.

**Onglet Local**
- Verdict : GitHub (`on_github`) prime sur les `refs/remotes` locaux quand le repo est suivi ; c'est l'écart
  entre les deux qui révèle une branche supprimée en ligne.
- Branche squashée : seule la recherche de PR **par nom de branche** la distingue d'un travail jamais poussé.
- « Jamais poussée » ≠ « poussée puis supprimée » : témoin = `remote_ref or upstream or pr`.
- Trois axes à ne pas fusionner : `state`, `safety`, `action`.
- `gitread` gère les deltas `ofs` **et** `ref` (un clone frais met tout en packs).
- Surveillance par `stat` toutes les 2 s (pas de scan complet) ; `.git/index` temporisé ; en veille si la
  page n'a rien demandé depuis `watch_idle`.
- Dossiers stockés en `~/…`, traduits par `localgit.resolve()` ; `browse()` limité au dossier personnel
  après `realpath`.

**Journal et cloche**
- `events.py` est le **seul** endroit qui décide ce qui est un événement ; le front affiche.
- `seq` (jamais réutilisé, même après `clear()`) et non `ts` pour repérer le nouveau.
- Amorçage : une section jamais vue ne produit rien (sinon le premier fetch déverse tout l'état).
- Front : `baseline` (en mémoire, rien notifié au chargement) ≠ `seen` (localStorage, la pastille).
- Notifications système en sourdine par défaut (`homedash:notif-v2`).

**Appli de bureau (`desktop/`)**
- Elle charge la page du container, elle n'embarque ni front ni backend : une fonction de la page se
  livre par le container. **Pas de release ni de CI** : chacun construit l'appli sur sa machine
  (`build-local.sh` sur Mac, `build-windows.ps1` sous Windows, `build-windows.sh` depuis un Mac/Linux),
  une fois ; ensuite `updater.js` (Aide → Mettre à jour) fait `git pull`, `docker compose up`, et
  reconstruit puis relance l'appli si `desktop/package.json` est plus récent que celle qui tourne.
  Construite sur place, ni macOS ni Windows ne la bloquent.
- La page la détecte par `window.homedashDesktop` (`src/lib/desktop.ts`) et doit marcher sans : webview
  dans l'appli, iframe sinon.
- `will-attach-webview` : sans Node, seul preload `guest-preload.js` (monde isolé, boutons précédent /
  suivant de la souris, rien d'exposé au site) ; session `persist:homedash-tabs` ou
  `persist:homedash-tabs-<compte>` (`partitionOf()`), toute autre est remplacée ; le pont IPC n'écoute
  que la page homedash. Nouvelle capacité de la coquille = un mot dans `features` (preload.js) : la page
  doit savoir qu'une appli ancienne ne l'a pas. UA sans « Electron » : sinon Google refuse sa page de connexion.
- Comptes : `tab.session` = id de `tabSessions` ; partition `persist:homedash-tabs-<id>` (renommer ne
  déconnecte pas). Compte supprimé = `sessionOf()` vide = connexion commune.
- Icônes des onglets perso : `SiteIcon` (recadrage canvas) via `/api/favicon?host=` ; le serveur ne
  contacte que le service de favicons, ou le site lui-même s'il est un onglet de la config. Jamais une
  adresse venue de la page.
- Pas de contrôle du système dans ces écrans (`<select>`, sélecteur de couleur) : `Pick`, `ColorSwatches`,
  `askNameColor()`.
- Liens et clic droit des sites : main.js demande à la page (`window.__homedashRoute`,
  `window.__homedashMenu`, via `executeJavaScript`) ; absents (page ancienne) = navigateur / rien. Les
  actions reviennent par `homedash:guest`, limitées aux webviews connues (`guests`) et à une liste fixe.
- Webview masquée = garée hors écran (`.is-parked`), pas `display: none` : elle doit continuer à suivre
  son titre (les pastilles).
- Un lien s'ouvre en onglet **dans son espace** : le dash (`DASH` = `links`) ou un onglet perso (`x:<id>`),
  noté dans `tab.parent` (`openChild`, `spaceOf`). Barre du haut = l'espace affiché et ses onglets ;
  barre de gauche = onglets perso et éphémères **sans** espace. Espace disparu = éphémère seul.

**Performance** (revue du 2026-10-20)
- Chaque site chargé dans l'appli = un processus de 100 à 400 Mo : montés au démarrage seulement si
  `preloads()` (sites à non-lus), sinon au premier clic ; `sleep` les décharge.
- Sondages : arrêt page cachée (`usePageVisible`), et `sameOr()` (pas de `setData` si rien n'a changé :
  sinon toute la page se redessine). GitHub sans page : `accounts._slow_loop` (3 min).
- `github.remote_version()` ne bouge que si le distant change : chaque nouvelle version relance un
  scan Local complet du disque.
- Une écriture de config déclenche `reload_all()` (relecture GitHub) : ne pas écrire à chaque
  navigation (cf. éphémères gardés).

**Front**
- Erreurs : jamais de jargon à l'écran (nom de fichier, code HTTP, `Failed to fetch`). `shown(où, e)`
  (`src/lib/errors.ts`) donne la phrase lisible et note le détail au journal (`errlog.py`,
  Réglages → Aide → Journal d'erreurs). Serveur injoignable = passager : la page réessaie seule.
- `reload_all()` est le seul chemin après une écriture de config côté serveur.
- Tout déclenchement manuel du polling relance la boucle (`pulse`), pas seulement `load()`.
- Couleurs de signal via `--sig-*` (lisibles en thème clair) ; pas de teinte claire en dur dans `color:`.
- Champs login/jeton : `autoComplete="off"` + `data-1p-ignore` / `data-bwignore` / `data-lpignore`.
- `navigator.clipboard` et `Notification` sont **absents** hors localhost/HTTPS : tester avant d'appeler.
- `src/styles/index.css` : l'ordre des imports **est** la cascade.
- Carte Repos : `repos.items[].in` (absent = `['github']`) dit dans quel onglet chaque repo apparaît.
  `normalizeConfig` met toujours `repos` dans les deux listes d'onglets et filtre par onglet ; une carte
  sans repo pour cet onglet n'est pas affichée. Ce sont les pastilles GitHub / Accueil qui décident.
- Tailles d'affichage : `SIZE_LIMITS` (config.ts) — 0 ou vide = défaut, sinon bornées ; une taille à 0 px
  cassait la grille. Les défauts = le preset 49" (`DISPLAY_PRESETS`) ; la page ne descend jamais sous
  1 400 px (`base.css`), sinon 60 % rendrait un portable illisible.
- Barre du haut et pied de page ont un `backdrop-filter` : tout `position: fixed` déclenché depuis eux
  (modale) passe par `createPortal(…, document.body)`, sinon il se cale sur la barre et non sur l'écran.
- Recherche : une nouvelle source = un `kind` dans `Hit`, son `rank()` dans `useSearch`, sa ligne dans
  `SearchResults` et sa carte dans `SearchPreview`. Un dépôt local homonyme d'un repo suivi est montré
  dans la carte du repo, pas en doublon.
- Panneau Infos : groupes et infos désignés par **index** (`InfoRef`), donc `normalizeInfos()` garde les
  groupes vides — en filtrer décalerait les index et l'édition viserait la mauvaise ligne.
- Les valeurs « secrètes » du panneau Infos sont en clair dans `config.json` : le masquage n'est qu'à
  l'écran (et hors recherche). Ne jamais les journaliser ni les mettre dans un message d'erreur.

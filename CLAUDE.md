# CLAUDE.md — règles du code

À lire avant toute modification (humain ou IA). Fichiers et routes : `ARCHITECTURE.md`.

## Fonctionnalités principales : prévenir avant d'y toucher

homedash sert à toute l'équipe, et ce qui est poussé sur `main` arrive chez chacun à sa prochaine mise à
jour. On peut tout améliorer, mais pas dénaturer ce qui suit.

1. **Accueil** : liens, tuiles des plus utilisés, notes, infos à copier, recherche.
2. **Mes sites** (onglets perso) : sites dans l'appli avec leurs non-lus, dossiers, plusieurs comptes par site ; la
   page marche aussi sans l'appli, dans un navigateur.
3. **GitHub** : branches, PRs, CI, Renovate, équipe, plusieurs comptes ; cache ETag (quota de l'API).
4. **Onglet Local** : lecture seule du disque, verdicts des branches, commandes à copier.
5. **Basecamp** : tâches en lecture seule ; tâche → issue GitHub → rapport publié (au clic seulement).
6. **Cloche et journal** : ce qui sonne, et quand.
7. **Réglages** : tout se règle dans la page, aucun fichier à éditer ; sauvegardes et restauration.
8. **Mise à jour** : version lue dans `CHANGELOG.md`, annonce (dernière Release GitHub), *Mettre à jour*
   de l'appli (téléchargement, empreinte vérifiée, sauvegarde avant), sauvegarde de `data/` avant migration.
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

**Une vague = une branche, un push = une version.** On travaille sur une branche locale (`vague/<sujet>`)
et on y commite librement, sans toucher au `CHANGELOG.md` ni aux versions. Une fois la vague testée :
retour sur `main`, synchronisation (ci-dessous), **une** entrée de CHANGELOG pour toute la vague, fusion,
tag, push. Trois commits poussés ensemble = une seule version, jamais une par commit.

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

  Depuis la 2.0, l'appli embarque tout : **chaque version** monte `desktop/package.json` à la même
  version que le CHANGELOG (le workflow de Release refuse un tag où les deux diffèrent). Le tag `vX.Y.Z`
  poussé déclenche GitHub Actions, qui construit l'appli et publie la Release que les applis installées
  proposent.

  Plusieurs changements livrés ensemble (une vague, un push) = une seule version. Après le commit : `git tag -a vX.Y.Z -m
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
docker compose -f docker-compose.dev.yml up -d                            # dev : homedash-dev.localhost:7778, à chaud
docker run --rm -v "$PWD":/app -w /app node:24-alpine sh -c "apk add -q git; npm run typecheck && npm test"
sh desktop/build-local.sh [--install]                                     # l'appli, construite sur ce Mac
node scripts/parity.mjs <ancien> <nouveau>                                # compare deux serveurs (GET seulement)
```

Les tests (Vitest, `tests-ts/`) n'utilisent ni `data/` ni le réseau. Les tests `gitread` exigent git.
Les versions publiées sont construites par `.github/workflows/release.yml` (Mac arm64 + x64, Windows x64).

## Règles absolues

1. **Zéro dépendance au runtime** : Node seul côté serveur (`server/`, TypeScript « effaçable » : lancé
   tel quel en dev, compilé par `tsc` pour l'appli), React seul côté front, Electron seul pour l'appli
   (`desktop/`, sans paquet npm à l'exécution). Rien du serveur ni du front ne dépend d'Electron : la page
   marche aussi dans un navigateur (dev, ou « Accès depuis le navigateur »).
2. **L'onglet Local n'écrit et n'exécute rien.** `gitread.ts` ne fait que des lectures (`readFileSync`,
   `readSync`, `lstat`), sans sous-processus ni commande git (même `git status` écrit). Les commandes
   affichées sont du texte à copier. Testé contre git (`tests-ts/gitread.test.ts`).
3. **« 🗑 à supprimer » exige `safety.level` dans `SAFE_LEVELS`** (contenu présent ailleurs). Jamais de
   suppression sur la branche courante ni une protégée. `_commands()` filtre sur `delete`. Testé.
4. **Basecamp est en lecture seule, à une exception.** `basecamp.ts` lit par GET (`apiGet`) ; l'échange
   de jeton POSTe vers Launchpad ; seule écriture : `publishReport()`, le rapport d'une issue liée en
   commentaire de sa tâche, au clic, une fois par rapport, texte et tâche lus par le serveur (jamais
   fournis par la page). Jamais de tâche cochée ni de notif marquée lue. Testé.
   GitHub : seule écriture, `GitHubAccount.createIssue()` (onglet Basecamp, à la demande, repos suivis
   seulement). Testé.
5. **Les jetons ne sortent jamais de `data/secrets.json`** (600) : ni dans `config.json` (servi entier à
   la page, inclus dans les sauvegardes), ni dans une réponse d'API. Seule sortie : l'export complet
   (`fullexport.ts`), **chiffré** par un mot de passe (scrypt + AES-256-GCM). Testé.
6. **Toute requête passe par `app.handle()` → `refused()`** (Host connu, pas d'écriture intersite, corps
   JSON), quel que soit le transport (`http.ts` en dev, messages de l'appli). Toute écriture du front
   envoie `Content-Type: application/json` dès qu'elle a un corps.
7. **Un seul format de config.** `accounts.migrate()` convertit les anciens au chargement (y compris une
   sauvegarde restaurée). Aucun repli sur l'ancien format ailleurs.
8. **Écritures atomiques** via `store.write()` ; `store.validateConfig()` avant toute écriture.
   Lecture-modification-écriture de config **sans `await` entre la lecture et l'écriture** : Node n'a
   qu'un fil, c'est ce qui remplace le verrou de la 1.x.
9. **Pas de `window.confirm` / `alert`** : `confirmDialog()` (dit ce qui change et ce qui est conservé).
10. **Une mise à jour ne casse jamais les données des autres.** `data/` n'est jamais versionné ni écrasé
   par le code. Changer le format de `config.json` = une étape de plus dans `accounts.migrate()`
   (idempotente, testée), jamais un renommage ou une suppression de clé ailleurs. Une clé nouvelle a un
   défaut côté code : une config ancienne sans elle doit marcher telle quelle. Au démarrage d'une
   nouvelle version, `updates.onStart()` sauvegarde `data/` **avant** la migration ; l'appli sauvegarde
   aussi avant de se remplacer.

## Pièges connus

**GitHub**
- Une instance `GitHubAccount` **par compte** (`accounts.configure`) : pas d'état partagé entre
  comptes. `localgit` importe `accounts` sous le nom `github` (même API, agrégée).
- Repos écrits `propriétaire/repo` ; `configure()` les ramène au nom court (clé partout) et garde le
  propriétaire dans `_OWNERS`. Deux repos de même nom ne peuvent donc pas être suivis ensemble.
- Le cache ETag est vital : sans lui ~16 800 appels/h pour un plafond de 5 000. Les 304 sont gratuits.
- Attribution d'une branche : PR dont `head.ref` == branche, puis auteurs des commits propres, puis auteur
  du tip si déjà mergée. **Jamais** de filtrage par préfixe de nom.
- `applyToken()` vide caches et amorçage du journal : sinon le changement de jeton passe pour des nouveautés.

**Onglet Local**
- Verdict : GitHub (`on_github`) prime sur les `refs/remotes` locaux quand le repo est suivi ; c'est l'écart
  entre les deux qui révèle une branche supprimée en ligne.
- Branche squashée : seule la recherche de PR **par nom de branche** la distingue d'un travail jamais poussé.
- « Jamais poussée » ≠ « poussée puis supprimée » : témoin = `remote_ref or upstream or pr`.
- Trois axes à ne pas fusionner : `state`, `safety`, `action`.
- `gitread` gère les deltas `ofs` **et** `ref` (un clone frais met tout en packs).
- Surveillance par `stat` toutes les 2 s (pas de scan complet) ; `.git/index` temporisé ; en veille si la
  page n'a rien demandé depuis `watch_idle`.
- Dossiers stockés en `~/…` (ou chemin absolu : `C:/…`, `/Volumes/…`), traduits par `paths.resolve()`.
  Dans l'appli ce sont les vrais chemins ; en dev, le dossier personnel est monté `:ro` sur `/host`
  (`HOST_MOUNT`, `HOST_HOME`) et le disque sur `/hostdisk` (`DISK_MOUNT`, `HOST_DISK`). Chemins toujours
  écrits avec des `/`, Windows compris. `browse()` limité au dossier personnel et au disque après
  `realpath` ; choix de fichier (`files`, Mes sites) : dossier personnel seulement, comme `localfile`.
  Plus de `:ro` du système dans l'appli : ces garde-fous sont les seuls, et testés.

**Journal et cloche**
- `events.ts` est le **seul** endroit qui décide ce qui est un événement ; le front affiche.
- `seq` (jamais réutilisé, même après `clear()`) et non `ts` pour repérer le nouveau.
- Amorçage : une section jamais vue ne produit rien (sinon le premier fetch déverse tout l'état).
- Front : `baseline` (en mémoire, rien notifié au chargement) ≠ `seen` (localStorage, la pastille).
- Notifications système en sourdine par défaut (`homedash:notif-v2`).

**Appli de bureau (`desktop/`)**
- Elle embarque tout (2.0) : `server.js` lance `server/host.js` dans un utilityProcess, et intercepte
  `http://localhost:7777` dans ses sessions (`protocol.handle('http')`) : **aucun port ouvert**, et la page
  garde son origine de toujours (localStorage, connexions, contexte sûr pour notifications et
  presse-papiers). Les sessions des sites ne reçoivent que `GET /api/file`. Mode dev : `HOMEDASH_URL`
  (ou `devUrl` dans desktop.json) charge une autre adresse, le serveur intégré ne démarre pas.
- Données : `<userData>/data` (`app.getPath('userData')`, dossier `homedash` : même que la 1.x, donc
  sessions des sites gardées). `HOMEDASH_PROFILE=/dossier` : profil à part (tests).
- Mise à jour (`updater.js`) : dernière Release, fichier de la machine d'après `latest-mac.yml` /
  `latest.yml`, sha512 vérifié, instantané des données, puis remplacement par un processus détaché (Mac :
  .app extrait par `ditto` ; Windows : installateur NSIS `/S --force-run`). Dépôt privé : jeton du premier
  compte GitHub connecté. Pas de signature : `identity: '-'` (ad hoc) dans electron-builder.yml.
- Identifiant d'appli `com.lepetitpaco.homedash` : **ne plus le changer** (autorisations, notifications,
  épingles de la barre des tâches y sont rattachées).
- Fermer la fenêtre la cache (Mac et Windows, icône près de l'horloge) ; seul *Quitter* arrête l'appli et
  son serveur.
- La page la détecte par `window.homedashDesktop` (`src/lib/desktop.ts`) et doit marcher sans : webview
  dans l'appli, iframe sinon.
- `will-attach-webview` : sans Node, seul preload `guest-preload.js` (monde isolé, boutons précédent /
  suivant de la souris, rien d'exposé au site) ; session `persist:homedash-tabs` ou
  `persist:homedash-tabs-<compte>` (`partitionOf()`), toute autre est remplacée ; le pont IPC n'écoute
  que la page homedash. Nouvelle capacité de la coquille = un mot dans `features` (preload.js) : la page
  doit savoir qu'une appli ancienne ne l'a pas. UA sans « Electron » : sinon Google refuse sa page de connexion.
- Comptes : `tab.session` = id de `tabSessions` ; partition `persist:homedash-tabs-<id>` (renommer ne
  déconnecte pas). Compte supprimé = `sessionOf()` vide = connexion commune.
- Icônes de Mes sites : `SiteIcon` (recadrage canvas) via `/api/favicon?host=` ; le serveur ne
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
  (`src/lib/errors.ts`) donne la phrase lisible et note le détail au journal (`errlog.ts`,
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
  `SearchResults`, sa carte dans `SearchPreview` et sa portée dans `SEARCH_SCOPES` (sinon elle n'apparaît
  que dans « Partout »). Un dépôt local homonyme d'un repo suivi est montré
  dans la carte du repo, pas en doublon.
- Panneau Infos : groupes et infos désignés par **index** (`InfoRef`), donc `normalizeInfos()` garde les
  groupes vides — en filtrer décalerait les index et l'édition viserait la mauvaise ligne.
- Les valeurs « secrètes » du panneau Infos sont en clair dans `config.json` : le masquage n'est qu'à
  l'écran (et hors recherche). Ne jamais les journaliser ni les mettre dans un message d'erreur.

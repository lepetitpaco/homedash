# CLAUDE.md — homedash

Voir `ARCHITECTURE.md` pour l'arborescence et les routes. Résumé : un seul projet,
un seul conteneur, **un seul process au runtime** (Python). Node ne sert qu'au
build Vite et n'existe pas dans l'image finale.

## Lancer

```bash
docker compose up -d --build      # http://127.0.0.1:7777
docker compose logs -f
```

Tout le reste se règle dans la page (⚙ Réglages) : comptes GitHub, repos,
équipe, dossiers de dépôts, sauvegardes. Aucun script, aucun fichier à éditer.
Le mode d'emploi côté utilisateur est dans `GUIDE.md` : le tenir à jour quand
un comportement visible change.

**Node n'est pas installé sur l'hôte** — tout passe par Docker :

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine npx tsc --noEmit   # typecheck
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm run build      # build
```

Le backend seul peut tourner sur l'hôte (Python stdlib), après un build qui crée `dist/` :

```bash
DATA_DIR=$PWD/data PUBLIC_DIR=$PWD/dist PORT=7999 HOST=127.0.0.1 python3 backend/server.py
```

## Conventions

- **Zéro dépendance runtime**, des deux côtés : `backend/` n'utilise que la stdlib
  Python, le front n'a que React. C'est un choix, pas un accident.
- Le stockage est dans `data/`, monté en **répertoire** (et non fichier par
  fichier) : `store.write()` écrit dans un temporaire puis renomme, donc jamais de
  JSON tronqué si le process meurt en pleine écriture.
- `config.json` est la seule source de vérité de la page, et l'UI peut y écrire
  n'importe quoi : `store.validate_config()` est un garde-fou, pas une formalité.
  `config.prev.json` garde la version précédente.
- Toute écriture de config recharge les sections `github` et `local` à chaud et
  invalide les caches (`load_sections()` + `github.invalidate()` +
  `localgit.invalidate()`).
- **L'onglet Local ne modifie rien, jamais.** `gitread.py` n'ouvre les fichiers
  qu'en `"rb"`, n'appelle aucun sous-processus et ne lance aucune commande git —
  `git status` lui-même réécrit l'index, c'est pour ça qu'il n'est pas utilisé.
  Les commandes `git branch -d` affichées sont du texte à copier. Si une
  évolution demande d'exécuter quoi que ce soit, c'est un autre produit.

## Points d'attention

- **Plusieurs comptes GitHub dans une instance** (`backend/accounts.py`). Chaque
  compte = un jeton + ses réglages (`github_accounts[i]`). `github.py` est chargé
  **une fois par compte** (`importlib`, un module par id) : chaque copie a ses
  globales — jeton, cache ETag, données, amorçage du journal — donc les comptes
  sont rafraîchis en parallèle et l'onglet GitHub ne fait que choisir lequel il
  affiche (`?account=`). Ne pas réintroduire d'état partagé entre comptes dans
  `github.py`. `localgit` importe `accounts` sous le nom `github` : même API,
  agrégée sur tous les comptes. Une config sans `github_accounts` = le compte
  « main » ; `github` est tenu égal au premier compte (le front y lit org/login).
  Ajouter/supprimer un compte écrit la config tout de suite (le serveur doit le
  connaître pour y ranger un jeton) : Réglages exige donc un brouillon enregistré.
- Les jetons vivent dans `data/secrets.json` → `github_tokens` {id: jeton} (600),
  **jamais** dans `config.json` : celui-ci transite entier par `GET /api/config`
  et part dans les sauvegardes. L'ancien `github_token` et `GH_TOKEN` valent pour
  « main ». `apply_token()` vide le cache ETag et l'amorçage du journal du compte :
  les repos visibles d'un jeton et pas de l'autre passeraient sinon pour des
  nouveautés. Les événements portent `account`, et leur `tag` est préfixé de l'id
  pour que deux comptes ne se remplacent pas la même notification.
- Chaque repo s'écrit `propriétaire/repo` (`mon-org/api`, `mon-compte/blog`) :
  plus de champ « Organisation », plus rien à deviner. `github.configure()` ramène
  chaque entrée à son nom court et range le propriétaire dans `_OWNERS` — le nom
  court reste la clé partout (caches, journal, onglet Local qui la retrouve dans
  l'URL de son remote) ; tout appel passe par `owner(repo)`. Conséquence : deux
  repos de même nom chez deux propriétaires ne peuvent pas être suivis ensemble,
  et Réglages le refuse (`track()`). L'ancienne clé `org` ne sert plus qu'à lire
  les noms courts des configs d'avant ; le premier enregistrement les réécrit.
- Un jeton voit tous les repos de son compte (perso et orgs) : Réglages les
  propose tous, un onglet par propriétaire, listes chargées une fois par compte.
  Renovate est sauté pour un compte sans repo dérivé : sinon un compte neuf
  interrogerait un `base-site` qui n'existe pas chez lui.
- Réglages → Repos suivis : **une** liste, trois usages par repo (pastilles PRs /
  Branches / Carte → `github.repos`, `github.branch_repos`, `repos.items`).
  `branch_repos` vide veut dire vide ; seule une clé absente reprend `repos`.
  Tout ce qui ne sert qu'à la carte Renovate (repo socle, auteur, repos dérivés,
  affichage) est dans sa section repliable, nulle part ailleurs.
- Le dossier personnel de l'hôte est monté `:ro` sur `/host` ; `HOST_HOME` dit ce
  qu'il vaut côté hôte. Les dossiers choisis dans la page s'écrivent `~/…` et
  `localgit.resolve()` les traduit — ils restent valables hors Docker. Les
  anciennes racines (`/repos`, `/Users/…`) se résolvent aussi, et `_roots()`
  dédoublonne par `realpath`. `browse()` refuse tout ce qui sort du dossier
  personnel après `realpath` (les `..` et les liens symboliques compris).
- `reload_all()` est le seul chemin après une écriture de config (Réglages,
  connexion, restauration) : il démarre aussi la surveillance Local si elle
  dormait faute de dossier — sinon le premier dossier ajouté depuis la page
  attendrait un redémarrage.
- Sauvegardes (`backend/backup.py`) : config + notes + compteurs, **ni** le jeton
  **ni** le journal. Une restauration prend toujours un instantané de l'état
  courant avant d'écrire, et le front recharge la page : notes et compteurs
  vivent aussi dans l'état de l'App. Les noms d'instantané viennent de l'URL :
  `_NAME` est vérifié avant tout accès disque.
- `gitread.py` : le lecteur de packfiles gère les deltas `ofs` **et** `ref` — un
  dépôt fraîchement cloné a tout dans les packs, y compris son commit de tête
  (constaté sur un clone réel). Un repli sur les seuls objets libres marcherait sur
  neuf dépôts sur dix et casserait sur le dixième.
- `localgit.py` : le verdict d'une branche vient de GitHub (`on_github`) quand le
  repo est dans la section `github`, et des `refs/remotes/origin/*` locaux sinon.
  Ne pas inverser cette priorité : le ref local est précisément ce qui survit à
  la suppression d'une branche distante tant qu'on n'a pas fait `fetch --prune`,
  et c'est l'écart entre les deux qui donne à cet onglet son intérêt.
- Une branche squashée sur GitHub a des commits locaux introuvables sur le
  distant : seule la recherche de PR **par nom de branche**
  (`pulls?head=org:branche`) la distingue d'un travail jamais poussé. Chercher par
  sha ne donne rien, le commit n'existe plus en face.
- Jamais de suppression proposée sur la branche courante ni sur une branche
  protégée : `_verdict()` remet `delete` à `None`, et `_commands()` filtre sur
  `delete`, pas sur l'état — sinon la commande réapparaît par la bande.
- **Invariant de `_action()`** : « 🗑 à supprimer » exige `safety.level` dans
  `SAFE_LEVELS`. Un drapeau `-D` ne suffit pas — `git branch -D` efface justement
  ce qui n'est sauvegardé nulle part, et une branche poussée puis effacée du
  distant tombe dans ce cas. Elle affiche « 🔍 à vérifier », pas « à supprimer ».
- Le scan coûte 0,22 s à chaud et 1,6 s à froid. La différence n'est pas le
  disque mais `pr_for_branch()` : sans `_pr_cache`, ces appels pesaient 1,3 s des
  1,5 s d'un cycle. Les dépôts sont lus dans un pool de 6 threads — lstat et HTTP
  libèrent tous deux le GIL.
- La surveillance (`localgit._watch_loop`) repose sur sept `stat` par dépôt —
  0,3 ms pour dix, d'où un contrôle toutes les 2 s. `git fetch` réécrit
  `FETCH_HEAD` **même sans rien ramener** : c'est ce qui permet de détecter la
  commande et pas seulement son résultat. Ne pas remplacer par un scan complet
  périodique, il coûte 200 ms.
- Deux garde-fous qui ne sautent pas : la surveillance dort tant que le front
  n'a rien demandé depuis `watch_idle` (inutile de tenir le volume monté éveillé
  la nuit), et `.git/index` est temporisé à `INDEX_DEBOUNCE` — un éditeur avec
  intégration git lance `git status` en boucle et le réécrit sans arrêt. Les
  causes sont collectées sur **tous** les dépôts puis triées par priorité :
  s'arrêter au premier changement laisserait un fetch derrière un index touché.
- Le rappel de ménage a quatre points d'appel, tous vers l'onglet Local : pastille
  sur l'onglet, bouton dans la barre GitHub, puce sur la PR mergée elle-même, et
  l'entrée du journal. Le troisième est le plus utile — c'est en relisant ses
  merges qu'on est au bon moment. Il faut pour ça que `useLocal` sonde **en
  continu**, onglet fermé compris.
- `localgit._record_cleanup` compare les ensembles de branches supprimables et
  n'enregistre que les nouvelles. Enregistrer l'état ferait sonner tout ce qui
  traîne à chaque scan. Un seul `tag` par branche, donc pas d'empilement.
- Le journal (`backend/events.py`) est la **seule** implémentation du diff. Il
  était côté navigateur, dans `notifyDiff`, tant que les notifications étaient
  sa seule sortie ; les garder toutes les deux, c'était deux diffs qui finissent
  par diverger et une cloche qui contredit la page. `notifications.ts` ne décide
  plus rien, il affiche.
- Le journal se lit dans la **cloche de la barre du haut** (`EventBell.tsx`),
  plus dans un onglet : ouvrir le panneau vaut lecture (`markSeen`), et c'est
  aussi là que vit l'interrupteur des notifications système — **en sourdine par
  défaut** (`homedash:notif-v2` doit valoir `on`). Les non-lus s'affichent dans
  le titre et l'icône de l'onglet du navigateur (`setUnread`), même compteur que
  la cloche, indépendamment des notifications système. « Tout voir » ouvre
  `EventFeed` en vue hors onglets (`tab === 'events'`, jamais mémorisée) ; son
  « fermer » ramène à l'onglet d'où l'on vient.
- Deux repères distincts côté front, et les confondre casse l'un des deux :
  `baseline` (en mémoire) est ce que la page a vu passer depuis son chargement et
  ne notifie rien au premier tour — ouvrir le dashboard le matin ne doit pas faire
  sonner la nuit entière ; `seen` (localStorage) est ce que l'utilisateur a lu, et
  ne sert qu'à la pastille.
- L'amorçage du journal n'est pas une précaution, c'est ce qui le rend lisible.
  Une section jamais vue ne produit rien, sinon le premier fetch y déverse l'état
  courant. Deux pièges déjà payés : `_seeded` porte l'**utilisateur observé** —
  sans ça, une bascule d'utilisateur comparait les PRs de l'un à celles de l'autre
  (mesuré : 18 branches d'écart) — et le côté local ré-amorce **jusqu'au premier
  scan éclairé par GitHub**, parce que la première réponse bascule d'un coup un
  paquet de verdicts qui n'étaient faux que faute d'information.
- `seq` et non `ts` pour repérer ce qui est nouveau : les événements d'un même
  cycle partagent la seconde, un horodatage ne les départage pas. `events.clear()`
  garde donc le compteur — un `seq` réattribué ferait passer d'anciens repères
  pour des nouveautés.
- Le sondage front dépend de `pulse` : sans lui, un clic sur ↻ n'était suivi
  d'aucun sondage avant le tick déjà programmé, soit jusqu'à 120 s de bouton qui
  tourne alors que le scan était fini. Tout déclenchement manuel doit relancer la
  boucle, pas seulement appeler `load()`.
- Trois axes distincts, à ne pas fusionner : `state` (où en est la branche),
  `safety` (son contenu existe-t-il ailleurs), `action` (la conclusion). Les
  fusionner produit exactement la contradiction ci-dessus.
- « Jamais poussée » ≠ « poussée puis supprimée » : le faisceau est
  `remote_ref or upstream or pr`. `branch.<x>.merge` survit à un
  `fetch --prune` qui a effacé le ref distant, c'est le seul témoin restant.
- `github.py` : ne **jamais** revenir à un filtrage des branches par préfixe de nom.
  L'attribution passe par trois signaux, dans cet ordre : la PR dont `head.ref` ==
  la branche (vérifier ce garde-fou — un commit partagé remonte la PR d'une autre
  branche), les auteurs des commits propres à la branche (`compare default...branche`),
  puis l'auteur du commit de tête pour une branche déjà mergée (`ahead_by == 0` →
  `merge_base_commit` EST le tip, donc aucun appel supplémentaire).
- Le cache ETag n'est pas une optimisation cosmétique : sans lui un cycle complet
  coûte ~70 appels, soit ~16 800/h avec un rafraîchissement à 15 s, pour un plafond
  de 5 000/h. GitHub ne décompte pas les 304. Mesuré : ~230 appels au démarrage
  puis **0** tant que rien ne change.
- Les faits de branche sont mis en cache par `(repo, branche, sha)` et sont
  indépendants de l'utilisateur observé : changer d'utilisateur coûte ~0 appel.
- `ResolvedSection` : une variante par jeton `gh:*` avec un `kind` **littéral** —
  TypeScript ne discrimine pas un membre dont le `kind` est une union.
- Le polling front ne s'arrête **pas** quand l'onglet est caché : c'est là que les
  notifications servent. Le navigateur throttle lui-même les timers.
- Les couleurs de signal passent par `--sig-ok` / `--sig-bad` / `--sig-warn` /
  `--sig-info` / `--sig-branch`, redéfinies en thème clair. Ne pas remettre de
  teinte claire en dur dans un `color:` : posée sur un fond `color-mix()` à 18 %,
  elle est lisible sur noir et invisible sur blanc. Les teintes des *fonds*
  restent en dur, un voile pâle marche des deux côtés.
- Jamais de `window.confirm` / `alert` : `confirmDialog()` (`ConfirmHost.tsx`,
  monté une fois dans App) renvoie une promesse. Le message dit ce qui change **et**
  ce qui est conservé ; `danger: true` met le focus sur « Annuler ».
- Champs de Réglages qui ressemblent à un identifiant (login, jeton) :
  `autoComplete="off"` + `data-1p-ignore` / `data-bwignore` / `data-lpignore`,
  sinon le gestionnaire de mots de passe ouvre sa popup « Nouvel identifiant ».
- L'API Notification exige un contexte sécurisé : en `http://<ip>:7777` depuis une
  autre machine elle est absente. La cloche l'explique au lieu de planter. Même
  chose pour `navigator.clipboard` dans l'onglet Local : il est *absent*, donc
  l'appel jette avant de rendre une promesse — un `.catch()` seul ne suffit pas.

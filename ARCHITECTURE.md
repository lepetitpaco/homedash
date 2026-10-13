# Architecture

Un seul projet, un seul conteneur, un seul process au runtime. Node ne sert qu'au
build Vite et disparaît de l'image finale.

```
homedash/
├── backend/                  ← tout le serveur, Python stdlib uniquement
│   ├── server.py             · HTTP : statique + routes /api/*
│   ├── store.py              · lecture/écriture des JSON, validation, backup atomique
│   ├── accounts.py           · plusieurs comptes : un module github chargé par compte, routage
│   ├── github.py             · couche données GitHub d'UN compte
│   ├── events.py             · journal des transitions — ce que la notification laissait filer
│   ├── gitread.py            · lecture des .git : refs, packfiles, index — zéro écriture
│   ├── localgit.py           · dépôts du disque : branches qui traînent, commandes proposées
│   └── backup.py             · instantanés de data/, export, restauration
│
├── src/                      ← front React + Vite (inchangé dans son principe)
│   ├── App.tsx               · assemblage : onglets, barre du haut, vue courante
│   ├── hooks/                · l'état de la page, hors rendu
│   │   ├── useConfigState.ts · chargement + écriture de config.json, témoin d'enregistrement
│   │   ├── useContextMenus.ts· menus clic droit (lien, catégorie) et modale d'édition
│   │   ├── useSearch.ts      · recherche unifiée et ses raccourcis clavier
│   │   ├── useTabs.ts        · onglet ouvert, retour depuis l'historique, titre du navigateur
│   │   ├── useUsage.ts       · compteurs d'ouverture et rangées de tuiles
│   │   ├── usePrefs.ts       · thème et catégories repliées (localStorage)
│   │   └── useCopy.ts        · presse-papier + témoin ✓
│   ├── styles/               · index.css importe les tranches DANS L'ORDRE de la cascade
│   │   └── base, links, ui, github, settings-page, github-bar, local, events,
│   │       settings, confirm, settings-nav, accounts, bell (.css)
│   ├── components/
│   │   ├── Section.tsx       · un bloc de page (carte GitHub, infos, repos, notes, catégorie…)
│   │   ├── GithubView.tsx    · onglet GitHub : barre + cartes
│   │   ├── GhBranches.tsx    · nouvelles cartes GitHub, au design homedash
│   │   ├── GhPrs.tsx
│   │   ├── GhRenovate.tsx
│   │   ├── GhMerged.tsx
│   │   ├── LocalRepos.tsx    · onglet Local : dépôts du disque, en lecture seule
│   │   ├── EventBell.tsx     · cloche de la barre du haut : pastille + panneau des derniers événements
│   │   └── EventFeed.tsx     · historique complet (« Tout voir »), du plus récent au plus ancien
│   └── lib/
│       ├── ghboard.ts        · fetch /api/github + polling
│       ├── local.ts          · fetch /api/local + polling (seulement onglet ouvert)
│       ├── events.ts         · fetch /api/events + polling + déclenche les notifications
│       ├── notes.ts          · → passe du localStorage à l'API
│       └── usage.ts          · → passe du localStorage à l'API
│
├── data/                     ← LE stockage, monté en volume Docker
│   ├── config.json           · liens, groupes, ui, infos, repos + sections "github" et "local"
│   ├── secrets.json          · jeton GitHub saisi dans Réglages (600, jamais servi)
│   ├── backups/              · instantanés : 1/jour + manuels + avant restauration, 30 gardés
│   ├── notes.json            · notes (sortaient du localStorage du navigateur)
│   ├── usage.json            · compteurs d'ouverture (idem)
│   ├── events.json           · journal borné aux 300 derniers événements
│   └── config.prev.json      · sauvegarde auto avant chaque écriture de config
│
├── Dockerfile                ← stage 1 node:22 (vite build) → stage 2 python:3.12-slim
└── docker-compose.yml        · un service, port 7777, volume ./data + ~:/host:ro (nom/port/data paramétrables)
```

## Routes

| route | méthode | rôle |
|---|---|---|
| `/api/config` | GET, PUT | config.json (validé avant écriture, backup de la version précédente) |
| `/api/notes` | GET, PUT | notes.json |
| `/api/usage` | GET, POST, DELETE | compteurs — POST `{id}` incrémente, DELETE remet à zéro |
| `/api/github` | GET | snapshot GitHub d'un compte (`?account=`), + liste des comptes |
| `/api/github/user/{login}` | POST | change l'utilisateur observé |
| `/api/github/refresh` | POST | force un fetch |
| `/api/local` | GET | dépôts git du disque (branches, verdicts, commandes proposées) |
| `/api/local/refresh` | POST | relance le parcours des `.git` — ne lance aucune commande git |
| `/api/events` | GET, DELETE | journal des transitions ; `?since=<seq>` ne renvoie que la suite |
| `/api/github/accounts` | GET, POST | comptes configurés (libellé, login, état) / en ajoute un |
| `/api/github/accounts/{id}` | DELETE | supprime un compte et son jeton |
| `/api/github/auth` | GET | compte du jeton, source (`ui` / `env`) — jamais le jeton |
| `/api/github/token` | PUT, DELETE | connecte (jeton vérifié auprès de GitHub) / déconnecte |
| `/api/github/owners` | GET | comptes dont le jeton voit des repos (le sien, ses orgs) |
| `/api/github/repos/{owner}` | GET | repos visibles d'un compte, les plus actifs d'abord |
| `/api/github/members/{org}` | GET | membres d'une org, pour l'équipe |
| `/api/github/users/{login}` | GET | vérifie qu'un login existe |
| `/api/local/browse` | GET | sous-dossiers d'un dossier du dossier personnel (`?path=~/dev`) |
| `/api/local/roots` | GET | dossiers configurés et s'ils sont lisibles |
| `/api/backup` | GET | export de l'état courant (téléchargement) |
| `/api/backup/restore` | POST | restaure un fichier exporté |
| `/api/backups` | GET, POST | liste / crée un instantané |
| `/api/backups/{nom}` | GET, DELETE | télécharge / supprime un instantané |
| `/api/backups/{nom}/restore` | POST | restaure un instantané |
| `/*` | GET | fichiers statiques, repli SPA sur index.html |

Tout se configure depuis l'onglet Réglages — connexion GitHub, repos, équipe,
dossiers lus, sauvegardes : `docker compose up -d --build` est la seule commande.

L'onglet Local se rafraîchit aussi tout seul : un fil surveille l'empreinte `stat`
des `.git` toutes les 2 s et relance un scan dès qu'un `git fetch`, `git branch -d`
ou changement de branche est constaté, sans rien lire ni écrire.

## Pourquoi le journal est tenu par le serveur

Une notification système répond à « regarde maintenant » et disparaît. Le journal
répond à une autre question — « qu'est-ce qui s'est passé pendant que je
ne regardais pas » — et celle-là exige un historique. Il se lit dans la cloche de la
barre du haut (un panneau, pas un onglet : on y jette un œil puis on revient à ce
qu'on faisait), l'historique complet derrière « Tout voir ».

Il est écrit par le serveur, et pas par le navigateur, pour trois raisons qui
vont dans le même sens : le serveur tourne déjà en continu (fetch GitHub toutes
les 15 s, surveillance des `.git` toutes les 2 s) donc il voit les transitions
même sans page ouverte ; le journal survit au rechargement ; et il est le même
dans tous les navigateurs — c'est aussi pour ça que notes et compteurs ne
vivent pas dans le `localStorage` (voir plus bas).

Conséquence directe : le diff a **un seul** point d'implémentation. Il vivait
dans `notifications.ts`, qui décidait ce qui méritait de sonner ; il vit
maintenant dans `github._diff()` et `localgit._record_cleanup()`, et les
notifications ne sont plus qu'un rendu du journal. Le front ne peut donc pas
sonner pour un événement que la page ne montrerait pas, ni l'inverse.

## Pourquoi Python garde la couche GitHub

La valeur de la couche GitHub est dans sa logique, mesurée et corrigée : cache ETag (un cycle coûte ~225 appels au démarrage puis **0** — GitHub
ne décompte pas les 304), attribution des branches par PR + auteurs de commits,
cache de faits par `(repo, branche, sha)` qui rend le changement d'utilisateur
gratuit, et les portes Renovate. Le serveur tourne de toute façon en continu pour
le journal : il est naturel qu'il porte aussi cette logique, le front ne fait
qu'afficher.

## Pourquoi l'onglet Local relit les .git à la main

Aucune commande git n'est en lecture seule : `git status` réécrit l'index quand
les mtimes ont bougé, une commande interrompue laisse un `.lock`. Comme la seule
exigence non négociable de cet onglet est de ne jamais toucher aux dépôts,
`gitread.py` relit les formats lui-même — refs libres et `packed-refs`, objets
libres et packfiles (index v2, deltas `ofs`/`ref`), en-têtes de commit, index —
avec pour seules primitives `open(…, "rb")`, `os.lstat` et `mmap` en
`ACCESS_READ`. La garantie n'est pas une promesse dans la doc, c'est une
propriété du code, et elle tient même si le montage n'est pas en `:ro`.

Ce n'est pas gratuit : ~450 lignes contre trois `subprocess`. Ce qu'on y gagne,
outre la garantie, c'est la vitesse (10 dépôts en 0,22 s, 1,6 s au premier scan
le temps de peupler le cache) et le maintien de la règle « zéro dépendance runtime » —
l'image reste `python:3.12-slim` sans git installé. Les compteurs ahead/behind
ont été validés à 55/55 contre `git rev-list --left-right --count`, et le
comptage des fichiers modifiés contre `git status --porcelain`.

## Ce qui reste dans le navigateur

Notes et compteurs de clics vivent dans `data/` : dans le `localStorage`, ils
seraient invisibles d'un navigateur à l'autre. Seules les préférences d'affichage
restent en local — thème, catégories repliées, onglet ouvert, compte et dossier
affichés, notifications système activées ou non.

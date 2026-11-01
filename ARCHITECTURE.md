# Architecture

Une appli Electron qui embarque tout : le front React compilé et le serveur TypeScript (Node seul,
aucune dépendance), lancé dans un utilityProcess. La page garde l'adresse http://localhost:7777, servie
par l'appli sans ouvrir de port. En dev, le même serveur tourne en HTTP dans Docker (:7778).

```
server/                   TypeScript « effaçable » : lancé tel quel en dev, compilé par tsc (dist-server/)
  app.ts                  handle(req) → res : toute l'API et les fichiers, indépendants du transport ;
                          contrôles Host/Origin (refused) ; démarrage des tâches de fond
  http.ts, main.ts        transport HTTP : dev (:7779 derrière Vite :7778), accès navigateur
  host.ts                 dans l'appli : requêtes reçues par messages, accès navigateur facultatif
  store.ts                JSON dans data/ : écriture atomique, validation, secrets en 600
  paths.ts                chemins affichés (~/…, C:/…) ↔ lisibles (vrais dans l'appli, montages en dev)
  accounts.ts             comptes GitHub : une instance GitHubAccount par compte, migration de config
  github.ts               données GitHub d'un compte (cache ETag), seule écriture : createIssue
  basecamp.ts             Basecamp : OAuth, mes tâches, mes notifications (lecture), rapport d'issue
                          publié en commentaire (seule écriture) ; html.ts lit leur HTML
  trello.ts               Trello : clé d'API + jeton collé, cartes ouvertes, notifications non lues
                          (lecture), rapport d'issue publié en commentaire (seule écriture)
  localfile.ts            Mes sites : un fichier du dossier personnel servi en lecture seule
  docker.ts               Réglages → Docker : liste des containers lue sur le socket (une seule requête GET)
  favicons.ts             icônes de Mes sites relayées (la page les recadre), en cache
  perflog.ts              journal de performance facultatif (ui.perfLog) : data/perf/, 30 jours
  perfreport.ts           ce journal résumé jour par jour (Réglages → Aide, scripts/perf-report.mjs)
  events.ts               journal des événements (la cloche)
  gitread.ts              lecture des .git sans git ni écriture
  localgit.ts             onglet Local : verdicts et commandes proposées
  backup.ts               instantanés, export, restauration, réparation d'une config abîmée
  fullexport.ts           export complet chiffré (.homedash : scrypt + AES-256-GCM), aperçu, import
  errlog.ts               journal d'erreurs (data/logs/, 30 jours) : message vu + détail technique
  updates.ts              version installée (CHANGELOG.md), dernière Release GitHub, GUIDE.md servi
src/
  App.tsx                 assemblage : barre du haut, onglets, barre de gauche (Rail), vue courante
  hooks/                  état de la page (config, recherche, onglets, menus, préférences…)
  components/             une vue ou un bloc par fichier (Gh*, LocalRepos, Set*, EventBell…) ; IssueComposer :
                          la fenêtre d'une tâche ou d'une carte, et la création d'issue (IssueHost, TrIssueHost)
  lib/                    appels API et polling (ghboard, local, events, admin…), markdown (aide),
                          tabCount (pastilles de Mes sites)
  styles/                 index.css importe les feuilles dans l'ordre de la cascade
desktop/                  l'appli (Electron)
  main.js                 fenêtre, webviews de Mes sites (guest-preload.js : souris, clavier, rien
                          d'exposé), badge du Dock / barre des tâches, icône près de l'horloge (Windows),
                          menus, connexion Basecamp interceptée, cookies de l'export complet,
                          reprise des données Docker au premier lancement
  server.js               lance le serveur, intercepte http://localhost:7777 (sessions des sites :
                          GET /api/file seulement)
  updater.js              mise à jour par la dernière Release (sha512 vérifié, données sauvegardées, journal Windows)
  assemble.sh             assemble desktop/app/ (coquille + server/ + public/ + CHANGELOG, GUIDE)
  electron-builder.yml    .dmg / .zip Mac (arm64, x64), setup.exe Windows, latest*.yml
  build-local.sh          l'appli construite sur ce Mac pour l'essayer (Docker + codesign ad hoc)
.github/workflows/        release.yml : nouvelle version arrivée sur main → tag, appli construite, Release publiée
                          windows.yml : mise à jour Windows testée sur un vrai Windows (pull requests qui y touchent)
tests-ts/                 Vitest (gitread comparé à git, verdicts Local, Basecamp lecture seule, API…)
scripts/                  parity.mjs (compare deux serveurs), perf-report.mjs
docker-compose.dev.yml    le dev : Vite + serveur en --watch, homedash-dev.localhost:7778
CLAUDE.md                 règles du code et fonctionnalités principales (fait foi, pour humains et IA)
AGENTS.md, .cursor/rules/ les mêmes règles pour Cursor et les autres IA (renvoient à CLAUDE.md)
CHANGELOG.md              une entrée par version (un tag = une Release) ; la première = version installée
CHANGELOG-dev.md          ce qui est fait sur les branches, pas encore publié ; non livré dans l'appli
RELEASE.md                les étapes de livraison : flux, tests, preprod, version, prod
GUIDE.md                  mode d'emploi ; chaque `## ` = une page de Réglages → Aide
docs/screenshots/         captures (instance de démo) : README, GUIDE, et servies sous /guide/
data/                     (non versionné, dev) ; dans l'appli : <userData>/data
                          config.json, secrets.json, notes, journal, backups/, version.json
```

## API

| Route | Méthode | Rôle |
| --- | --- | --- |
| `/api/config` | GET, PUT | Config de la page (validée, version précédente gardée) |
| `/api/notes`, `/api/usage` | GET, PUT/POST, DELETE | Notes, compteurs de clics |
| `/api/events` | GET, DELETE | Journal ; `?since=<seq>` pour la suite |
| `/api/github` | GET | Données d'un compte (`?account=`) |
| `/api/github/refresh`, `/api/github/user/{login}` | POST | Forcer un fetch, changer d'utilisateur affiché |
| `/api/github/accounts[/{id}]` | GET, POST, DELETE | Lister, ajouter, supprimer un compte |
| `/api/github/token` | PUT, DELETE | Connecter (jeton vérifié) / déconnecter |
| `/api/github/{auth,owners,repos/{owner},members/{org},users/{login}}` | GET | Pour Réglages |
| `/api/basecamp`, `/api/basecamp/refresh` | GET, POST | Tâches et notifs non lues, relecture |
| `/api/basecamp/{auth,app,authorize,code,token}` | GET, PUT, POST, DELETE | Réglages : appli Launchpad, connexion, déconnexion |
| `/api/basecamp/search?q=` | GET | Recherche dans tout Basecamp (barre de recherche), réponses gardées 1 min |
| `/api/basecamp/task?url=` | GET | Description et étapes d'une tâche (`text`), ses échanges à part (`comments`), ses images (`images`) : fiche et issue |
| `/api/basecamp/file?url=` | GET | Image jointe à une tâche, lue avec le jeton (adresse `…/blobs/…` du compte, formats d'image sûrs, sans SVG) |
| `/api/basecamp/report` | POST | Publier le rapport d'une issue liée en commentaire de sa tâche (une fois) |
| `/api/basecamp/dismiss` | POST | Écarter une issue liée sans publier son rapport (`undo` : la rétablir) ; rien n'est envoyé |
| `/api/github/issue` | POST | Créer une issue liée à une tâche Basecamp ou une carte Trello (repos suivis, et choisis pour l'outil : `basecamp.repos` / `trello.repos`, absent = tous) |
| `/api/trello`, `/api/trello/refresh` | GET, POST | Cartes ouvertes et notifs non lues, relecture |
| `/api/trello/{auth,app,authorize,token}` | GET, PUT, POST, DELETE | Réglages : clé d'API, page d'autorisation, jeton collé, déconnexion |
| `/api/trello/search?q=` | GET | Recherche Trello (barre de recherche), réponses gardées 1 min |
| `/api/trello/card?url=` | GET | Description, listes et commentaires d'une carte |
| `/api/trello/file?url=` | GET | Image déjà vue sur une carte (formats sûrs, sans SVG, 15 Mo au plus, coupée pendant la lecture) |
| `/api/trello/report` | POST | Publier le rapport d'une issue liée en commentaire de sa carte (une fois) |
| `/api/trello/dismiss` | POST | Écarter une issue liée sans publier ; rien n'est envoyé |
| `/api/basecamp/callback` | GET | Retour d'autorisation Basecamp (`state` vérifié) |
| `/api/perf` | GET, POST, DELETE | Journal de performance : état et place prise, mesure de l'appli / action de la page, vider |
| `/api/favicon?host=` | GET | Icône d'un site, via le service de favicons (ou le site, s'il est dans Mes sites) |
| `/api/file?path=` | GET | Fichier / dossier de Mes sites (dossier personnel, sans caché ni `data/`) |
| `/api/local`, `/api/local/refresh` | GET, POST | Dépôts du disque, relecture |
| `/api/local/browse`, `/api/local/roots` | GET | Choix des dossiers (dossier personnel et disque monté ; `&files=1` liste aussi les fichiers, dossier personnel seulement) |
| `/api/backup`, `/api/backup/restore` | GET, POST | Export, restauration d'un fichier |
| `/api/backups[/{nom}[/restore]]` | GET, POST, DELETE | Instantanés |
| `/api/changelog`, `/api/changelog/check` | GET, POST | Changelog, version installée, mise à jour disponible |
| `/api/guide` | GET | Texte de GUIDE.md (Réglages → Aide) |
| `/api/errors` | GET, POST, DELETE | Journal d'erreurs : lire, noter une erreur de la page, vider |
| `/api/perf/report?days=` | GET | Journal de performance résumé, jour par jour (Réglages → Aide) |
| `/api/config/repair` | POST | Config illisible : mise de côté, dernière sauvegarde valide restaurée |
| `/api/export/full` | POST | Export complet chiffré (mot de passe, cookies des sites fournis par l'appli) → fichier `.homedash` |
| `/api/import/preview`, `/api/import/apply` | POST | Export complet : aperçu sans secret, puis import (instantané avant, jetons remplacés gardés à part) |
| `/api/docker` | GET | Lignes Docker (projets et containers, en marche ou éteints) ; socket contacté seulement si `docker.enabled` (ou `?probe=1`, depuis Réglages) |
| `/api/health` | GET | État du serveur : fonctionnalités actives, Basecamp et Trello connectés, comptes GitHub, version, accès navigateur |

Toute requête doit venir d'un hôte local (ou de `HOMEDASH_HOSTS`) ; une écriture doit venir de la page
elle-même et envoyer du JSON.

## Choix structurants

- **Zéro dépendance au runtime.** Node seul pour le serveur, React seul pour la page, Electron seul pour
  l'appli : rien à mettre à jour, peu de surface d'attaque.
- **Une appli, pas un container (2.0).** Une page web ne peut afficher un autre site que dans une
  iframe, que Gmail, Chat… refusent, ni lire ce qu'il affiche : Electron fournit des webviews, qui
  échappent aux deux. Electron embarquant déjà Node, le serveur y vit aussi, écrit en TypeScript : un
  seul langage, rien d'autre à installer. Le serveur ne dépend pas d'Electron (`app.handle()` sert aussi
  le HTTP du dev), et la page marche aussi dans un navigateur.
- **Aucun port.** L'appli sert http://localhost:7777 dans ses propres sessions (`protocol.handle`) :
  même origine qu'en 1.x (réglages de la page et connexions gardés, contexte sûr), mais aucun site ouvert
  dans le navigateur ne peut joindre l'API. Le port n'existe que si on l'active (« Accès depuis le
  navigateur »).
- **Mise à jour par les Releases.** Une nouvelle version sur `main` pose le tag et construit l'appli (Actions) ; l'appli télécharge son fichier,
  vérifie le sha512 publié, sauvegarde les données et se remplace. Sous Windows, un PowerShell lancé par un relais installe, note ses
  étapes dans `<userData>/update.log` et rouvre l'appli en cas d'échec ; le démarrage suivant le signale. L'appli ne quitte qu'une fois sa ligne `start` écrite. Sans signature : le compte GitHub est
  la seule protection (double authentification indispensable).
- **Le serveur tient le journal.** Il tourne en continu, voit tout même page fermée, et c'est le seul
  endroit qui décide ce qui est un événement : la cloche et les notifications ne font qu'afficher.
- **L'onglet Local relit les `.git` à la main** (`gitread.ts`). Aucune commande git n'est sans écriture
  (`git status` réécrit l'index) ; relire les fichiers garantit qu'on ne touche jamais un dépôt.
  Validé contre git dans `tests-ts/gitread.test.ts` (packs, deltas `ofs` et `ref`, aucune écriture).
- **Cache ETag GitHub.** ~220 appels au démarrage, puis 0 tant que rien ne change (les 304 sont gratuits).
- **Une instance `GitHubAccount` par compte.** Chaque compte a son jeton et ses caches, sans rien partager.

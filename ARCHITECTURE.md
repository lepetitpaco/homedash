# Architecture

Un conteneur, un process Python (stdlib) qui sert le front React compilé et l'API. Node ne sert qu'au build.

```
backend/                  Python stdlib, aucune dépendance
  server.py               HTTP : fichiers statiques + /api/*, contrôles Host/Origin
  store.py                JSON dans data/ : écriture atomique, validation, secrets en 600
  accounts.py             comptes GitHub : un module github.py chargé par compte, migration de config
  github.py               données GitHub d'un compte (cache ETag)
  basecamp.py             Basecamp : OAuth, mes tâches, mes notifications (lecture), rapport d'issue
                          publié en commentaire (seule écriture)
  localfile.py            onglets perso : un fichier du dossier personnel servi en lecture seule
  favicons.py             icônes des onglets perso relayées (la page les recadre), en cache
  perflog.py              journal de performance facultatif (ui.perfLog) : data/perf/, 30 jours
  events.py               journal des événements (la cloche)
  gitread.py              lecture des .git sans git ni écriture
  localgit.py             onglet Local : verdicts et commandes proposées
  backup.py               instantanés, export, restauration, réparation d'une config abîmée
  errlog.py               journal d'erreurs (data/logs/, 30 jours) : message vu + détail technique
  updates.py              version installée (CHANGELOG.md), mise à jour disponible sur GitHub, GUIDE.md servi
src/
  App.tsx                 assemblage : barre du haut, onglets, barre de gauche (Rail), vue courante
  hooks/                  état de la page (config, recherche, onglets, menus, préférences…)
  components/             une vue ou un bloc par fichier (Gh*, LocalRepos, Set*, EventBell…)
  lib/                    appels API et polling (ghboard, local, events, admin…), markdown (aide),
                          tabCount (pastilles des onglets perso)
  styles/                 index.css importe les feuilles dans l'ordre de la cascade
desktop/                  appli de bureau facultative (Electron) : fenêtre sur la page du container,
                          webviews des onglets perso, badge du Dock (barre des tâches sous Windows).
                          Construite sur la machine : build-local.sh (Mac, Docker + codesign),
                          build-windows.ps1 / .sh (Windows x64 : Docker, installateur NSIS installer.nsi).
                          updater.js : mise à jour depuis l'appli (git pull, compose, se reconstruit)
scripts/perf-report.py    résumé du journal de performance en texte (même calcul que la page :
                          backend/perfreport.py)
tests/                    unittest stdlib
CLAUDE.md                 règles du code et fonctionnalités principales (fait foi, pour humains et IA)
AGENTS.md, .cursor/rules/ les mêmes règles pour Cursor et les autres IA (renvoient à CLAUDE.md)
CHANGELOG.md              une entrée par version ; la première = version installée
GUIDE.md                  mode d'emploi ; chaque `## ` = une page de Réglages → Aide
docs/screenshots/         captures (instance de démo) : README, GUIDE, et servies sous /guide/
data/                     (non versionné) config.json, secrets.json, notes, journal, backups/, version.json
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
| `/api/github/issue` | POST | Créer une issue liée à une tâche Basecamp (repos suivis) |
| `/api/basecamp/callback` | GET | Retour d'autorisation Basecamp (`state` vérifié) |
| `/api/perf` | GET, POST, DELETE | Journal de performance : état et place prise, mesure de l'appli / action de la page, vider |
| `/api/favicon?host=` | GET | Icône d'un site, via le service de favicons (ou le site, s'il est un onglet perso) |
| `/api/file?path=` | GET | Fichier / dossier d'un onglet perso (dossier personnel, sans caché ni `data/`) |
| `/api/local`, `/api/local/refresh` | GET, POST | Dépôts du disque, relecture |
| `/api/local/browse`, `/api/local/roots` | GET | Choix des dossiers (limité au dossier personnel ; `&files=1` liste aussi les fichiers) |
| `/api/backup`, `/api/backup/restore` | GET, POST | Export, restauration d'un fichier |
| `/api/backups[/{nom}[/restore]]` | GET, POST, DELETE | Instantanés |
| `/api/changelog`, `/api/changelog/check` | GET, POST | Changelog, version installée, mise à jour disponible |
| `/api/guide` | GET | Texte de GUIDE.md (Réglages → Aide) |
| `/api/errors` | GET, POST, DELETE | Journal d'erreurs : lire, noter une erreur de la page, vider |
| `/api/perf/report?days=` | GET | Journal de performance résumé, jour par jour (Réglages → Aide) |
| `/api/config/repair` | POST | Config illisible : mise de côté, dernière sauvegarde valide restaurée |

Toute requête doit venir d'un hôte local (ou de `HOMEDASH_HOSTS`) ; une écriture doit venir de la page
elle-même et envoyer du JSON.

## Choix structurants

- **Zéro dépendance au runtime.** Image légère, rien à mettre à jour, peu de surface d'attaque.
- **L'appli de bureau n'est qu'une coquille.** Une page web ne peut afficher un autre site que dans une
  iframe, que Gmail, Chat… refusent, ni lire ce qu'il affiche. Electron fournit des webviews, qui
  échappent aux deux. Elle charge la page du container (rien d'embarqué) : le serveur et le front restent
  sans dépendance, et la page marche aussi dans un navigateur.
- **Le serveur tient le journal.** Il tourne en continu, voit tout même page fermée, et c'est le seul
  endroit qui décide ce qui est un événement : la cloche et les notifications ne font qu'afficher.
- **L'onglet Local relit les `.git` à la main** (`gitread.py`). Aucune commande git n'est sans écriture
  (`git status` réécrit l'index) ; relire les fichiers garantit qu'on ne touche jamais un dépôt.
  Validé contre git dans `tests/`.
- **Cache ETag GitHub.** ~220 appels au démarrage, puis 0 tant que rien ne change (les 304 sont gratuits).
- **Un module `github.py` par compte.** Chaque compte a son jeton et ses caches, sans rien partager.

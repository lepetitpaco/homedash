# Architecture

Un conteneur, un process Python (stdlib) qui sert le front React compilé et l'API. Node ne sert qu'au build.

```
backend/                  Python stdlib, aucune dépendance
  server.py               HTTP : fichiers statiques + /api/*, contrôles Host/Origin
  store.py                JSON dans data/ : écriture atomique, validation, secrets en 600
  accounts.py             comptes GitHub : un module github.py chargé par compte, migration de config
  github.py               données GitHub d'un compte (cache ETag)
  events.py               journal des événements (la cloche)
  gitread.py              lecture des .git sans git ni écriture
  localgit.py             onglet Local : verdicts et commandes proposées
  backup.py               instantanés, export, restauration
src/
  App.tsx                 assemblage : barre du haut, onglets, vue courante
  hooks/                  état de la page (config, recherche, onglets, menus, préférences…)
  components/             une vue ou un bloc par fichier (Gh*, LocalRepos, Set*, EventBell…)
  lib/                    appels API et polling (ghboard, local, events, admin…)
  styles/                 index.css importe les feuilles dans l'ordre de la cascade
tests/                    unittest stdlib
data/                     (non versionné) config.json, secrets.json, notes, journal, backups/
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
| `/api/local`, `/api/local/refresh` | GET, POST | Dépôts du disque, relecture |
| `/api/local/browse`, `/api/local/roots` | GET | Choix des dossiers (limité au dossier personnel) |
| `/api/backup`, `/api/backup/restore` | GET, POST | Export, restauration d'un fichier |
| `/api/backups[/{nom}[/restore]]` | GET, POST, DELETE | Instantanés |

Toute requête doit venir d'un hôte local (ou de `HOMEDASH_HOSTS`) ; une écriture doit venir de la page
elle-même et envoyer du JSON.

## Choix structurants

- **Zéro dépendance au runtime.** Image légère, rien à mettre à jour, peu de surface d'attaque.
- **Le serveur tient le journal.** Il tourne en continu, voit tout même page fermée, et c'est le seul
  endroit qui décide ce qui est un événement : la cloche et les notifications ne font qu'afficher.
- **L'onglet Local relit les `.git` à la main** (`gitread.py`). Aucune commande git n'est sans écriture
  (`git status` réécrit l'index) ; relire les fichiers garantit qu'on ne touche jamais un dépôt.
  Validé contre git dans `tests/`.
- **Cache ETag GitHub.** ~220 appels au démarrage, puis 0 tant que rien ne change (les 304 sont gratuits).
- **Un module `github.py` par compte.** Chaque compte a son jeton et ses caches, sans rien partager.

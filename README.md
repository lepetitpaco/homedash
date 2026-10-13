# homedash

Une page d'accueil de navigateur auto-hébergée : raccourcis, infos à copier, notes, un tableau de bord
GitHub (branches, PRs, CI, Renovate) et un onglet **Local** qui repère les branches mergées qui traînent
encore dans tes clones.

Un seul conteneur Docker, aucune dépendance à installer sur la machine, aucune donnée envoyée ailleurs
qu'à l'API GitHub.

> **Mode d'emploi complet : [GUIDE.md](GUIDE.md)**

## Démarrer

Prérequis : Docker (Docker Desktop, OrbStack, Colima…).

```bash
docker compose up -d --build
```

Puis ouvre **http://localhost:7777**. Tout le reste se règle dans **⚙ Réglages**, sans script ni fichier
à éditer :

| Réglage | Ce qu'il fait |
| --- | --- |
| 🔑 Compte & équipe | Colle un jeton GitHub (lecture seule suffit). Plusieurs comptes possibles. |
| 📦 Repos suivis | Choisis parmi les repos que voit le jeton, un onglet par propriétaire. |
| 🐙 Onglet GitHub | Fréquence de rafraîchissement, carte Renovate optionnelle. |
| 💻 Dépôts locaux | Dossiers contenant tes clones git — lus, jamais modifiés. |
| 💾 Sauvegardes | Instantané quotidien automatique, export, restauration. |
| 🎛 Affichage | Thème, horloge, largeur des liens, notifications… |

Au premier lancement, `data/` est créé avec une config minimale. Rien à préparer.

## Commandes utiles

```bash
docker compose logs -f          # suivre les logs
docker compose down             # arrêter (les données restent dans data/)
docker compose up -d --build    # reconstruire après une mise à jour du code
python3 -m unittest discover -s tests -t .   # tests (Python 3.9+, git pour ceux de gitread)
```

Le conteneur redémarre tout seul avec Docker (`restart: always`).

### Une seconde instance

Pour des données complètement séparées, sans copier le projet :

```bash
HOMEDASH_NAME=homedash-2 HOMEDASH_PORT=7778 HOMEDASH_DATA=./data-2 \
  docker compose -p homedash-2 up -d --build
```

Pour suivre plusieurs comptes GitHub, ce n'est pas nécessaire : une instance gère plusieurs jetons.

## Données et sécurité

- Tout est dans `data/` (config, notes, compteurs, journal, sauvegardes). Copier ce dossier = tout copier.
- Les jetons GitHub sont dans `data/secrets.json` (droits 600). Ils ne sont jamais renvoyés au navigateur
  ni inclus dans les sauvegardes.
- Le dossier personnel de l'hôte est monté **en lecture seule** pour l'onglet Local. Aucune commande git
  n'est lancée : les `.git` sont relus directement, fichier par fichier.
- Le port n'écoute que sur `127.0.0.1`. La config est modifiable depuis la page et peut contenir des
  mots de passe (panneau Infos) : pour l'ouvrir au réseau, remplace `127.0.0.1:${HOMEDASH_PORT:-7777}:80`
  par `${HOMEDASH_PORT:-7777}:80` dans `docker-compose.yml` **et** déclare les noms utilisés pour y
  accéder : `HOMEDASH_HOSTS=homedash.lan,192.168.1.20 docker compose up -d`.
- Le serveur refuse toute requête dont l'hôte n'est pas reconnu, et toute écriture venue d'un autre site :
  une page web ouverte dans ton navigateur ne peut ni lire ni modifier homedash.

## Documentation

| Fichier | Pour qui |
| --- | --- |
| [GUIDE.md](GUIDE.md) | Utiliser la page : chaque onglet, chaque réglage, les raccourcis. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Arborescence, routes de l'API, choix techniques. |
| [CLAUDE.md](CLAUDE.md) | Règles du code et pièges connus, pour qui le modifie (humain ou IA). |

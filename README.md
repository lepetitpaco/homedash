# homedash

Ta page d'accueil, chez toi : tes liens et notes, ton code (GitHub et dépôts locaux), Basecamp, et tes
sites (Gmail, Chat, Claude…) dans une barre façon Discord, avec leurs non-lus. Dans le navigateur, ou
dans sa propre appli sur Mac et Windows.

![homedash : un site ouvert dans l'appli, barre de gauche et non-lus](docs/screenshots/site-dans-un-onglet.jpg)

| Raccourcis | Clic droit sur un lien | La cloche |
| --- | --- | --- |
| ![](docs/screenshots/accueil.jpg) | ![](docs/screenshots/clic-droit-sur-un-lien.jpg) | ![](docs/screenshots/cloche.jpg) |

Toutes les captures, commentées : **[docs/APERCU.md](docs/APERCU.md)** (démo, données fictives).

## Ce que ça fait

- **Raccourcis** : liens, tuiles des plus utilisés, notes, infos à copier (Wi-Fi, IP…).
- **Mes sites** : Gmail, Chat, WhatsApp, Claude… à côté de homedash, avec la pastille de leurs
  non-lus, des dossiers et plusieurs comptes par site.
- **GitHub et Local** : tes branches, PRs et CI, et les branches mergées qui traînent sur ton disque.
- **Basecamp** : tes tâches en retard ou à venir ; une tâche devient une issue GitHub, et son rapport
  revient en commentaire.
- **La cloche** : CI cassée ou réparée, PR mergée, nouvelle version…

## Installer

Il faut **Docker Desktop** (lancé), **Git** et l'accès au dépôt. Colle le bloc de ton système dans un
terminal, depuis le dossier où tu ranges tes projets.

**Mac** (Terminal) :

```bash
git clone https://github.com/davidgennaoui/homedash.git && cd homedash
docker compose up -d --build              # le serveur (2-3 min la première fois)
sh desktop/build-local.sh --install       # l'appli, dans Applications (1 min)
open -a homedash
```

**Windows** (PowerShell) :

```powershell
git clone https://github.com/davidgennaoui/homedash.git; cd homedash
docker compose up -d --build              # le serveur (2-3 min la première fois)
powershell -ExecutionPolicy Bypass -File desktop\build-windows.ps1 -Install   # l'appli (1-2 min)
```

Pas envie de l'appli ? Arrête-toi après `docker compose` et ouvre **http://localhost:7777**. Dans
Docker Desktop, coche *Start Docker Desktop when you sign in* : homedash redémarre avec ta machine.

## Premiers réglages

Tout se fait dans **⚙ Réglages**, aucun fichier à éditer :

1. **Compte & équipe** : colle un jeton GitHub. Crée-le dans *GitHub → Settings → Developer settings →
   Fine-grained tokens*, en lecture seule : *Contents*, *Pull requests*, *Checks*, *Metadata*, *Issues*
   (+ *Members* sur l'organisation pour voir l'équipe). Pour créer des issues depuis l'onglet Basecamp :
   *Issues* en *Read and write*. Un jeton classic `repo` fait tout cela.
2. **Repos suivis** : ＋ sur tes repos.
3. **Dépôts locaux** : le dossier de tes clones (`~/dev`…).
4. **Mes sites** : tes sites, ou ＋ en bas de la barre de gauche.

## Mettre à jour

Une nouvelle version, la cloche et le numéro de version (en haut à droite) le disent.

- **Dans l'appli** : *Aide → Mettre à jour maintenant*. Elle récupère la version, reconstruit le
  serveur, et se reconstruit elle-même quand il le faut.
- **Sans l'appli** : `git pull && docker compose up -d --build` (sous Windows : `git pull; docker
  compose up -d --build`).

Tes données sont sauvegardées automatiquement avant chaque mise à jour.

## Bon à savoir

- **Tes données** sont dans `data/`, jamais dans git. Sauvegarde automatique chaque jour, restauration
  dans *Réglages → Sauvegardes*.
- **Les jetons** restent côté serveur (`data/secrets.json`) : jamais envoyés au navigateur, ni mis dans
  les sauvegardes.
- **L'onglet Local ne touche à rien** : tes dossiers sont lus, jamais modifiés, et aucune commande
  git n'est lancée.
- **Accessible depuis ta machine seulement** (`127.0.0.1`). Pour l'ouvrir au réseau : remplace
  `127.0.0.1:${HOMEDASH_PORT:-7777}:80` par `${HOMEDASH_PORT:-7777}:80` dans `docker-compose.yml`, et
  lance avec `HOMEDASH_HOSTS=<nom-ou-ip>`.
- **Un souci ?** *Réglages → Aide* (guide, *En cas de souci*, journal d'erreurs), puis une
  [issue](https://github.com/davidgennaoui/homedash/issues/new).

## Contribuer

homedash sert à toute l'équipe : ce que tu pousses sur `main` arrive chez tout le monde à sa prochaine
mise à jour. Améliore tout ce que tu veux, sans dénaturer l'existant.

- **Avant de coder** : lis **[CLAUDE.md](CLAUDE.md)** (règles du code, et la liste des **fonctionnalités
  principales** à ne pas changer sans prévenir) et **[ARCHITECTURE.md](ARCHITECTURE.md)** (fichiers,
  API). Ton IA les lit aussi : `CLAUDE.md` pour Claude Code, `AGENTS.md` et `.cursor/rules/` pour
  Cursor et les autres. Elle te prévient avant de toucher une fonctionnalité principale.
- **Tester** (Node n'est pas requis, tout passe par Docker) :

  ```bash
  docker compose up -d --build                                              # redéployer, puis tester la page
  docker run --rm -v "$PWD":/app -w /app node:22-alpine npx tsc --noEmit    # typecheck
  python3 -m unittest discover -s tests -t .                                # tests (~10 s)
  ```

- **Livrer** : travaille ta vague sur une branche locale, puis pousse sur `main`, après `git pull
  --rebase` et `git fetch --tags`. Un push = une version : une entrée en tête du `CHANGELOG.md` pour
  toute la vague (pas une par commit), un tag `vX.Y.Z`, le `GUIDE.md` à jour et une issue par
  changement. Le détail est dans `CLAUDE.md`. Jamais de
  `push --force`.

## Aller plus loin

- **[GUIDE.md](GUIDE.md)** : le mode d'emploi, aussi dans *Réglages → Aide*.
- **[CHANGELOG.md](CHANGELOG.md)** : les nouveautés de chaque version.

# homedash

Ta page d'accueil, chez toi : tes liens et notes, ton code (GitHub et dépôts locaux), Basecamp, et tes
sites (Gmail, Chat, Claude…) dans une barre façon Discord, avec leurs non-lus. Une appli pour Mac et
Windows, qui s'installe et se met à jour toute seule.

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

1. **Télécharge** la dernière version sur la page des
   **[versions](https://github.com/lepetitpaco/homedash/releases/latest)** :
   - **Mac Apple Silicon** (M1, M2…) : `homedash-<version>-arm64.dmg` ;
   - **Mac Intel** : `homedash-<version>-x64.dmg` ;
   - **Windows** : `homedash-<version>-setup.exe`.

   Les autres fichiers (`.zip`, `.blockmap`, `latest*.yml`) servent aux mises à jour automatiques.
2. **Installe** : sur Mac, ouvre le `.dmg` et glisse homedash dans Applications ; sous Windows, lance
   le `setup.exe`. Rien d'autre à installer : ni Docker, ni Git, ni Node.
3. **Autorise-la au premier lancement** (une seule fois : l'appli n'est pas signée par Apple ni
   Microsoft) :
   - **Mac** : macOS affiche « Apple n'a pas pu confirmer que homedash… ». Clique **Terminé** (pas
     *Placer dans la corbeille*), puis *Réglages Système → Confidentialité et sécurité*, tout en bas :
     **Ouvrir quand même**, ton mot de passe, puis **Ouvrir**. Le bouton n'apparaît qu'après une
     tentative d'ouverture : relance homedash s'il n'y est pas.
   - **Windows** : « Windows a protégé votre ordinateur » → **Informations complémentaires** →
     **Exécuter quand même**.
4. **Premier lancement** : homedash propose de reprendre les données d'une installation Docker
   (ci-dessous) ; sinon, *Commencer à zéro*.

Les mises à jour se font ensuite depuis l'appli, sans rien retélécharger ni réautoriser.

### Tu avais homedash avec Docker (1.x)

Fais-le **sur la machine où tournait la v1** : tout est repris, connexions des sites comprises.

1. Installe la 2.0 (ci-dessus) et ouvre-la.
2. Elle trouve le dossier `data` de ton projet homedash : **Reprendre ces données**. Sinon, *Choisir
   un autre dossier…* et désigne le dossier du projet ou son dossier `data`. Les données sont **copiées**,
   l'original n'est pas touché ; une sauvegarde est prise au démarrage (*Réglages → Sauvegardes*).
3. Tes sites (Gmail, Discord…) sont déjà connectés : la 2.0 reprend les sessions de l'ancienne appli. Si
   macOS demande l'accès à « homedash Safe Storage » dans le trousseau : **Toujours autoriser**.
4. Vérifie que tout y est, puis arrête l'ancien container (`docker compose down` dans le dossier du
   projet) et supprime l'ancienne appli si tu l'avais construite.

**Sur une autre machine** : installe d'abord la 2.0 là où tu avais la v1, puis *Réglages → Sauvegardes
→ Export complet*, et importe le fichier sur la nouvelle machine.

## Premiers réglages

Tout se fait dans **⚙ Réglages**, aucun fichier à éditer :

1. **GitHub → Connexion** : colle un jeton GitHub. Crée-le dans *GitHub → Settings → Developer settings →
   Fine-grained tokens*, en lecture seule : *Contents*, *Pull requests*, *Checks*, *Metadata*, *Issues*
   (+ *Members* sur l'organisation pour voir l'équipe). Pour créer des issues depuis l'onglet Basecamp :
   *Issues* en *Read and write*. Un jeton classic `repo` fait tout cela.
2. **GitHub → Repos suivis** : ＋ sur tes repos.
3. **Dépôts locaux** : le dossier de tes clones (`~/dev`…).
4. **Mes sites** : tes sites, ou ＋ en bas de la barre de gauche.

## Mettre à jour

Une nouvelle version, la cloche et le numéro de version (en haut à droite) le disent. *Aide → Vérifier
les mises à jour* (ou le bouton des nouveautés) : l'appli télécharge la version, vérifie son empreinte,
sauvegarde tes données, puis se remplace et se relance.

## Bon à savoir

- **Tes données** sont sur ta machine : `~/Library/Application Support/homedash/data` (Mac),
  `%APPDATA%\homedash\data` (Windows). Sauvegarde automatique chaque jour, restauration dans
  *Réglages → Sauvegardes*. Pour changer de machine : *Export complet*, chiffré par un mot de passe.
- **Les jetons** restent dans le serveur de l'appli (`secrets.json`) : jamais envoyés à la page, ni mis
  dans les sauvegardes simples.
- **L'onglet Local ne touche à rien** : tes dossiers sont lus, jamais modifiés, et aucune commande
  git n'est lancée.
- **Aucun port ouvert** : homedash n'existe que dans l'appli. *Réglages → Affichage → Accès depuis le
  navigateur* l'ouvre aussi sur http://localhost:7777, sur ta machine seulement.
- **Un souci ?** *Réglages → Aide* (guide, *En cas de souci*, journal d'erreurs), puis une
  [issue](https://github.com/lepetitpaco/homedash/issues/new).

## Contribuer

homedash sert à toute l'équipe : ce que tu pousses sur `main` arrive chez tout le monde à sa prochaine
mise à jour. Améliore tout ce que tu veux, sans dénaturer l'existant.

- **Avant de coder** : lis **[CLAUDE.md](CLAUDE.md)** (règles du code, et la liste des **fonctionnalités
  principales** à ne pas changer sans prévenir) et **[ARCHITECTURE.md](ARCHITECTURE.md)** (fichiers,
  API). Ton IA les lit aussi : `CLAUDE.md` pour Claude Code, `AGENTS.md` et `.cursor/rules/` pour
  Cursor et les autres. Elle te prévient avant de toucher une fonctionnalité principale.
- **Développer et tester** (Node n'est pas requis sur la machine, tout passe par Docker) :

  ```bash
  docker compose -f docker-compose.dev.yml up -d     # http://homedash-dev.localhost:7778, rechargement à chaud
  docker run --rm -v "$PWD":/app -w /app node:24-alpine sh -c "apk add -q git; npm run typecheck && npm test"
  sh desktop/build-local.sh                          # l'appli, construite sur ce Mac pour l'essayer
  HOMEDASH_URL=http://localhost:7778 /Applications/homedash.app/Contents/MacOS/homedash   # l'appli sur le dev
  ```

- **Livrer** : travaille ta vague sur une branche locale, puis pousse sur `main`, après `git pull
  --rebase` et `git fetch --tags`. Un push = une version : une entrée en tête du `CHANGELOG.md` pour
  toute la vague (pas une par commit), la même version dans `desktop/package.json`, un tag `vX.Y.Z`, le
  `GUIDE.md` à jour et une issue par changement. Le tag déclenche GitHub Actions, qui construit l'appli
  et publie la Release : c'est elle que les applis installées proposent. Le détail est dans
  `CLAUDE.md`. Jamais de `push --force`.

## Aller plus loin

- **[GUIDE.md](GUIDE.md)** : le mode d'emploi, aussi dans *Réglages → Aide*.
- **[CHANGELOG.md](CHANGELOG.md)** : les nouveautés de chaque version.

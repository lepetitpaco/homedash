# homedash

Page d'accueil de navigateur auto-hébergée : raccourcis, notes, tableau de bord GitHub (branches, PRs, CI)
et un onglet **Local** qui repère les branches mergées qui traînent dans tes clones.

## Installer

Il faut Docker.

```bash
git clone https://github.com/davidgennaoui/homedash.git
cd homedash
docker compose up -d --build
```

Ouvre **http://localhost:7777**, puis **⚙ Réglages** :

1. **Compte** : colle un jeton GitHub (voir ci-dessous).
2. **Repos suivis** : clique **＋** sur tes repos.
3. **Dépôts locaux** : ajoute le dossier de tes clones (ex. `~/dev`).
4. **Enregistrer** (`⌘S`).

C'est tout. Aucun fichier à éditer.

**Appli de bureau (Mac, facultatif)** : homedash dans sa fenêtre, avec Gmail, Google Chat… affichés dans
ses onglets et leurs non-lus en pastille. Le container reste nécessaire, l'appli l'affiche. `.dmg` dans
les releases `desktop-v…`, ou `sh desktop/build-local.sh --install`. Détails : [GUIDE.md](GUIDE.md).

**Jeton GitHub** : *GitHub → Settings → Developer settings → Fine-grained tokens*, en lecture seule :
*Contents*, *Pull requests*, *Checks*, *Metadata* (+ *Members* sur l'organisation pour l'équipe).

## Au quotidien

```bash
docker compose logs -f                      # logs
docker compose down                         # arrêter (les données restent)
git pull && docker compose up -d --build    # mettre à jour
```

Quand une nouvelle version est publiée, la cloche 🔔 et le numéro de version en haut à droite te le disent. Un
clic sur ce numéro donne la commande de mise à jour, prête à coller dans n'importe quel terminal. Tes données sont sauvegardées automatiquement avant chaque mise à jour.

Mode d'emploi complet : **[GUIDE.md](GUIDE.md)**.

## À savoir

- **Tes données** sont dans `data/` (jamais versionné). Sauvegarde auto chaque jour, restauration dans Réglages.
- **Le jeton** reste côté serveur (`data/secrets.json`), jamais renvoyé au navigateur ni sauvegardé.
- **L'onglet Local ne touche à rien** : ton dossier personnel est monté en lecture seule et aucune
  commande git n'est lancée.
- **Accessible en local uniquement** (`127.0.0.1`). Pour l'ouvrir au réseau : remplace
  `127.0.0.1:${HOMEDASH_PORT:-7777}:80` par `${HOMEDASH_PORT:-7777}:80` dans `docker-compose.yml`, et
  lance avec `HOMEDASH_HOSTS=<nom-ou-ip>`.

## Contribuer

- [CLAUDE.md](CLAUDE.md) : règles du code, à lire avant de modifier (humain ou IA).
- [ARCHITECTURE.md](ARCHITECTURE.md) : fichiers et routes de l'API.
- Tests : `python3 -m unittest discover -s tests -t .`

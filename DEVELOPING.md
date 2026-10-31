# Développer homedash

homedash sert à toute une équipe : ce qui arrive sur `main` et part en version arrive chez tout le monde.

## À lire d'abord

| Fichier | Pour quoi |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Règles du code, **fonctionnalités principales** à ne pas changer sans prévenir, livraison. Fait foi. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Fichiers, routes de l'API, choix techniques |
| [AGENTS.md](AGENTS.md), `.cursor/rules/` | La même chose pour Cursor, Codex… (Claude Code lit `CLAUDE.md`) |
| [docs/MIGRATION-2.0.md](docs/MIGRATION-2.0.md) | Ce qui a changé avec la 2.0 (Python → TypeScript, Docker → appli) |

## En deux mots

- **Appli Electron** (`desktop/`) qui embarque un **serveur TypeScript** (`server/`, Node seul, aucune
  dépendance) et la **page React** (`src/`). Aucun port ouvert : l'adresse `http://localhost:7777` n'existe
  que dans les sessions de l'appli (`protocol.handle`), un navigateur n'y trouve rien. Le vrai port ne
  s'ouvre qu'avec *Accès depuis le navigateur* (désactivé par défaut). En dev, c'est :7778.
- Les données vivent dans le profil de l'appli (`data/`), jamais dans le dépôt.

## Travailler

Node n'est pas requis sur ta machine, tout passe par Docker.

```bash
docker compose -f docker-compose.dev.yml up -d        # http://homedash-dev.localhost:7778, à chaud
```

- Une modif dans `src/` s'affiche tout de suite (Vite) ; une modif dans `server/` relance le serveur.
- Les données du dev sont dans `data-dev/`, à part des vraies.

**Dans l'appli** (onglets de sites, pastilles, Dock…) : l'appli « homedash dev », éclair **orange**,
branchée sur le Docker de dev, avec son propre profil. Elle cohabite avec l'appli normale.

```bash
sh desktop/build-local.sh --dev --install             # Mac : « homedash dev » dans Applications
# Dans cette appli, le menu « Branche » change la branche du dépôt : le container suit à chaud
# (npm ci et redémarrage si package-lock.json change). Modifications non commitées : refusé.
```

Console : *Présentation → Outils de développement* (⌥⌘I).

**Avant de pousser** :

```bash
docker run --rm -v "$PWD":/app -w /app node:24-alpine sh -c "apk add -q git; npm run typecheck && npm test"
```

## Livrer

1. Une branche par sujet (`vague/<sujet>`), commits libres, sans toucher au CHANGELOG.
2. Pull request vers `main`, relue et approuvée.
3. Pour publier : une entrée en tête de `CHANGELOG.md`, la **même version** dans
   `desktop/package.json`, puis `git tag -a vX.Y.Z -m "X.Y.Z" && git push --follow-tags`.
4. Le tag lance GitHub Actions : il construit l'appli (Mac arm64 + x64, Windows) et publie la Release,
   que les applis installées proposent en mise à jour.

Doc, tests ou refactor seuls : pas de version. Le détail (quel numéro, issues, étiquettes) est dans
[CLAUDE.md](CLAUDE.md).

## Captures

`sh docs/demo/capture.sh` reprend les captures de `docs/screenshots/` : la vraie page, sur une instance
de démo aux données fictives (`docs/demo/`), dans Docker. Celles des sites ouverts dans l'appli
(`site-dans-un-onglet`, clics droits, éphémère, barre) se prennent à la main dans l'appli.

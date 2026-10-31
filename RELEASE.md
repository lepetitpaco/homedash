# Livrer homedash

Recette suivie par `/test-app`, `/preprod`, `/version` et `/prod`. Le détail des règles : `CLAUDE.md`.

## Flux

`/forge` → `/test-app` → commit → `/preprod` → `/test-app full` → `/version` → `/prod` → **toi : fusionner**

Branches : `<qui>/<type>/<nom>`. Le tag et la Release partent seuls à la fusion dans `main`.

## Test

- Docker dev à jour sur :7778 ; `homedash dev` quittée puis relancée avec `open "/Applications/homedash dev.app" --args --remote-debugging-port=9333`.
- `desktop/` a changé : `sh desktop/build-local.sh --dev --install` d'abord.
- Liste de `full` : `aidd_docs/test-app-full.md`.
- Tests : `docker run --rm -v "$PWD":/app -w /app node:24-alpine sh -c "apk add -q git; npm run typecheck && npm test"`.

## Preprod

1. Arrêt si : branche `main` ou `preprod`, nom hors format, pas d'entrée dans `CHANGELOG-dev.md`.
2. `git fetch --prune origin`. `preprod` a disparu : arrêt, explique, ne la recrée pas. `origin/main` a des commits absents de `preprod` : signale-le.
3. Tests, `git push -u origin <branche>`, PR vers `preprod` (réutilise celle qui existe), sans mention de Claude.
4. `gh pr merge --merge --delete-branch`. Conflit : arrêt.
5. `git switch preprod`, `git pull --ff-only`, `git branch -d <branche>`.

## Version

1. Depuis `preprod` à jour et `git fetch --tags` : branche `<qui>/docs/version-X.Y.Z`.
2. Numéro : table de `CLAUDE.md`.
3. Relire : `README.md`, `GUIDE.md`, `DEVELOPING.md`, `ARCHITECTURE.md`, `PRIVACY.md`, `CLAUDE.md`, `AGENTS.md`, `.cursor/`, `aidd_docs/`, `docs/` (site GitHub Pages). Captures périmées : `sh docs/demo/capture.sh`, sinon les lister.
4. `CHANGELOG-dev.md` devient une entrée de `CHANGELOG.md`, écrite pour l'utilisateur ; même numéro dans `desktop/package.json`.
5. Créer les issues manquantes (`CLAUDE.md`).
6. Tests, PR vers `preprod` avec la checklist remplie, fusion comme ci-dessus.

## Prod

1. `git fetch --tags --prune origin`. Arrêt si la tête de `CHANGELOG.md` sur `origin/preprod` n'est pas une nouvelle version, si `desktop/package.json` diffère, ou si `CHANGELOG-dev.md` a encore des lignes.
2. PR de `preprod` vers `main` : titre `X.Y.Z`, corps = l'entrée du changelog.
3. **S'arrêter. Réservé à la personne : fusionner par commit de fusion, avec `lepetitpaco` (admin, passe outre l'approbation requise). Une PR ouverte par un autre compte s'approuve normalement.**
4. Après sa fusion : vérifier que la Release existe et que `preprod` est toujours là.

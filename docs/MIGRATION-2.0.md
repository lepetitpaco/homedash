# Passer de la 1.x à la 2.0

La 1.x tournait dans Docker (serveur Python, page sur http://localhost:7777). La 2.0 est une **appli de
bureau** qui embarque tout : plus de Docker ni de Python, mise à jour automatique.

## Tu utilisais homedash (Docker), sans développer

Tu n'as plus besoin du projet ni de Docker : seulement l'appli.

1. **Installe l'appli normale** : la [dernière version](https://github.com/lepetitpaco/homedash/releases/latest)
   (`…-arm64.dmg` Mac M1/M2…, `…-x64.dmg` Mac Intel, `…-setup.exe` Windows).
2. **Autorise-la au premier lancement** (une fois, elle n'est pas signée) :
   - Mac : « Apple n'a pas pu confirmer… » → **Terminé**, puis *Réglages Système → Confidentialité et
     sécurité*, tout en bas → **Ouvrir quand même**. Le bouton n'y est pas ? Relance homedash une fois,
     ou dans un Terminal : `xattr -dr com.apple.quarantine /Applications/homedash.app`.
   - Windows : **Informations complémentaires** → **Exécuter quand même**.
3. **Reprends tes données** : au premier lancement, l'appli trouve le dossier `data` de ton ancien projet
   → **Reprendre ces données** (sinon *Choisir un autre dossier…*). Elles sont **copiées**. Mac : si le
   trousseau demande « homedash Safe Storage », **Toujours autoriser**.
4. **Vérifie** que tout y est (liens, sites connectés, jetons).
5. **Supprime l'ancien** :
   - le container : `docker compose down` dans le dossier du projet (puis Docker Desktop n'est plus utile
     pour homedash) ;
   - l'ancienne appli de bureau 1.x si tu l'avais construite ;
   - le dossier du projet, si tu ne développes pas : tes données sont maintenant dans l'appli.

Sur une autre machine : fais d'abord ces étapes là où tournait la 1.x, puis *Réglages → Sauvegardes →
Export complet*, et importe le fichier sur la nouvelle.

## Tu développais homedash

| 1.x | 2.0 |
| --- | --- |
| `backend/*.py` (Python) | `server/*.ts` (TypeScript, Node seul). Mêmes routes, mêmes fichiers dans `data/` |
| `tests/*.py` | `tests-ts/*.test.ts` (Vitest) |
| `docker compose up -d --build` sur :7777 | Dev : `docker compose -f docker-compose.dev.yml up -d` sur :7778 ([DEVELOPING.md](../DEVELOPING.md)) |
| Mise à jour : `git pull` + compose | Tag `vX.Y.Z` → GitHub Actions publie la Release → les applis se mettent à jour |

Une branche partie de la 1.x : reprends le front (`src/`) tel quel, porte le Python dans `server/` sur
le modèle du module voisin (Trello a suivi `server/basecamp.ts`, voir la PR #65), et les tests dans
`tests-ts/`. L'historique de `main` a aussi été réécrit (adresses e-mail retirées) : repars de
`origin/main`, pas d'une ancienne branche locale.

Pour une IA (Claude Code, Cursor…) qui reprend une branche 1.x : ne réintroduis ni `backend/` ni
Python ni `docker-compose.yml` de production ; tout le serveur est dans `server/`, les règles dans
[CLAUDE.md](../CLAUDE.md). Le dev se lance avec `docker-compose.dev.yml`, l'appli avec
`desktop/build-local.sh`.

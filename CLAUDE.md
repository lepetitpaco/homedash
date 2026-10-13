# CLAUDE.md — règles du code

À lire avant toute modification (humain ou IA). Fichiers et routes : `ARCHITECTURE.md`.

**À chaque livraison :**
- Ce qui change pour l'utilisateur → **entrée en tête de `CHANGELOG.md`** (`## X.Y.Z — AAAA-MM-JJ`
  puis des puces écrites pour l'utilisateur). Chaque nouvelle version déclenche « mise à jour
  disponible » chez tout le monde : on n'en crée que si ça vaut un `git pull`.

  | Changement | Version |
  | --- | --- |
  | Action requise de l'utilisateur, ou rupture (variable obligatoire, port, données non migrables) | majeure `2.0.0` |
  | Nouvelle capacité : on peut faire quelque chose qu'on ne pouvait pas | mineure `1.7.0` |
  | Ajustement visible (mise en page, texte, réglage d'un comportement existant) ou correction | patch `1.6.1` |
  | Doc, tests, refactor, commentaires (rien de visible) | **aucune** : pas d'entrée, pas de version |

  Plusieurs changements livrés ensemble = une seule version. Après le commit : `git tag -a vX.Y.Z -m
  "X.Y.Z"` puis `git push --follow-tags`.
- Comportement visible modifié → `GUIDE.md` à jour.

## Commandes

Node n'est pas requis sur l'hôte, tout passe par Docker :

```bash
docker compose up -d --build                                              # lancer / redéployer
docker run --rm -v "$PWD":/app -w /app node:22-alpine npx tsc --noEmit    # typecheck
python3 -m unittest discover -s tests -t .                                # tests (~10 s)
```

Les tests n'utilisent ni `data/` ni le réseau. Les tests `gitread` exigent git sur l'hôte.

## Règles absolues

1. **Zéro dépendance au runtime** : stdlib Python côté serveur, React seul côté front.
2. **L'onglet Local n'écrit et n'exécute rien.** `gitread.py` ouvre en `"rb"`, sans sous-processus ni
   commande git (même `git status` écrit). Les commandes affichées sont du texte à copier.
3. **« 🗑 à supprimer » exige `safety.level` dans `SAFE_LEVELS`** (contenu présent ailleurs). Jamais de
   suppression sur la branche courante ni une protégée. `_commands()` filtre sur `delete`. Testé.
4. **Les jetons ne sortent jamais de `data/secrets.json`** (600) : ni dans `config.json` (servi entier au
   navigateur, inclus dans les sauvegardes), ni dans une réponse d'API.
5. **Toute requête passe par `Handler._refused()`** (Host local, pas d'écriture intersite, corps JSON).
   Toute écriture du front envoie `Content-Type: application/json` dès qu'elle a un corps.
6. **Un seul format de config.** `accounts.migrate()` convertit les anciens au chargement (y compris une
   sauvegarde restaurée). Aucun repli sur l'ancien format ailleurs.
7. **Écritures atomiques** via `store.write()` ; lecture-modification-écriture de config sous
   `server._config_lock` ; `store.validate_config()` avant toute écriture.
8. **Pas de `window.confirm` / `alert`** : `confirmDialog()` (dit ce qui change et ce qui est conservé).
9. **Une mise à jour ne casse jamais les données des autres.** `data/` n'est jamais versionné ni écrasé
   par le code. Changer le format de `config.json` = une étape de plus dans `accounts.migrate()`
   (idempotente, testée), jamais un renommage ou une suppression de clé ailleurs. Une clé nouvelle a un
   défaut côté code : une config ancienne sans elle doit marcher telle quelle. Au démarrage d'une
   nouvelle version, `updates.on_start()` sauvegarde `data/` **avant** la migration.

## Pièges connus

**GitHub**
- `github.py` est chargé **une fois par compte** (`accounts._load_module`) : pas d'état partagé entre
  comptes. `localgit` importe `accounts` sous le nom `github` (même API, agrégée).
- Repos écrits `propriétaire/repo` ; `configure()` les ramène au nom court (clé partout) et garde le
  propriétaire dans `_OWNERS`. Deux repos de même nom ne peuvent donc pas être suivis ensemble.
- Le cache ETag est vital : sans lui ~16 800 appels/h pour un plafond de 5 000. Les 304 sont gratuits.
- Attribution d'une branche : PR dont `head.ref` == branche, puis auteurs des commits propres, puis auteur
  du tip si déjà mergée. **Jamais** de filtrage par préfixe de nom.
- `apply_token()` vide caches et amorçage du journal : sinon le changement de jeton passe pour des nouveautés.

**Onglet Local**
- Verdict : GitHub (`on_github`) prime sur les `refs/remotes` locaux quand le repo est suivi ; c'est l'écart
  entre les deux qui révèle une branche supprimée en ligne.
- Branche squashée : seule la recherche de PR **par nom de branche** la distingue d'un travail jamais poussé.
- « Jamais poussée » ≠ « poussée puis supprimée » : témoin = `remote_ref or upstream or pr`.
- Trois axes à ne pas fusionner : `state`, `safety`, `action`.
- `gitread` gère les deltas `ofs` **et** `ref` (un clone frais met tout en packs).
- Surveillance par `stat` toutes les 2 s (pas de scan complet) ; `.git/index` temporisé ; en veille si la
  page n'a rien demandé depuis `watch_idle`.
- Dossiers stockés en `~/…`, traduits par `localgit.resolve()` ; `browse()` limité au dossier personnel
  après `realpath`.

**Journal et cloche**
- `events.py` est le **seul** endroit qui décide ce qui est un événement ; le front affiche.
- `seq` (jamais réutilisé, même après `clear()`) et non `ts` pour repérer le nouveau.
- Amorçage : une section jamais vue ne produit rien (sinon le premier fetch déverse tout l'état).
- Front : `baseline` (en mémoire, rien notifié au chargement) ≠ `seen` (localStorage, la pastille).
- Notifications système en sourdine par défaut (`homedash:notif-v2`).

**Front**
- `reload_all()` est le seul chemin après une écriture de config côté serveur.
- Tout déclenchement manuel du polling relance la boucle (`pulse`), pas seulement `load()`.
- Couleurs de signal via `--sig-*` (lisibles en thème clair) ; pas de teinte claire en dur dans `color:`.
- Champs login/jeton : `autoComplete="off"` + `data-1p-ignore` / `data-bwignore` / `data-lpignore`.
- `navigator.clipboard` et `Notification` sont **absents** hors localhost/HTTPS : tester avant d'appeler.
- `src/styles/index.css` : l'ordre des imports **est** la cascade.
- Panneau Infos : groupes et infos désignés par **index** (`InfoRef`), donc `normalizeInfos()` garde les
  groupes vides — en filtrer décalerait les index et l'édition viserait la mauvaise ligne.
- Les valeurs « secrètes » du panneau Infos sont en clair dans `config.json` : le masquage n'est qu'à
  l'écran (et hors recherche). Ne jamais les journaliser ni les mettre dans un message d'erreur.

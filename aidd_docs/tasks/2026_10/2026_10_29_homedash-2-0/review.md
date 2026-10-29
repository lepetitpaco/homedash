# Review: homedash 2.0 — appli de bureau autonome

- **Verdict**: changes-requested
- **Diff**: `main...beta-2.0 (arbre de travail, non commité)`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_10_29
- **Findings**: 0 critical, 4 warning, 3 minor

## Phases

### Phase 1 — Socle TS, dev Docker :7778

- [x] Mauvais Host ou écriture intersite refusés (403), routes inconnues 404 — server/app.ts:208 (`refused`), tests-ts/app.test.ts
- [x] Tests Vitest portés au vert ; data/ v1 relu sans modification — tests-ts/*.test.ts (151 tests), scripts/parity.mjs (16 routes identiques)
- [x] Page sur :7778, changement de fichier visible sans reconstruire — docker-compose.dev.yml:16 (`node --watch` + Vite)

### Phase 2 — Onglet Local en TS

- [x] Objets lus égaux à `git cat-file` (packs ofs/ref) — tests-ts/gitread.test.ts (« pack avec deltas ofs / ref »)
- [x] Jamais de suppression pour courante, protégée, ou hors SAFE_LEVELS — tests-ts/localgit.test.ts (« invariants sur toutes les combinaisons »)

### Phase 3 — GitHub, comptes, Basecamp, parité, retrait du Python

- [x] Config v1 chargée, aucun jeton dans une réponse — tests-ts/app.test.ts (« aucune réponse ne contient un jeton »), parité /api/config
- [x] Basecamp : GET seulement hors jeton et rapport — tests-ts/basecamp.test.ts (« Basecamp ne reçoit que des GET »)
- [x] Parité sans écart sur les données de Paco — scripts/parity.mjs (16/16)

### Phase 4 — Appli Electron autonome

- [x] Aucun port par défaut ; notifications, presse-papiers, fichier local — desktop/server.js:126 (`serve`), vérifié : lsof sans port, appli affichée
- [ ] Windows : fermer laisse l'icône près de l'horloge — desktop/main.js:567 : icône lue dans `build/`, absent de l'appli construite
- [x] Basecamp connecté sans copier — desktop/main.js (`homedash:basecamp-connect`), non testé en réel (pas de connexion Basecamp)
- [x] Accès navigateur : port ouvert / libéré selon le réglage — server/host.ts:36
- [x] ⌘R l'onglet, ⇧⌘R tout — desktop/main.js (menu), src/App.tsx (`REFRESH_DATA`) ; vérifié dans le menu de l'appli
- [x] Plus d'ancien nom de dépôt, identifiant com.lepetitpaco.homedash — CHANGELOG.md, desktop/main.js (`APP_ID`)

### Phase 5 — Export/import complet et reprise des données

- [ ] Aucun jeton en clair ; mauvais mot de passe = refus sans écriture — server/fullexport.ts:94 implémenté, aucun test
- [x] Aperçu avant import, instantané avant — server/fullexport.ts:118 (`summary`), :140 (`apply`)
- [x] Données Docker copiées, original intact — desktop/main.js (`firstRun`, `fs.cpSync`) ; sessions v1 reprises vérifiées en réel (Gmail connecté)

### Phase 6 — Releases et mise à jour

- [ ] Un tag produit la Release complète — .github/workflows/release.yml écrit, jamais exécuté ; `identity: '-'` à confirmer
- [ ] Empreinte fausse = refus — desktop/updater.js:224 implémenté, aucun test de `parseLatest` / `pick`

### Phase 7 — Docs et 2.0.0

- [x] Aucune doc n'exige Docker ou Python pour utiliser homedash — README.md, GUIDE.md, CLAUDE.md, ARCHITECTURE.md
- [x] Version affichée 2.0.0 — CHANGELOG.md:7 (l'appli de test, construite avant, affiche encore 1.34.1)

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟡 | code | 4 | desktop/main.js:567 | Icône de la zone de notification (et du Dock en dev) lue dans `build/icon.png`, absent de l'appli assemblée : icône vide sous Windows | Copier l'icône dans `app/` (assemble.sh) et la lire depuis `__dirname` |
| 🟡 | code | 4 | server/localfile.ts:52 | `/api/file` peut servir les fichiers du profil de l'appli (`~/Library/Application Support/homedash` : Local Storage, Cookies) : seul `data/` est protégé (via secrets.json) | Refuser tout chemin sous le profil de l'appli (`HOMEDASH_PROFILE_DIR` passé par server.js) |
| 🟡 | functional | 5 | server/fullexport.ts | Critère « mauvais mot de passe = refus, aucun jeton en clair » sans test | tests-ts/fullexport.test.ts : aller-retour, mauvais mot de passe, octet modifié, aucun secret dans l'aperçu |
| 🟡 | functional | 6 | desktop/updater.js | Critère « empreinte fausse = refus » sans test ; `parseLatest` / `pick` non testés | Extraire la logique pure dans un module sans Electron et la tester |
| 🟢 | rot | 4 | desktop/main.js:832 | IPC `homedash:release` jamais appelé par la page | Le retirer |
| 🟢 | code | 1 | server/perflog.ts:181 | `threads: 1` en dur, chiffre sans signification sous Node | Retirer le champ (le résumé ne le lit pas) |
| 🟢 | conform | 7 | CHANGELOG.md:7 | CLAUDE.md : pas de CHANGELOG ni de version sur une branche de vague ; écrits ici à la demande du plan (phase 7) | Garder ; revoir la date et la version au moment de fusionner |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 78% (14/18) |
| Files checked | server/*.ts, desktop/*.js, desktop/electron-builder.yml, .github/workflows/release.yml, src/App.tsx, src/components/{SetFullExport,SetBackups,SetBasecamp,SettingsPage,VersionMenu}.tsx, src/lib/{desktop,admin}.ts, tests-ts/*.ts, docs |
| Unchecked     | Icône Windows — fix ; tests export complet — fix ; workflow exécuté — not-applicable (exige un tag) ; test empreinte — fix |
| Unplanned     | Adresse interne http://localhost:7777 au lieu de `homedash://` (garde l'origine v1) ; mise à jour Windows maison au lieu d'electron-updater ; `HOMEDASH_PROFILE` (profil de test) |

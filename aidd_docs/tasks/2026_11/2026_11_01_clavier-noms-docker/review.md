# Review: changer de site au clavier, noms dans la barre, liens Docker

- **Verdict**: approve
- **Diff**: `origin/main...arbre de travail` (paco/feature/changer-site-clavier, paco/feature/barre-noms, paco/feature/liens-docker)
- **Axes run**: code, functional, relevancy
- **Date**: 2026_11_01
- **Findings**: 0 critical, 0 warning, 4 minor

## Phases

### Phase 1 — Ctrl+Tab

- [x] Les tests de `siteSwitch` passent — `tests-ts/siteswitch.test.ts`
- [x] Ctrl+Tab change de site, y compris le focus dans un site, dans l'appli de dev — `desktop/main.js` (`watchSiteSwitch`)

### Phase 2 — Afficher les noms

- [x] Parcours vérifiés dans la page, sans débordement — `src/components/Rail.tsx`, `src/styles/rail.css`

### Phase 3 — Liens Docker

- [x] Sans activation, aucun accès au socket ; une seule requête GET possible — `server/docker.ts`, `server/app.ts`, `tests-ts/docker.test.ts`
- [x] Le dossier suit les vrais containers et n'écrit aucun site dans la config — `src/lib/dockerTabs.ts`, `src/components/Rail.tsx`

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟢 | fit | 3 | `src/components/Rail.tsx` (dossier Docker) | Une fois #103 et #104 réunies, le dossier Docker n'affiche son nom qu'en étendue, alors que « Afficher les noms » vaut pour tous les modes | À la fusion de la seconde branche, remplacer `wide` par `named` sur ce libellé |
| 🟢 | code | 1 | `desktop/main.js` (`watchSiteSwitch`) | Échap et les chiffres pendant le choix parviennent aussi au site affiché : l'annulation du clavier est impossible sans perdre le relâchement de Ctrl | Accepter, l'effet est limité |
| 🟢 | fit | 3 | `server/docker.ts` (`NOT_WEB`) | Un port de tunnel sans page web (`devhome :15432`) apparaît comme lien, car seul son numéro le trahit | Accepter : il se décoche dans Réglages → Docker |
| 🟢 | conform | 3 | `docker-compose.dev.yml` | Le socket monté en dev donne au container de dev le contrôle de Docker, seul `server/docker.ts` limite l'usage | Accepter : dev seulement, adresse locale, code en lecture seule |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 100% (5/5) |
| Files checked | `desktop/main.js`, `desktop/preload.js`, `desktop/guest-preload.js`, `src/App.tsx`, `src/components/Rail.tsx`, `src/components/SiteSwitcher.tsx`, `src/components/SetDocker.tsx`, `src/components/SettingsPage.tsx`, `src/lib/siteSwitch.ts`, `src/lib/docker.ts`, `src/lib/dockerTabs.ts`, `src/styles/rail.css`, `server/docker.ts`, `server/app.ts`, `server/store.ts`, `docker-compose.dev.yml`, `GUIDE.md`, `ARCHITECTURE.md`, `PRIVACY.md`, `CHANGELOG-dev.md` |
| Unchecked     | none |
| Unplanned     | Fenêtre en tuiles, clic et chiffres 1 à 9, ajoutés à la demande de Paco pendant les essais |

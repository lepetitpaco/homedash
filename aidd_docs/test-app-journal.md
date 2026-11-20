# Journal de `/test-app full`

Chaque cas testé, sur quel commit, et de quoi il dépend. Au `full` suivant, un cas ✅ dont aucun fichier n'a changé
depuis son commit est repris sans être refait (règle de `/test-app`).

Tailles : 800×600, 1024×700, 1280×720, 1920×1080, 2560×1440. « 5×2 » = les 5 tailles, thèmes clair et sombre.

## 2026-11-05 — `70dcf7d` (preprod, 2.5.0), appli « homedash dev » reconstruite

| Cas | Tailles / thèmes | Résultat | Dépend de |
| --- | --- | --- | --- |
| Typecheck + tests (353 ✓, 9 ignorés) | — | ✅ | `server/`, `src/`, `tests-ts/` |
| Barre de gauche, barre du haut, pied de page : débordements, double défilement | 5×2 | ✅ | `src/components/Rail.tsx`, `TopBar.tsx`, `src/styles/` |
| Raccourcis : tuiles, Notes, Liens | 5×2 | ✅ | `src/components/Links*`, `Notes*`, `src/styles/` |
| Note ouverte, boutons Supprimer / Fermer, Échap | 1024 clair | ✅ (correctif 2.5.0 vérifié) | `src/components/Notes*` |
| GitHub : repos, branches actives, PR, mergées | 5×2 | ✅ | `src/components/Github*`, `src/styles/github.css` |
| Local : cartes, verdicts, nom de branche à 800 | 5×2 | ✅ sauf « Dépôts locaux » (lexique) | `src/components/LocalRepos.tsx`, `src/styles/` |
| Local : ligne de commande défile seule (`loc-cmd-line`) | 5×2 | ✅ voulu | `LocalRepos.tsx` |
| Basecamp : À traiter, To-dos, Kanban, compteurs | 5×2 | ✅ | `src/components/BasecampView.tsx`, `basecamp.css` |
| Basecamp : fenêtre de tâche, Échap | 1280, 800 clair | ✅ | `BasecampView.tsx`, `modal` |
| Basecamp 📊 Stats : périodes, personne / projet, tri | 1280, 800 clair | ✅ | `src/components/BcStats.tsx`, `server/basecamp.ts` |
| Basecamp 📊 Stats : détail par mois | 1280 clair | ❌ colonne Total coupée | `BcStats.tsx`, `basecamp.css` |
| Basecamp 📊 Stats : plein écran, Échap | 1280 clair | ❌ panneau vide | `BcStats.tsx`, `basecamp.css` |
| Trello : tableau (défilement horizontal voulu), cartes, étiquettes, échéances | 5×2 | ✅ | `src/components/TrelloView.tsx`, `trello.css` |
| Trello : fenêtre de carte (description, image), Échap, clic dehors | 1280, 800 clair | ✅ | `TrelloView.tsx` |
| Créer une issue (Basecamp) : Tout / Rien inclure, Autres repos, aperçu, Échap, rien de superposé | 1280, 800 clair | ✅ (rien créé) | `src/components/Issue*`, `src/lib/issuetext.ts` |
| Réglages : les 13 pages, menu en bande à 800 (défile), Annuler / Enregistré | 5×2 | ✅ | `src/components/Set*`, `SettingsPage.tsx`, `settings.css` |
| Réglages → Affichage à 1024 (correctif 2.5.0) | 1024 ×2 | ✅ | `SetDisplay*`, `settings.css` |
| Réglages → Notifications : emoji collés au texte | 5×2 | ❌ détail | `src/lib/bellPrefs.ts`, `SetNotif*` |
| Réglages → Barres et onglets : miniatures | 1024 clair | ❌ détail « Icônes + titres » sur 3 lignes | `SetTabs.tsx` |
| Onglets en haut, pastilles, passage à la ligne, retour à la barre de gauche | 800, 1024, 1920 clair | ✅ | `SetTabs.tsx`, `TopTabs*`, `custom-tabs.css` |
| Recherche `⌘K` « veille » → Réglages › Mes sites › Veille, Entrée ouvre la page | 1280 clair | ✅ | `src/lib/settingsIndex.ts`, `useSearch`, `SearchResults` |
| Cloche : ouverture, filtres, Échap | 1280 clair | ✅ | `EventBell.tsx`, `EventFeed.tsx` |
| Site ouvert (Gmail) : en-tête ← → ↻ dans la barre du haut | 1280 clair | ✅ | `CustomTabView.tsx`, `TopBar.tsx` |
| Mode focus : ⤢ (site plein cadre 1280×720), ⌘⇧F aller et retour | 1280 clair | ✅ (Échap ne sort pas : non promis) | `CustomTabView.tsx`, `desktop/main.js` |
| Journal d'erreurs et de perf (prod et dev) | — | ❌ erreur WebView ; voir rapport | `CustomTabView.tsx`, `src/lib/errors.ts` |

**Non testés ce jour** (à faire au prochain `full`) : `Ctrl+Tab` (ni CDP ni les touches simulées n'atteignent l'appli),
Infos (aucune donnée de test), ↗ ouvrir les N et carte En cours (aucune branche sur plusieurs repos, aucun workflow en cours),
Renovate, dossiers glissés, deux comptes, Docker, menu Branche, Extensions, sauvegardes et restauration,
création d'issue et rapport sur un repo de test (pas autorisé ici), compteurs clic droit, non-lus près de la cloche
(barres masquées), dates GitHub au survol.

## 2026-11-21 — vue scindée (#160, #168, #169), `trempe full`

Commit testé : `1407785` (branche paco/feature/vue-scindee). Appli « homedash dev » (desktop/ identique au dépôt, vérifié octet par octet) + Docker dev :7778 (Vite sur le dossier, donc le front est celui du HEAD). Pilotée par CDP, sites factices (pages locales, vidéos canvas) ; aucun vrai site touché.

| Cas | Tailles / thèmes | Résultat | Commit | Dépend de |
|---|---|---|---|---|
| Grille 2×2 : ordre, débordement horizontal, pastilles, 4 panneaux | 800, 1024, 1280, 1920, 2560 × clair, sombre | ✅ pas de débordement ; ❌ barre de la vue : voir bug 3 ; ❌ en-têtes écrasés à 4 colonnes / 800 (bug 5) | 1407785 | `src/components/SplitView.tsx`, `src/styles/split.css` |
| Sélecteur de panneau, deux comptes d'un même site (fixture jetable), « déjà dans cette vue » grisé, Échap du sélecteur | 1280 sombre, 1024 | ✅ | 1407785 | `SplitView.tsx`, `Pick.tsx`, `src/lib/splitViews.ts` |
| Son qui suit la souris + pause suit le panneau (survol 1→4, sortie vers la barre, Garder le son coché / décoché, retour) | 1280 sombre | ✅ (badge 🔊/🔈, vidéo en pause hors panneau actif ; relance par la page remise en pause ; pause à la main non relancée) | 1407785 | `App.tsx`, `splitView.ts`, `desktop/site-adapters.js`, `main.js` |
| Classic : tous les sons, aucune pause, aucune touche interceptée (defaultPrevented faux) | 1024 sombre | ✅ | 1407785 | `splitView.ts`, `App.tsx` |
| Clavier côté page : Alt+chiffre (AZERTY \& é " '), Z / Z, J / K, Échap, table de mixage (Z/S défile le panneau 2 sans changer l'actif) | 1280 sombre | ✅ | 1407785 | `App.tsx`, `splitView.ts` |
| Séparateurs à la souris (vertical, horizontal, limites ≈12 %) | 1280 sombre | ✅ (voir note harnais) | 1407785 | `SplitView.tsx`, `splitView.ts` (`dragRatios`) |
| Agrandir (Z, ⤢) et restaurer | 1280 sombre | ✅ | 1407785 | `SplitView.tsx` |
| Menu Options | 800 clair, 1024 sombre, 1920 clair | ✅ 1024 / 1920 ; ❌ 800×600 le menu dépasse le bas de la fenêtre de 7 px (bug 4) ; ❌ Échap ferme aussi la vue (bug 1) | 1407785 | `SplitView.tsx`, `split.css` |
| Réglages → Vue scindée (changer le mode, Enregistrer, clé écrite dans ui.split) | 800 clair, 1024 sombre, 1280 clair / sombre | ✅ | 1407785 | `SettingsPage.tsx`, `settingsIndex.ts` |
| Garder cette vue : fenêtre de nom (Annuler, Échap, clic hors, Entrée, nom vide → « Vue 1 »), clé `splitViews` écrite | 1280 sombre | ✅ (fenêtre au-dessus de tout, pas de confirm natif) | 1407785 | `App.tsx`, `server/store.ts`, `src/lib/splitViews.ts` |
| Section « Vues scindées » de la barre : icône, compteur = somme (3 + 4 = 7), ouverture sans recharger les sites (même timeOrigin) | 1280, 2560 sombre | ✅ | 1407785 | `Rail.tsx`, `splitViews.ts` |
| Clic droit Renommer / Supprimer (confirmation, Annuler, Supprimer) | 1280 sombre | ✅ ; ❌ Échap sur la confirmation ferme aussi la vue (bug 1) ; libellé « Créer » du bouton de Renommer (bug 7) | 1407785 | `Rail.tsx`, `App.tsx` |
| Mettre à jour une vue ouverte (3 colonnes) | 1280 sombre | ✅ (config : layout c3) | 1407785 | `App.tsx` |
| Site retiré (fixture supprimée de la config) | 1280 sombre | ✅ la vue s'ouvre ; ❌ deux messages contradictoires dans la case (bug 6) | 1407785 | `SplitView.tsx`, `splitViews.ts` |
| Sauvegarde puis restauration d'une config avec vues | API de l'appli | ✅ `splitViews` revenu | 1407785 | `server/backup.ts`, `store.ts` |
| Fermeture de la vue : reprise (décision provisoire : seul le site affiché reprend) | 1280 sombre | ✅ conforme à la décision ; ouverte puis fermée depuis « Fixe C » : seul C reprend | 1407785 | `App.tsx`, `splitView.ts` (`CLOSE_KEEPS_PARKED_PAUSED`) |
| Ouvrir une vue enregistrée depuis Réglages | 1280 sombre | ❌ la vue se superpose à la page Réglages (bug 2) | 1407785 | `App.tsx` |
| Non-régression : Raccourcis, site ouvert, rail, Réglages | 800 clair, 1280 sombre, 1920 clair | ✅ | 1407785 | `Rail.tsx`, `TopBar.tsx` |

Note harnais : un glissé de séparateur envoyé sans `buttons=1` a laissé le voile des séparateurs bloqué (`is-dragging`). Avec `buttons=1` (vraie pression), pointerdown / capture / pointerup arrivent et le voile disparaît. Non reproduit comme bug, à vérifier à la vraie souris.

### Bugs trouvés (corrigés ensuite, voir #160)

1. **moyenne** : Échap alors qu'une couche est ouverte (menu Options de la barre de la vue, fenêtre « Supprimer la vue ? », fenêtre de nom) ferme la couche ET la vue scindée. Repro : ouvrir la vue, Options ▾, Échap (1024×700 sombre) ; ou clic droit sur une vue de la barre, Supprimer, Échap. Attendu : seule la couche se ferme (le sélecteur de panneau, lui, est correct). Fichiers : `src/App.tsx` (écouteur clavier de la vue, ~l.1415, ne regarde pas `defaultPrevented` / les fenêtres ouvertes), `SplitView.tsx` (menu sans gestion d'Échap).
2. **moyenne** : ouvrir une vue enregistrée (barre de gauche) depuis Réglages la superpose à la page Réglages : le menu et la barre « Tout est enregistré / Enregistrer » flottent sur les panneaux, « Réglages » et la vue sont tous deux actifs dans la barre (1280×720 sombre ; même chose à 800). Attendu : la vue remplace la page, ou Réglages se ferme. Fichier : `src/App.tsx` (`openSplit` / ouverture d'une vue ne change pas de page).
3. **basse** : barre de la vue à 1024 et 1280 de large : deux lignes avec « Fermer » seul sur la 2e (1280×720 : seul le bouton Fermer, barre de 96 px), légende tronquée (« Alt + & é … », réduite à « A. » quand le bouton devient « Mettre à jour « Mes flux » »). Clair et sombre. À 1920 : une ligne, correct. Fichier : `src/styles/split.css` (`.split-bar`, `.split-legend`).
4. **basse** : menu Options à 800×600 : son bas (420×378 à y=229) dépasse de 7 px le bas de la fenêtre. Fichier : `split.css` / placement du menu (`SplitView.tsx`, `top: r.bottom + 4` sans limite basse).
5. **basse** : en-têtes de panneaux trop étroits (4 colonnes à 800 px, ou séparateur tiré au minimum) : pastille de compte, icône, 🔈, ▾ et ⤢ se chevauchent. Fichiers : `split.css` (`.split-head`, `.pick-btn`).
6. **basse** : case vide d'un site retiré affiche deux phrases contradictoires l'une sous l'autre : « Choisis un site pour ce panneau. » et « Site retiré de Mes sites : choisis-en un autre. » Fichier : `SplitView.tsx` (`split-empty` : `!key` et `!key && gone`).
7. **basse** : fenêtre « Renommer la vue » : le bouton de validation s'appelle « Créer » (et propose le choix de couleur). Fichier : `App.tsx` (`askNameColor`).
8. **basse** : cibles à 30 px de haut (sélecteur de panneau, ⤢, sélecteur « Le son suit la souris ») sous les 44 px de la règle (appli de bureau : à trancher). Fichier : `split.css`.
9. **basse** : quand une vue est ouverte, l'entrée du site d'origine ET celle de la vue sont mises en avant dans la barre de gauche (deux « actifs »). Fichier : `Rail.tsx`.
10. **à vérifier sur de vrais sites** : le garde d'Échap (`guest-preload.js`, `DIALOG = [aria-modal], [role=dialog]…`) teste la seule présence d'un nœud, visible ou non : un site qui garde un `role="dialog"` caché dans le DOM empêcherait toujours Échap de fermer la vue. Constaté par lecture du code, pas en vrai (les touches vers un site ne sont pas simulables).

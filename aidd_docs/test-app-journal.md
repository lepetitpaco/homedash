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

## 2026-11-20 — vues scindées : Ajouter, placement libre, copies, pause (#172 #167 #166 #175), `trempe full` sur ce qui a changé

Commit testé : `f3acc6c` (branche paco/feature/vues-scindees-ajouter). Appli « homedash dev » reconstruite depuis le vrai dossier (`desktop/` a changé ; repoDir = dossier du dépôt), Docker dev :7778, pilotée par CDP + souris du système pour un glisser. Config de test (sites factices locaux servis sur :8791 : flux long + vidéo + son, appel à `srcObject`, page « joue en fond », page à cookie ; deux comptes d'un même site) ; `data-dev/config.json` sauvegardé avant et restauré à l'identique ensuite (empreinte vérifiée). Aucun vrai site chargé, aucune action sur un vrai compte.

| Cas | Tailles / thèmes | Résultat | Commit | Dépend de |
|---|---|---|---|---|
| ◫ absent de la barre du haut | 2560 sombre | ✅ | f3acc6c | `TopBar.tsx` |
| ＋ → « Ajouter une vue scindée… » : nom, Flux/Messagerie, dispositions, sites avec compte (« Flux A · perso » / « pro »), compte déjà pris grisé « déjà dans cette vue », Ajouter → vue dans la barre et ouverte | 2560 sombre, 1280 clair | ✅ ; ❌ à 800×600 le bouton est hors écran (bug 1) | f3acc6c | `AddTabDialog.tsx`, `SplitViewComposer.tsx`, `App.tsx` |
| Clic droit sur la barre / sur Réglages → « Ajouter une vue scindée » (fenêtre de composition, Échap, clic hors fenêtre) | 800 clair, 1280 clair | ✅ | f3acc6c | `Rail.tsx`, `SplitViewComposer.tsx` |
| Messagerie : `copies` absent, vrais sites, tous les sons, jamais de pause, lettres sans effet sur les panneaux | 2560 sombre | ✅ (les touches « non interceptées » ne sont pas observables par CDP : déduit de l'absence de défilement) | f3acc6c | `splitView.ts`, `guest-preload.js` |
| Placement libre : glisser une vue devant un site, dans un dossier, hors du dossier ; ordre gardé après rechargement ET après redémarrage de l'appli | 2560 sombre | ✅ (glisser par événements de glisser de confiance ; un glisser à la VRAIE souris a aussi mis `before` à jour) | f3acc6c | `Rail.tsx`, `splitViews.ts` |
| Vue enregistrée : pas de sélecteur de site en en-tête ; clic droit → Modifier la vue… (sélecteurs, disposition, Copie ⇄ Site réel, Enregistrer, Annuler, Échap = Annuler sans fermer la vue, 2 sites minimum : message, rien d'enregistré) | 2560 sombre, 800 clair | ✅ | f3acc6c | `SplitView.tsx`, `App.tsx` |
| Copies : cookie partagé avec le site d'origine (même identifiant), copie naviguée ailleurs ne bouge pas l'original, deux comptes = deux cookies différents, le son suit la souris, pause des vidéos et sons hors panneau actif, agrandir X puis X, scroll A/Q Z/S J puis Alt+2 (événements de confiance) | 2560 sombre | ✅ | f3acc6c | `SplitView.tsx`, `guest-preload.js`, `desktop/main.js` |
| Bloquant corrigé : re-clic sur la vue ouverte, Modifier→Annuler, Modifier→Enregistrer, Fermer puis rouvrir, vue puis autre vue : copies toujours pilotables (survol → son, touches) | 2560 sombre | ✅ (une fausse alerte due à ma souris simulée, écartée en envoyant les survols dans la page : voir note) | f3acc6c | `SplitView.tsx` (`copyGuests`) |
| Compteur d'une vue : somme des vrais sites (3 + 4 = 7), copies ignorées (7 sur une copie, 5 sur le vrai : la barre montre 5) | 1280 sombre | ✅ | f3acc6c | `splitViews.ts`, `Rail.tsx` |
| 2×2, molette synchronisée (événements de molette de confiance) : les 4 panneaux défilent ensemble depuis le panneau 1 comme depuis le panneau 4 | 2560 sombre | ✅ le « seul le panneau 1 défile » de F4 n'est PAS reproduit | f3acc6c | `guest-preload.js` |
| #175 Pause : pause au masquage et reprise au retour (son et vidéo), site « joue en fond » : son jamais coupé, vidéo muette mise en pause par Chromium lui-même (pas par homedash), pause manuelle jamais relancée, appel (`srcObject`) jamais coupé | 2560 sombre | ✅ | f3acc6c | `desktop/main.js`, pause script, `catalog.ts` |
| #175 Réglages → Mes sites : « Pause quand je n'y suis pas » Oui / Non, joue en fond, enregistrés ; ✨ Réglage recommandé proposé sans être appliqué (rien en config avant clic + Enregistrer, Annuler le défait) | 2560 sombre | ✅ ; ❌ détails (bugs 4, 5) | f3acc6c | `SetTabs.tsx`, `catalog.ts` |
| Site du catalogue ajouté par la pastille (Deezer) : joue en fond, effet bon | 2560 sombre | ✅ effet ; ❌ clé non écrite (bug 4) | f3acc6c | `AddTabDialog.tsx`, `catalog.ts` |
| Onglets en haut : vues créées ET rouvertes depuis l'onglet du haut | 2560 sombre | ✅ (pilotage des copies dans cette disposition non vérifié) ; ❌ Raccourcis reste marqué (bug 6) | f3acc6c | `Tabs.tsx`, `custom-tabs.css` |
| Sauvegarde → restauration : `before`, `folder`, `prefs`, `copies`, `pauseHidden` présents puis revenus | API | ✅ | f3acc6c | `server/backup.ts`, `store.ts` |
| Config ancienne (sans `before`, `folder`, `prefs`, `copies`, `ratios`, `pauseHidden`) : se charge, vues à la fin, s'ouvre en vrais sites | rechargement | ✅ | f3acc6c | `server/store.ts` |
| Échap par couche : menu Options, menu clic droit, fenêtre de composition, Renommer, Supprimer : seule la couche se ferme, la vue reste | 5 tailles × 2 thèmes (menu, Options) ; 1280 sombre (Renommer, Supprimer) | ✅ | f3acc6c | `splitView.ts` (`layerOpen`) |
| Écrans : vue 2×2, menu Options, clic droit, aucun débordement horizontal | 800, 1024, 1280, 1920, 2560 × clair, sombre | ✅ pas de débordement ; captures relues : 800 sombre / clair, 1024 clair, 1280 sombre, 800 clair (édition) | f3acc6c | `split.css` |
| Non-régression : Raccourcis, GitHub, Local (sans débordement), site ouvert, barre réduite (68 px) puis dépliée (200 px), Ajouter pendant qu'une vue est ouverte, Renommer (bouton « Renommer »), Supprimer (confirmation, Annuler) | 1280 clair, 800 clair | ✅ | f3acc6c | `Rail.tsx`, `TopBar.tsx` |

Note harnais : un survol simulé sur la page (CDP) ne prévient pas le site quitté (pas de `mouseout`) ; le site ne renvoie alors pas son survol au retour, ce qui ressemble à « un panneau ne se pilote plus ». Les survols envoyés dans la page elle-même (sortir, puis entrer) se comportent comme la vraie souris.

### Bugs trouvés (non corrigés)

1. **moyenne** : la fenêtre « Ajouter un site » (celle du ＋) fait 734 px de haut et ne défile pas : à 800×600 elle dépasse de 67 px en haut et de 67 px en bas, donc le pied (« Plus de réglages… », **« Ajouter une vue scindée… »**, Annuler, Ajouter) est hors écran ; à 1024×700 et 1280×720 elle dépasse encore de 17 et 7 px. Repro : fenêtre 800×600, clic sur ＋ Ajouter. Contournement : clic droit sur Réglages ou sur la barre → « Ajouter une vue scindée ». Fichiers : `AddTabDialog.tsx`, `modal`.
2. **basse** : à 2560×1303 le pied de cette même fenêtre coupe « Plus de réglages… » et « Ajouter une vue scindée… » sur deux lignes (boutons étroits).
3. **basse** : le message « Une vue scindée a besoin de deux sites au moins » s'affiche en bas du panneau vide, par-dessus le pied de page, avec un cadre bleu : ressemble à un champ de saisie, pas à un message. Repro : Modifier la vue… → panneau 2 « — aucun — » → Enregistrer.
4. **basse** : un site ajouté par la pastille du catalogue (Deezer, qui joue en fond) n'écrit pas `pauseHidden: false` (l'effet est bon, le défaut du code), mais ✨ Réglage recommandé propose ensuite « joue en fond (jamais de pause) » alors que c'est déjà le cas. `catalog.ts` (`adviceFor` compare `t.pauseHidden !== false` à une clé absente).
5. **basse** : choisir « Oui » dans « Pause quand je n'y suis pas » écrit `pauseHidden: true` en dur (au lieu de retirer la clé quand c'est le défaut du site) : si le catalogue change de défaut, ce site ne suivra pas. `SetTabs.tsx` (`patch(t.id, { pauseHidden: true })`).
6. **basse** : « Raccourcis » (barre de gauche, après création depuis ＋ ; onglets du haut quand une vue est ouverte) reste marqué actif en même temps que la vue : deux « actifs » (déjà noté bug 9 du `full` précédent pour le site d'origine). Vu sur capture, pas mesuré.
7. **à clarifier** : les cases du menu Options d'une vue enregistrée (ici Défilement synchronisé) ne sont pas gardées à la réouverture (`prefs` de la vue inchangé) : voulu (réglage de la séance) ou oubli ? Le GUIDE dit que le type est « changeable dans Modifier la vue… ».

### Non testé

Vrais sites X / TikTok / Instagram et leurs actions (L, B, T, C), vrai clavier AZERTY / QWERTY, Windows, vrai son (le son n'est vu que par l'état muet / non muet de la page et le haut-parleur de l'en-tête), notifications système en double d'une copie, appels réels, pilotage des copies (survol, touches) en onglets du haut, touches « non interceptées » en Messagerie (déduit), « Garder le son à la sortie », 1920×1080 et 2560×1440 en clair non relus à l'œil (mesurés seulement), Docker, Basecamp, Trello, Infos.

### Corrigés après la trempe du lot (f3acc6c), voir #172 et #175

Fenêtre « Ajouter un site » bornée à la fenêtre (corps qui défile, pied visible, une ligne) ; avertissement « deux sites au moins » dans la barre d'édition ; `adviceFor` ne propose plus un réglage déjà effectif et le choix « Pause quand je n'y suis pas » retire la clé quand il égale le défaut du catalogue ; « Raccourcis » et les sites ne restent plus actifs avec une vue ouverte ; cases du menu Options d'une vue = le temps de la vue (décision, GUIDE et CLAUDE.md).


## 2026-11-20 — Flux simplifié (#177), `trempe` de la branche

Commit testé : `c6e5d93` (branche paco/feature/flux-simplifie). Typecheck + tests : 458 ✓, 9 ignorés. Appli « homedash dev » construite depuis une copie du HEAD (`desktop/*.js` identiques au dépôt, vérifiés octet par octet), lancée à part (`HOMEDASH_PROFILE` jetable, `HOMEDASH_URL` vers un container de dev jetable sur une copie du HEAD, ses propres données) : ni la config de Paco (`data-dev/`, empreinte identique avant / après) ni son profil touchés. Pilotée par CDP : molette (`Input.dispatchMouseEvent` mouseWheel) et souris (déplacements par petits pas) envoyées à la fenêtre, touches (`Input.dispatchKeyEvent`) envoyées à la fenêtre, qui les route au panneau qui a le focus comme un vrai clavier ; AZERTY / QWERTY simulés par le même `code` physique avec le `key` de chaque disposition (ex. `KeyQ` = « a » ou « q »), Alt+chiffre avec le symbole Mac. Sites factices locaux (4 ports, 3 partitions : flux de 400 cartes, vidéo en fichier webm, vidéo `srcObject`, `<audio>` en boucle, champ, zone de texte). Config jetable avec les anciennes clés.

| Cas | Tailles / thèmes | Résultat | Commit | Dépend de |
|---|---|---|---|---|
| Réglages → Vue scindée : Messagerie / Flux + 2 cases + clavier ; plus de « Le son suit », Personnalisé, Raccourcis, mixage, pause, garder le son ; « Actions par site » grisée en Messagerie ; phrase Maj / Mac-Windows lisible ; passer en Messagerie décoche la synchro, revenir en Flux la coche | 1024×700, 1920×1080, 900×600 (largeur mini de la fenêtre) × clair, sombre | ✅ | c6e5d93 | `SetSplit.tsx`, `splitView.ts`, `settings-page.css` |
| Ancien `ui.split` (Personnalisé + follow souris + keys/mixer/pause/keep, `sync: false`, `keyboard: azerty`) | 1280 sombre | ✅ Flux, synchro décochée gardée, AZERTY ; à l'enregistrement, `ui.split` = `{mode, sync, actions, keyboard}` (anciennes clés retirées) | c6e5d93 | `splitView.ts` (`normalizeSplit`), `SetSplit.tsx` |
| Fenêtre Ajouter une vue scindée : nom, Flux / Messagerie, dispositions, sites ; aucune ancienne liste ni case ; Échap, clic hors fenêtre | 1024, 1920, 900 × clair, sombre | ✅ (pas de cases dans cette fenêtre : elles viennent de Réglages, puis Options / Modifier la vue) | c6e5d93 | `SplitViewComposer.tsx` |
| Menu Options d'une vue = 2 cases ; Actions grisée en Messagerie ; Échap et clic hors du menu ne ferment que le menu | 1024, 1920 × clair, sombre ; 1280 sombre | ✅ | c6e5d93 | `SplitView.tsx`, `split.css` |
| Défauts des nouvelles vues : Flux = synchro de Réglages (cochée par défaut), Messagerie = décochée (`withMode`) ; changer de mode dans une vue remet le défaut ; Modifier la vue → Messagerie → Enregistrer écrit `{mode: classic, sync: false, actions}` sans anciennes clés | 1280 sombre | ✅ | c6e5d93 | `App.tsx`, `splitView.ts` |
| Vues d'avant : Personnalisé + follow all → Messagerie (sync / actions gardés) ; Personnalisé + follow souris → Flux (défauts) ; Flux avec `sync: false, actions: false` + anciennes clés → gardés ; vue sans `prefs` → Réglages ; aucune erreur dans la page | 1280 sombre | ✅ | c6e5d93 | `splitView.ts`, `server/store.ts` |
| Molette synchronisée depuis chaque panneau (2, 3, 4 panneaux, 10 crans) : tous suivent, valeurs stables de 0,3 s à 4 s, aucune boucle (10 molettes reçues par panneau) | 1280 sombre | ✅ | c6e5d93 | `guest-preload.js`, `main.js`, `site-adapters.js` |
| Rafale type trackpad (70 crans décroissants) en traversant les panneaux 1 → 3 ; molette continue rapide (60 crans à 8 ms) | 1280 sombre | ✅ tous les panneaux à la même valeur, stables | c6e5d93 | idem |
| Maj + molette verticale : synchro cochée → un seul panneau ; décochée → tous | 1280 sombre | ✅ | c6e5d93 | idem |
| Maj + molette horizontale (ce qu'envoie une souris sur Mac / Windows) | 1280 sombre | ❌ le panneau d'origine défile moins que les autres (bug 1) | c6e5d93 | `main.js`, `site-adapters.js` (`self`), `guest-preload.js` |
| Touches de mixage A/Q Z/S E/D R/F en AZERTY et QWERTY : un seul panneau ; Maj + touche : tous | 1280 sombre | ✅ (160 px par touche) | c6e5d93 | `splitView.ts`, `guest-preload.js`, `App.tsx` |
| ↑ ↓ J K : le panneau sous la souris (prend le son) ; Maj : tous ; souris hors grille : le panneau actif (Alt+1..4) | 1280 sombre | ✅ avec une souris qui se déplace par petits pas (un saut de souris simulé d'un panneau à l'autre trompe la détection : harnais, voir note) | c6e5d93 | idem |
| Ctrl / ⌘ + S, J : jamais pris (la page les reçoit, rien ne défile) ; Maj+Espace : page précédente du seul panneau ; dans un champ du site : aucune touche prise (le texte arrive dans le champ) | 1280 sombre | ✅ | c6e5d93 | `guest-preload.js`, `splitView.ts` |
| Échap : agrandi (X) → restauré → menu Options fermé seul → Échap dans un champ ne ferme rien → la vue | 1280 sombre | ✅ | c6e5d93 | `App.tsx`, `splitView.ts` |
| Son et pause au dernier geste (survol, Alt+chiffre, touche de mixage, J, clic, molette) : un seul panneau a le son, les autres muets, vidéo (fichier) et audio en pause avec `data-hd-paused`, reprise au retour ; sortie de la grille : le dernier garde le son (3 s) ; Maj+touche ne change pas le son | 1280 sombre | ✅ ; une vidéo `srcObject` n'est jamais mise en pause (voulu, #175 : appel) | c6e5d93 | `App.tsx`, `splitView.ts`, `site-adapters.js` |
| Molette synchronisée : le son reste au panneau qu'on fait défiler (2, 3, 4 panneaux, 5 et 30 crans) | 1280 sombre | ✅ en séquence propre ; ❌ vu passer à un panneau suiveur après un saut de souris simulé (bug 2, à confirmer à la vraie souris) | c6e5d93 | `guest-preload.js`, `main.js` |
| Messagerie : tous les sons, aucune pause, lettres / Maj / Alt / flèches jamais prises (la page les reçoit, seul le défilement natif de ↓), Échap ne ferme pas la vue, synchro décochée : un seul panneau | 1280 sombre | ✅ ; Maj + molette y synchronise tous les panneaux (cohérent avec la bulle ⓘ, voir note) | c6e5d93 | `splitView.ts`, `guest-preload.js` |
| Régressions : #175 pause d'un site caché et reprise, copie indépendante du site (copie à 4000, site à 1234), fermeture de la vue (copies fermées, site affiché repris, l'autre reste en pause), onglets normaux | 1280 sombre | ✅ | c6e5d93 | `App.tsx`, `main.js`, `SplitView.tsx` |
| Perf : molette continue 5 s sur 4 panneaux (102 crans) | 1280 sombre | ✅ 23 messages vers la page en 5 s (≈ 4,6/s, pas un par cran) ; 408 messages des sites vers l'appli (1 vrai + 3 échos par cran, voulu) | c6e5d93 | `main.js`, `guest-preload.js` |

**Repris de `f3acc6c`** (fichiers non touchés depuis) : glisser une vue dans la barre (`Rail.tsx`), fenêtre Ajouter un site (`AddTabDialog.tsx`), sauvegarde / restauration.

Note harnais : un déplacement de souris simulé qui saute d'un panneau à l'autre sans passer par la gouttière ne prévient pas le panneau quitté (pas de `mouseout`) ; avec des déplacements par petits pas, comme une vraie souris, le survol est juste.

### Bugs trouvés

1. **moyenne** : Maj + molette **horizontale** (ce que macOS et Windows envoient pour Maj + molette d'une souris) : le panneau d'origine défile bien moins que les autres. Vue Flux 3, 1280×720 sombre, 6 crans de 100 : synchro décochée (tous doivent suivre) → panneaux 1 et 3 à 600, panneau d'origine (2) à **199** (crans espacés de 50 ms), 527 (150 ms), 600 (400 ms) ; synchro cochée (un seul doit défiler) : 5 crans → origine à 145 au lieu de 500. L'origine reçoit bien les 12 molettes (6 horizontales + 6 renvoyées par l'appli, `self`), mais chaque molette horizontale semble couper l'animation de la verticale renvoyée. Synchro décochée, les panneaux se désalignent. Mesuré avec des molettes CDP (non « précises », comme une molette de souris) : à confirmer à la vraie souris. Fichiers : `site-adapters.js` (`createWheelSync`, `self`), `guest-preload.js` (`sideways`).
2. **à confirmer à la vraie souris** : molette synchronisée, le son passe ~450 ms après à un panneau **suiveur** (son vidéo se met en lecture, celle du panneau qu'on fait défiler en pause). Vu 3 fois (Flux 4, 1280×720) après des sauts de souris simulés d'un panneau à un autre ; jamais en séquence propre (18 essais). Cause probable : un panneau qui croit encore avoir la souris (pas de `mouseout`) envoie un survol quand son contenu défile sous ce curseur fantôme (`guest-preload.js`, `mouseover` avec `relatedTarget`, relayé toutes les 300 ms), et la page le prend pour un geste. Si une vraie souris rapide peut sauter la gouttière, le bug existe en vrai. Fichiers : `guest-preload.js`, `App.tsx` (`doHover`).

### Non testé

Vraie souris, vrai trackpad avec élan (phases), vrai clavier AZERTY / QWERTY (simulés par `code`), Windows, vrai son (vu par l'état muet des webviews), bulle ⓘ affichée (c'est une bulle du système, `title` : texte vérifié, pas son rendu), vrais sites (X, TikTok, Instagram, actions L B T C), 800×600 (la fenêtre ne descend pas sous 900 de large), 1280 / 2560 en clair, onglets du haut.

## 2026-11-20 — Flux simplifié (#177), trempe courte après les correctifs `02492a5` et `a880667`

Commit testé : `a880667`. Typecheck + tests : 460 ✓, 9 ignorés. Même méthode que la trempe précédente (instance à part, profil et données jetables, sites factices, `desktop/*.js` identiques au dépôt).

| Cas | Tailles / thèmes | Résultat | Commit | Dépend de |
|---|---|---|---|---|
| Bug 1 : Maj + molette horizontale, Flux 3, 6 crans de 100 sur le panneau 2, crans à 50 / 150 / 400 ms | 1280 sombre | ✅ synchro cochée : 0 / 600 / 0 aux trois rythmes ; décochée : 600 / 600 / 600 aux trois rythmes ; `scrollX` reste à 0 (avant : 199, 527, 600 pour l'origine) | a880667 | `guest-preload.js` |
| Molette horizontale sans Maj et deltaX de trackpad (page plus large que le panneau) : non bloqués en Flux ; Maj + molette horizontale sur une page large : bloquée, défilement vertical seulement | 1280 sombre | ✅ scrollX 300 et 252, aucun défilement vertical ; Maj : scrollX 0, 600 partout | a880667 | `guest-preload.js` |
| Messagerie : Maj + molette horizontale non bloquée (le défilement horizontal natif marche) | 1280 sombre | ✅ natif non bloqué ; ❌ le panneau d'origine traîne encore en hauteur (bug 3) | a880667 | `guest-preload.js`, `site-adapters.js` |
| Bug 2 : son qui saute après la molette, rejoué avec les sauts de souris simulés (3 essais du cas d'avant, molette continue 4 s, 3 sauts directs d'un panneau à l'autre) | 1280 sombre | ✅ le son ne bouge plus (8 relevés sur 2 s après chaque molette) | a880667 | `guest-preload.js` |
| Un vrai déplacement de souris donne toujours le son : petits pas vers 2, 4, 1, 3 ; Alt+1 puis petits mouvements dans le panneau 3 → le son revient au 3 | 1280 sombre | ✅ | a880667 | `guest-preload.js`, `App.tsx` |
| Régression molette synchronisée (2, 3, 4 panneaux depuis chaque panneau, trackpad qui traverse, molette continue, Maj dans les deux sens) | 1280 sombre | ✅ mêmes valeurs qu'avant | a880667 | `guest-preload.js`, `main.js` |
| Régression touches (mixage AZERTY / QWERTY, Maj, ↑ ↓ J K sous la souris, Alt+chiffre, Ctrl / ⌘, Maj+Espace, champ) | 1280 sombre | ✅ | a880667 | `guest-preload.js`, `splitView.ts` |
| Régression son et pause au dernier geste | 1280 sombre | ✅ mêmes résultats qu'avant | a880667 | `App.tsx`, `guest-preload.js` |

### Bug restant

3. **basse** : en **Messagerie**, Maj + molette horizontale (souris sur Mac / Windows) : le correctif ne bloque la molette horizontale qu'en Flux. En Messagerie, synchro décochée, Maj inverse et tous les panneaux suivent, mais le panneau d'origine reste en retard comme avant : 6 crans de 100, l'autre panneau à 600, l'origine à **210** (crans à 50 ms), 537 (150 ms), 600 (400 ms). Sur une page plus large que le panneau, l'origine défile aussi en travers (scrollX 400, hauteur 235 au lieu de 400). 1280×720 sombre, vue Messagerie à 2 panneaux. Fichiers : `guest-preload.js` (`setSplit`, `blockSideways`), `site-adapters.js` (`self`).

### Non testé

Vraie souris, vrai trackpad avec élan, vrai clavier, Windows, vrais sites, autres tailles et thème clair (rien d'affiché n'a changé).

## 2026-11-21 — Vue Flux : toujours des copies (#179), trempe courte

Commit testé : `738da49` (branche paco/fix/flux-toujours-copies). Typecheck + tests : 461 ✓, 9 ignorés. Même méthode : appli construite depuis une copie du HEAD (`desktop/*.js` identiques au dépôt), instance à part (profil, container et données jetables), sites factices locaux (4 ports, 3 partitions : compte perso, compte pro, commun ; flux, vidéo webm, `<audio>`, cookie posé par le vrai site), molette / souris / touches réelles par CDP (touches AZERTY par `code`). Config jetable : vue Flux d'avant #172 **sans `copies`** (3 panneaux), la même sans `prefs`, une vue Flux avec `copies: [false, false]`, une Messagerie avec `copies: [true, true, true]`, une Flux 4.

| Cas | Tailles / thèmes | Résultat | Commit | Dépend de |
|---|---|---|---|---|
| Ancienne vue Flux sans `copies` (et sans `prefs`) : 3 copies sur la partition de chaque site (`-s1`, `-s2`, commune), badge « copie », aucun vrai site affiché ; cookie posé par l'onglet lu par la tuile | 1280 sombre | ✅ | 738da49 | `splitViews.ts` (`viewSlots`, `copiesFor`), `App.tsx` |
| Onglet ↔ tuile indépendants : onglets défilés à 600 (molette réelle) → tuiles à 0 à l'ouverture ; molette sur les tuiles (400) → onglets toujours à 600 ; onglet A défilé à 900 → tuile A à 0 ; vidéo / son : la tuile qui a le son joue, les onglets garés en pause (#175) | 1280 sombre | ✅ | 738da49 | idem |
| Vue Flux avec `copies: [false, false]` stocké : des copies ; Messagerie avec `copies: [true…]` stocké : vrais sites | 1280 sombre | ✅ | 738da49 | `splitViews.ts` |
| Nouvelle vue Flux (fenêtre Ajouter) : 3 copies, son au panneau 1 ; nouvelle Messagerie : les 3 vrais sites (mêmes webviews que les onglets : 3 webviews en tout), tous les sons | 1280 sombre | ✅ | 738da49 | `SplitViewComposer.tsx`, `App.tsx` |
| Modifier la vue : aucun bouton Copie / Site réel par panneau (badge « copie » seul) ; Messagerie → Flux → Messagerie → Flux : 3 → 6 → 3 → 6 webviews (aucune orpheline), son SSS / S.. ; Enregistrer (`prefs.mode: scroll`), Annuler, re-clic sur la vue ouverte : copies toujours pilotées (survol → son, S → seul le panneau 2 défile de 160, vidéos des autres en pause `data-hd-paused`) | 1280 sombre | ✅ | 738da49 | `SplitView.tsx`, `App.tsx`, `split.css` |
| Compteurs : sites à 3, 2, 4 → vues Flux 0, Messagerie 9 ; une copie qui affiche « (9) » ne compte nulle part | 1280 sombre | ✅ | 738da49 | `splitViews.ts` (`viewCounter`), `Rail.tsx` |
| Fermer la vue : copies fermées (7 → 3 webviews), le site affiché reprend (vidéo et son), les sites garés restent en pause ; Messagerie ouverte : les 3 vrais sites jouent | 1280 sombre | ✅ | 738da49 | `App.tsx` |
| Régression #177 (Flux 4) : molette synchronisée depuis chaque panneau (1000 partout, stable à 3 s, 10 molettes par panneau), le son reste au panneau qu'on fait défiler ; Maj + molette verticale et horizontale : seul le 2 (600) ; touches de mixage, Maj + S, ↓ / J sous la souris (et le son), Maj + ↓, Alt+2 souris dehors, E | 1280 sombre | ✅ | 738da49 | `guest-preload.js`, `main.js`, `App.tsx` |

Aucun bug trouvé.

### Non testé

Compteur de l'icône du Dock et de l'Activité (le Dock reste à 0 dans un profil neuf, même pour les sites : réglage des notifications non activé ; rien vu de faux, rien vérifié), notifications système d'une copie, vrais sites (Instagram…), vraie souris et vrai clavier, autres tailles et thème clair (seul le bouton par panneau a disparu, vu en capture à 1280 sombre).

## 2026-11-21 — Vue Flux : dernière adresse de chaque panneau (#180), trempe

Commit testé : `05c6451` (branche paco/feature/flux-derniere-adresse, worktree à part ; contient #179). Typecheck + tests : 480 ✓, 9 ignorés. Appli construite depuis une copie du HEAD (`desktop/*.js` identiques), instance à part (profil, container, données jetables). Sites factices servis dans le container jetable (5 ports, toute adresse = la page, `/notfound` = 404, 8794 refuse l'encadrement par en-têtes), un **proxy qui note chaque appel de l'API** entre la page et le serveur. Navigations des copies : `history.pushState` (reels) et vraies navigations (`location.href`) lancées dans la page de la copie ; molette, souris, touches réelles (CDP). Navigateur : Chromium (Playwright, Docker), requêtes hors local bloquées.

| Cas | Tailles / thèmes | Résultat | Commit | Dépend de |
|---|---|---|---|---|
| Flux 3 : panneau 1 `/reels/111/?token=SECRET&x=1#frag` puis `instagram://…` ; panneau 2 `/p/222?auth=zz&y=2` puis une 404 ; panneau 3 `/reel/333` puis une autre origine. Noté : `/reels/111/?x=1`, `/p/222?y=2`, `null` ; à la réouverture : ces deux adresses et l'**accueil** pour le 3 (jamais l'autre site, jamais la 404, ni `#` ni `token` / `auth`) | 1280 sombre | ✅ | 05c6451 | `splitViews.ts` (`navOk`, `navFail`, `cleanUrl`, `startUrl`), `SplitView.tsx` |
| Pas de rechargement d'une copie ouverte quand `last` s'écrit (marque posée dans la page, toujours là après l'écriture) | 1280 sombre | ✅ | 05c6451 | `SplitView.tsx` (`useState`) |
| **Mesure** : 100 navigations (un reel toutes les 2 s) pendant 201 s, vue ouverte : **3 PUT** (à ~60 s, puis 49 s et 61 s d'écart) ; aucun PUT pendant les 8 premières s ; `config.prev.json` inchangé ; aucun rechargement des copies | 1280 sombre | ✅ | 05c6451 | `lastKeeper.ts`, `server/app.ts`, `store.ts` (`onlyLastChanged`) |
| Un vrai réglage (Réglages → Vue scindée → Enregistrer) sauvegarde encore `config.prev.json` | 1280 sombre | ✅ | 05c6451 | `server/app.ts` |
| Première écriture de `last` sur une config dont les vues n'ont pas 4 cases (écrite à la main) : prise pour un vrai changement (`config.prev.json` réécrit, `reloadAll`) | 1280 sombre | ❌ basse (bug 3), une seule fois | 05c6451 | `store.ts` (`onlyLastChanged`), `accounts.normalized` |
| Clic droit : « Repartir du début » en Flux seulement (absent en Messagerie) ; efface `last`, réouverture sur l'accueil des sites | 1280 sombre | ✅ | 05c6451 | `App.tsx` |
| Modifier la vue : panneau 2 B → D puis Annuler = adresses gardées (et copies ouvertes à leur adresse) ; puis Enregistrer = seule l'adresse du panneau 2 oubliée | 1280 sombre | ✅ | 05c6451 | `App.tsx`, `splitViews.ts` (`keepLast`) |
| Messagerie : navigation dans un vrai site, fermeture : rien noté, aucun PUT ; vue ancienne sans `last` ouverte / fermée sans navigation : rien écrit | 1280 sombre | ✅ | 05c6451 | idem |
| Adresses en attente dans une vue, puis Ajouter une vue scindée → Ajouter : la vue neuve ET l'adresse en attente sont dans la config (2 PUT), encore 8 s après | 1280 sombre | ✅ | 05c6451 | `useConfigState.ts`, `App.tsx` |
| Conflit : config changée par l'API (titre) pendant qu'une adresse attend → 409 puis nouvel essai silencieux (200) ; aucune fenêtre ni message ; titre et adresse gardés | 1280 sombre | ✅ | 05c6451 | `useConfigState.ts` |
| Fenêtre cachée vue ouverte : écrit en moins de 2 s ; fermeture de la vue, rechargement de la page (`location.reload`) : écrit, juste | 1280 sombre | ✅ | 05c6451 | `App.tsx` (`visibilitychange`, `pagehide`) |
| **Quitter l'appli** (⌘Q) ou **Recharger tout homedash** (⇧⌘R) avec une vue Flux ouverte | 1280 sombre | ❌ **haute** : toutes les adresses de la vue sont effacées (bug 1) | 05c6451 | `desktop/main.js` (`unloadGuests`), `SplitView.tsx`, `splitViews.ts` (`navOk`) |
| Navigateur (hors appli) : vue Flux = cadres ; site connu pour refuser (x.com) : la phrase, aucune requête vers lui ; site inconnu qui refuse par en-têtes : panneau blanc | 1280 sombre | ✅ ; ❌ basse (bug 2) | 05c6451 | `splitViews.ts` (`copyFrame`), `customTabs.ts` (`NO_EMBED`) |
| Régressions #177 / #179 (Flux 4) : molette synchronisée depuis chaque panneau (1000 partout, stable, 10 molettes chacun), le son reste au panneau ; Maj + molette verticale et horizontale (seul le 2, 600) ; touches de mixage, Maj + S, ↓ / J sous la souris, Maj + ↓, Alt+2, E ; copie indépendante de l'onglet (onglet à 500, tuile à 0 puis 300, onglet toujours à 500) | 1280 sombre | ✅ | 05c6451 | `guest-preload.js`, `App.tsx` |

### Bugs

1. **haute** : quitter l'appli (⌘Q, ou une mise à jour qui relance) ou « Recharger tout homedash » (⇧⌘R) avec une vue Flux ouverte **efface toutes ses adresses** (`last` disparaît de la config), celles déjà écrites comme celles en attente. Repro : ouvrir Flux 4, un reel dans le panneau 1, attendre l'écriture (`last` = `[…/reel/a, null, null, null]` sur le disque), ⌘Q → `last` absent. Pareil avec ⇧⌘R sans aucune navigation depuis l'ouverture. Cause : `unloadGuests` (`main.js`) charge `about:blank` dans **toutes** les webviews avant de quitter ou de recharger, copies comprises ; chaque copie signale cette navigation (autre site → `null`), puis l'écriture de `pagehide` enregistre quatre `null`, donc plus rien. Un `location.reload()` de la page seule (sans `unloadGuests`) garde bien les adresses. Fichiers : `desktop/main.js`, `SplitView.tsx` (`CopyPane`, `did-navigate`), `splitViews.ts` (`navOk`).
2. **basse** : hors de l'appli, seuls les sites de `NO_EMBED` (`customTabs.ts`) affichent « Ce site refuse de s'afficher… ». Instagram et TikTok, les sites du doomscroll, n'y sont pas : leur panneau serait blanc dans un navigateur (vu avec un site factice qui refuse par `X-Frame-Options` / CSP : panneau blanc, aucune phrase).
3. **basse** : la première écriture de `last` sur une config dont les vues n'ont pas 4 cases (`slots` / `copies` plus courts : config écrite à la main, ou très ancienne) n'est pas reconnue comme « seulement `last` » : la page envoie les vues complétées à 4 cases, le serveur compare à la config brute. Effet une seule fois : `config.prev.json` écrasé et `reloadAll`. La vue de la config de dev de Paco a déjà 4 cases (non concernée). Fichier : `server/app.ts` / `store.ts` (`onlyLastChanged` après `accounts.normalized`, qui ne complète pas les vues).

### Non testé

Vrais sites (Instagram, TikTok : leurs vraies adresses de reels, leurs navigations internes), vraie souris et vrai clavier, ⌘Q avec la fenêtre cachée, mise à jour réelle de l'appli (même chemin que ⇧⌘R d'après le code, pas exécutée), relecture GitHub / scan Local réels (aucun compte ni dossier dans la config jetable : vu par `config.prev.json`, qui est écrit dans la même branche du code que `reloadAll`), autres tailles et thème clair.

## 2026-11-21 — Dernière adresse (#180), trempe courte après les correctifs `5900c24` et `5c4a3eb`

Commit testé : `5c4a3eb` (worktree paco/feature/flux-derniere-adresse). Typecheck + tests : 482 ✓, 9 ignorés. Même méthode que la trempe précédente (copie du HEAD, instance à part, sites factices et proxy qui note les appels de l'API dans un container jetable).

| Cas | Tailles / thèmes | Résultat | Commit | Dépend de |
|---|---|---|---|---|
| Bug 1 : Flux 4, panneaux 1 et 2 écrits (`/reel/q1`, `/p/q2`), panneau 3 en attente (`/reel/q3`), puis Quitter par le vrai chemin (`app.quit()` → `before-quit` → `unloadGuests` → fin) : `last` = q1, q2, q3 sur le disque ; relance sur le même profil : les copies rouvrent sur q1, q2, q3, accueil | 1280 sombre | ✅ (avant : `last` effacé) | 5c4a3eb | `splitViews.ts` (`navOk`), `desktop/main.js` |
| « Recharger tout homedash » (⇧⌘R, `reloadHome` → `unloadGuests`), vue ouverte sans navigation : `last` gardé, la vue rouvre aux mêmes adresses | 1280 sombre | ✅ | 5c4a3eb | idem |
| Une copie qui va vraiment sur un autre site : le panneau qui avait `/reel/q1` passe à `null`, et rouvre sur l'accueil ; un panneau sans adresse qui part ailleurs reste à `null` | 1280 sombre | ✅ | 5c4a3eb | `splitViews.ts` |
| Bug 3 : vue ancienne à 2 cases, 1re écriture d'adresses : `config.prev.json` intact (même empreinte), 1 PUT | 1280 sombre | ✅ | 5c4a3eb | `store.ts` (`onlyLastChanged`) |
| Bug 2 : navigateur (Chromium, requêtes hors local bloquées), vue Flux A + Instagram + TikTok : cadre pour A, la phrase « Ce site refuse de s'afficher… » pour Instagram et TikTok, aucune requête vers eux | 1280 sombre | ✅ | 5c4a3eb | `customTabs.ts` (`NO_EMBED`) |
| Mesure : 93 navigations (un reel toutes les 2 s) pendant 187 s : **3 PUT, à 60 s d'écart pile** ; copies jamais rechargées ; `config.prev.json` inchangé | 1280 sombre | ✅ | 5c4a3eb | `lastKeeper.ts`, `server/app.ts` |
| Régressions #177 / #179 (Flux 4) : molette synchronisée depuis chaque panneau (1000 partout, stable, 10 molettes chacun), son au panneau qui défile ; Maj + molette verticale et horizontale (seul le 2, 600) ; touches de mixage, Maj + S, ↓ / J sous la souris (et le son), Maj + ↓, Alt+2, E ; copie indépendante de l'onglet (onglet 500, tuile 0 puis 300) | 1280 sombre | ✅ | 5c4a3eb | `guest-preload.js`, `App.tsx` |

Note harnais : une première passe des régressions a donné des valeurs fausses (une touche faisait défiler tous les panneaux) parce que des scripts interrompus avaient laissé une touche enfoncée et que la fenêtre de test était recouverte (page « hidden »). Une fois les touches relâchées et la fenêtre gardée au premier plan, la passe complète est juste. Ce n'est pas un bug de l'appli.

Aucun bug trouvé.

### Non testé

Le chemin « Mettre à jour » (refusé en mode dev par l'appli ; il passe par le même `unloadGuests` que Quitter), vrais sites (vraies adresses de reels), vraie souris et vrai clavier, autres tailles et thème clair.

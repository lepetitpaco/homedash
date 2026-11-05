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

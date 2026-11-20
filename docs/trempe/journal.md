# Journal de trempe : vue scindée (#160, #168, #169)

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

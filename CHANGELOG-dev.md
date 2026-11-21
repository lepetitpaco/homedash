# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/feature/vue-scindee

- **Vue scindée** (#160) : 2 à 4 sites côte à côte dans un seul onglet (les sites déjà ouverts sont placés par CSS dans leur panneau, sans rechargement), 6 dispositions, séparateurs glissables, panneau agrandi. Deux modes, Classic (tous les sons, aucune touche interceptée) et Scroll (le son suit la souris, raccourcis, actions par site (J'aime, Enregistrer, Repartager, Commenter ; pas de Suivre), table de mixage (remplace J K, N P, Z et les actions), scroll synchronisé), définis par des cases à cocher (`ui.split`, Réglages → Vue scindée). Clavier AZERTY / QWERTY (données `PRESETS`).
- Logique pure dans `src/lib/splitView.ts` (tests : `tests-ts/splitview.test.ts`) ; relais des touches, du survol et de la molette dans `desktop/` (`homedash:split-*`, `guest-preload.js` inactif vue fermée) ; actions par site dans `desktop/site-adapters.js`.
- **Pause des vidéos** (#168) : en Scroll, les vidéos des panneaux qui n'ont pas le son sont mises en pause et reprennent avec lui (case *Pause : les panneaux inactifs*).
- **Vues scindées enregistrées** (#169, touche Mes sites) : *Garder cette vue* (nom, disposition, sites) la range dans la barre de gauche avec son compteur ; clic = ouvre, clic droit = renommer / supprimer ; sélecteur de panneau avec le nom du compte (« X · pro »), compte déjà pris grisé ; site retiré = panneau vide. Clé `splitViews` de `config.json` (absente = aucune vue, validée avant écriture, reprise par sauvegardes et export). Pas encore : dossiers et ordre, onglet temporaire dans un panneau, proportions rejouées (#172).
- Pas encore : copie dans un onglet temporaire, mesures de performance (Mac, Windows), « Quoi de neuf » (à la version).


## paco/fix/build-dev-vite

- `build-local.sh` relance `homedash-dev` après le build (page noire, 504 Vite) — #159

## paco/fix/selecteurs-actions

- **Actions par site relues sur de vraies pages connectées** (#166, comptes d'éléments, aucun clic) : X passe de touches (qui visaient SON tweet « focus ») à des clics dans le tweet centré (`data-testid` like / bookmark / retweet / reply, et leurs formes « déjà fait ») ; TikTok : la colonne d'actions est devenue commune, hors des articles (`anchoring-engagement-vertical`), et Enregistrer est `favorite-icon` ; Instagram : sélecteurs confirmés, formes « déjà fait » ajoutées (« Je n’aime plus », « Retirer »). Non vérifié : l'effet réel d'un clic, les pages hors fil.

## paco/feature/vues-scindees-ajouter

- **Ajouter une vue scindée** (menu Ajouter) crée une vue enregistrée dans la barre de gauche, comme un site ; le bouton ◫ de la barre du haut disparaît ; plus de vue « jetable ». Touche : Mes sites.
- Les vues se placent où on veut dans la barre (glisser entre les sites, dans ou hors d'un dossier) : clés `before` et `folder` de `splitViews` (additives, une vue sans position reste à la fin).
- Composition fixe d'une vue enregistrée (plus de sélecteur de site dans les panneaux) ; clic droit → *Modifier la vue…* (sélecteurs, puis Enregistrer / Annuler). Proportions des séparateurs gardées.
- Table de mixage (A/Q, Z/S, E/D, R/F) cochée par défaut en Scroll, sans rien retirer aux autres touches ; agrandir passe de Z à X quand elle est cochée.

- **Flux et Messagerie** : chaque vue a son type (Flux : copies des sites sur la même connexion, son à la souris, pause, mixage ; Messagerie : vrais sites, tous les sons, rien d'intercepté). Les copies ne comptent ni dans le compteur ni dans l'Activité. Les vues d'avant gardent leur comportement (vrais sites).

## paco/feature/pause-hors-focus

- **Pause quand je n'y suis pas** (#175, touche Mes sites) : par site (*Réglages → Mes sites → ▾ → Plus d'options*, clé `pauseHidden`), les vidéos et sons d'un site qui n'est plus affiché (garé, autre site, autre page) sont mis en pause et reprennent à son retour. Actif par défaut, sauf pour les lecteurs (YouTube, YouTube Music, Spotify, Deezer, Apple Music, SoundCloud, Twitch, Netflix, Plex) et les appels, réunions et messageries du catalogue (`background: true`). Défaut dans le code (`pauseHiddenOf`), aucune migration ; le catalogue écrit le réglage sur un site qu'il crée, et ✨ *Configuration recommandée* le propose aux sites existants. Même mécanisme que la pause des vues (#168), maintenant aussi pour `<audio>`.

## paco/feature/flux-simplifie

- **Vue scindée : le mode décide** (#177, touche Mes sites). Flux : table de mixage (A/Q Z/S E/D R/F en AZERTY, Q/A W/S E/D R/F en QWERTY) et raccourcis toujours actifs, pause des panneaux sans le son toujours active ; Messagerie inchangée (tous les sons, jamais de pause, aucune touche). Il ne reste que deux cases, dans les deux modes : *Défilement synchronisé* (coché par défaut en Flux, décoché en Messagerie) et *Actions par site* (grisée en Messagerie). Disparaissent : « Le son suit », raccourcis, mixage, pause, garder le son, Personnalisé ; le choix du clavier reste seulement dans Réglages. Vues d'avant : mode et deux cases gardés, anciennes cases ignorées, sans migration.
- **Son au dernier geste** (Flux) : survol, molette, touche de mixage, J K ou flèches, Alt+chiffre ou clic donnent le son au panneau ; les autres sont coupés et en pause.
- **Défilement synchronisé depuis n'importe quel panneau** : un panneau qui venait d'être suivi avalait sa propre molette (échos en attente), oubliés quand la souris y entre ; une molette envoyée pour une touche n'est plus recopiée.
- **Maj + molette** (qui arrive horizontale d'une souris) : la molette horizontale native est bloquée vue ouverte (Flux et Messagerie), le panneau d'origine ne traîne plus derrière les autres ; une molette horizontale sans Maj reste native. Un survol causé par le contenu qui défile (souris immobile) ne donne plus le son.
- **Modificateurs**, mêmes touches sur Mac et Windows (lues à leur place, `event.code`) : Maj = tous les panneaux (touches de mixage, J K, flèches, N P), Maj + molette inverse la synchro ; J K et flèches visent le panneau sous la souris. Légende ⓘ de la barre et Réglages → Vue scindée le disent.

## paco/fix/flux-toujours-copies

- **Une vue Flux n'ouvre que des copies** (#179) : une vue Flux enregistrée avant les copies ouvrait les vrais sites, liés à leur onglet (défiler la tuile Instagram faisait défiler l'onglet Instagram). Le type décide seul, vues anciennes comprises, sans migration : Flux = copies (même compte, page à part), Messagerie = vrais sites. La bascule « Copie / Site réel » par panneau disparaît de *Modifier la vue…* ; changer le type change tous les panneaux tout de suite. Le compteur d'une vue Flux vaut 0 (décision : une copie n'a pas de compteur). Hors de l'appli (navigateur), une copie est un cadre sur l'adresse du site. Limite : après Messagerie → Flux, un site sans pause garé (YouTube, Discord…) continue de jouer derrière les copies, comme #175.

## paco/feature/flux-derniere-adresse

- **Une vue Flux reprend où tu en étais** (#180) : chaque panneau rouvre sa dernière page (reel, post) si elle est sur le même site, sinon l'accueil du site ; clic droit → *Repartir du début* ; changer le site d'un panneau oublie sa page. Clé additive `splitViews[].last`, sans migration ; écriture discrète et regroupée (5 s après la dernière navigation, au plus une fois par minute, et à la fermeture).

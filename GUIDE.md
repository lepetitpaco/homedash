# Guide

Installation : voir le [README](README.md).

## Les onglets

### ⚡ Raccourcis

Tes liens, tuiles (épinglés + plus cliqués), infos à copier, notes.

- **Tout se modifie au clic droit** : sur un lien (modifier, épingler, surveiller, supprimer…) ou sur
  une catégorie (ajouter un lien, renommer, couleur…). Le **＋** de la barre du haut crée une catégorie.
- **Lien surveillé** : un voyant vert/rouge dit si le site répond.
- **Infos** (WiFi, IP, accès…) : un clic copie. Les valeurs *secrètes* se copient sans s'afficher.
  Clic droit sur une ligne ou un titre de groupe pour modifier, ou **＋** dans l'en-tête du panneau.
  Pas encore de panneau ? Clic droit sur une catégorie → *Ajouter un panneau Infos*.

### 🐙 GitHub ⇄ 💻 Local

Les deux onglets forment un seul bloc : ton code en ligne (GitHub) et sur ton disque (Local). Un clic sur
chaque moitié.

### 🐙 GitHub

Apparaît dès qu'un compte est connecté. Se rafraîchit toutes les 15 s.

| Carte | Contenu |
| --- | --- |
| 🌿 Branches actives | Tes branches, avec leur PR, leur CI, leur avance/retard |
| 🔀 PRs ouvertes | CI, revues, conflits |
| ✅ Mergées | PRs mergées récemment ; 🧹 = la branche locale peut partir |
| 🤖 Renovate | *Optionnelle*, se règle dans Réglages → Onglet GitHub |

En haut : choix du **compte** (si plusieurs) et de l'**utilisateur** affiché (si équipe), pause, ↻.

### 💻 Local

Tes clones git, branche par branche, avec un verdict :

| Verdict | Sens |
| --- | --- |
| 🗑 à supprimer | Son contenu existe ailleurs. Sans risque. |
| 🔍 à vérifier | Sans doute finie, mais une partie n'est nulle part ailleurs. |
| ⚠ à garder | Commits présents uniquement sur ton disque. |
| 🔧 en cours | Travail actif. |

Des commandes prêtes à copier sont proposées (`git branch -d …`). **Rien n'est exécuté** : tu les
lances toi-même. La page se met à jour seule après un `git fetch` ou un changement de branche.

### 🏕 Basecamp

Apparaît dès que l'appli Basecamp est renseignée (Réglages → Basecamp). **Lecture seule** : homedash ne
coche rien, ne marque rien comme lu, ne poste rien. Chaque ligne est un lien qui ouvre Basecamp.

Tes tâches assignées (rouge = en retard, ⭐ = Up Next), avec un **menu à gauche** comme dans Réglages :

- **🔥 À traiter** : tout ce qui est en retard ou dû dans les 7 jours, tous projets confondus. Sous chaque
  tâche, son projet et son tableau ; un clic y mène.
- **Un projet**, et sous lui ses **tableaux kanban** (leurs colonnes dans l'ordre du tableau, seules celles
  où tu as des cartes) et ses **To-dos** (par liste). Chaque ligne du menu donne son nombre de tâches et,
  en rouge, ses retards : la vue d'ensemble se lit sans rien ouvrir.

La pastille de l'onglet compte les tâches en retard des projets affichés. **Choisir les projets
affichés** : les pastilles en haut de l'onglet, ou « masquer le projet ». Enregistré dans la config, donc
pareil dans tous tes navigateurs ; un nouveau projet s'affiche de lui-même.

**🏕 en haut à droite**, à côté de la cloche : tes notifications Basecamp non lues, la pastille en donne
le nombre. Ouvrir le panneau ne les marque pas lues : c'est en les ouvrant dans Basecamp qu'elles partent.

Relu toutes les 60 s, page fermée comprise. Une nouvelle notif ou tâche arrive aussi dans la cloche 🔔.

**Connexion** (une fois par personne, pas besoin d'être admin). Le pas-à-pas est dans Réglages → Basecamp :

1. Sur [launchpad.37signals.com/integrations](https://launchpad.37signals.com/integrations) → *Register
   another application* : nom `homedash`, site `https://github.com/davidgennaoui/homedash`, produit
   **Basecamp 4**, Redirect URI `https://example.com/oauth` (Launchpad refuse `localhost` et `127.0.0.1`).
2. Dans Réglages → Basecamp : colle le Client ID et le Client Secret, **Enregistrer l'appli**.
3. **Se connecter à Basecamp** → autorise. Tu arrives sur une page example.com vide : copie son adresse
   complète (avec `?code=…`), colle-la dans Réglages → Basecamp, **Valider**.

Le jeton se renouvelle ensuite tout seul.

### 🔔 Activité (la cloche, en haut à droite)

CI cassée ou réparée, PR mergée, branche locale à nettoyer… La pastille rouge compte les non-lus, aussi
visibles dans l'onglet du navigateur. Clic = les derniers événements ; **vider** efface le journal
(après confirmation) ; **Tout voir** = l'historique.

Notifications bureau : **désactivées par défaut**, à activer en bas du panneau de la cloche.

### Version et nouveautés (en haut à droite)

Le numéro de version (`v1.7.0`) ouvre une fenêtre avec le changelog : ce qui a changé à chaque version. Quand une version
plus récente est publiée, il passe en bleu (`⬆ 1.8.0`) et la cloche le signale ; la fenêtre donne la
commande à copier (`git pull && docker compose up -d --build`). Tes données sont sauvegardées
automatiquement avant la mise à jour (Réglages → Sauvegardes, instantané « avant-x-y-z »).

## ⚙ Réglages

Le menu de gauche affiche une partie à la fois. Les modifications s'enregistrent avec **Enregistrer** (`⌘S`), toutes parties confondues. La barre du bas signale ce qui n'est pas
enregistré.

| Partie | Ce qu'on y fait |
| --- | --- |
| 🔑 Compte & équipe | Jeton GitHub, membres de l'équipe (★ = affiché par défaut), **＋ compte** pour un autre compte GitHub |
| 📦 Repos suivis | Ajouter / retirer des repos. Pastilles par repo : **PRs**, **Branches**, **GitHub** (ligne dans la carte Repos de l'onglet GitHub), **Accueil** (carte dans Raccourcis) |
| 🐙 Onglet GitHub | Fréquence de rafraîchissement, carte Renovate |
| 💻 Dépôts locaux | Dossiers où chercher tes clones |
| 💾 Sauvegardes | Instantané, export, restauration (l'état actuel est toujours sauvegardé avant) |
| 🎛 Affichage | Presets (49", 34", MacBook Pro), thème, horloge, notifications, largeur de la page, colonnes GitHub / Local |

Un seul jeton voit ton compte **et** tes organisations : un second compte ne sert que pour un autre
compte GitHub.

## Raccourcis clavier

| Touche | Action |
| --- | --- |
| `/` ou `⌘K` | Rechercher : liens, repos, PRs, branches, dépôts locaux, infos, notes. La carte de la sélection s'affiche à droite |
| `↑` `↓` `↵` | Parcourir, ouvrir / copier |
| `Échap` | Effacer, fermer |
| `⌘S` | Enregistrer les réglages |

## En cas de souci

| Problème | Solution |
| --- | --- |
| Pas d'onglet GitHub | Aucun jeton : Réglages → Compte |
| Un repo n'est pas proposé | Le jeton n'y a pas accès : ajoute-le dans *Repository access* du jeton sur GitHub |
| Onglet Local vide | Ajoute un dossier dans Réglages → Dépôts locaux (il doit être dans ton dossier personnel) |
| Config cassée | Réglages → Sauvegardes → restaurer celle de la veille |
| Changer de machine | Copier `data/`, ou Exporter / Restaurer (puis recoller le jeton) |

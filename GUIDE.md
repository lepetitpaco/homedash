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

### 🔔 Activité (la cloche, en haut à droite)

CI cassée ou réparée, PR mergée, branche locale à nettoyer… La pastille rouge compte les non-lus, aussi
visibles dans l'onglet du navigateur. Clic = les derniers événements ; **Tout voir** = l'historique.

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
| 📦 Repos suivis | Ajouter / retirer des repos. Trois pastilles par repo : **PRs**, **Branches**, **Carte** (lien dans Raccourcis) |
| 🐙 Onglet GitHub | Fréquence de rafraîchissement, carte Renovate |
| 💻 Dépôts locaux | Dossiers où chercher tes clones |
| 💾 Sauvegardes | Instantané, export, restauration (l'état actuel est toujours sauvegardé avant) |
| 🎛 Affichage | Thème, horloge, notifications, mise en page : largeur de la page (% de l'écran), colonnes GitHub / Local (0 = auto) |

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

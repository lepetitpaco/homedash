# Guide

Installation : voir le [README](README.md).

## Les onglets

### ⚡ Raccourcis

Tes liens, tuiles (épinglés + plus cliqués), infos à copier, notes.

- **Tout se modifie au clic droit** : sur un lien (modifier, épingler, surveiller, supprimer…) ou sur
  une catégorie (ajouter un lien, renommer, couleur…). Le **＋** de la barre du haut crée une catégorie.
- **Lien surveillé** : un voyant vert/rouge dit si le site répond.
- **Infos** : un clic copie. Les valeurs *secrètes* se copient sans s'afficher.

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

## ⚙ Réglages

Les modifications s'enregistrent avec **Enregistrer** (`⌘S`). La barre du bas signale ce qui n'est pas
enregistré.

| Partie | Ce qu'on y fait |
| --- | --- |
| 🔑 Compte & équipe | Jeton GitHub, membres de l'équipe (★ = affiché par défaut), **＋ compte** pour un autre compte GitHub |
| 📦 Repos suivis | Ajouter / retirer des repos. Trois pastilles par repo : **PRs**, **Branches**, **Carte** (lien dans Raccourcis) |
| 🐙 Onglet GitHub | Fréquence de rafraîchissement, carte Renovate |
| 💻 Dépôts locaux | Dossiers où chercher tes clones |
| 💾 Sauvegardes | Instantané, export, restauration (l'état actuel est toujours sauvegardé avant) |
| 🎛 Affichage | Thème, horloge, notifications… |

Un seul jeton voit ton compte **et** tes organisations : un second compte ne sert que pour un autre
compte GitHub.

## Raccourcis clavier

| Touche | Action |
| --- | --- |
| `/` ou `⌘K` | Rechercher (liens, infos, notes) |
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

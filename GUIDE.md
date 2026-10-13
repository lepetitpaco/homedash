# Guide d'utilisation

Ce guide décrit la page telle qu'on l'utilise au quotidien. Pour l'installation, voir le
[README](README.md).

- [Premier lancement](#premier-lancement)
- [Barre du haut](#barre-du-haut)
- [⚡ Raccourcis](#-raccourcis)
- [🐙 GitHub](#-github)
- [💻 Local](#-local)
- [🔔 Activité](#-activité)
- [⚙ Réglages](#-réglages)
- [Raccourcis clavier](#raccourcis-clavier)
- [Questions fréquentes](#questions-fréquentes)

---

## Premier lancement

1. `docker compose up -d --build`, puis ouvre **http://localhost:7777**.
2. **⚙ Réglages → 🔑 Compte & équipe** : colle un jeton GitHub.
   - Crée-le sur *GitHub → Settings → Developer settings → Personal access tokens*.
   - **Fine-grained** (recommandé) : en lecture, *Contents*, *Pull requests*, *Checks* et *Metadata* sur
     les repos voulus, plus *Members* côté organisation pour proposer l'équipe. Pour les repos d'une
     organisation, choisis-la comme *Resource owner*.
   - **Classic** : la portée `repo` suffit (plus `read:org` pour lister les membres d'une org).
   - Le jeton est vérifié auprès de GitHub ; ton login devient l'utilisateur affiché.
3. **📦 Repos suivis** : clique **＋** sur les repos à suivre.
4. **💻 Dépôts locaux** *(facultatif)* : ajoute le dossier qui contient tes clones, par exemple `~/dev`.
5. Clique **Enregistrer** (ou `⌘S` / `Ctrl+S`).

> [!TIP]
> Pour en faire la page d'accueil du navigateur : dans les réglages du navigateur, *Page d'accueil* →
> `http://localhost:7777`.

---

## Barre du haut

| Élément | Rôle |
| --- | --- |
| **Recherche** | Cherche dans les liens, les infos et les notes, depuis n'importe quel onglet. |
| **Horloge** | Masquable dans *Réglages → Affichage*. |
| **🔔 Cloche** | Le journal d'activité (voir [Activité](#-activité)). La pastille rouge compte les non-lus. |
| **⟳** | Re-teste les liens surveillés (visible seulement s'il y en a). |
| **＋** | Nouvelle catégorie de liens. |
| **☾ / ☀** | Thème sombre / clair. |

---

## ⚡ Raccourcis

L'onglet des liens de tous les jours.

- **Tuiles** en haut : les liens épinglés, complétés par les plus cliqués.
- **Catégories** de liens, repliables, avec icône et couleur.
- **Infos & accès** : des valeurs à copier (adresses, identifiants Wi-Fi…). Un clic copie. Les valeurs
  marquées *secrètes* sont masquées et se copient sans être affichées, pratique en partage d'écran.
- **Repos** : une carte par repo avec ses liens (PRs, branches, Actions…) et un bouton `clone` qui copie la
  commande.
- **Notes** : clic pour ouvrir, sauvegarde automatique. La première ligne sert de titre.

### Modifier

Tout se fait au **clic droit** :

| Sur… | Actions |
| --- | --- |
| un lien | modifier, épingler en tuile, surveiller (voyant), copier l'URL, dupliquer, monter / descendre, supprimer |
| une catégorie | ajouter un lien, modifier (nom, icône, couleur), monter / descendre, masquer, supprimer |

Chaque modification est enregistrée immédiatement.

### Voyants

Un lien **surveillé** affiche un voyant : vert si le serveur répond, rouge sinon (DNS, refus, délai
dépassé). Le test est refait toutes les 60 s. La catégorie indique combien de liens sont en panne.

---

## 🐙 GitHub

Visible dès qu'un compte est connecté. Les données se mettent à jour toutes les 15 s environ.

### Barre de l'onglet

- **Compte** : avec plusieurs comptes GitHub, un sélecteur choisit celui qui est affiché. Les autres
  continuent d'être suivis en arrière-plan.
- **Utilisateur** : avec une équipe configurée, choisis de qui tu regardes les branches et les PRs.
- **🧹 Branches locales à supprimer** : apparaît quand des branches mergées traînent encore sur ton disque.
- **⏸ / ▶** : met en pause le rafraîchissement automatique. **↻** : rafraîchit tout de suite.

### Cartes

| Carte | Contenu |
| --- | --- |
| 🌿 **Branches actives** | Les branches de l'utilisateur, regroupées par chantier quand elles portent le même nom dans plusieurs repos. Indique la PR associée, l'état de la CI, l'avance et le retard. |
| 🔀 **PRs ouvertes** | État de la CI, revues, conflits. |
| ✅ **Mergées** | Les PRs mergées récemment. Une puce 🧹 rappelle quand la branche locale peut partir. |
| 🤖 **Renovate** | *Facultative.* Suit la propagation d'une version d'un repo « socle » vers des repos dérivés. Se règle dans *Réglages → Onglet GitHub*. |

Chaque carte a son propre **↻**.

---

## 💻 Local

Les clones git présents sur ta machine, dans les dossiers choisis dans *Réglages → Dépôts locaux*.

> [!IMPORTANT]
> Cet onglet **ne modifie rien et n'exécute rien**. Les `.git` sont lus directement, sans lancer git.
> Les commandes affichées sont du texte à copier, que tu lances toi-même dans ton terminal.

### Ce qu'il montre

Pour chaque dépôt : la branche courante, l'avance et le retard sur le distant, les fichiers modifiés, et
surtout **chaque branche locale avec un verdict** :

| Verdict | Signification |
| --- | --- |
| 🗑 **à supprimer** | Son contenu existe ailleurs (mergée, ou PR mergée). Peut partir sans risque. |
| 🔍 **à vérifier** | Probablement terminée, mais une partie n'est sauvegardée nulle part. À regarder avant de supprimer. |
| 🔧 **en cours** | Travail actif. |
| ⚠ **à garder** | Contient des commits qui n'existent que sur ton disque. |
| 📍 **tu es dessus** | La branche courante, jamais proposée à la suppression. |
| 🏠 **référence** | La branche par défaut (main, master…). |

À côté, une pastille dit où le contenu est sauvegardé : *✓ sauvegardée*, *✓ PR mergée*, *↑ sur GitHub*,
*⚠ jamais poussée*…

Pour les repos suivis dans l'onglet GitHub, le verdict s'appuie sur GitHub lui-même. Il reconnaît ainsi
une branche **squashée** ou **supprimée du distant**, même sans `git fetch --prune`.

### Commandes proposées

En haut de chaque dépôt, des commandes prêtes à copier : rafraîchir le distant, supprimer les branches
mergées, rattraper la branche par défaut… Un clic copie, rien n'est lancé.

### Plusieurs dossiers

Avec plusieurs dossiers configurés, des onglets apparaissent : **Tous**, puis un par dossier, chacun avec
son nombre de dépôts et de branches à supprimer.

La page se met à jour seule quand tu fais un `git fetch`, un `git branch -d` ou que tu changes de branche.

---

## 🔔 Activité

Le journal de ce qui s'est passé, tenu par le serveur : il se remplit même page fermée.

- CI qui casse ou qui repasse au vert sur tes PRs
- PR mergée, branche mergée
- Nouvelles PRs Renovate, versions validées ou en échec
- Branche locale devenue supprimable

**Clic sur la 🔔** : les 20 derniers événements. L'ouvrir marque tout comme lu. Clic sur un événement : la
PR sur GitHub, ou l'onglet Local pour une branche à nettoyer. **Tout voir →** ouvre l'historique complet,
avec ses filtres (GitHub, Local, problèmes) et un bouton pour le vider.

Les non-lus apparaissent aussi **dans l'onglet du navigateur** : `(3)` devant le titre et une pastille
rouge sur l'icône, visibles depuis n'importe quel autre onglet.

> [!NOTE]
> Les **notifications système** (bureau) sont **désactivées par défaut**. Pour les activer : bas du panneau
> de la cloche → *activer*, ou *Réglages → Affichage → Notifications*. Elles demandent `localhost` ou HTTPS.

---

## ⚙ Réglages

Le menu de gauche mène à chaque partie. Les modifications forment un brouillon : la barre du bas indique
**● Modifications non enregistrées** tant que tu n'as pas cliqué **Enregistrer** (`⌘S` / `Ctrl+S`).

> [!NOTE]
> Exceptions, appliquées tout de suite : connecter ou déconnecter un jeton, ajouter ou supprimer un compte,
> les actions de sauvegarde.

### 🔑 Compte & équipe

- **Jeton** : colle, *Connecter*. Le jeton est stocké côté serveur et n'est jamais réaffiché.
- **Équipe** : les membres de tes organisations sont proposés. **★** désigne l'utilisateur affiché à
  l'ouverture. L'onglet GitHub permet ensuite de passer de l'un à l'autre.
- **Plusieurs comptes GitHub** : **＋ compte** en haut des réglages, donne-lui un nom, colle son jeton.
  Chaque compte a ses propres repos, équipe et réglages Renovate ; les cartes réglées sont celles du compte
  sélectionné. Un seul jeton voit déjà ton espace personnel *et* tes organisations : un second compte ne
  sert que pour un autre compte GitHub.

### 📦 Repos suivis

Une liste unique, rangée par propriétaire. Chaque repo a trois pastilles, actives par défaut :

| Pastille | Effet |
| --- | --- |
| **PRs** | Ses PRs apparaissent dans *PRs ouvertes* et *Mergées*. |
| **Branches** | Ses branches apparaissent dans *Branches actives*, et l'onglet Local s'appuie sur GitHub pour juger ses branches. |
| **Carte** | Il a sa carte dans la section *Repos* de l'onglet Raccourcis. |

**✕** arrête de suivre le repo partout.

**Ajouter** : un onglet par propriétaire visible par le jeton, repos triés par activité, filtre de
recherche. Ou à la main : `propriétaire/repo`.

> [!TIP]
> Chaque repo coûte quelques appels à l'API GitHub par cycle. Rester sous une quinzaine de repos par compte.
> Un repo absent de la liste n'est pas accessible au jeton : ajoute-le à son *Repository access* sur GitHub.

### 🐙 Onglet GitHub

- **PRs mergées affichées** : combien de PRs garder dans la carte *Mergées*.
- **Rafraîchissement** : secondes entre deux lectures de GitHub (0 = seulement à la demande).
- **Renovate** *(repliable)* : active la carte, nomme le repo socle et l'auteur des PRs (par défaut
  `renovate[bot]`), choisis les repos dérivés à surveiller.

### 💻 Dépôts locaux

**Parcourir** ton dossier personnel et **ajouter** les dossiers qui contiennent tes clones. Le nombre de
dépôts trouvés s'affiche avant l'ajout. Seul le dossier personnel est accessible, en lecture seule.

### 💾 Sauvegardes

| Action | Effet |
| --- | --- |
| Automatique | Un instantané par jour, les 30 derniers sont gardés. |
| **Créer un instantané** | Tout de suite, en plus des automatiques. |
| **Exporter** | Télécharge un fichier `.json` à garder ailleurs. |
| **Restaurer** | Depuis un instantané ou un fichier exporté. L'état courant est d'abord sauvegardé, rien n'est perdu. |

Une sauvegarde contient la config, les notes et les compteurs de clics. Elle **ne contient pas** les jetons
GitHub, à recoller après une restauration sur une autre machine, ni le journal d'activité.

### 🎛 Affichage

Thème, horloge, largeur des liens, fréquence des tests de voyants, notifications système…

---

## Raccourcis clavier

| Touche | Action |
| --- | --- |
| `/` ou `⌘K` / `Ctrl+K` | Aller à la recherche |
| `↑` `↓` | Parcourir les résultats |
| `↵` | Ouvrir le lien, copier l'info ou ouvrir la note |
| `Échap` | Effacer la recherche, fermer un panneau ou une note |
| `⌘S` / `Ctrl+S` | Enregistrer les réglages |

La recherche est floue et ignore les accents : `mpa` trouve `mon-projet-api`.

---

## Questions fréquentes

<details>
<summary><strong>L'onglet GitHub n'apparaît pas.</strong></summary>

Aucun compte n'est connecté. *Réglages → Compte & équipe*, colle un jeton, puis suis au moins un repo.
</details>

<details>
<summary><strong>Un repo n'apparaît pas dans la liste à ajouter.</strong></summary>

Le jeton n'y a pas accès. Pour un jeton *fine-grained*, ajoute le repo (ou l'organisation) dans son
*Repository access* sur GitHub. Ou ajoute-le à la main : `propriétaire/repo`.
</details>

<details>
<summary><strong>L'onglet Local est vide.</strong></summary>

Aucun dossier n'est configuré : *Réglages → Dépôts locaux*. Le dossier doit se trouver dans ton dossier
personnel, le seul qui soit monté dans le conteneur.
</details>

<details>
<summary><strong>Je ne reçois pas de notifications sur le bureau.</strong></summary>

Elles sont désactivées par défaut : active-les depuis la cloche. Si elles le sont déjà, vérifie les
réglages de notifications du système pour ton navigateur, et le mode Concentration / Ne pas déranger.
</details>

<details>
<summary><strong>Comment changer de machine ?</strong></summary>

Copie le dossier `data/`, ou *Réglages → Sauvegardes → Exporter* puis *Restaurer* sur la nouvelle
instance. Dans le second cas, recolle ensuite ton jeton GitHub.
</details>

<details>
<summary><strong>J'ai cassé ma config.</strong></summary>

*Réglages → Sauvegardes → Restaurer* l'instantané de la veille. La version juste avant la dernière
écriture est aussi dans `data/config.prev.json`.
</details>

# Guide

Installation : voir le [README](README.md).

## Les onglets

### ⚡ Raccourcis

Tes liens, tuiles (épinglés + plus cliqués), infos à copier, notes.

- **Tout se modifie au clic droit** : sur un lien (modifier, épingler, surveiller, supprimer…) ou sur
  une catégorie (ajouter un lien, renommer, couleur…). Le **＋** de la barre du haut crée une catégorie.
- **Ordre des 📌 Épinglés** : glisse une tuile par sa poignée ⠿ (visible au survol) ; un trait bleu
  montre où elle va tomber. Un lien nouvellement épinglé se met à la fin.
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

Le menu s'élargit en glissant la poignée entre lui et le contenu (double-clic = largeur par défaut).
La pastille de l'onglet compte les tâches en retard des projets affichés. **Choisir les projets
affichés** : les pastilles en haut de l'onglet, ou « masquer le projet ». Enregistré dans la config, donc
pareil dans tous tes navigateurs ; un nouveau projet s'affiche de lui-même.

**🏕 en haut à droite**, à côté de la cloche : tes notifications Basecamp non lues, la pastille en donne
le nombre. Ouvrir le panneau ne les marque pas lues : c'est en les ouvrant dans Basecamp qu'elles partent.

Relu toutes les 60 s, page fermée comprise. Une nouvelle notif ou tâche arrive aussi dans la cloche 🔔.

**Connexion** (une fois par personne, pas besoin d'être admin). Le pas-à-pas est dans Réglages → Basecamp :

1. Sur [launchpad.37signals.com/integrations](https://launchpad.37signals.com/integrations) → *Register
   another application* : nom `homedash`, site `https://github.com/davidgennaoui/homedash`, produit
   **Basecamp 4**, Redirect URI `https://<ton site>/oauth` (Launchpad refuse `localhost` et `127.0.0.1`).
2. Dans Réglages → Basecamp : colle le Client ID et le Client Secret, et dans **Mon site de callback** le
   même domaine (vide = `example.com`, domaine réservé aux exemples). L'adresse exacte à mettre dans
   Launchpad s'affiche dessous. **Enregistrer l'appli**.
3. **Se connecter à Basecamp** → autorise. Tu arrives sur une page de ce site (vide ou introuvable, peu
   importe) : copie son adresse complète (avec `?code=…`), colle-la dans Réglages → Basecamp, **Valider**.

Un site à toi est préférable : le code n'arrive que chez toi (vérifie que `/oauth` ne redirige pas
ailleurs en perdant le `?code=…`). Le site ne voit jamais le jeton : le code seul ne sert à rien sans ton
Client Secret, et ne sert qu'une fois.

Le jeton se renouvelle ensuite tout seul.

### ＋ Onglets perso

Le **＋** au bout de la barre d'onglets (ou Réglages → Onglets perso) ajoute un onglet vers **un site**
(`https://…`) ou **un fichier / dossier de ton disque** (`~/Documents/procédure.pdf`, ou 📁 pour le
choisir). Icône (un emoji), nom, adresse, et ce que fait un clic :

- **dans homedash** : le site ou le fichier s'affiche sous la barre d'onglets. Revenir sur l'onglet ne
  le recharge pas (↻ pour ça). Dans un navigateur, ça marche pour les fichiers (PDF, images, texte, HTML,
  dossiers) et les sites qui l'acceptent : **Gmail, Google Chat, GitHub et la plupart des grands sites le
  refusent** (page blanche, ↗ *ouvrir à part* reste possible). Dans l'**appli de bureau** (plus bas),
  tous s'affichent, avec leurs non-lus en pastille.
- **ouvrir à part ↗** : l'onglet est un raccourci, il ouvre le site dans un onglet du navigateur.

Les fichiers sont lus, jamais modifiés, et limités à ton dossier personnel (ni fichiers cachés, ni le
`data/` de homedash). ↑ ↓ dans Réglages pour l'ordre ; puis **Enregistrer**.

Une page web ne peut ni afficher un site qui le refuse, ni lire ce qu'il affiche (ses non-lus) : c'est
ce que l'appli de bureau débloque.

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

## L'appli de bureau (Mac)

Une fenêtre homedash à part, dans le Dock, comme Discord ou Slack. Elle **affiche** le homedash de ton
container : Docker reste nécessaire et tourne comme avant (`docker compose up -d`, il redémarre seul avec
Docker Desktop). L'appli ne remplace que l'onglet du navigateur ; container arrêté, elle le dit et
réessaie toute seule.

Ce qu'elle apporte :

- **Tous les onglets perso s'affichent**, Gmail, Google Chat et GitHub compris (dans un navigateur, ces
  sites refusent d'être affichés dans une page). Tu t'y connectes une fois, dans l'onglet : la connexion
  est gardée, et vaut pour tous les onglets Google.
- **Pastilles** : le nombre que le site met dans son titre (« Boîte de réception (3) », « Chat (2) »)
  devient une pastille rouge sur l'onglet, même fermé. Leur total, plus les non-lus de la cloche, s'affiche
  sur l'**icône du Dock**.
- Les liens s'ouvrent dans ton **navigateur par défaut** (Firefox…). Dans un onglet perso : ← pour revenir
  en arrière, ↗ pour ouvrir la page en cours dans le navigateur.
- Fermer la fenêtre la cache (l'appli continue de compter) ; *homedash → Quitter* (`⌘Q`) la ferme.

**Installer** : télécharge le `.dmg` de la dernière release `desktop-v…` du repo sur GitHub (`-arm64` pour
un Mac Apple Silicon, `-x64` pour un Mac Intel), glisse homedash dans Applications. L'appli n'est pas
signée par Apple : au premier lancement, macOS la bloque. *Réglages Système → Confidentialité et sécurité →
Ouvrir quand même* (une seule fois), ou dans un terminal :
`xattr -dr com.apple.quarantine /Applications/homedash.app`.

**Sans passer par GitHub** : `sh desktop/build-local.sh --install` construit l'appli sur ton Mac (Docker
suffit, pas besoin de Node) et la copie dans Applications.

L'appli charge l'interface depuis le container : `git pull && docker compose up -d --build` la met à jour,
sans la réinstaller. Un nouveau `.dmg` n'est publié que si la coquille elle-même change. Autre adresse
que `localhost:7777` (seconde instance) : menu *Présentation → Adresse de homedash…*.

### Sans l'appli : installer la page (PWA)

homedash est aussi une PWA : dans Chrome ou Edge, icône ⊕ « Installer » à droite de la barre d'adresse (ou menu
⋮ → *Caster, enregistrer et partager* → *Installer la page en tant qu'application*). Dans Safari (macOS) :
*Fichier → Ajouter au Dock*. Clic droit sur l'icône installée : raccourcis GitHub, Local et Basecamp.

Les liens s'ouvrent dans le navigateur qui a installé l'appli. Pour qu'ils s'ouvrent dans ton navigateur
par défaut, installe-la depuis Safari (*Ajouter au Dock*) : une appli Safari envoie les liens externes
au navigateur par défaut du Mac.

Accès réseau en `http://` (autre machine que localhost) : pas d'installation possible, le navigateur ne
l'autorise qu'en localhost ou HTTPS.

## ⚙ Réglages

Le menu de gauche affiche une partie à la fois. Les modifications s'enregistrent avec **Enregistrer** (`⌘S`), toutes parties confondues. La barre du bas signale ce qui n'est pas
enregistré.

Le menu de gauche range les parties par thème :

| Groupe | Partie | Ce qu'on y fait |
| --- | --- | --- |
| GitHub | 🔑 Compte & équipe | Jeton GitHub, membres de l'équipe (★ = affiché par défaut), **＋ compte** pour un autre compte GitHub |
| | 📦 Repos suivis | Ajouter / retirer des repos. Pastilles par repo : **PRs**, **Branches**, **GitHub** (ligne dans la carte Repos de l'onglet GitHub), **Accueil** (carte dans Raccourcis) |
| | 🐙 Onglet GitHub | Fréquence de rafraîchissement, carte Renovate |
| | 💻 Dépôts locaux | Dossiers où chercher tes clones |
| Connexions | 🏕 Basecamp | Connexion Basecamp (lecture seule) |
| La page | 🗂 Onglets perso | Onglets vers un site ou un fichier du disque, affichés dans homedash ou ouverts à part |
| | 🎛 Affichage & notifications | Presets (49", 34", MacBook Pro), thème, horloge, notifications, largeur de la page, colonnes GitHub / Local |
| Données | 💾 Sauvegardes | Instantané, export, restauration (l'état actuel est toujours sauvegardé avant) |

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

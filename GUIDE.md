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

**Notifications Basecamp** : dans la cloche 🔔 (filtre *Basecamp*). Ouvrir la cloche ne les marque pas
lues : c'est en les ouvrant dans Basecamp qu'elles partent.

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

**☰ Catalogue** (Réglages → Onglets perso) : mails, messageries, réseaux sociaux, IA et outils courants,
ajoutés d'un clic. Le **＋** en bas de la barre de gauche (ou **＋ Ajouter un onglet**) ajoute
un onglet vers **un site** (`https://…`) ou **un fichier / dossier de ton disque**
(`~/Documents/procédure.pdf`, ou **📁 Parcourir**). Dans Réglages, un onglet par ligne : un clic l'ouvre
pour le modifier. Adresse, nom (proposé d'après l'adresse), icône (un emoji, ou le lien d'une image
`https://…/logo.png`, remise à l'échelle des autres ; vide = celle du site), dossier, compte, et ce que
fait un clic (par défaut, dans homedash). Les réglages de chaque onglet s'affichent aussi en pastilles
sur sa ligne (▣ homedash / ↗ navigateur, 💤 veille, ⚡ chargement au démarrage, 🔗 liens) : un clic
sur une pastille la bascule, sans ouvrir l'onglet.

- **dans homedash** : le site ou le fichier s'affiche sous la barre d'onglets. Revenir sur l'onglet ne
  le recharge pas (↻ pour ça). Dans un navigateur, ça marche pour les fichiers (PDF, images, texte, HTML,
  dossiers) et les sites qui l'acceptent : **Gmail, Google Chat, GitHub et la plupart des grands sites le
  refusent** (page blanche, ↗ *ouvrir à part* reste possible). Dans l'**appli de bureau** (plus bas),
  tous s'affichent, avec leurs non-lus en pastille.
- **ouvrir à part ↗** : l'onglet est un raccourci, il ouvre le site dans un onglet du navigateur.

**Barre de gauche** (dès qu'il y a un onglet perso), comme les serveurs Discord : **⚡** ramène à
homedash et ses onglets du haut, puis une icône par onglet perso, avec sa pastille rouge de non-lus. Un
trait à gauche de l'icône montre celui qui est ouvert. Un site (ou Réglages) ouvert depuis la barre a
toute la page : la barre d'onglets de homedash revient avec ⚡.

- **Dossiers**, comme Discord : glisse une icône **sur** une autre pour les réunir dans un nouveau
  dossier (nom et couleur demandés), **sur** un dossier pour l'y ranger, **sur le haut** d'une icône pour
  la placer avant, **tout en bas** pour la sortir de son dossier. Clic = replier / déplier ; replié, il
  montre ses quatre premières icônes et le total des non-lus. Clic droit : nom et couleur, supprimer
  (ses onglets restent). Clic droit sur une icône : dossier, compte, recharger, ouvrir dans le navigateur.
- En bas : **⚙ Réglages** (il quitte alors la barre du haut), **＋** ajouter, **» / «** noms affichés ou icônes seules, **✕** cacher la barre (les onglets
  perso reviennent dans la barre du haut, avec le même clic droit, le glisser-déposer, le ✕ des
  éphémères et ⧉ ; la languette **»** à gauche de l'écran la rouvre). Ces choix
  et les dossiers repliés sont propres à chaque navigateur ou appli.

**Comptes** (appli de bureau), comme les conteneurs de Firefox : un compte a un nom et une couleur, et
ses onglets partagent leur propre connexion. YouTube, Gmail et Claude sur « pro » sont connectés au
compte pro, les mêmes sur « perso » au compte perso, côte à côte. Sans compte, un onglet utilise la
connexion commune. Créer un compte : clic droit sur une icône → *Nouveau compte…*, ou Réglages → Onglets
perso. Un liseré de sa couleur entoure l'icône de ses onglets. Renommer ne déconnecte pas ; supprimer
renvoie ses onglets sur la connexion commune. Dans un navigateur, sans effet : il n'a qu'une connexion
par site.

Les fichiers sont lus, jamais modifiés, et limités à ton dossier personnel (ni fichiers cachés, ni le
`data/` de homedash). L'ordre se règle en glissant les icônes de la barre de gauche ; dans Réglages,
**Enregistrer** (`⌘S`).

Une page web ne peut ni afficher un site qui le refuse, ni lire ce qu'il affiche (ses non-lus) : c'est
ce que l'appli de bureau débloque.

### 🔔 Notifications (la cloche, en haut à droite)

CI cassée ou réparée, PR mergée, branche locale à nettoyer… et, si Basecamp est connecté, tes
notifications Basecamp non lues, dans la même cloche (filtre *Tout / Activité / Basecamp*). La pastille
rouge additionne les deux. Ouvrir la cloche efface les nouveautés de l'activité ; une notif Basecamp
reste comptée tant qu'elle n'est pas lue dans Basecamp. **vider** efface le journal (après
confirmation) ; **Tout voir** = l'historique.

Notifications bureau : **désactivées par défaut**, à activer en bas du panneau de la cloche.

### Journal de performance (facultatif)

Réglages → Affichage & notifications → *Journal de performance* (désactivé par défaut). Activé, homedash
note jour par jour dans `data/perf/` ce qu'il consomme : mémoire et CPU du serveur, de l'appli de bureau
et **de chaque onglet**, opérations lentes, pics (avec l'action qui les a précédés), temps de chargement
des onglets, routes les plus sondées. Gardé 30 jours ; la place prise s'affiche dans Réglages, avec un
avertissement au-delà de 50 Mo, et un bouton pour vider. Résumé : `python3 scripts/perf-report.py`.
Uniquement des chiffres et des noms d'onglets ou de domaines : aucune adresse complète, aucun contenu.

### Version et nouveautés (en haut à droite)

Le numéro de version (`v1.7.0`) ouvre une fenêtre avec le changelog : ce qui a changé à chaque version. Quand une version
plus récente est publiée, il passe en bleu (`⬆ 1.8.0`) et la cloche le signale ; la fenêtre donne la
commande à copier (`git pull && docker compose up -d --build`). Tes données sont sauvegardées
automatiquement avant la mise à jour (Réglages → Sauvegardes, instantané « avant-x-y-z »). Juste dessous, l'**appli
de bureau** : le lien vers sa dernière version, ou la commande pour la construire sur ton Mac.

## L'appli de bureau (Mac)

Une fenêtre homedash à part, dans le Dock, comme Discord ou Slack. Elle **affiche** le homedash de ton
container : Docker reste nécessaire et tourne comme avant (`docker compose up -d`, il redémarre seul avec
Docker Desktop). L'appli ne remplace que l'onglet du navigateur ; container arrêté, elle le dit et
réessaie toute seule.

Ce qu'elle apporte :

- **Tous les onglets perso s'affichent**, Gmail, Google Chat et GitHub compris (dans un navigateur, ces
  sites refusent d'être affichés dans une page). Tu t'y connectes une fois, dans l'onglet : la connexion
  est gardée, et vaut pour tous les onglets Google.
- **Pastilles** : le nombre que le site met dans son titre (« Boîte de réception (3) », « (12) WhatsApp »)
  devient une pastille rouge sur l'onglet, même fermé. Google Chat, dont le titre ne compte rien, est lu
  dans sa page (le total de *Accueil*). La pastille est gardée au redémarrage de l'appli et pendant la
  veille, jusqu'à ce que le site rechargé en donne une nouvelle. Elle suit le site aussitôt (lire un
  message l'efface), sauf juste après le chargement d'un onglet caché : 20 s avant d'effacer, le temps
  que le site affiche son compteur. Gmail ne compte que la boîte de réception :
  les non-lus de ses sections ou libellés n'y sont pas. Leur total, plus les non-lus de la cloche,
  s'affiche sur l'**icône du Dock**.
- Les liens s'ouvrent dans ton **navigateur par défaut** (Firefox…). Dans un onglet perso : ← pour revenir
  en arrière, ↗ pour ouvrir la page en cours dans le navigateur.
- **`⌘R`** recharge homedash (après une mise à jour du container), onglets perso compris : « ↻ homedash
  rechargé » le confirme. **`⇧⌘R`** recharge seulement le site ouvert ; un trait bleu file en haut de
  l'onglet pendant le chargement.
- **Liens entre onglets** : un lien X cliqué dans Google Chat (ou ailleurs) s'ouvre dans ton onglet X,
  s'il y en a un, au lieu du navigateur ; avec deux onglets du même site, celui du même compte que
  l'onglet d'où vient le lien. Par onglet (Réglages → Onglets perso) : couper ce comportement, ou capter
  d'autres domaines (`twitter.com` pour X est déjà prévu, comme `youtu.be` pour YouTube).
- **Clic droit dans un site** : sur un lien, l'ouvrir dans un onglet de ce site, dans un **onglet
  éphémère** (avec le compte de ton choix), dans le navigateur, ou copier le lien ; sur du texte,
  copier ou le rechercher ; dans un champ, couper / copier / coller ; sur une image, la copier ; sinon,
  précédent / suivant / recharger.
- **Précédent / suivant** : boutons latéraux de la souris (MX Master compris, via le geste de
  balayage de Logi Options+), ⌘[ / ⌘], ou ⌘← / ⌘→ hors d'un champ de saisie. Dans un site, recule
  dans ses pages ; arrivé à la première, ou ailleurs dans homedash, revient à l'onglet d'avant. Dans un
  navigateur, les boutons de la souris font de même (le clavier garde ceux du navigateur).
- **Onglets éphémères** : en bas de la barre de gauche, contour pointillé. Ouverts depuis un lien (clic
  droit), ou vierges avec **⧉** en bas de la barre (le compte est demandé s'il y en a) : leur en-tête a
  une **barre d'adresse** (une adresse ou une recherche, puis Entrée). ✕ au survol de l'icône pour
  fermer, clic droit → *Garder dans mes onglets*. Ils disparaissent au redémarrage de l'appli.
- **Éphémères gardés** : clic droit → *Garder ouvert* ; il survit au redémarrage, rangé avec les
  éphémères, et rouvre sur la page où tu l'as gardé (*Garder cette page* pour la changer). *Ne plus
  garder* le rend éphémère, *Ajouter à mes onglets* en fait un onglet perso. Listés dans Réglages →
  Onglets perso.
- **Mémoire** : au démarrage, seuls les sites à non-lus (mails, messageries, réseaux sociaux) sont
  chargés ; les autres le sont au premier clic. Réglable par onglet (Réglages → Onglets perso, « Au
  démarrage de l'appli »).
- **Son** : 🔊 sur l'onglet (ou dans le coin de son icône) qui joue du son ; un clic dessus le coupe
  (🔇), ou clic droit → *Couper le son*.
- **Mise en veille** (au choix, par onglet, éphémère compris : clic droit → *Mettre en veille si
  inutilisé*, ou sa pastille 💤 dans Réglages → Onglets perso) : laissé de côté plus de
  5 min (délai réglable dans la même page : 5 min, 15 min, 30 min, 1 h ou au choix), l'onglet est déchargé — mémoire libérée, icône grisée avec 💤 — et rechargé au clic. Pas par
  défaut : en veille, il ne reçoit ni notifications ni non-lus (sa pastille reste celle d'avant la veille).
- Un menu (clic droit, cloche…) se ferme par un clic n'importe où, site compris, ou Échap.
- Fermer la fenêtre la cache (l'appli continue de compter) ; *homedash → Quitter* (`⌘Q`) la ferme.

**Installer**, au choix :

- **Le plus simple** : dans le dossier homedash, `sh desktop/build-local.sh --install`. L'appli est
  construite sur ton Mac (Docker suffit, pas besoin de Node), pour le bon processeur, et copiée dans
  Applications. Construite sur place, macOS ne la bloque pas.
- **Le `.dmg`** de la [dernière release](https://github.com/davidgennaoui/homedash/releases/latest) du
  repo sur GitHub (`-arm64` pour un Mac Apple
  Silicon, `-x64` pour un Mac Intel) : glisse homedash dans Applications. Téléchargée et non signée par
  Apple, macOS la bloque au premier lancement : *Réglages Système → Confidentialité et sécurité → Ouvrir
  quand même* (une seule fois), ou `xattr -dr com.apple.quarantine /Applications/homedash.app`.

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


## Recherche

La recherche (`/` ou `⌘K`) sert aussi de barre d'adresse :

- **une adresse** (`exemple.com`, `localhost:3000`, `https://…`) : Entrée l'ouvre ;
- **un raccourci** en premier mot : `g` Google, `gh` GitHub, `yt` YouTube, `w` Wikipédia, `maps`,
  `tr` (traduction), `mdn` — `gh homedash` cherche sur GitHub ;
- sinon, en dernière ligne, **Rechercher sur Google** ;
- **tes onglets** (« gmail » → y aller), et **des actions** : Réglages, GitHub, Activité, thème clair /
  sombre, nouvel onglet éphémère… ;
- **les pages déjà vues** dans tes onglets (appli de bureau), par titre ou adresse, comme l'historique
  d'un navigateur. Gardé dans ce navigateur seulement ; action *Effacer l'historique des pages*.

Dans l'appli de bureau, ces adresses, comme tous les liens de homedash (raccourcis, GitHub, Basecamp…),
s'ouvrent **dans homedash** : l'onglet du site s'il y en a un, sinon un onglet éphémère. ⌘-clic pour le
navigateur ; tout envoyer au navigateur : Réglages → Onglets perso, *Liens de homedash*. **Clic droit**
sur n'importe quel lien (raccourcis, GitHub, Basecamp…) : *Ouvrir* dans l'onglet du site, dans un onglet
éphémère (une pastille par compte) ou dans le navigateur, ou copier le lien.
## Raccourcis clavier

| Touche | Action |
| --- | --- |
| `/` ou `⌘K` | Rechercher : liens, onglets, actions, repos, PRs, branches, dépôts locaux, infos, notes, pages visitées. La carte de la sélection s'affiche à droite. Aussi une barre d'adresse (voir *Recherche*) |
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

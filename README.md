# homedash

Ta page d'accueil de bureau : tes liens et notes, ton code (GitHub et dépôts locaux), Basecamp, et tes
sites (Gmail, Chat, Claude…) dans une barre à gauche, avec leurs non-lus. Pour Mac et Windows,
mise à jour automatique.

![homedash : un site ouvert dans l'appli, barre de gauche et non-lus](docs/screenshots/site-dans-un-onglet.jpg)

| Raccourcis | GitHub | La cloche |
| --- | --- | --- |
| ![](docs/screenshots/accueil.jpg) | ![](docs/screenshots/github.jpg) | ![](docs/screenshots/cloche.jpg) |

Le site : **[lepetitpaco.github.io/homedash](https://lepetitpaco.github.io/homedash/)** · plus de captures : [docs/APERCU.md](docs/APERCU.md).

## Ce que ça fait

- **Raccourcis** : liens, tuiles des plus utilisés, notes, infos à copier (Wi-Fi, IP…).
- **Mes sites** : tes sites dans l'appli, avec leurs non-lus, rangés en dossiers, plusieurs comptes par site.
- **GitHub et Local** : branches, PRs, CI et builds en cours ; les branches de ton disque qu'on peut supprimer sans risque.
- **Basecamp et Trello** : tes tâches et tes cartes en retard ou à venir, tes tableaux Trello tels quels ;
  une tâche ou une carte devient une issue GitHub, et son rapport revient en commentaire.
- **La cloche** : CI cassée ou réparée, PR mergée, nouvelle version…
- **Recherche** (`/` ou `⌘K`) : tout ce qui précède, plus le web.

## Installer

Pas à pas : **[la page Installer](https://lepetitpaco.github.io/homedash/installer.html)**.


1. Télécharge la **[dernière version](https://github.com/lepetitpaco/homedash/releases/latest)** :
   `…-arm64.dmg` (Mac M1, M2…), `…-x64.dmg` (Mac Intel) ou `…-setup.exe` (Windows).
2. Mac : ouvre le `.dmg`, glisse homedash dans Applications. Windows : lance le `setup.exe`.
3. **Premier lancement** (une fois, l'appli n'est pas signée) :
   - **Mac** : « Apple n'a pas pu confirmer… » → **Terminé**, puis *Réglages Système → Confidentialité
     et sécurité*, tout en bas → **Ouvrir quand même**.
   - **Windows** : « Windows a protégé votre ordinateur » → **Informations complémentaires** →
     **Exécuter quand même**.

Ensuite tout se règle dans **⚙ Réglages** : la carte *👋 Pour commencer* de l'accueil te guide (sites,
jeton GitHub, dossiers de code, Basecamp, Trello). Les mises à jour arrivent toutes seules.

## Bon à savoir

- **Tes données restent sur ta machine** (`~/Library/Application Support/homedash` sur Mac,
  `%APPDATA%\homedash` sous Windows), sauvegardées chaque jour. Changer de machine : *Réglages →
  Sauvegardes → Export complet* (chiffré).
- **Rien n'est collecté** : ni compte, ni statistiques, ni pisteur. Les jetons (GitHub, Basecamp, Trello) ne
  quittent jamais l'appli. Le détail : **[PRIVACY.md](PRIVACY.md)**.
- **Rien n'est modifié sans toi** : l'onglet Local lit tes dossiers sans y toucher ; Basecamp et Trello ne
  sont lus qu'en lecture, sauf le rapport que tu publies.
- **Mode d'emploi** : *Réglages → Aide → Guide*, ou **[GUIDE.md](GUIDE.md)**.
- **Un souci ?** Ouvre une [issue](https://github.com/lepetitpaco/homedash/issues/new).

Développer homedash : **[DEVELOPING.md](DEVELOPING.md)**.

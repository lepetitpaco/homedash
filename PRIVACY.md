# Confidentialité

**homedash ne collecte rien.** Pas de compte, pas de serveur homedash en ligne, pas de statistiques
d'usage, pas de pisteur, pas de publicité. Tout reste sur ta machine.

## Ce qui est stocké, et où

Dans le profil de l'appli : `~/Library/Application Support/homedash` (Mac), `%APPDATA%\homedash`
(Windows).

| Quoi | Où |
| --- | --- |
| Liens, notes, réglages, compteurs d'ouverture, historique de la cloche | `data/` |
| Jetons GitHub, Basecamp (et Trello) | `data/secrets.json`, lisible par toi seul ; jamais envoyés à la page ni mis dans une sauvegarde simple |
| Connexions de tes sites (cookies de Gmail, Chat…) | le profil de l'appli, comme dans un navigateur |
| Sauvegardes automatiques | `data/backups/` |

L'**export complet** (pour changer de machine) emporte tout, jetons compris, **chiffré** par le mot de
passe que tu choisis. Désinstaller l'appli et supprimer ce dossier efface tout.

## Ce qui sort de ta machine

Uniquement vers les services que tu branches, avec tes propres accès :

| Vers | Pourquoi |
| --- | --- |
| GitHub (`api.github.com`) | Tes repos, branches, PRs, workflows en cours ; la création d'une issue quand tu la demandes ; la recherche de mises à jour (Releases de homedash) |
| Basecamp (`launchpad.37signals.com`, `*.basecampapi.com`) | Tes tâches, en lecture ; le rapport que tu publies, au clic |
| Trello (`api.trello.com`), si branché | Tes tableaux, en lecture ; le rapport que tu publies, au clic |
| Le service d'icônes (Google Favicons par défaut) | Le nom de domaine de tes liens, pour afficher leur icône. Désactivable : *Réglages → Affichage → Icônes des sites* |
| jsDelivr (`cdn.jsdelivr.net`) | Les icônes des sites ajoutés depuis le catalogue, ou ceux auxquels tu appliques la configuration recommandée |
| Trello (`trello-members.s3.amazonaws.com`), si branché | Les photos de profil des membres de tes tableaux |
| Tes sites et tes liens | Comme un navigateur : quand tu les ouvres, ou pour le voyant d'un lien *surveillé* |

Rien d'autre : rien n'est envoyé à l'auteur de homedash, ni à personne en dehors de ce tableau.

## Ta machine

- L'appli **n'ouvre aucun port** : rien n'écoute sur ta machine. Seule l'option *Accès depuis le
  navigateur* (désactivée par défaut) ouvre `localhost:7777`, joignable depuis ta machine seulement.
- L'onglet **Local lit** tes dossiers de code sans rien y écrire ni lancer de commande.
- L'option **Docker** (désactivée par défaut) lit la liste de tes containers sur ta machine, sans rien y changer ni l'envoyer ailleurs.
- Le code est ouvert : tout ceci se vérifie dans ce dépôt (`server/`, `desktop/`).

Une question : [ouvre une issue](https://github.com/lepetitpaco/homedash/issues/new).

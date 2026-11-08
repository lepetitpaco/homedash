My confidence level of correctness now: 72%

# Correctness (100%)
- Pastilles en haut, rangées multiples, aucun défilement horizontal (mesuré 420 → 1440 px, deux thèmes).
- Menu Disposition : Onglets en haut, retour par une disposition de gauche, choix enregistré et relu au rechargement.
- Tailles des pastilles (25/30/37 px), dossiers en pastilles avec somme des non-lus, Docker en dossier.
- Masquage auto gauche et haut : caché au repos, montré au survol du bord, recaché en sortant, y compris après un clic.
- ⚡ en dossier dans la barre de gauche : un clic par onglet, toutes dispositions alignées à 1 px près.
- Alignement dossier / sites en taille Petit corrigé (24 px partout).
- Réglages : accès navigateur dans Fonctionnalités, journal de performance activable depuis Aide, plus de doublon dans Affichage ; `--cat-w` distinct de `--rail-w`, config inchangée.
- Style des onglets pastilles (défaut validé par Paco) / soulignés, rendu d'avant retrouvé.

# Deal breakers
- Jamais vu dans l'appli de bureau : le survol du bord pour faire revenir une barre masquée, avec un site (webview) affiché dessous, n'est vérifié que dans un navigateur. L'appli « homedash dev » tourne sans port de débogage ; la relancer avec `--remote-debugging-port=9333` couperait la session de Paco. À tester par Paco, ou relance de l'appli de dev sur son accord.

# Suggestions (enhancements only)
- `ResizeObserver` recréé à chaque rendu : dépendances explicites.
- Commentaire `TabLook` sans numéro de version supposé.
- Aide du bloc « Barre de gauche et onglets » : citer style et taille des onglets.
- Commentaire sur l'id `f:…` des dossiers du haut (affichage seulement).
- Commit : `Touche : Affichage (onglets du haut en pastilles)`.

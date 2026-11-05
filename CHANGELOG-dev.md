# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/feature/non-lus-barre-haut

- Barres masquées (*Masquer automatiquement*) : les sites qui ont des non-lus apparaissent à gauche de la cloche, avec
  leur compteur (les 3 plus chargés, puis *+N* qui ouvre la liste) ; un clic ouvre le site. Rien à lire, rien
  d'affiché ; barres visibles, rien ne change. Site en veille : compteur estompé. Issue #130.

## paco/feature/mode-focus

- Mode focus sur un site : ⤢ dans la barre du haut ou ⌘⇧F (Ctrl+Maj+F), même le clavier dans le site. Le site prend
  toute la fenêtre ; la barre du haut revient au survol du bord haut (ou ⌘K), celle de gauche au bord gauche. ⤡,
  ⌘⇧F ou quitter le site en sortent. Sans réglage. Issue #144.

## paco/feature/extensions-sites

- Appli de bureau, *Réglages → Mes sites → Extensions* : des extensions de navigateur non empaquetées (un dossier avec
  `manifest.json`) tournent dans les sites, tous comptes compris. Ajouter (choix du dossier), retirer, recharger les
  sites ouverts ; état de chaque extension (chargée, ou l'erreur). Propre à la machine, rien par défaut. Ce qu'elle fait
  dans la page marche ; ni icône, ni popup, ni clic droit, ni `storage.sync`. Issue #132.


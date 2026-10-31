# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/feature/ci-en-cours

- Onglet GitHub (#86) : carte *En cours*, visible seulement quand un workflow GitHub Actions tourne sur un repo suivi,
  toutes branches, avec le détail de ses jobs. Pas de notification.

## paco/fix/maj-windows-version

- Mise à jour sous Windows (#82) : la version installée est bien reconnue (l'exe écrit 2.2.4.0). Le script ne rouvre plus
  l'appli inutilement après une réussite, et voit un installateur qui finit en code 0 sans rien remplacer.

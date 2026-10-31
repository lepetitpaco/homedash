# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/fix/maj-windows

- Mise à jour sous Windows (#82) : si l'installation échoue, homedash se rouvre et le dit au démarrage suivant, avec
  la raison et un lien vers la page des versions. Étapes notées dans `update.log`.
- L'installation attend la fermeture de tous les processus de l'appli et se lance hors de son dossier. Les
  téléchargements des anciennes tentatives sont supprimés au démarrage.
- À mettre dans le CHANGELOG : le passage vers cette version utilise encore l'ancien code et peut échouer pareil.
  Dans ce cas, installer `setup.exe` à la main.

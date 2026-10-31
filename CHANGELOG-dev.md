# Journal du dev

Où en est le dev : ce qui est fait sur les branches et pas encore publié. Ce fichier n'est pas livré dans
l'appli et ne déclenche aucune version. Règles : `CLAUDE.md`, « À chaque livraison ».

## paco/fix/maj-windows-lancement

- Mise à jour sous Windows (#82) : le script d'installation ne démarrait jamais. Il démarre maintenant, et homedash ne
  se ferme que si c'est prouvé ; sinon il reste ouvert et le dit.
- À mettre dans le CHANGELOG : le bouton des versions 2.2.1 et 2.2.2 ne peut pas installer cette version sous Windows.
  Tout PC Windows doit passer une fois par `setup.exe`.
- Test Windows en CI sur les pull requests qui touchent la mise à jour.

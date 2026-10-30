# AGENTS.md — pour les IA (Cursor, Codex, Copilot…)

**Lis `CLAUDE.md` en entier avant toute modification** : c'est lui qui fait foi (règles du code,
fonctionnalités principales, livraison). `ARCHITECTURE.md` donne les fichiers et les routes.

L'essentiel, au cas où :

- homedash sert à toute l'équipe ; ce qui est poussé sur `main` arrive chez chacun à sa prochaine mise
  à jour.
- **Avant de toucher une fonctionnalité principale** (liste dans `CLAUDE.md`), arrête-toi et préviens :
  « ⚠️ Attention : ceci change *<fonctionnalité>* : *<effet pour les utilisateurs>*. Tout le monde
  l'aura à sa prochaine mise à jour. On continue ? » N'écris rien sans un « oui » explicite.
- Zéro dépendance au runtime (Node seul pour `server/`, React seul, Electron seul pour `desktop/`) ; l'onglet Local n'écrit ni n'exécute rien ;
  les jetons ne quittent jamais `data/secrets.json` ; `data/` n'est jamais écrasé ni versionné.
- Une vague de travail = une branche locale ; un push = **une** version (une entrée de `CHANGELOG.md`,
  un tag), écrite au moment de fusionner, jamais une par commit.
- Pas de push direct sur `main` : une pull request, approuvée par le propriétaire. Avant :
  `git pull --rebase`, `git fetch --tags`, typecheck et tests au vert ; jamais de `push --force`.
- La 1.x (Python, `backend/`, Docker sur :7777) n'existe plus : traduis vers `server/*.ts` au lieu de la
  recréer. Correspondances dans `CLAUDE.md` (« Depuis la 1.x ») et `docs/MIGRATION-2.0.md`.

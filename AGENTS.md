# AGENTS.md — pour les IA (Cursor, Codex, Copilot…)

**Lis `CLAUDE.md` en entier avant toute modification** : c'est lui qui fait foi (règles du code,
fonctionnalités principales, livraison). `ARCHITECTURE.md` donne les fichiers et les routes.

L'essentiel, au cas où :

- homedash sert à toute l'équipe ; ce qui est poussé sur `main` arrive chez chacun à sa prochaine mise
  à jour.
- **Avant de toucher une fonctionnalité principale** (liste dans `CLAUDE.md`), arrête-toi et préviens :
  « ⚠️ Attention : ceci change *<fonctionnalité>* : *<effet pour les utilisateurs>*. Tout le monde
  l'aura à sa prochaine mise à jour. On continue ? » N'écris rien sans un « oui » explicite.
- Zéro dépendance au runtime (Python stdlib, React seul) ; l'onglet Local n'écrit ni n'exécute rien ;
  les jetons ne quittent jamais `data/secrets.json` ; `data/` n'est jamais écrasé ni versionné.
- Avant de pousser : `git pull --rebase`, `git fetch --tags`, typecheck et tests au vert ; jamais de
  `push --force`.

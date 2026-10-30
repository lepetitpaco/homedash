# Review: Onglet Trello

- Rounds: 1
- Started: 2026-10-27

## Round 1 · r-c4e1

- Date: 2026-10-27
- By: pjpoirson
- Diff: `main...HEAD` plus the working tree
- Axes: code
- Verdict: blocked
- Score: not scored

### Findings

- `backend/trello.py:532` : une pièce jointe `https` au type image entre dans `_allowed`, puis `attachment` la télécharge avec l'en-tête OAuth du compte. Une carte peut pointer vers un autre hôte : le jeton part avec la requête, et une redirection est suivie. → n'accepter que `trello.com` et `api.trello.com`, refuser toute autre adresse avant la requête, et ne pas suivre une redirection hors de ces hôtes. — 🔴 critical, security
- `backend/trello.py:549` : l'image est lue en entier, sans plafond. → couper au-delà d'une taille maximale, comme les pièces Basecamp. — 🟡 major, security
- `src/components/TrIssueHost.tsx:91` : le corps de l'issue reprend `need`, rempli une seule fois. Cocher ou décocher un échange ensuite ne change pas ce qui est créé. → composer le corps au moment de créer, à partir du texte édité et des échanges encore cochés. — 🟡 major, frontend
- `src/components/TrelloView.tsx:109` : un seul champ « rapport final » est partagé par toutes les issues. Les précisions de l'une s'écrivent dans le prompt de l'autre. → un texte par issue. — 🟡 major, frontend

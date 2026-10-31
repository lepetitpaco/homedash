# Phase 2 : Entrées : recherche, cloche, copie

**Objectif** : chaque chemin vers la fenêtre l'ouvre sur le bon contenu.

- Recherche : `💬 Voir la tâche`, `Voir la carte`, `Créer une issue` depuis `SearchPreview`, recherche d'un commentaire.
- Cloche : « Rapport prêt » mène à la liste Issues du bon service ; `tr-task` ouvre la carte.
- Copier la commande, Copier le prompt : le libellé confirme et le presse-papiers contient le texte.

**Validation** : parcours par CDP dans l'appli de dev ; corrections dans `src/App.tsx`, `src/components/SearchPreview.tsx`, `src/components/IssueComposer.tsx` si besoin.

# Essai sur un vrai compte Trello — 2026-10-30

Page de dev (`docker-compose.dev.yml`, :7778), données copiées de `data/` dans `data-dev/` (converties 1.34.1 → 2.0.1).

| Étape | Résultat |
| --- | --- |
| Connexion (clé + jeton repris de l'essai #62) | ✅ compte `pjpoirson`, aucune erreur |
| Tableaux, colonnes, fonds | ✅ 6 tableaux, 490 cartes, colonnes dans l'ordre Trello, fonds affichés |
| Issues liées retrouvées | ✅ #583 et #572 (avec rapport), une seule lecture par repo |
| Fiche d'une carte et image jointe | ✅ `/api/trello/file` → 200 `image/png`, 784 094 octets ; route `trello.com/1/…/download/…` servie sans redirection |
| Repos où créer les issues (Réglages → Trello) | ✅ seuls les repos cochés proposés |
| Créer une issue depuis une carte | ✅ issue créée, marqueur `homedash:tr` |
| Publier le rapport, deux clics | ✅ un seul commentaire sur la carte (`tr_posted.json` : une entrée) |

Corrections nées de l'essai : aucune. La piste `api.trello.com` / redirection S3 (phase 4, tâche 3) n'a pas été nécessaire.

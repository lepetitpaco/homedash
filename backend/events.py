"""Journal des événements — ce qui a changé, gardé au-delà de la notification.

Une notification système disparaît dès qu'on la chasse : elle répond à « regarde
maintenant », jamais à « qu'est-ce qui s'est passé pendant que je ne regardais
pas ». C'est cette seconde question que la cloche (et son historique) traite, et elle exige
un journal.

Le journal est tenu par le **serveur**, et pas par le navigateur, pour trois
raisons qui vont dans le même sens : le serveur tourne déjà en continu (fetch
GitHub toutes les 15 s, surveillance des `.git` toutes les 2 s), donc il voit
les transitions même sans page ouverte ; le journal survit au rechargement ; et
il est le même dans tous les navigateurs — c'est exactement le reproche fait au
`localStorage` dans ARCHITECTURE.md quand notes et compteurs y vivaient.

Le front s'en sert pour DEUX choses : peupler la page, et décider quoi notifier.
Une seule implémentation du diff, donc la cloche et la page ne peuvent pas
raconter deux histoires différentes.

Le `seq` est un entier strictement croissant, jamais réutilisé, y compris après
un vidage. C'est lui — et pas l'horodatage — que le front compare pour savoir ce
qu'il n'a pas encore vu : deux événements du même cycle partagent la même
seconde, et un `ts` ne les départagerait pas.
"""

import sys
import threading
import time

import store

# Deux jours de bavardage bien tassé. Au-delà, ce n'est plus un journal qu'on
# relit mais un historique qu'on fouille, et ce n'est pas ce qu'on cherche ici.
MAX = 300

_lock    = threading.Lock()
_journal = None          # {"seq": int, "events": [...]} — autorité en mémoire

def _load():
    """Relit le fichier une fois. Ensuite la mémoire fait foi : un seul process."""
    global _journal
    if _journal is None:
        try:
            raw = store.read(store.EVENTS, None)
        except ValueError:
            raw = None                     # fichier corrompu : on repart à vide
        if isinstance(raw, dict) and isinstance(raw.get("events"), list):
            _journal = {"seq": int(raw.get("seq") or 0), "events": raw["events"][:MAX]}
        else:
            _journal = {"seq": 0, "events": []}
    return _journal

def event(kind, level, source, title, body="", repo="", url="", tag="", sticky=False):
    """Construit un événement sans l'enregistrer — l'appelant en pousse un lot.

    `tag` est repris tel quel par la notification : deux onglets homedash ouverts
    remplacent la même notification au lieu d'en empiler deux.
    """
    return {
        "kind": kind, "level": level, "source": source,
        "title": title, "body": body, "repo": repo, "url": url,
        "tag": tag or f"{kind}:{repo}", "sticky": bool(sticky),
    }

def record(items):
    """Ajoute un lot en tête. Retourne le nombre effectivement enregistré."""
    items = [i for i in items if i]
    if not items:
        return 0
    with _lock:
        j   = _load()
        now = time.time()
        fresh = []
        for it in items:
            j["seq"] += 1
            fresh.append({**it, "seq": j["seq"], "ts": it.get("ts") or now})
        # le plus récent d'abord : le front affiche et tronque sans retourner
        j["events"] = list(reversed(fresh)) + j["events"]
        del j["events"][MAX:]
        try:
            store.write(store.EVENTS, j)
        except Exception as e:
            # Le journal en mémoire reste juste : un disque plein ne doit pas
            # faire échouer le cycle GitHub qui vient de l'alimenter.
            print(f"✗ Journal : {e}", file=sys.stderr, flush=True)
        seq = j["seq"]
    print(f"📓 Journal : +{len(fresh)} ({fresh[-1]['title']})" if len(fresh) == 1
          else f"📓 Journal : +{len(fresh)} événements → seq {seq}", flush=True)
    return len(fresh)

def payload(since=None, limit=MAX):
    """`since` = dernier `seq` connu du client, pour ne renvoyer que la suite."""
    with _lock:
        j    = _load()
        evs  = j["events"][:max(1, min(int(limit or MAX), MAX))]
        if since is not None:
            evs = [e for e in evs if e.get("seq", 0) > since]
        return {"events": evs, "seq": j["seq"], "total": len(j["events"])}

def clear():
    """Vide le journal mais **garde le compteur** : un `seq` réattribué ferait
    passer d'anciens repères côté front pour des nouveautés."""
    with _lock:
        j = _load()
        j["events"] = []
        store.write(store.EVENTS, j)
    return True

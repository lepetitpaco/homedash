"""Icônes des onglets perso, relayées par le serveur.

La page recadre chaque icône (marges transparentes retirées) pour les mettre
toutes à la même échelle ; pour lire ses pixels, le navigateur exige qu'elle
vienne de la page elle-même. Le serveur la demande donc au service de favicons
réglé dans la config (`ui.faviconProvider`, Google par défaut) et la garde en
mémoire.

On ne reçoit qu'un nom d'hôte, jamais une adresse : la destination est le
service de favicons. Si celui-ci ne connaît pas le site (un site privé), on
demande `/favicon.ico` au site lui-même, mais seulement pour un site d'un
onglet perso de la config : la page ne peut pas faire contacter n'importe quoi
au serveur.
"""

import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PROVIDER = "https://www.google.com/s2/favicons?domain={host}&sz=64"
TTL      = 7 * 24 * 3600     # une icône change rarement
FAIL_TTL = 3600              # un échec est retenté au bout d'une heure
MAX_SIZE = 256 * 1024
MAX_KEEP = 400               # au-delà, les plus anciennes sortent du cache

HOST = re.compile(r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$")

_lock  = threading.Lock()
_cache = {}                  # host -> (heure, octets ou None, type)


def _open(req):
    """Point de passage unique vers le réseau (remplacé dans les tests)."""
    return urllib.request.urlopen(req, timeout=6)


def valid_host(host):
    return bool(host) and bool(HOST.match(host))


def _fetch(host, provider):
    return _download(provider.replace("{host}", urllib.parse.quote(host)).replace(
        "{url}", urllib.parse.quote(f"https://{host}")))


def _download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "homedash"})
    try:
        with _open(req) as r:
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            body = r.read(MAX_SIZE + 1)
    except (urllib.error.URLError, OSError, ValueError) as e:
        # Visible dans `docker logs` : un réseau filtré ou un proxy d'entreprise
        # se voit ici (la page passe alors par le navigateur, cf. SiteIcon).
        # Une fois par hôte et par heure : le cache retient l'échec (FAIL_TTL).
        if isinstance(e, urllib.error.HTTPError):
            return None, ""             # le service ne connaît pas le site : normal
        host = urllib.parse.urlsplit(url).hostname or url
        print(f"⚠ favicon indisponible via {host} : {getattr(e, 'reason', e)}", file=sys.stderr, flush=True)
        return None, ""
    if not ctype.startswith("image/") or not body or len(body) > MAX_SIZE:
        return None, ""
    return body, ctype


def get(host, provider=None, own=()):
    """(octets, type) de l'icône de `host`, ou (None, "") si introuvable.
    `own` : hôtes des onglets perso, qu'on peut interroger directement."""
    host = (host or "").strip().lower()
    if not valid_host(host):
        raise ValueError("nom d'hôte invalide")
    provider = provider if isinstance(provider, str) and provider.startswith(("http://", "https://")) \
        else DEFAULT_PROVIDER
    now = time.time()
    with _lock:
        hit = _cache.get(host)
    if hit and now - hit[0] < (TTL if hit[1] else FAIL_TTL):
        return hit[1], hit[2]
    body, ctype = _fetch(host, provider)
    if not body and host in own:
        body, ctype = _download(f"https://{host}/favicon.ico")
    with _lock:
        _cache[host] = (now, body, ctype)
        if len(_cache) > MAX_KEEP:
            for old in sorted(_cache, key=lambda h: _cache[h][0])[: len(_cache) - MAX_KEEP]:
                del _cache[old]
    return body, ctype

"""Prépare l'import du backend pour les tests.

Importé en tête de chaque fichier de test, AVANT tout module du backend :
`store` lit `DATA_DIR` à l'import, et aucun test ne doit jamais toucher au
`data/` réel. Les jetons d'environnement sont retirés pour la même raison —
`github._find_token()` les lirait.
"""

import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT    = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"

DATA_DIR = Path(tempfile.mkdtemp(prefix="homedash-tests-"))
atexit.register(shutil.rmtree, DATA_DIR, ignore_errors=True)

os.environ["DATA_DIR"] = str(DATA_DIR)
for var in ("GH_TOKEN", "GITHUB_TOKEN"):
    os.environ.pop(var, None)

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import store  # noqa: E402

# Si `store` a déjà été importé ailleurs avec un autre DATA_DIR, on le force.
store.DATA_DIR = DATA_DIR

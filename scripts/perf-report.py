#!/usr/bin/env python3
"""Résumé du journal de performance (data/perf/, voir backend/perflog.py).

    python3 scripts/perf-report.py            # les 7 derniers jours
    python3 scripts/perf-report.py --days 30  # plus loin
    python3 scripts/perf-report.py --dir data-2/perf

Le même résumé que Réglages → Aide → Journal de performance
(backend/perfreport.py). Python stdlib seulement.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
import perfreport  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--dir", default=str(ROOT / "data" / "perf"))
    args = ap.parse_args()
    if not Path(args.dir).is_dir():
        raise SystemExit(f"{args.dir} introuvable : journal jamais activé (Réglages → Affichage → Journal de performance)")
    days = perfreport.report(args.dir, args.days)
    if not days:
        raise SystemExit(f"rien dans {args.dir} sur les {args.days} derniers jours")
    print(perfreport.text(days))


if __name__ == "__main__":
    main()

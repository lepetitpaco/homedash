#!/usr/bin/env python3
"""Résumé du journal de performance (data/perf/, voir backend/perflog.py).

    python3 scripts/perf-report.py            # les 7 derniers jours
    python3 scripts/perf-report.py --days 30  # plus loin
    python3 scripts/perf-report.py --dir data-2/perf

Par jour : le serveur (mémoire, CPU, appels GitHub, scans Local, opérations
lentes, routes les plus sondées), l'appli (mémoire, CPU, puis chaque onglet :
moyenne et pic), les temps de chargement des onglets, et les pics avec les
actions qui les ont précédés. Python stdlib seulement.
"""

import argparse
import json
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(path):
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except ValueError:
            pass        # ligne tronquée (arrêt brutal) : on l'ignore
    return out


def avg(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return sum(xs) / len(xs) if xs else 0


def top(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return max(xs) if xs else 0


def when(t):
    return t[11:16] if isinstance(t, str) and len(t) >= 16 else "?"


def server_day(rows):
    samples = [r for r in rows if r.get("kind") == "sample"]
    if not samples:
        return ["  (aucune mesure)"]
    ops = defaultdict(lambda: [0, 0.0, 0.0])
    routes = Counter()
    for s in samples:
        for k, o in (s.get("ops") or {}).items():
            ops[k][0] += o.get("n", 0)
            ops[k][1] += o.get("avg_s", 0) * o.get("n", 0)
            ops[k][2] = max(ops[k][2], o.get("max_s", 0))
        routes.update(s.get("requests") or {})
    lines = [
        f"  mémoire {avg(s.get('rss_mb') for s in samples):.0f} Mo (pic {top(s.get('rss_mb') for s in samples):.0f}), "
        f"CPU {avg(s.get('cpu_pct') for s in samples):.1f} % (pic {top(s.get('cpu_pct') for s in samples):.1f}), "
        f"{len(samples)} mesures",
        f"  GitHub {sum(s.get('github_calls', 0) for s in samples)} appels dont "
        f"{sum(s.get('github_304', 0) for s in samples)} « 304 » (gratuits) · "
        f"Local {sum(s.get('local_scans', 0) for s in samples)} scans du disque",
    ]
    for k, (n, total, worst) in sorted(ops.items()):
        lines.append(f"  {k:<9} {n:>5} fois, {total / n if n else 0:.2f} s en moyenne, pire {worst:.2f} s")
    slow = [r for r in rows if r.get("kind") == "slow"]
    for r in slow[:10]:
        lines.append(f"  ⚠ lent à {when(r.get('t'))} : {r.get('op')} {r.get('took_s')} s")
    if len(slow) > 10:
        lines.append(f"  … et {len(slow) - 10} autres opérations lentes")
    if routes:
        lines.append("  routes les plus sondées : " + ", ".join(f"{r} ×{n}" for r, n in routes.most_common(6)))
    return lines


def app_day(rows, page_rows):
    samples = [r for r in rows if r.get("kind") == "sample"]
    lines = []
    if samples:
        lines.append(
            f"  total {avg(s.get('total_mb') for s in samples):.0f} Mo (pic {top(s.get('total_mb') for s in samples):.0f}), "
            f"CPU {avg(s.get('cpu') for s in samples):.1f} % (pic {top(s.get('cpu') for s in samples):.1f}), "
            f"page homedash {avg(s.get('page_mb') for s in samples):.0f} Mo, {len(samples)} mesures")
        per = defaultdict(list)
        for s in samples:
            for t in s.get("tabs") or []:
                name = t.get("tab") or t.get("host") or "?"
                if t.get("account"):
                    name += f" ({t['account']})"
                per[name].append(t)
        if per:
            lines.append("  par onglet (mémoire moyenne / pic, CPU moyen, présent dans N mesures) :")
            for name, ts in sorted(per.items(), key=lambda kv: -avg(t.get("mb") for t in kv[1])):
                shared = " · processus partagé" if any(t.get("shared") for t in ts) else ""
                lines.append(f"    {name:<28} {avg(t.get('mb') for t in ts):>5.0f} / {top(t.get('mb') for t in ts):>5.0f} Mo"
                             f"  {avg(t.get('cpu') for t in ts):>5.1f} %  ×{len(ts)}{shared}")
    events = [r for r in rows if r.get("kind") == "event"]
    if events:
        lines.append("  appli : " + ", ".join(f"{e} ×{n}" for e, n in Counter(r.get("event") for r in events).items()))
    for sp in [r for r in rows if r.get("kind") == "spike"]:
        biggest = sorted(sp.get("tabs") or [], key=lambda t: -(t.get("mb") or 0))[:3]
        t0 = sp.get("t", "")
        try:
            at = datetime.fromisoformat(t0)
            before = [p for p in page_rows if p.get("kind") == "event"
                      and timedelta(0) <= at - datetime.fromisoformat(p.get("t", t0)) <= timedelta(seconds=90)]
        except ValueError:
            before = []
        lines.append(f"  ⚠ pic à {when(t0)} ({sp.get('reason')}, +{sp.get('grew_mb', 0)} Mo) : "
                     f"{sp.get('total_mb')} Mo, CPU {sp.get('cpu')} % — "
                     + ", ".join(f"{t.get('tab')} {t.get('mb')} Mo / {t.get('cpu')} %" for t in biggest)
                     + (f" — juste avant : {', '.join(str(p.get('event')) + ' ' + str(p.get('tab') or p.get('host') or '') for p in before)}" if before else ""))
    return lines or ["  (aucune mesure de l'appli : journal coupé, ou appli de bureau pas lancée)"]


def page_day(rows):
    events = [r for r in rows if r.get("kind") == "event"]
    if not events:
        return []
    lines = ["  actions : " + ", ".join(f"{e} ×{n}" for e, n in Counter(r.get("event") for r in events).most_common())]
    loads = defaultdict(list)
    for r in events:
        if r.get("event") == "load":
            loads[r.get("tab") or r.get("host") or "?"].append(r.get("ms"))
    if loads:
        lines.append("  chargements (moyenne / pire) :")
        for name, ms in sorted(loads.items(), key=lambda kv: -avg(kv[1])):
            lines.append(f"    {name:<28} {avg(ms) / 1000:>5.1f} s / {top(ms) / 1000:>5.1f} s  ×{len(ms)}")
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--dir", default=str(ROOT / "data" / "perf"))
    args = ap.parse_args()
    d = Path(args.dir)
    if not d.is_dir():
        raise SystemExit(f"{d} introuvable : journal jamais activé (Réglages → Affichage → Journal de performance)")
    first = date.today() - timedelta(days=args.days - 1)
    days = sorted({p.stem.split("-", 1)[1] for p in d.glob("*.jsonl")})
    days = [x for x in days if date.fromisoformat(x) >= first]
    if not days:
        raise SystemExit(f"rien dans {d} sur les {args.days} derniers jours")
    for day in days:
        load = lambda src: read(d / f"{src}-{day}.jsonl") if (d / f"{src}-{day}.jsonl").exists() else []
        server, app, page = load("server"), load("app"), load("page")
        print(f"\n## {day}")
        print("Serveur")
        print("\n".join(server_day(server)))
        print("Appli de bureau")
        print("\n".join(app_day(app, page)))
        if page:
            print("Page")
            print("\n".join(page_day(page)))


if __name__ == "__main__":
    main()

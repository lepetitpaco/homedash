"""Résumé du journal de performance (data/perf/, voir perflog.py), jour par jour.

Servi à la page (Réglages → Aide → Journal de performance, `GET /api/perf/report`)
et imprimé par `scripts/perf-report.py`. Par jour : le serveur (mémoire, CPU,
appels GitHub, scans Local, opérations lentes, routes les plus sondées), l'appli
(mémoire, CPU, chaque onglet : moyenne et pic), les temps de chargement des
onglets, et les pics avec les actions qui les ont précédés.
"""

import json
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from perflog import ASLEEP


def _read(path):
    out = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return out
    for line in lines:
        try:
            out.append(json.loads(line))
        except ValueError:
            pass        # ligne tronquée (arrêt brutal) : on l'ignore
    return out


def _avg(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return sum(xs) / len(xs) if xs else 0


def _top(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return max(xs) if xs else 0


def _when(t):
    return t[11:16] if isinstance(t, str) and len(t) >= 16 else "?"


def _server(rows):
    samples = [r for r in rows if r.get("kind") == "sample"]
    ops = defaultdict(lambda: [0, 0.0, 0.0])
    routes = Counter()
    for s in samples:
        for k, o in (s.get("ops") or {}).items():
            ops[k][0] += o.get("n", 0)
            ops[k][1] += o.get("avg_s", 0) * o.get("n", 0)
            ops[k][2] = max(ops[k][2], o.get("max_s", 0))
        routes.update(s.get("requests") or {})
    # Journaux d'avant la ligne « asleep » : une veille y passait pour une lenteur.
    slow = [r for r in rows if r.get("kind") == "slow" and (r.get("took_s") or 0) < ASLEEP]
    asleep = [r for r in rows if r.get("kind") == "asleep"
              or (r.get("kind") == "slow" and (r.get("took_s") or 0) >= ASLEEP)]
    return {
        "samples": len(samples),
        "mem_mb": round(_avg(s.get("rss_mb") for s in samples)),
        "mem_peak_mb": round(_top(s.get("rss_mb") for s in samples)),
        "cpu": round(_avg(s.get("cpu_pct") for s in samples), 1),
        "cpu_peak": round(_top(s.get("cpu_pct") for s in samples), 1),
        "github_calls": sum(s.get("github_calls", 0) for s in samples),
        "github_304": sum(s.get("github_304", 0) for s in samples),
        "local_scans": sum(s.get("local_scans", 0) for s in samples),
        "ops": [{"op": k, "n": n, "avg_s": round(total / n if n else 0, 2), "max_s": round(worst, 2)}
                for k, (n, total, worst) in sorted(ops.items())],
        "slow": [{"at": _when(r.get("t")), "op": r.get("op"), "took_s": r.get("took_s")} for r in slow],
        "asleep": [{"at": _when(r.get("t")), "op": r.get("op"), "took_s": r.get("took_s")} for r in asleep],
        "routes": [{"route": r, "n": n} for r, n in routes.most_common(6)],
    }


def _app(rows, page_rows):
    samples = [r for r in rows if r.get("kind") == "sample"]
    per = defaultdict(list)
    for s in samples:
        for t in s.get("tabs") or []:
            name = t.get("tab") or t.get("host") or "?"
            if t.get("account"):
                name += f" ({t['account']})"
            per[name].append(t)
    loads = defaultdict(list)
    for r in page_rows:
        if r.get("kind") == "event" and r.get("event") == "load":
            loads[r.get("tab") or r.get("host") or "?"].append(r.get("ms"))
    tabs = []
    for name, ts in per.items():
        base = name.split(" (")[0]
        ms = loads.get(base) or []
        tabs.append({
            "tab": name,
            "mb": round(_avg(t.get("mb") for t in ts)),
            "peak_mb": round(_top(t.get("mb") for t in ts)),
            "cpu": round(_avg(t.get("cpu") for t in ts), 1),
            "seen": len(ts),
            "load_s": round(_avg(ms) / 1000, 1) if ms else None,
            "loads": len(ms),
        })
    # Les plus gourmands sur la journée (moyenne × présence) : un site ouvert une
    # fois ne passe pas devant celui qui tourne toute la journée.
    tabs.sort(key=lambda t: -t["mb"] * t["seen"])
    spikes = []
    for sp in [r for r in rows if r.get("kind") == "spike"]:
        t0 = sp.get("t", "")
        try:
            at = datetime.fromisoformat(t0)
            before = [p for p in page_rows if p.get("kind") == "event"
                      and timedelta(0) <= at - datetime.fromisoformat(p.get("t", t0)) <= timedelta(seconds=90)]
        except ValueError:
            before = []
        spikes.append({
            "at": _when(t0),
            "reason": sp.get("reason"),
            "grew_mb": sp.get("grew_mb", 0),
            "total_mb": sp.get("total_mb"),
            "cpu": sp.get("cpu"),
            "tabs": [{"tab": t.get("tab"), "mb": t.get("mb"), "cpu": t.get("cpu")}
                     for t in sorted(sp.get("tabs") or [], key=lambda t: -(t.get("mb") or 0))[:3]],
            "before": [f"{p.get('event')} {p.get('tab') or p.get('host') or ''}".strip() for p in before][-12:],
        })
    events = Counter(r.get("event") for r in rows if r.get("kind") == "event")
    actions = Counter(r.get("event") for r in page_rows if r.get("kind") == "event")
    return {
        "samples": len(samples),
        "mem_mb": round(_avg(s.get("total_mb") for s in samples)),
        "mem_peak_mb": round(_top(s.get("total_mb") for s in samples)),
        "cpu": round(_avg(s.get("cpu") for s in samples), 1),
        "cpu_peak": round(_top(s.get("cpu") for s in samples), 1),
        "page_mb": round(_avg(s.get("page_mb") for s in samples)),
        "tabs": tabs,
        "spikes": spikes,
        "events": dict(events),
        "actions": dict(actions.most_common()),
    }


def days_available(perf_dir):
    d = Path(perf_dir)
    return sorted({p.stem.split("-", 1)[1] for p in d.glob("*.jsonl") if "-" in p.stem}) if d.is_dir() else []


def report(perf_dir, days=7):
    """Les `days` derniers jours ayant des mesures, du plus récent au plus ancien."""
    d = Path(perf_dir)
    first = date.today() - timedelta(days=days - 1)
    out = []
    for day in reversed(days_available(d)):
        try:
            if date.fromisoformat(day) < first:
                continue
        except ValueError:
            continue
        load = lambda src: _read(d / f"{src}-{day}.jsonl")
        page = load("page")
        out.append({"day": day, "server": _server(load("server")), "app": _app(load("app"), page)})
    return out


def text(days_report):
    """Le même résumé en texte (script, « Copier pour une issue »)."""
    lines = []
    for r in reversed(days_report):
        s, a = r["server"], r["app"]
        lines += [f"## {r['day']}", "Serveur"]
        if s["samples"]:
            lines.append(f"  mémoire {s['mem_mb']} Mo (pic {s['mem_peak_mb']}), CPU {s['cpu']} % (pic {s['cpu_peak']}), "
                         f"{s['samples']} mesures")
            lines.append(f"  GitHub {s['github_calls']} appels, plus {s['github_304']} « rien de neuf » (304, gratuits) · "
                         f"Local {s['local_scans']} scans du disque")
            for o in s["ops"]:
                lines.append(f"  {o['op']:<9} {o['n']:>5} fois, {o['avg_s']:.2f} s en moyenne, pire {o['max_s']:.2f} s")
            for o in s["slow"][:10]:
                lines.append(f"  ⚠ lent à {o['at']} : {o['op']} {o['took_s']} s")
            if len(s["slow"]) > 10:
                lines.append(f"  … et {len(s['slow']) - 10} autres opérations lentes")
            if s["asleep"]:
                lines.append("  mis à part (machine en veille ?) : "
                             + ", ".join(f"{o['op']} à {o['at']}" for o in s["asleep"]))
            if s["routes"]:
                lines.append("  routes les plus sondées : " + ", ".join(f"{x['route']} ×{x['n']}" for x in s["routes"]))
        else:
            lines.append("  (aucune mesure)")
        lines.append("Appli de bureau")
        if a["samples"]:
            lines.append(f"  total {a['mem_mb']} Mo (pic {a['mem_peak_mb']}), CPU {a['cpu']} % (pic {a['cpu_peak']}), "
                         f"page homedash {a['page_mb']} Mo, {a['samples']} mesures")
            if a["tabs"]:
                lines.append("  par onglet (mémoire moyenne / pic, CPU moyen, chargement moyen) :")
                for t in a["tabs"]:
                    load = f"  {t['load_s']} s ×{t['loads']}" if t["load_s"] is not None else ""
                    lines.append(f"    {t['tab']:<28} {t['mb']:>5} / {t['peak_mb']:>5} Mo  {t['cpu']:>5} %{load}")
            if a["events"]:
                lines.append("  appli : " + ", ".join(f"{e} ×{n}" for e, n in a["events"].items()))
            for sp in a["spikes"]:
                lines.append(f"  ⚠ pic à {sp['at']} ({sp['reason']}, +{sp['grew_mb']} Mo) : {sp['total_mb']} Mo, "
                             f"CPU {sp['cpu']} % — " + ", ".join(f"{t['tab']} {t['mb']} Mo" for t in sp["tabs"])
                             + (f" — juste avant : {', '.join(sp['before'])}" if sp["before"] else ""))
        else:
            lines.append("  (aucune mesure de l'appli : journal coupé, ou appli de bureau pas lancée)")
        if a["actions"]:
            lines.append("Page")
            lines.append("  actions : " + ", ".join(f"{e} ×{n}" for e, n in a["actions"].items()))
        lines.append("")
    return "\n".join(lines)

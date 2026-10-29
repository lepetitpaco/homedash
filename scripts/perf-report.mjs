#!/usr/bin/env node
// Résumé du journal de performance (data/perf/, voir server/perflog.ts) : le même
// que Réglages → Aide → Journal de performance (server/perfreport.ts).
//
//   node scripts/perf-report.mjs                 # les 7 derniers jours
//   node scripts/perf-report.mjs --days 30       # plus loin
//   node scripts/perf-report.mjs --dir data-2/perf

import fs from 'node:fs'
import path from 'node:path'

import { report, text } from '../server/perfreport.ts'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const days = Number(opt('--days', 7))
const dir = opt('--dir', path.join(import.meta.dirname, '..', 'data', 'perf'))
if (!fs.existsSync(dir)) {
  console.error(`${dir} introuvable : journal jamais activé (Réglages → Affichage → Journal de performance)`)
  process.exit(1)
}
const out = report(dir, days)
if (!out.length) {
  console.error(`rien dans ${dir} sur les ${days} derniers jours`)
  process.exit(1)
}
console.log(text(out))

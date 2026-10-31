// Réponses d'API fictives pour les captures : la vraie page, des données inventées (équipe « acme »).
// Les dates sont relatives à maintenant, pour que « il y a 2 h » reste vrai à chaque capture.

const now = Date.now()
const ago = (h) => new Date(now - h * 3600e3).toISOString()
const sec = (h) => (now - h * 3600e3) / 1000
const day = (d) => new Date(now + d * 86400e3).toISOString().slice(0, 10)

const ci = (state, total = 4) => ({
  state,
  label: state === 'pass' ? `${total}/${total}` : state === 'fail' ? '2 échecs' : 'en cours',
  total,
  checks: [],
})
const branch = (repo, name, h, ahead, pr) => ({
  repo, name, url: `https://github.com/acme/${repo}/tree/${name}`, base: 'main', date: ago(h), ahead,
  merged: false, role: 'creator', creator: 'ada', creator_src: 'pr', last_author: 'ada', authors: ['ada'],
  pr: pr ? { number: pr, url: `https://github.com/acme/${repo}/pull/${pr}`, author: 'ada', merged: false } : null,
})
const pr = (repo, number, title, branchName, h, state) => ({
  repo, number, title, url: `https://github.com/acme/${repo}/pull/${number}`, branch: branchName, created_at: ago(h), ci: ci(state),
})
const merged = (repo, number, title, h) => ({ ...pr(repo, number, title, '', h, 'pass'), merged_at: ago(h) })

export const github = {
  enabled: true, error: null, user: 'ada', users: ['ada', 'linus', 'grace'], updated_at: now / 1000 - 25, building: false,
  auto_refresh: 15,
  branches: {
    active: [
      branch('api', 'feat/orders-export', 2, 6, 142),
      branch('web', 'feat/checkout-v2', 5, 11, 88),
      branch('web', 'fix/menu-mobile', 26, 2, 91),
      branch('design-system', 'feat/danger-button', 30, 3, 31),
    ],
    stale: [],
  },
  prs: [
    pr('api', 142, 'Export des commandes en CSV', 'feat/orders-export', 2, 'fail'),
    pr('web', 88, 'Nouvelle page de paiement', 'feat/checkout-v2', 5, 'pass'),
    pr('web', 91, 'Corrige le menu sur mobile', 'fix/menu-mobile', 20, 'pending'),
  ],
  merged: [
    merged('design-system', 31, 'Boutons : variante « danger »', 15),
    merged('api', 139, 'Pagination des factures', 25),
    merged('web', 85, 'Mode sombre sur le tableau de bord', 40),
  ],
  renovate: { upstream_open: [], upstream_merged: [], open_groups: [], merged_groups: [], gate: null, open_count: 0 },
  stats: { calls: 0, hits: 0, errors: 0 },
  account: 'main',
  accounts: [{ id: 'main', label: 'ada', login: 'ada', avatar: null, ok: true, enabled: true, source: 'ui' }],
}

const lb = (name, o) => ({
  name, sha: 'a1b2c3d4e5f6', short: 'a1b2c3d4', current: false, protected: false, upstream: `origin/${name}`,
  remote_ref: true, remote_sha: 'a1b2c3d4e5f6', ahead_default: 0, behind_default: 0, capped: false, push_ahead: 0,
  push_behind: 0, on_github: true, date: sec(o.h ?? 30), author: 'ada', subject: o.subject, pr: o.pr ?? null,
  state: o.state, advice: o.advice, delete: o.delete ?? null, safety: o.safety, action: o.action,
})
const saved = { level: 'merged', label: '✓ sauvegardée', detail: 'chacun de ses commits est déjà dans main sur GitHub' }
const repo = (name, branches, counts) => ({
  path: `/demo/${name}`, display: `~/dev/acme/${name}`, name, org: 'acme', repo: name, url: `https://github.com/acme/${name}`,
  error: null, default_branch: 'main', head: 'main', detached: false, linked: true, branches, stashes: 0, fetched_at: sec(1),
  dirty: { known: true, count: 0, capped: false },
  commands: counts.deletable
    ? [{ id: 'delete', label: 'Supprimer les branches mergées', cmd: `cd ~/dev/acme/${name} && git branch -d ${branches.filter((b) => b.delete).map((b) => b.name).join(' ')}`, hint: 'leur contenu est déjà dans main' }]
    : [],
  counts: { branches: branches.length, squashed: 0, risky: 0, unpushed: 0, safe: branches.length, at_risk: 0, ...counts },
})
const main = lb('main', {
  subject: 'Merge pull request #139', state: 'protected', advice: 'branche de référence', safety: saved,
  action: { kind: 'ref', label: '🏠 référence', detail: 'branche de référence du dépôt' },
})

export const local = {
  enabled: true, error: null, updated_at: now / 1000 - 5, building: false, took: 0.2, refresh: 60, watch: 2, watching: true,
  trigger: 'watch', github_linked: true, roots: ['~/dev'],
  repos: [
    repo('api', [
      { ...main, current: true },
      lb('feat/invoices-pagination', {
        subject: 'Pagination des factures', state: 'gone-merged', advice: 'mergée puis supprimée sur GitHub', delete: '-d',
        pr: { number: 139, url: 'https://github.com/acme/api/pull/139', author: 'ada', merged: true },
        safety: saved, action: { kind: 'delete', label: '🗑 à supprimer', detail: 'PR #139 mergée, branche supprimée sur GitHub' },
      }),
      lb('feat/orders-export', {
        h: 2, subject: 'Export CSV : en-têtes', state: 'ok', advice: 'à jour avec GitHub',
        pr: { number: 142, url: 'https://github.com/acme/api/pull/142', author: 'ada', merged: false },
        safety: { level: 'pushed', label: '✓ poussée', detail: 'tout est sur GitHub' },
        action: { kind: 'work', label: '🔨 en cours', detail: 'PR #142 ouverte' },
      }),
    ], { deletable: 1 }),
    repo('web', [
      { ...main, current: true },
      lb('fix/menu-mobile', {
        h: 20, subject: 'Menu : fermeture au clic', state: 'unpushed', advice: '2 commits pas encore poussés', push_ahead: 2,
        safety: { level: 'partial', label: '⚠ 2 commits locaux', detail: 'pousse-les avant toute suppression' },
        action: { kind: 'check', label: '⬆ à pousser', detail: 'git push' },
      }),
    ], { unpushed: 1, at_risk: 1, safe: 1 }),
  ],
  totals: { repos: 2, branches: 5, deletable: 1, squashed: 0, risky: 0, unpushed: 1, dirty: 0, safe: 4, at_risk: 1 },
  global_commands: [{ id: 'fetch-all', label: 'Rafraîchir les 2 dépôts', cmd: 'for d in ~/dev/acme/api ~/dev/acme/web; do git -C "$d" fetch --prune; done', hint: 'met à jour les refs distantes' }],
}

const task = (id, title, project, list, due, steps = []) => ({
  id, kind: 'todo', column_id: null, project_id: 1, title, url: `https://3.basecamp.com/1/buckets/1/todos/${id}`, type: 'Todo',
  project, project_url: 'https://3.basecamp.com/1/projects/1', list, list_url: 'https://3.basecamp.com/1/buckets/1/todolists/1',
  due_on: due, starts_on: null, comments: 2, steps,
})
export const basecamp = {
  configured: true, enabled: true, account: 'Acme', app_href: 'https://3.basecamp.com/1', name: 'Ada', updated_at: now / 1000 - 30,
  building: false, error: null, every: 60,
  tasks: {
    priorities: [
      task(11, 'Envoyer le devis au client Dupont', 'Ventes', 'Cette semaine', day(-1)),
      task(12, 'Préparer la démo de vendredi', 'Produit', 'Sprint 42', day(1), [
        { title: 'Scénario', url: '', due_on: null, completed: true },
        { title: 'Jeu de données', url: '', due_on: null, completed: false },
      ]),
    ],
    others: [
      task(13, 'Export des commandes en CSV', 'Produit', 'Sprint 42', day(4)),
      task(14, 'Mettre à jour la page Tarifs', 'Site', 'À faire', null),
    ],
  },
  unreads: [
    { id: 1, title: 'Re: Démo de vendredi', url: 'https://3.basecamp.com/1', project: 'Produit', section: 'Messages', type: 'Message', creator: 'Grace', excerpt: 'Je peux montrer le paiement si tu veux.', unread_count: 1, ts: sec(1) },
  ],
  boards: {}, loaded: true, posted: {},
  github: {
    issues: [{ account: 'main', repo: 'acme/api', number: 143, title: 'Export des commandes en CSV', url: 'https://github.com/acme/api/issues/143', state: 'open', bc_url: 'https://3.basecamp.com/1/buckets/1/todos/13', updated_at: ago(3), report: null }],
    repos: [{ account: 'main', repo: 'acme/api' }, { account: 'main', repo: 'acme/web' }],
  },
}

let seq = 0
const ev = (kind, level, source, title, body, h, repoName = '') => ({
  kind, level, source, title, body, repo: repoName, url: 'https://github.com/acme', tag: `${kind}:${++seq}`, sticky: false, seq, ts: sec(h),
})
const list = [
  ev('pr-merged', 'ok', 'github', '🎉 PR mergée — design-system #31', 'Boutons : variante « danger »', 15, 'design-system'),
  ev('ci-fixed', 'ok', 'github', '✅ CI réparée — web #88', 'Nouvelle page de paiement', 4, 'web'),
  ev('bc-notif', 'info', 'basecamp', '💬 Grace — Re: Démo de vendredi', 'Produit · Je peux montrer le paiement si tu veux.', 1),
  ev('ci-failed', 'error', 'github', '❌ CI cassée — api #142', 'Export des commandes en CSV · 2 échecs', 0.5, 'api'),
]
export const events = { events: list, seq, total: list.length }

const tc = (n, title, list, o = {}) => ({
  id: `c${n}`, short_link: `sl${n}`, title, url: `https://trello.com/c/sl${n}`, board_id: 'b1', board: 'Site perso',
  board_url: 'https://trello.com/b/demo/site-perso', list_id: list, list: { l1: 'Idées', l2: 'À faire', l3: 'En cours', l4: 'Fait' }[list],
  list_pos: { l1: 1, l2: 2, l3: 3, l4: 4 }[list], pos: n, due: o.due ?? null, due_complete: false, comments: o.comments ?? 0,
  checks: o.checks ?? 0, checks_done: o.done ?? 0, mine: o.mine ?? true,
  labels: [[{ name: 'Site', color: 'green' }], [{ name: 'Urgent', color: 'red' }, { name: 'Design', color: 'blue' }], []][n % 3],
})
export const trello = {
  configured: true, enabled: true, account: 'Ada', username: 'ada', updated_at: now / 1000 - 20, building: false, error: null,
  every: 60, loaded: true, posted: {},
  boards: [{ id: 'b1', name: 'Site perso', url: 'https://trello.com/b/demo/site-perso', background: '', background_brightness: 'dark',
    lists: [{ id: 'l1', name: 'Idées', pos: 1 }, { id: 'l2', name: 'À faire', pos: 2 }, { id: 'l3', name: 'En cours', pos: 3 }, { id: 'l4', name: 'Fait', pos: 4 }] }],
  cards: [
    tc(1, 'Mode sombre automatique', 'l1', { mine: false }),
    tc(2, 'Page « À propos »', 'l1', { mine: false, comments: 1 }),
    tc(3, 'Formulaire de contact', 'l2', { due: day(2), checks: 4, done: 1 }),
    tc(4, 'Optimiser les images', 'l2', { comments: 3 }),
    tc(5, 'Nouveau thème du blog', 'l3', { due: day(-1), checks: 5, done: 3, comments: 2 }),
    tc(6, 'Flux RSS', 'l4', { mine: false }),
    tc(7, 'Nom de domaine renouvelé', 'l4'),
  ],
  unreads: [{ id: 'n1', title: 'Grace a commenté « Nouveau thème du blog »', url: 'https://trello.com/c/sl5', board: 'Site perso', excerpt: 'Les couleurs me vont !', creator: 'Grace', ts: sec(2) }],
  github: { issues: [], repos: [{ account: 'main', repo: 'acme/web' }] },
}

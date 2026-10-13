import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addAccount,
  getAuth,
  getOwners,
  listAccounts,
  removeAccount,
  type AccountInfo,
  type Auth,
  type Owner,
} from '../lib/admin'
import {
  notifState,
  testNotification,
  toggleNotifications,
  type NotifState,
} from '../lib/notifications'
import { DEFAULT_UI, GH_TOKENS } from '../lib/config'
import type { Config, RepoItem } from '../types'
import { confirmDialog } from './ConfirmHost'
import SetBackups from './SetBackups'
import SetConnect from './SetConnect'
import SetLocal from './SetLocal'
import SetRenovate from './SetRenovate'
import SetRepos, { type Use } from './SetRepos'
import SetTeam from './SetTeam'

const NOTIF_LABEL: Record<NotifState, string> = {
  unsupported: 'Non supportées par ce navigateur',
  insecure: 'Indisponibles : origine non sécurisée (il faut localhost ou HTTPS)',
  denied: 'Bloquées dans les réglages du navigateur',
  default: 'Pas encore autorisées',
  muted: 'En sourdine (par défaut) — la cloche de la barre du haut suffit',
  on: 'Actives',
}

/** Parties de la page, dans l'ordre : le menu de gauche y mène. */
const SECTIONS = [
  { id: 'set-account', icon: '🔑', label: 'Compte & équipe' },
  { id: 'set-repos', icon: '📦', label: 'Repos suivis' },
  { id: 'set-ghtab', icon: '🐙', label: 'Onglet GitHub' },
  { id: 'set-local', icon: '💻', label: 'Dépôts locaux' },
  { id: 'set-backups', icon: '💾', label: 'Sauvegardes' },
  { id: 'set-display', icon: '🎛', label: 'Affichage' },
] as const

function Card({ id, icon, title, children }: { id: string; icon: string; title: string; children: ReactNode }) {
  return (
    <section className="card set-card" id={id}>
      <header className="group-head">
        <div className="group-toggle static">
          <span className="group-icon" aria-hidden="true">
            {icon}
          </span>
          <h2 className="group-title">{title}</h2>
        </div>
      </header>
      <div className="set-body">{children}</div>
    </section>
  )
}

type Props = {
  config: Config | null
  onSave: (next: Config) => void
  /** Relit config.json : après une connexion, le backend a pu y écrire. */
  onReload: () => void
  saving: boolean
}

type GhCfg = {
  id?: string
  label?: string
  me?: string
  repos?: string[]
  branch_repos?: string[]
  base_site_repos?: string[]
  upstream_repo?: string
  renovate_author?: string
  users?: string[]
  merged_count?: number
  cache_ttl?: number
  auto_refresh?: number
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])

export default function SettingsPage({ config, onSave, onReload, saving }: Props) {
  // Brouillon local : rien n'est écrit avant « Enregistrer ».
  const [draft, setDraft] = useState<Config | null>(config)
  const [auth, setAuth] = useState<Auth | null>(null)
  const [owners, setOwners] = useState<Owner[]>([])
  const [bell, setBell] = useState<NotifState>('default')
  const [notifLog, setNotifLog] = useState<string | null>(null)
  // Compte GitHub en cours d'édition, et ce que le serveur sait de chacun.
  const [sel, setSel] = useState('')
  const [infos, setInfos] = useState<AccountInfo[]>([])
  const [newLabel, setNewLabel] = useState<string | null>(null)

  useEffect(() => setBell(notifState()), [])

  useEffect(() => setDraft(config), [config])

  // Toujours au moins un compte : le serveur convertit les anciennes configs.
  const accList: GhCfg[] = useMemo(
    () =>
      (draft?.github_accounts as GhCfg[] | undefined)?.length
        ? (draft!.github_accounts as GhCfg[])
        : [{ id: 'main', label: '' }],
    [draft],
  )
  const gh: GhCfg = accList.find((a) => a.id === sel) ?? accList[0]
  const selId = gh?.id ?? 'main'

  const refreshInfos = () =>
    listAccounts()
      .then(setInfos)
      .catch(() => setInfos([]))
  useEffect(() => {
    void refreshInfos()
  }, [])

  useEffect(() => {
    setAuth(null)
    setOwners([])
    getAuth(selId)
      .then(setAuth)
      .catch(() => setAuth({ ok: false, source: null, error: 'backend injoignable' }))
  }, [selId])

  const connected = !!auth?.ok
  useEffect(() => {
    if (!connected) return
    getOwners(selId)
      .then(setOwners)
      .catch(() => setOwners([]))
  }, [connected, auth?.login, selId])

  /** Chaque repo porte son propriétaire : `mon-org/api`. */
  const cardKey = (i: { name: string; owner?: string }) => (i.owner ? `${i.owner}/${i.name}` : i.name)
  const cardRepos = useMemo(
    () => (draft?.repos?.items ?? []).map(cardKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft],
  )

  // Comptes à parcourir : celui du jeton (owners[0]) et ses orgs. Les autres
  // « User » sont des collaborateurs croisés sur un repo, pas des comptes à lister.
  const accounts = useMemo(() => owners.filter((o, i) => i === 0 || o.type === 'Organization'), [owners])

  // Partie visible : surlignée dans le menu. La bande d'observation est le haut
  // de l'écran, là où l'œil lit — pas le milieu, sinon une carte courte en bas
  // de page ne serait jamais « active ».
  const cleanedRef = useRef<(c: Config) => Config>((c) => c)
  const [active, setActive] = useState<string>(SECTIONS[0].id)
  // Après un clic dans le menu, on garde son choix le temps du défilement : en
  // colonnes, plusieurs cartes sont visibles à la fois et l'observateur
  // reprendrait sinon celle de la première colonne.
  const pinned = useRef(0)
  useEffect(() => {
    if (!draft) return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting)
        if (Date.now() < pinned.current) return
        const first = SECTIONS.find((sec) => seen.get(sec.id))
        if (first) setActive(first.id)
      },
      { rootMargin: '-15% 0px -60% 0px' },
    )
    for (const sec of SECTIONS) {
      const el = document.getElementById(sec.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [!!draft])

  const jump = (id: string) => {
    setActive(id)
    pinned.current = Date.now() + 1000
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [draft, config])

  // ⌘S / Ctrl+S : enregistrer sans aller chercher le bouton.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty && draft && !saving) onSave(cleanedRef.current(draft))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, draft, saving, onSave])

  if (!draft) return <div className="loading">chargement…</div>

  /** Brouillon avec le compte sélectionné modifié (liste des comptes matérialisée). */
  const withAcc = (patch: Partial<GhCfg>): Config => ({
    ...draft,
    github_accounts: accList.map((a) => (a.id === selId ? { ...a, ...patch } : a)) as Record<string, unknown>[],
  })
  const patchGh = (patch: Partial<GhCfg>) => setDraft(withAcc(patch))

  const items: RepoItem[] = draft.repos?.items ?? []
  const fullList = asList
  // Clé absente = mêmes repos que les PRs, comme le backend.
  const branchList = Array.isArray(gh.branch_repos) ? fullList(gh.branch_repos) : fullList(gh.repos)
  const uses: Record<Use, string[]> = { prs: fullList(gh.repos), branches: branchList, card: cardRepos }
  const tracked = [...new Set([...uses.prs, ...uses.branches, ...uses.card])].sort()
  const nameOf = (k: string) => k.split('/').pop() ?? k

  const itemOf = (key: string): RepoItem => {
    const [owner, name] = key.split('/', 2)
    return name ? { name, owner } : { name: owner }
  }

  /**
   * Un seul brouillon pour les trois endroits qu'alimente un repo : les deux
   * listes de la section `github`, et la carte Repos (`repos.items`). Tout est
   * réécrit en `propriétaire/repo`, y compris les entrées de la carte.
   */
  const writeUses = (next: Record<Use, string[]>, extra: Partial<GhCfg> = {}) => {
    const keep = items
      .filter((i) => next.card.includes(cardKey(i)))
      .map((i) => (i.owner ? i : { ...i, ...itemOf(cardKey(i)) }))
    const added = next.card.filter((k) => !keep.some((i) => cardKey(i) === k)).map(itemOf)
    setDraft({
      ...withAcc({
        repos: next.prs,
        branch_repos: next.branches,
        base_site_repos: fullList(gh.base_site_repos),
        ...extra,
      }),
      repos: { ...(draft.repos ?? { items: [] }), items: [...keep, ...added] },
    })
  }

  /**
   * Le backend et l'onglet Local reconnaissent un repo à son nom court (c'est
   * ce qu'ils lisent dans l'URL d'un remote) : deux propriétaires pour un même
   * nom seraient confondus. On refuse plutôt que de mélanger leurs branches.
   */
  const track = (key: string): string | null => {
    const clash = tracked.find((k) => k !== key && nameOf(k).toLowerCase() === nameOf(key).toLowerCase())
    if (clash) return `${clash} est déjà suivi : deux repos du même nom ne peuvent pas être suivis ensemble.`
    const add = (l: string[]) => (l.includes(key) ? l : [...l, key].sort())
    writeUses({ prs: add(uses.prs), branches: add(uses.branches), card: add(uses.card) })
    return null
  }

  const toggleUse = (use: Use, key: string) => {
    const cur = uses[use]
    writeUses({ ...uses, [use]: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key].sort() })
  }

  const untrack = (key: string) => {
    const drop = (l: string[]) => l.filter((x) => x !== key)
    writeUses(
      { prs: drop(uses.prs), branches: drop(uses.branches), card: drop(uses.card) },
      { base_site_repos: drop(fullList(gh.base_site_repos)) },
    )
  }

  const layout = draft.githubLayout?.length ? draft.githubLayout : [...GH_TOKENS]
  const setRenovateShown = (on: boolean) =>
    setDraft({
      ...draft,
      githubLayout: on
        ? layout.includes('gh:renovate')
          ? layout
          : [...layout, 'gh:renovate']
        : layout.filter((t) => t !== 'gh:renovate'),
    })

  const onAuth = (a: Auth) => {
    setAuth(a)
    // le backend a pu renseigner login/libellé au premier branchement
    onReload()
    void refreshInfos()
  }

  /**
   * Ajouter / supprimer un compte écrit la config tout de suite (le serveur doit
   * connaître le compte pour y ranger un jeton). Un brouillon en cours serait
   * écrasé par le rechargement : on demande d'enregistrer d'abord.
   */
  const needsSave = () => {
    if (!dirty) return false
    void confirmDialog({
      title: 'Enregistre d’abord tes modifications',
      body: 'Ajouter ou supprimer un compte recharge les réglages : les modifications non enregistrées seraient perdues.',
      confirmLabel: 'Compris',
      cancelLabel: 'Fermer',
    })
    return true
  }

  const createAccount = () => {
    const label = (newLabel ?? '').trim()
    if (!label || needsSave()) return
    void addAccount(label).then(({ id }) => {
      setNewLabel(null)
      setSel(id)
      onReload()
      void refreshInfos()
    })
  }

  const deleteAccount = () => {
    if (needsSave()) return
    const label = gh.label || infoOf(selId)?.login || selId
    void confirmDialog({
      title: `Supprimer le compte « ${label} » ?`,
      body: [
        'Son jeton est effacé de data/secrets.json, et ses réglages (repos suivis, équipe, Renovate) disparaissent.',
        'Les autres comptes ne bougent pas. Une sauvegarde automatique est faite chaque jour.',
      ],
      confirmLabel: 'Supprimer le compte',
      danger: true,
    }).then((ok) => {
      if (!ok) return
      void removeAccount(selId).then(() => {
        setSel('')
        onReload()
        void refreshInfos()
      })
    })
  }

  const infoOf = (id: string) => infos.find((i) => i.id === id)
  const labelOf = (a: GhCfg) => a.label || infoOf(a.id ?? '')?.login || a.id || 'compte'


  const local = (draft.local ?? {}) as { roots?: { path?: string; as?: string }[]; max_depth?: number }
  const patchLocal = (patch: Record<string, unknown>) =>
    setDraft({ ...draft, local: { ...(draft.local ?? {}), ...patch } })

  /**
   * Un champ texte laissé vide ne doit PAS être écrit comme "" : le backend a des
   * défauts (upstream_repo = base-site, renovate_author = renovate[bot]) et une
   * chaîne vide les écraserait — ce qui désactive silencieusement la section
   * Upstream. On retire la clé pour que le défaut s'applique.
   */
  const cleaned = (config: Config): Config => {
    const clean = (o: Record<string, unknown> = {}) => {
      const out = { ...o }
      for (const key of ['me', 'upstream_repo', 'renovate_author']) {
        if (typeof out[key] === 'string' && !(out[key] as string).trim()) delete out[key]
      }
      return out
    }
    return {
      ...config,
      ...(config.github_accounts ? { github_accounts: config.github_accounts.map(clean) } : {}),
    }
  }

  cleanedRef.current = cleaned

  const num = (value: string, fallback: number) => {
    const n = Number.parseInt(value, 10)
    return Number.isNaN(n) ? fallback : n
  }

  return (
    <div className="settings-layout">
      <nav className="set-nav" aria-label="Parties des réglages">
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            className={`set-nav-item${active === sec.id ? ' is-active' : ''}`}
            onClick={() => jump(sec.id)}
          >
            <span aria-hidden="true">{sec.icon}</span>
            {sec.label}
          </button>
        ))}
      </nav>

      <div className="settings-page">
        <div className="set-accounts">
          <span className="set-accounts-title">Compte GitHub</span>
          {accList.map((a) => {
            const info = infoOf(a.id ?? '')
            return (
              <button
                key={a.id}
                className={`gh-account${a.id === selId ? ' is-active' : ''}${info?.ok ? '' : ' is-off'}`}
                onClick={() => setSel(a.id ?? '')}
                title={info?.ok ? `connecté en tant que ${info.login}` : 'non connecté'}
              >
                {info?.avatar ? <img src={info.avatar} alt="" /> : <span className="gh-account-dot" />}
                {labelOf(a)}
              </button>
            )
          })}
          {newLabel === null ? (
            <button className="gh-account set-account-add" onClick={() => !needsSave() && setNewLabel('')}>
              ＋ compte
            </button>
          ) : (
            <span className="set-account-new">
              <input
                autoFocus
                value={newLabel}
                placeholder="nom : Perso, Client X…"
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createAccount()
                  if (e.key === 'Escape') setNewLabel(null)
                }}
                autoComplete="off"
                data-1p-ignore
              />
              <button onClick={createAccount} disabled={!newLabel.trim()}>
                créer
              </button>
              <button onClick={() => setNewLabel(null)}>annuler</button>
            </span>
          )}
          <span className="set-hint set-accounts-hint">
            Les trois cartes suivantes règlent ce compte. Chaque compte a son jeton et est suivi en
            parallèle ; l'onglet GitHub choisit lequel il affiche.
          </span>
        </div>

        <div className="set-cards">
        <Card id="set-account" icon="🔑" title={`Compte & équipe · ${labelOf(gh)}`}>
          <div className="set-grid">
            <label className="set-field">
              <span>
                Nom du compte <em>affiché dans le sélecteur</em>
              </span>
              <input
                value={gh.label ?? ''}
                placeholder={infoOf(selId)?.login ?? 'Boulot, Perso…'}
                onChange={(e) => patchGh({ label: e.target.value })}
                autoComplete="off"
                data-1p-ignore
              />
            </label>
          </div>
          <SetConnect account={selId} auth={auth} onChange={onAuth} />
          <SetTeam
            account={selId}
            orgs={accounts.filter((o) => o.type === 'Organization').map((o) => o.login)}
            users={asList(gh.users)}
            me={gh.me ?? ''}
            connected={connected}
            login={auth?.login}
            onUsers={(users) => patchGh({ users })}
            onMe={(me) => patchGh({ me })}
          />
          {accList.length > 1 ? (
            <div className="set-add">
              <button className="set-danger-link" onClick={deleteAccount}>
                Supprimer le compte « {labelOf(gh)} »
              </button>
            </div>
          ) : null}
        </Card>

        <Card id="set-repos" icon="📦" title={`Repos suivis · ${labelOf(gh)}`}>
          <SetRepos
            account={selId}
            owners={accounts}
            uses={uses}
            connected={connected}
            onTrack={track}
            onToggle={toggleUse}
            onRemove={untrack}
          />
        </Card>

        <Card id="set-ghtab" icon="🐙" title={`Onglet GitHub · ${labelOf(gh)}`}>
          <div className="set-grid">
            <label className="set-field">
              <span>
                PRs mergées affichées <em>carte « PRs mergées »</em>
              </span>
              <input
                type="number"
                min={0}
                max={50}
                value={gh.merged_count ?? 10}
                onChange={(e) => patchGh({ merged_count: num(e.target.value, 10) })}
              />
            </label>
            <label className="set-field">
              <span>
                Rafraîchissement <em>secondes entre deux lectures de GitHub, 0 = manuel</em>
              </span>
              <input
                type="number"
                min={0}
                max={3600}
                value={gh.auto_refresh ?? 15}
                onChange={(e) => patchGh({ auto_refresh: num(e.target.value, 15) })}
              />
            </label>
          </div>
          <SetRenovate
            shown={layout.includes('gh:renovate')}
            upstream={gh.upstream_repo ?? 'base-site'}
            author={gh.renovate_author ?? 'renovate[bot]'}
            tracked={tracked}
            watched={fullList(gh.base_site_repos)}
            onShown={setRenovateShown}
            onUpstream={(upstream_repo) => patchGh({ upstream_repo })}
            onAuthor={(renovate_author) => patchGh({ renovate_author })}
            onWatched={(base_site_repos) => patchGh({ base_site_repos })}
          />
        </Card>

        <Card id="set-local" icon="💻" title="Dépôts locaux">
          <SetLocal
            roots={local.roots ?? []}
            maxDepth={local.max_depth ?? 3}
            onRoots={(roots) => patchLocal({ roots, enabled: true })}
            onMaxDepth={(max_depth) => patchLocal({ max_depth })}
          />
        </Card>

        <Card id="set-backups" icon="💾" title="Sauvegardes">
          <SetBackups />
        </Card>

        <Card id="set-display" icon="🎛" title="Affichage">
          <div className="set-grid">
            {(
              [
                ['maxTiles', 'Tuiles « les plus utilisés »'],
                ['railWidth', 'Largeur du rail de titre'],
                ['linkWidth', 'Largeur mini d’un lien'],
                ['sidebarWidth', 'Largeur mini des blocs du haut'],
                ['healthcheckInterval', 'Test des liens surveillés (s)'],
                ['pageWidth', 'Largeur max de la page (px, 0 = tout l’écran)'],
                ['cardColumns', 'Colonnes GitHub / Local (0 = auto)'],
                ['cardWidth', 'Largeur mini d’une carte en auto (px)'],
                ['settingsColumns', 'Colonnes des Réglages (0 = auto)'],
              ] as const
            ).map(([key, label]) => (
              <label className="set-field" key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  min={0}
                  placeholder={String(DEFAULT_UI[key])}
                  value={(draft.ui?.[key] as number | undefined) ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ui: { ...(draft.ui ?? {}), [key]: num(e.target.value, 0) },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <h3 className="set-sub">Notifications</h3>
          <p className="set-hint">
            État : <strong>{NOTIF_LABEL[bell]}</strong>. Le test envoie une notification tout de
            suite, puis une seconde 6 secondes plus tard — change d'onglet entre les deux pour
            vérifier qu'elles arrivent quand tu ne regardes pas.
          </p>
          <div className="set-add">
            <button
              onClick={() => void toggleNotifications().then(setBell)}
              disabled={bell === 'unsupported' || bell === 'insecure' || bell === 'denied'}
            >
              {bell === 'default'
                ? 'Autoriser'
                : bell === 'muted'
                  ? 'Activer'
                  : 'Mettre en sourdine'}
            </button>
            <button
              onClick={() => {
                setNotifLog('…')
                testNotification(setNotifLog)
              }}
              disabled={bell !== 'on'}
            >
              🔔 Tester
            </button>
          </div>

          {notifLog ? <p className="set-notif-log">{notifLog}</p> : null}
          <p className="set-hint">
            Rien à l'écran alors que le test dit « affichée » ? C'est macOS :
            Réglages Système → Notifications → ton navigateur, style <strong>Alertes</strong>
            (les bannières s'effacent en 5 s), et surtout <strong>mode Concentration désactivé</strong>
            — il les avale sans rien dire.
          </p>

          <h3 className="set-sub">Interface</h3>
          <div className="set-toggles">
            {(
              [
                ['showClock', 'Horloge'],
                ['showTiles', 'Rangées de tuiles'],
                ['showFooter', 'Pied de page'],
                ['favicons', 'Favicons'],
              ] as const
            ).map(([key, label]) => (
              <label className="set-toggle" key={key}>
                <input
                  type="checkbox"
                  checked={(draft.ui?.[key] as boolean | undefined) ?? true}
                  onChange={(e) =>
                    setDraft({ ...draft, ui: { ...(draft.ui ?? {}), [key]: e.target.checked } })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </Card>
        </div>

        <div className={`set-actions${dirty ? ' is-dirty' : ''}`}>
          <span className="set-actions-note">
            {dirty
              ? '● Modifications non enregistrées'
              : 'Connexion et sauvegardes s’appliquent tout de suite ; le reste attend « Enregistrer ».'}
          </span>
          <button className="set-cancel" onClick={() => setDraft(config)} disabled={saving || !dirty}>
            Annuler
          </button>
          <button className="set-save" onClick={() => onSave(cleaned(draft))} disabled={saving || !dirty}>
            {saving ? 'enregistrement…' : dirty ? 'Enregistrer  ⌘S' : 'Enregistré ✓'}
          </button>
        </div>
      </div>
    </div>
  )
}

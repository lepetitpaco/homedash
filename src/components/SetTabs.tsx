import { useState } from 'react'
import { browse, type Browse } from '../lib/admin'
import { isLocal, newTabId, refusesEmbed } from '../lib/customTabs'
import { desktop } from '../lib/desktop'
import type { CustomTab } from '../types'

/**
 * Onglets perso : un site ou un fichier / dossier du disque, ajouté à la barre
 * d'onglets entre Basecamp et Réglages. Chacun s'affiche dans la page ou
 * s'ouvre dans un onglet du navigateur. Écrit dans config.json (`tabs`) avec
 * « Enregistrer », comme le reste de Réglages.
 */
export default function SetTabs({ tabs, onChange }: { tabs: CustomTab[]; onChange: (tabs: CustomTab[]) => void }) {
  // Ligne dont on choisit le fichier, et dossier affiché dans l'explorateur.
  const [picking, setPicking] = useState<string | null>(null)
  const [view, setView] = useState<Browse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const patch = (id: string, p: Partial<CustomTab>) => onChange(tabs.map((t) => (t.id === id ? { ...t, ...p } : t)))
  const remove = (id: string) => onChange(tabs.filter((t) => t.id !== id))
  const move = (i: number, by: number) => {
    const next = [...tabs]
    const [t] = next.splice(i, 1)
    next.splice(i + by, 0, t)
    onChange(next)
  }
  const add = () => {
    const id = newTabId(tabs.map((t) => t.id))
    onChange([...tabs, { id, icon: '', label: '', url: '', embed: false }])
  }

  const go = (path: string) => {
    setError(null)
    browse(path, true)
      .then((b) => (b.error ? setError(b.error) : setView(b)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const pick = (id: string) => {
    setPicking(id)
    const cur = tabs.find((t) => t.id === id)?.url ?? ''
    // on rouvre le dossier du fichier déjà choisi
    go(isLocal(cur) && cur.includes('/') ? cur.slice(0, cur.lastIndexOf('/')) || '~' : '~')
  }
  const choose = (path: string) => {
    if (!picking) return
    const t = tabs.find((x) => x.id === picking)
    const name = path.split('/').pop() ?? path
    // Un fichier du disque s'affiche dans la page : c'est l'intérêt de le servir ici.
    patch(picking, { url: path, embed: true, ...(t?.label ? {} : { label: name.replace(/\.[^.]+$/, '') }) })
    setPicking(null)
  }

  return (
    <>
      <p className="set-hint">
        Un onglet de plus dans la barre, vers un <strong>site</strong> (<code>https://…</code>) ou un{' '}
        <strong>fichier / dossier de ton disque</strong> (<code>~/Documents/…</code>, lu sans jamais être modifié).
        Le <strong>＋</strong> au bout de la barre d'onglets mène ici.
      </p>

      {tabs.length ? (
        <div className="xset-list">
          {tabs.map((t, i) => {
            // Dans l'appli de bureau, une webview : aucun site ne la refuse.
            const warnEmbed = !desktop && t.embed && !isLocal(t.url) && refusesEmbed(t.url)
            return (
              <div key={t.id} className="xset-row">
                <input
                  className="xset-icon"
                  value={t.icon ?? ''}
                  placeholder={isLocal(t.url) ? '📄' : '🌐'}
                  maxLength={4}
                  title="Icône (un emoji)"
                  onChange={(e) => patch(t.id, { icon: e.target.value })}
                  autoComplete="off"
                  data-1p-ignore
                />
                <input
                  className="xset-label"
                  value={t.label}
                  placeholder="Nom"
                  onChange={(e) => patch(t.id, { label: e.target.value })}
                  autoComplete="off"
                  data-1p-ignore
                />
                <input
                  className="xset-url"
                  value={t.url}
                  placeholder="https://… ou ~/Documents/fichier.pdf"
                  onChange={(e) => patch(t.id, { url: e.target.value })}
                  autoComplete="off"
                  data-1p-ignore
                />
                <button onClick={() => pick(t.id)} title="Choisir un fichier ou un dossier sur le disque">
                  📁
                </button>
                <select
                  value={t.embed ? 'embed' : 'open'}
                  onChange={(e) => patch(t.id, { embed: e.target.value === 'embed' })}
                  title="Ce que fait un clic sur l'onglet"
                >
                  <option value="embed">dans homedash</option>
                  <option value="open">ouvrir à part ↗</option>
                </select>
                <span className="xset-moves">
                  <button className="set-del" onClick={() => move(i, -1)} disabled={i === 0} title="Vers la gauche">
                    ↑
                  </button>
                  <button
                    className="set-del"
                    onClick={() => move(i, 1)}
                    disabled={i === tabs.length - 1}
                    title="Vers la droite"
                  >
                    ↓
                  </button>
                  <button className="set-del" onClick={() => remove(t.id)} title="Supprimer cet onglet">
                    ✕
                  </button>
                </span>
                {warnEmbed ? (
                  <p className="set-hint set-bad xset-note">
                    Ce site refuse d'être affiché dans une page : l'onglet restera blanc dans un navigateur (il s'affiche dans l'appli de bureau). Sinon, « ouvrir à part ».
                  </p>
                ) : null}
                {picking === t.id ? (
                  <div className="set-browser xset-note">
                    <div className="set-browser-head">
                      <code>{view?.path ?? '~'}</code>
                      <span className="set-spacer" />
                      {view && view.path !== '~' ? (
                        <button onClick={() => choose(view.path)}>✓ ce dossier</button>
                      ) : null}
                      <button onClick={() => setPicking(null)}>fermer</button>
                    </div>
                    {error ? <p className="set-hint set-bad">✗ {error}</p> : null}
                    <ul className="set-dirs">
                      {view?.parent ? (
                        <li>
                          <button onClick={() => go(view.parent!)}>↰ ..</button>
                        </li>
                      ) : null}
                      {view?.dirs.map((d) => (
                        <li key={d.path}>
                          <button onClick={() => go(d.path)} title="Ouvrir">
                            📁 {d.name}
                          </button>
                        </li>
                      ))}
                      {view?.files?.map((f) => (
                        <li key={f.path}>
                          <button onClick={() => choose(f.path)} title="Choisir ce fichier">
                            📄 {f.name}
                          </button>
                        </li>
                      ))}
                      {view && !view.dirs.length && !view.files?.length ? <li className="set-hint">dossier vide</li> : null}
                    </ul>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="set-hint">Aucun onglet perso pour l'instant.</p>
      )}

      <div className="set-add">
        <button onClick={add}>+ ajouter un onglet</button>
      </div>
      {desktop ? (
        <p className="set-hint">
          <strong>Dans homedash</strong> : le site ou le fichier s'affiche sous la barre d'onglets. Tu es dans l'appli
          de bureau : tous les sites s'affichent (Gmail, Google Chat…), tu t'y connectes une fois, et le nombre de
          non-lus que le site met dans son titre devient une pastille sur l'onglet et sur l'icône du Dock.{' '}
          <strong>Ouvrir à part ↗</strong> : l'onglet ouvre le site dans ton navigateur par défaut. Fichiers limités à
          ton dossier personnel, fichiers cachés exclus.
        </p>
      ) : (
        <p className="set-hint">
          <strong>Dans homedash</strong> : le site ou le fichier s'affiche sous la barre d'onglets. Dans un navigateur,
          ça marche pour les fichiers du disque (PDF, images, texte, HTML) et les sites qui l'acceptent ; Gmail, Google
          Chat, GitHub et la plupart des grands sites le refusent (page blanche). Dans l'<strong>appli de bureau
          homedash</strong>, tous s'affichent, avec leurs non-lus en pastille. <strong>Ouvrir à part ↗</strong> :
          l'onglet est un raccourci qui ouvre un onglet du navigateur. Fichiers limités à ton dossier personnel,
          fichiers cachés exclus.
        </p>
      )}
    </>
  )
}

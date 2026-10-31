export type TabMemory = {
  /** Toute l'appli, en Mo. */
  total: number
  /** Les sites, en Mo (un processus partagé par deux onglets ne compte qu'une fois). */
  sites: number
  /** Par onglet (`tab.id`) ; absent = pas chargé. */
  tabs: Record<string, { mb: number; shared: boolean }>
}

/** `312 Mo`, `2,8 Go`. */
export function formatMb(mb: number): string {
  return mb < 1024 ? `${Math.round(mb)} Mo` : `${(mb / 1024).toFixed(1).replace('.', ',')} Go`
}

type Raw = { total_mb: number; tabs: Record<string, { mb: number; pid: number }> }

/** Rapproche la mesure de l'appli (par webview) des onglets de la page. */
export function readMemory(raw: Raw, tabOf: (guest: string) => string | undefined): TabMemory {
  const entries = Object.entries(raw.tabs)
  const perPid = new Map<number, number>()
  for (const [, m] of entries) perPid.set(m.pid, (perPid.get(m.pid) ?? 0) + 1)
  const tabs: TabMemory['tabs'] = {}
  for (const [guest, m] of entries) {
    const id = tabOf(guest)
    if (id) tabs[id] = { mb: m.mb, shared: (perPid.get(m.pid) ?? 0) > 1 }
  }
  const sites = [...new Map(entries.map(([, m]) => [m.pid, m.mb])).values()].reduce((a, b) => a + b, 0)
  return { total: raw.total_mb, sites, tabs }
}

/** Partie de Réglages affichée, mémorisée d'une visite à l'autre. */
export const SECTION_KEY = 'homedash:settings-section'

/** ＋ de la barre de gauche : Réglages → Onglets perso s'ouvre sur un nouvel onglet à remplir. */
export const NEW_TAB_KEY = 'homedash:new-tab'
/** Même demande quand Réglages est déjà ouvert (pas de remontage, le brouillon reste). */
export const NEW_TAB_EVENT = 'homedash:new-tab'

export function presetNewTab() {
  presetSettingsSection('set-tabs')
  try {
    sessionStorage.setItem(NEW_TAB_KEY, '1')
  } catch {
    /* stockage indisponible : la page s'ouvre sans nouvel onglet */
  }
}

/** « Modifier… » d'un onglet : Réglages → Onglets perso, son éditeur ouvert. */
export const EDIT_TAB_KEY = 'homedash:edit-tab'
/** Même demande quand Réglages est déjà ouvert (détail : l'id de l'onglet). */
export const EDIT_TAB_EVENT = 'homedash:edit-tab'

export function presetEditTab(id: string) {
  presetSettingsSection('set-tabs')
  try {
    sessionStorage.setItem(EDIT_TAB_KEY, id)
  } catch {
    /* stockage indisponible : la liste s'ouvre sans éditeur */
  }
  window.dispatchEvent(new CustomEvent(EDIT_TAB_EVENT, { detail: id }))
}

/** Prépare la partie à afficher à la prochaine ouverture de Réglages. */
export function presetSettingsSection(id: string) {
  try {
    localStorage.setItem(SECTION_KEY, id)
  } catch {
    /* stockage indisponible */
  }
}

/** Réglages déjà ouvert : passer à cette partie (détail : son id, `help-guide` = 1re page du guide). */
export const SECTION_EVENT = 'homedash:settings-section'

/** Ouvre (ou prépare) cette partie de Réglages, Réglages ouvert ou non. */
export function showSettingsSection(id: string) {
  presetSettingsSection(id)
  window.dispatchEvent(new CustomEvent(SECTION_EVENT, { detail: id }))
}

/**
 * Brouillon de Réglages non enregistré : gardé quand on quitte la page (un autre
 * onglet, la recherche) et retrouvé au retour, tant que la config n'a pas changé
 * entre-temps. Avant, il était perdu sans un mot.
 */
let draftCache: { base: string; draft: unknown } | null = null

export function cachedDraft<T>(base: T): T | null {
  return draftCache && draftCache.base === JSON.stringify(base) ? (draftCache.draft as T) : null
}

export function cacheDraft<T>(base: T, draft: T | null) {
  draftCache = draft === null ? null : { base: JSON.stringify(base), draft }
}

/** Enregistre le brouillon en cours ; `null` quand il n'y a rien à enregistrer. */
let saveDraft: (() => void) | null = null

export function setDraftSaver(fn: (() => void) | null) {
  saveDraft = fn
}

export function draftSaver() {
  return saveDraft
}

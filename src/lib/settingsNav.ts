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

/** Prépare la partie à afficher à la prochaine ouverture de Réglages. */
export function presetSettingsSection(id: string) {
  try {
    localStorage.setItem(SECTION_KEY, id)
  } catch {
    /* stockage indisponible */
  }
}

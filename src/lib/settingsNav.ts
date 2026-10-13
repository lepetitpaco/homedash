/** Partie de Réglages affichée, mémorisée d'une visite à l'autre. */
export const SECTION_KEY = 'homedash:settings-section'

/** Prépare la partie à afficher à la prochaine ouverture de Réglages. */
export function presetSettingsSection(id: string) {
  try {
    localStorage.setItem(SECTION_KEY, id)
  } catch {
    /* stockage indisponible */
  }
}

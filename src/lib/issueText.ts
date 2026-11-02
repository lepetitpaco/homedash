/**
 * Corps d'une issue liée à une tâche Basecamp ou à une carte Trello : une section
 * par source, sans rien retaper. Le texte venu du service est seulement rendu
 * lisible sur GitHub (`forGitHub`) ; les précisions tapées dans homedash partent
 * telles quelles.
 */

/** Ce qui part dans l'issue, chaque morceau à part. Vide = section omise. */
export type IssueParts = {
  /** « Tes précisions », tapées dans homedash. */
  need: string
  /** Description de la tâche ou de la carte (et ses étapes), si cochée. */
  card: string
  /** Échanges retenus, déjà mis en forme (`exchangesMarkdown`). */
  exchanges: string
}

/** Un échange : auteur et date tels que le service les donne. */
export type IssueExchange = { who: string; date: string; text: string }

const FENCE = /^\s*(```|~~~)/
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s/
/** Une ligne de 10 tirets ou plus : ce qui suit est la suite de la description. */
const SEPARATOR = /^-{10,}$/

/**
 * Texte d'un service → Markdown sûr et lisible sur GitHub :
 * - aucun `@` devant un mot (GitHub notifierait le compte de ce nom) : une mention
 *   `**@Nom**` devient `**Nom**` ; les e-mails et les adresses web sont épargnés ;
 * - une ligne indentée de 4 espaces n'est plus prise pour du code (sauf liste imbriquée) ;
 * - les sauts de ligne restent des sauts de ligne (deux espaces en fin de ligne).
 * Les blocs de code (```) sont laissés tels quels.
 */
export function forGitHub(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let fenced = false
  const out = lines.map((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced
      return line
    }
    if (fenced) return line
    let l = line.replace(/\s+$/, '')
    if (/^( {4,}|\t)/.test(l) && !LIST_ITEM.test(l)) l = l.trimStart()
    // adresse web d'abord (gardée telle quelle), puis tout `@` en tête de mot
    return l.replace(/(<?https?:\/\/[^\s)>]+>?)|(?<![\w.])@(?=\w)/g, (_all, url: string | undefined) => url ?? '')
  })
  // saut de ligne dur entre deux lignes de texte (GitHub les fusionnerait)
  fenced = false
  return out
    .map((l, i) => {
      if (FENCE.test(l)) {
        fenced = !fenced
        return l
      }
      const next = out[i + 1]
      return !fenced && l.trim() && next?.trim() && !FENCE.test(next) ? `${l}  ` : l
    })
    .join('\n')
    .trim()
}

/**
 * Description de la carte : ce qui suit une ligne de 10 tirets ou plus passe dans un
 * bloc replié, au titre neutre (le code ne sait pas ce qu'il contient). `keep` : début
 * d'un morceau ajouté après la description (les étapes) qui reste visible.
 */
export function foldDescription(text: string, keep?: string): string {
  const lines = text.split('\n')
  const at = lines.findIndex((l) => SEPARATOR.test(l.trim()))
  if (at < 0) return text
  let rest = lines.slice(at + 1).join('\n')
  let tail = ''
  const cut = keep ? rest.indexOf(keep) : -1
  if (cut >= 0) {
    tail = rest.slice(cut).trim()
    rest = rest.slice(0, cut)
  }
  const head = lines.slice(0, at).join('\n').trim()
  if (!rest.trim()) return [head, tail].filter(Boolean).join('\n\n')
  const folded = ['<details><summary>Suite de la description (après le séparateur)</summary>', '', rest.trim(), '', '</details>'].join('\n')
  return [head, folded, tail].filter(Boolean).join('\n\n')
}

/** Échanges retenus : un bloc par message, auteur et date en tête. */
export function exchangesMarkdown(list: IssueExchange[]): string {
  return list.map((c) => `**${c.who}** (${c.date.slice(0, 10)}) :  \n${forGitHub(c.text)}`).join('\n\n')
}

/**
 * Les sections du corps, dans un ordre fixe, chacune omise si sa source est vide.
 * `service` : « Basecamp » ou « Trello » ; `icon` : celle du lien en tête.
 */
export function issueSections(service: string, icon: string, p: IssueParts): string[] {
  const need = p.need.trim()
  const card = p.card.trim()
  const exchanges = p.exchanges.trim()
  const out: string[] = []
  if (need || (!card && !exchanges)) out.push('## 🎯 Mon besoin', '', need || '_À compléter._', '')
  if (card) out.push(`## ${icon} Carte ${service}`, '', '> Description de la carte, reprise telle quelle.', '', card, '')
  if (exchanges) out.push(`## 💬 Échanges ${service}`, '', exchanges, '')
  return out
}

/** Pour l'aperçu : les sections, sans le lien en tête ni la consigne en bas. */
export function sectionsOf(body: string): string {
  const m = /(?:^|\n)(## [\s\S]*?)\n+---\n<!-- homedash:/.exec(body)
  return m ? m[1] : body
}

/** Comment lire les trois sections : commun à la consigne et aux prompts (sans apostrophe droite : voir `claudeCommand`). */
export function sectionsRule(service: string): string {
  return (
    `Le corps de l’issue a jusqu’à trois sections : « Carte ${service} » est la demande d’origine, reprise telle quelle ; ` +
    `« Échanges ${service} » est la suite de la conversation ; « Mon besoin » sont les précisions de la personne qui a créé l’issue, ` +
    `prioritaires en cas d’écart.`
  )
}

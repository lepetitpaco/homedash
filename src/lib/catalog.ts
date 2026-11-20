import type { CustomTab } from '../types'
import { hostOf, preloads } from './customTabs'

/**
 * Sites courants proposés dans Réglages → Mes sites : un clic les ajoute, avec un
 * réglage recommandé, modifiable ensuite. Rien n'est installé, chacun se connecte
 * dans l'onglet.
 *
 * `live` : chargé au démarrage, jamais en veille (ses non-lus arrivent sans l'ouvrir).
 * `click` : chargé au premier clic, jamais en veille (musique, réponse d'une IA en cours :
 *   la veille les couperait).
 * `nap` : chargé au premier clic, en veille après le délai réglé (site lourd qu'on consulte).
 *
 * `shortcut` : une page d'un site déjà au catalogue (Instagram Direct). Les liens de ce site
 * ne s'y ouvrent pas : ils restent pour l'onglet du site lui-même.
 *
 * `background` : joue en fond (YouTube, Spotify, appels, messageries) : le site garde `pauseHidden: false`.
 */
export type CatalogSite = {
  label: string
  url: string
  /** Nom sur dashboardicons.com ; absent = le favicon du site (pas d'icône, ou d'une seule teinte, illisible sur le thème sombre ou le clair). */
  icon?: string
  use: 'live' | 'click' | 'nap'
  shortcut?: boolean
  domains?: string[]
  /**
   * Joue en fond, jamais de pause quand on n'y est pas (#175) : lecteurs média, appels, réunions et messageries.
   * Absent = en pause dès qu'il n'est plus affiché (apps de scroll, bureautique, IA, dev, liens perso).
   */
  background?: boolean
}
export type CatalogGroup = { title: string; sites: CatalogSite[] }

const ICONS = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/'

/** L'onglet créé à partir d'un site du catalogue. */
export function catalogTab(site: CatalogSite): Omit<CustomTab, 'id'> {
  return {
    label: site.label,
    url: site.url,
    embed: true,
    preload: site.use === 'live',
    ...(site.icon ? { icon: `${ICONS}${site.icon}.png` } : {}),
    ...(site.use === 'nap' ? { sleep: true } : {}),
    ...(site.background ? { pauseHidden: false } : {}),
    ...(site.shortcut ? { capture: false } : {}),
    ...(site.domains ? { domains: site.domains } : {}),
  }
}

/** Le réglage recommandé, en mots (bulle du catalogue). */
export function catalogHint(site: CatalogSite): string {
  const play = site.background ? ', joue en fond' : ', vidéos en pause quand tu n’y es pas'
  if (site.use === 'live') return `Chargé au démarrage, pour ses non-lus${play}`
  if (site.use === 'click') return `Chargé au premier clic, sans mise en veille${play}`
  return `Chargé au premier clic, mis en veille si tu n’y vas plus${play}`
}

/** Le site du catalogue d'un onglet existant : raccourci d'abord (même hôte que son site). */
export function siteOf(t: CustomTab): CatalogSite | undefined {
  const all = CATALOG.flatMap((g) => g.sites)
  const host = hostOf(t.url)
  return (
    all.find((s) => s.shortcut && t.url.startsWith(s.url)) ??
    (host ? all.find((s) => !s.shortcut && hostOf(s.url) === host) : undefined)
  )
}

/** Le site joue-t-il en fond d'après le catalogue (reconnu par son adresse) ? Faux pour un lien perso inconnu. */
export function catalogBackground(t: CustomTab): boolean {
  return !!siteOf(t)?.background
}

/**
 * « Pause quand je n'y suis pas » (#175) : le réglage du site, sinon le défaut du code : pause, sauf si le catalogue
 * dit que le site joue en fond. Une config ancienne sans la clé marche donc telle quelle, sans migration.
 */
export function pauseHiddenOf(t: CustomTab): boolean {
  return t.pauseHidden ?? !catalogBackground(t)
}

export type Advice = { patch: Partial<CustomTab>; changes: string[] }

/**
 * Ce que le réglage recommandé changerait sur un onglet existant ; null si rien.
 * Son nom et son adresse ne bougent jamais, et une icône choisie reste.
 */
export function adviceFor(t: CustomTab): Advice | null {
  if (!t.embed || t.kept) return null
  const site = siteOf(t)
  if (!site) return null
  const patch: Partial<CustomTab> = {}
  const changes: string[] = []
  const live = site.use === 'live'
  if (preloads(t) !== live) {
    patch.preload = live
    changes.push(live ? 'chargé au démarrage' : 'chargé au 1er clic')
  }
  const sleep = site.use === 'nap'
  if (!!t.sleep !== sleep) {
    patch.sleep = sleep ? true : undefined
    changes.push(sleep ? 'mise en veille' : 'plus de mise en veille')
  }
  // Seul un site qui joue en fond reçoit un réglage écrit ; les autres suivent le défaut (pause), un réglage manuel
  // différent est proposé de revenir au défaut.
  const bg = !!site.background
  if (bg ? t.pauseHidden !== false : t.pauseHidden === false) {
    patch.pauseHidden = bg ? false : undefined
    changes.push(bg ? 'joue en fond (jamais de pause)' : 'pause quand je n’y suis pas')
  }
  const icon = catalogTab(site).icon
  if (icon && !t.icon) {
    patch.icon = icon
    changes.push('icône')
  }
  return changes.length ? { patch, changes } : null
}

export const CATALOG: CatalogGroup[] = [
  {
    title: 'Mails & agenda',
    sites: [
      { label: 'Gmail', url: 'https://mail.google.com/', icon: 'gmail', use: 'live' },
      { label: 'Outlook', url: 'https://outlook.office.com/mail/', use: 'live' },
      { label: 'Proton Mail', url: 'https://mail.proton.me/', icon: 'proton-mail', use: 'live' },
      { label: 'iCloud Mail', url: 'https://www.icloud.com/mail/', icon: 'icloud', use: 'live' },
      { label: 'Yahoo Mail', url: 'https://mail.yahoo.com/', icon: 'yahoo-mail', use: 'live' },
      { label: 'Fastmail', url: 'https://app.fastmail.com/', icon: 'fastmail', use: 'live' },
      { label: 'Tuta', url: 'https://app.tuta.com/', icon: 'tuta', use: 'live' },
      { label: 'Agenda', url: 'https://calendar.google.com/', icon: 'google-calendar', use: 'nap' },
      { label: 'Proton Calendar', url: 'https://calendar.proton.me/', icon: 'proton-calendar', use: 'nap' },
    ],
  },
  {
    title: 'Messageries',
    sites: [
      { label: 'WhatsApp', url: 'https://web.whatsapp.com/', icon: 'whatsapp', use: 'live', background: true },
      { label: 'Messenger', url: 'https://www.messenger.com/', icon: 'facebook-messenger', use: 'live', background: true },
      { label: 'Instagram Direct', url: 'https://www.instagram.com/direct/inbox/', icon: 'instagram', use: 'live', shortcut: true, background: true },
      { label: 'Messages X', url: 'https://x.com/messages', use: 'live', shortcut: true, background: true },
      { label: 'Messagerie LinkedIn', url: 'https://www.linkedin.com/messaging/', icon: 'linkedin', use: 'live', shortcut: true, background: true },
      { label: 'Chat Reddit', url: 'https://www.reddit.com/chat/', icon: 'reddit', use: 'live', shortcut: true, background: true },
      { label: 'Telegram', url: 'https://web.telegram.org/', icon: 'telegram', use: 'live', background: true },
      { label: 'Discord', url: 'https://discord.com/app', icon: 'discord', use: 'live', background: true },
      { label: 'Slack', url: 'https://app.slack.com/', icon: 'slack', use: 'live', background: true },
      { label: 'Teams', url: 'https://teams.microsoft.com/', icon: 'microsoft-teams', use: 'live', background: true },
      { label: 'Google Chat', url: 'https://chat.google.com/', icon: 'google-chat', use: 'live', background: true },
      { label: 'Element', url: 'https://app.element.io/', icon: 'element', use: 'live', background: true },
    ],
  },
  {
    title: 'Réseaux sociaux',
    sites: [
      { label: 'X', url: 'https://x.com/', use: 'nap' },
      // Ses messages : au démarrage, pour la pastille (un seul onglet suffit, Direct est la même appli).
      { label: 'Instagram', url: 'https://www.instagram.com/', icon: 'instagram', use: 'live' },
      { label: 'Facebook', url: 'https://www.facebook.com/', icon: 'facebook', use: 'nap' },
      { label: 'LinkedIn', url: 'https://www.linkedin.com/', icon: 'linkedin', use: 'nap' },
      { label: 'TikTok', url: 'https://www.tiktok.com/', icon: 'tiktok', use: 'nap' },
      { label: 'Reddit', url: 'https://www.reddit.com/', icon: 'reddit', use: 'nap' },
      { label: 'Bluesky', url: 'https://bsky.app/', icon: 'bluesky', use: 'nap' },
      { label: 'Threads', url: 'https://www.threads.net/', use: 'nap' },
      { label: 'Mastodon', url: 'https://mastodon.social/', icon: 'mastodon', use: 'nap' },
      { label: 'Pinterest', url: 'https://www.pinterest.com/', icon: 'pinterest', use: 'nap' },
      { label: 'Snapchat', url: 'https://web.snapchat.com/', icon: 'snapchat', use: 'nap' },
    ],
  },
  {
    title: 'IA',
    sites: [
      { label: 'Claude', url: 'https://claude.ai/', icon: 'claude-ai', use: 'click' },
      { label: 'ChatGPT', url: 'https://chatgpt.com/', icon: 'chatgpt', use: 'click' },
      { label: 'Gemini', url: 'https://gemini.google.com/', use: 'click' },
      { label: 'Le Chat', url: 'https://chat.mistral.ai/', icon: 'mistral-ai', use: 'click' },
      { label: 'Perplexity', url: 'https://www.perplexity.ai/', icon: 'perplexity', use: 'click' },
      { label: 'Copilot', url: 'https://copilot.microsoft.com/', icon: 'microsoft-copilot', use: 'click' },
      { label: 'DeepSeek', url: 'https://chat.deepseek.com/', icon: 'deepseek', use: 'click' },
      { label: 'Grok', url: 'https://grok.com/', use: 'click' },
    ],
  },
  {
    title: 'Vidéo & musique',
    sites: [
      { label: 'YouTube', url: 'https://www.youtube.com/', icon: 'youtube', use: 'click', background: true },
      { label: 'YouTube Music', url: 'https://music.youtube.com/', icon: 'youtube-music', use: 'click', background: true },
      { label: 'Spotify', url: 'https://open.spotify.com/', icon: 'spotify', use: 'click', background: true },
      { label: 'Deezer', url: 'https://www.deezer.com/', icon: 'deezer', use: 'click', background: true },
      { label: 'Apple Music', url: 'https://music.apple.com/', icon: 'apple-music', use: 'click', background: true },
      { label: 'SoundCloud', url: 'https://soundcloud.com/', use: 'click', background: true },
      { label: 'Twitch', url: 'https://www.twitch.tv/', icon: 'twitch', use: 'click', background: true },
      { label: 'Netflix', url: 'https://www.netflix.com/', icon: 'netflix', use: 'click', background: true },
      { label: 'Plex', url: 'https://app.plex.tv/', icon: 'plex', use: 'click', background: true },
    ],
  },
  {
    title: 'Travail',
    sites: [
      { label: 'Drive', url: 'https://drive.google.com/', icon: 'google-drive', use: 'nap' },
      { label: 'Docs', url: 'https://docs.google.com/document/', icon: 'google-docs', use: 'nap' },
      { label: 'Sheets', url: 'https://docs.google.com/spreadsheets/', icon: 'google-sheets', use: 'nap' },
      { label: 'Keep', url: 'https://keep.google.com/', icon: 'google-keep', use: 'nap' },
      { label: 'Photos', url: 'https://photos.google.com/', icon: 'google-photos', use: 'nap' },
      { label: 'Meet', url: 'https://meet.google.com/', icon: 'google-meet', use: 'click', background: true },
      { label: 'Zoom', url: 'https://app.zoom.us/wc/', icon: 'zoom', use: 'click', background: true },
      { label: 'Dropbox', url: 'https://www.dropbox.com/home', icon: 'dropbox', use: 'nap' },
      { label: 'Notion', url: 'https://www.notion.so/', icon: 'notion', use: 'nap' },
      { label: 'Figma', url: 'https://www.figma.com/', icon: 'figma', use: 'nap' },
      { label: 'Miro', url: 'https://miro.com/app/', icon: 'miro', use: 'nap' },
      { label: 'Trello', url: 'https://trello.com/', use: 'nap' },
      { label: 'Asana', url: 'https://app.asana.com/', icon: 'asana', use: 'nap' },
      { label: 'Todoist', url: 'https://app.todoist.com/', icon: 'todoist', use: 'nap' },
    ],
  },
  {
    title: 'Dev',
    sites: [
      { label: 'GitHub', url: 'https://github.com/', use: 'nap' },
      { label: 'GitLab', url: 'https://gitlab.com/', icon: 'gitlab', use: 'nap' },
      { label: 'Linear', url: 'https://linear.app/', use: 'nap' },
      { label: 'Vercel', url: 'https://vercel.com/dashboard', use: 'nap' },
      { label: 'Cloudflare', url: 'https://dash.cloudflare.com/', icon: 'cloudflare', use: 'nap' },
    ],
  },
]

/**
 * Sites courants proposés dans Réglages → Onglets perso : un clic les ajoute.
 * Juste des adresses : rien n'est installé, chacun se connecte dans l'onglet.
 */
export type CatalogSite = { label: string; url: string; domains?: string[] }
export type CatalogGroup = { title: string; sites: CatalogSite[] }

export const CATALOG: CatalogGroup[] = [
  {
    title: 'Mails & agenda',
    sites: [
      { label: 'Gmail', url: 'https://mail.google.com/' },
      { label: 'Agenda', url: 'https://calendar.google.com/' },
      { label: 'Outlook', url: 'https://outlook.office.com/mail/' },
      { label: 'Proton Mail', url: 'https://mail.proton.me/' },
      { label: 'iCloud Mail', url: 'https://www.icloud.com/mail/' },
      { label: 'Yahoo Mail', url: 'https://mail.yahoo.com/' },
    ],
  },
  {
    title: 'Messageries',
    sites: [
      { label: 'Google Chat', url: 'https://chat.google.com/' },
      { label: 'WhatsApp', url: 'https://web.whatsapp.com/' },
      { label: 'Messenger', url: 'https://www.messenger.com/' },
      { label: 'Telegram', url: 'https://web.telegram.org/' },
      { label: 'Slack', url: 'https://app.slack.com/' },
      { label: 'Discord', url: 'https://discord.com/app' },
      { label: 'Teams', url: 'https://teams.microsoft.com/' },
    ],
  },
  {
    title: 'Réseaux sociaux',
    sites: [
      { label: 'X', url: 'https://x.com/' },
      { label: 'Instagram', url: 'https://www.instagram.com/' },
      { label: 'Facebook', url: 'https://www.facebook.com/' },
      { label: 'LinkedIn', url: 'https://www.linkedin.com/' },
      { label: 'YouTube', url: 'https://www.youtube.com/' },
      { label: 'TikTok', url: 'https://www.tiktok.com/' },
      { label: 'Reddit', url: 'https://www.reddit.com/' },
      { label: 'Bluesky', url: 'https://bsky.app/' },
      { label: 'Threads', url: 'https://www.threads.net/' },
    ],
  },
  {
    title: 'IA',
    sites: [
      { label: 'Claude', url: 'https://claude.ai/' },
      { label: 'ChatGPT', url: 'https://chatgpt.com/' },
      { label: 'Gemini', url: 'https://gemini.google.com/' },
      { label: 'Le Chat', url: 'https://chat.mistral.ai/' },
      { label: 'Perplexity', url: 'https://www.perplexity.ai/' },
      { label: 'Copilot', url: 'https://copilot.microsoft.com/' },
    ],
  },
  {
    title: 'Outils',
    sites: [
      { label: 'Drive', url: 'https://drive.google.com/' },
      { label: 'Notion', url: 'https://www.notion.so/' },
      { label: 'Figma', url: 'https://www.figma.com/' },
      { label: 'Trello', url: 'https://trello.com/' },
      { label: 'Spotify', url: 'https://open.spotify.com/' },
    ],
  },
]

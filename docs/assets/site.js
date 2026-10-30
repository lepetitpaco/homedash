// En-tête et pied de page communs, et affichage d'un fichier Markdown du dépôt (toujours la version de main).
const RAW = 'https://raw.githubusercontent.com/lepetitpaco/homedash/main/'
const NAV = [
  ['./#onglets', 'Fonctionnalités'],
  ['installer.html', 'Installer'],
  ['guide.html', "Mode d'emploi"],
  ['nouveautes.html', 'Nouveautés'],
]
const FOOT = [
  ['installer.html', 'Installer'],
  ['guide.html', "Mode d'emploi"],
  ['nouveautes.html', 'Nouveautés'],
  ['confidentialite.html', 'Confidentialité'],
  ['aide.html', 'Une idée, un souci ?'],
  ['https://github.com/lepetitpaco/homedash', 'Code source'],
]
const here = location.pathname.split('/').pop() || 'index.html'
const link = ([href, label], cls = '') =>
  `<a href="${href}"${cls ? ` class="${cls}"` : ''}${href === here ? ' aria-current="page"' : ''}>${label}</a>`

document.body.insertAdjacentHTML('afterbegin', `<div class="top"><div class="in">
  <a class="brand" href="./"><img src="icon.png" alt="">homedash</a>
  <nav>${NAV.map((l) => link(l)).join('')}${link(['https://github.com/lepetitpaco/homedash/releases/latest', 'Télécharger'], 'pill')}</nav>
</div></div>`)
document.body.insertAdjacentHTML('beforeend', `<footer>${FOOT.map((l) => link(l)).join(' · ')}</footer>`)

const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Affiche `file` dans `#md` ; `tidy(html)` retouche le HTML ; sommaire des titres ## dans `#toc`. */
export async function render(file, tidy = (h) => h) {
  const box = document.getElementById('md')
  try {
    const res = await fetch(RAW + file, { cache: 'no-cache' })
    if (!res.ok) throw new Error(res.status)
    const md = await res.text()
    box.innerHTML = tidy(window.marked.parse(md))
  } catch {
    box.innerHTML = `<p>Impossible de charger cette page. <a href="https://github.com/lepetitpaco/homedash/blob/main/${file}">La lire sur GitHub</a>.</p>`
    return
  }
  // Liens entre fichiers du dépôt → pages du site
  const pages = { 'README.md': './', 'GUIDE.md': 'guide.html', 'CHANGELOG.md': 'nouveautes.html', 'PRIVACY.md': 'confidentialite.html' }
  for (const a of box.querySelectorAll('a[href]')) {
    const [path, hash] = a.getAttribute('href').split('#')
    const name = path.split('/').pop()
    if (name === 'README.md' && hash === 'installer') a.href = 'installer.html'
    else if (pages[name]) a.href = pages[name]
    else if (/\.md$/.test(name)) a.href = 'https://github.com/lepetitpaco/homedash/blob/main/' + path
  }
  const toc = document.getElementById('toc')
  for (const h of box.querySelectorAll('h2')) {
    h.id = slug(h.textContent)
    if (toc) toc.insertAdjacentHTML('beforeend', `<a href="#${h.id}">${h.textContent}</a>`)
  }
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
}

/**
 * Ce que la mise à jour décide sans rien toucher (updater.js s'en sert) : quelle
 * version est plus récente, quel fichier de la Release va à cette machine, et
 * si le fichier téléchargé est bien celui publié. Sans Electron : testé à part
 * (tests-ts/release.test.ts).
 */
const crypto = require('node:crypto')
const fs = require('node:fs')

/** `1.10.0` > `1.9.3`. */
function newer(a, b) {
  const x = String(a).split('.').map(Number)
  const y = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

/**
 * `latest-mac.yml` / `latest.yml` d'electron-builder → [{url, sha512, size}].
 * Format fixe et simple : pas besoin d'une bibliothèque YAML.
 */
function parseLatest(text) {
  const files = []
  let cur = null
  for (const line of String(text).split(/\r?\n/)) {
    const item = /^\s*-\s+url:\s*(.+)$/.exec(line)
    if (item) {
      cur = { url: item[1].trim().replace(/^['"]|['"]$/g, '') }
      files.push(cur)
      continue
    }
    const kv = /^\s+(sha512|size):\s*(.+)$/.exec(line)
    if (kv && cur) cur[kv[1]] = kv[1] === 'size' ? Number(kv[2]) : kv[2].trim().replace(/^['"]|['"]$/g, '')
    else if (/^\S/.test(line)) cur = null
  }
  return files
}

/** Le fichier de cette machine : zip Mac de la bonne architecture, ou installateur Windows. */
function pick(files, platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') {
    const a = arch === 'arm64' ? 'arm64' : 'x64'
    return files.find((f) => f.url.endsWith('.zip') && f.url.includes(`-${a}-`)) || null
  }
  if (platform === 'win32') return files.find((f) => f.url.endsWith('.exe')) || null
  return null
}

/** Empreinte d'un fichier au format de latest*.yml : sha512 en base64. */
function sha512Of(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')
}

/** Le fichier téléchargé est-il celui publié ? Sans empreinte publiée : non. */
function matches(digest, expected) {
  return typeof expected === 'string' && expected.length > 0 && digest === expected
}

module.exports = { matches, newer, parseLatest, pick, sha512Of }

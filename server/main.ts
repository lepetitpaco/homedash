/**
 * Serveur homedash seul, en HTTP : le dev (Docker, :7778) s'en sert.
 * L'appli de bureau, elle, lance `host.ts` dans un utilityProcess.
 */

import { httpHosts, setPublicDir, start } from './app.ts'
import { createServer } from './http.ts'
import * as store from './store.ts'

const PORT = Number(process.env.PORT || 7779)
const HOST = process.env.HOST || '127.0.0.1'

if (process.env.PUBLIC_DIR) setPublicDir(process.env.PUBLIC_DIR)
start()
createServer({ hosts: httpHosts() }).listen(PORT, HOST, () => {
  console.log(`homedash sur http://${HOST}:${PORT} — data ${store.DATA_DIR()}`)
})

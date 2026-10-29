/**
 * Avant tout module du serveur : un DATA_DIR temporaire par fichier de test,
 * jamais le data/ réel, et aucun jeton venu de l'environnement.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'

import * as store from '../server/store.ts'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homedash-tests-'))
process.env.DATA_DIR = dir
delete process.env.GH_TOKEN
delete process.env.GITHUB_TOKEN
store.setDataDir(dir)

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

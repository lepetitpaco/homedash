import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

// Le script de pause des panneaux inactifs (#168 #175), exécuté sur un DOM factice.
const { PAUSE_SCRIPT, RESUME_SCRIPT } = createRequire(import.meta.url)('../desktop/site-adapters.js') as { PAUSE_SCRIPT: string; RESUME_SCRIPT: string }

type Media = { tagName: string; paused: boolean; ended: boolean; srcObject: unknown; attrs: Set<string>; pauses: number; plays: number } & Record<string, unknown>
const media = (tagName: 'VIDEO' | 'AUDIO', over: Partial<Media> = {}): Media => {
  const m: Media = {
    tagName,
    paused: false,
    ended: false,
    srcObject: null,
    attrs: new Set(),
    pauses: 0,
    plays: 0,
    ...over,
  }
  m.pause = () => ((m.paused = true), m.pauses++)
  m.play = () => ((m.paused = false), m.plays++, Promise.resolve())
  m.setAttribute = (k: string) => m.attrs.add(k)
  m.removeAttribute = (k: string) => m.attrs.delete(k)
  return m
}

function page(items: Media[]) {
  let onPlay: ((e: { target: Media }) => void) | null = null
  const win: Record<string, unknown> = {}
  const doc = {
    querySelectorAll: (sel: string) => (sel.includes('data-hd-paused') ? items.filter((m) => m.attrs.has('data-hd-paused')) : items),
    addEventListener: (t: string, f: (e: { target: Media }) => void) => t === 'play' && (onPlay = f),
  }
  const run = (script: string) => new Function('window', 'document', `return ${script}`)(win, doc)
  return { run, play: (m: Media) => ((m.paused = false), onPlay?.({ target: m })), win }
}

describe('pause des médias d’un panneau inactif', () => {
  it('met en pause une vidéo en lecture, la marque, et la reprise ne relance que les marquées', () => {
    const playing = media('VIDEO')
    const byHand = media('VIDEO', { paused: true })
    const p = page([playing, byHand])
    p.run(PAUSE_SCRIPT)
    expect(playing.paused).toBe(true)
    expect(playing.attrs.has('data-hd-paused')).toBe(true)
    expect(byHand.attrs.size).toBe(0)
    p.run(RESUME_SCRIPT)
    expect(playing.plays).toBe(1)
    expect(byHand.plays).toBe(0)
  })

  it('un média à srcObject (appel WebRTC) n’est jamais coupé ni relancé, ni quand la page le relance', () => {
    const call = media('VIDEO', { srcObject: {} })
    const callAudio = media('AUDIO', { srcObject: {} })
    const p = page([call, callAudio])
    p.run(PAUSE_SCRIPT)
    expect(call.pauses + callAudio.pauses).toBe(0)
    p.play(call)
    p.play(callAudio)
    expect(call.pauses + callAudio.pauses).toBe(0)
    p.run(RESUME_SCRIPT)
    expect(call.plays + callAudio.plays).toBe(0)
  })

  it('une vidéo relancée par la page est remise en pause ; un <audio> aussi mais SANS être marqué pour la reprise', () => {
    const v = media('VIDEO', { paused: true })
    const ding = media('AUDIO', { paused: true })
    const p = page([v, ding])
    p.run(PAUSE_SCRIPT)
    p.play(v)
    p.play(ding)
    expect(v.paused).toBe(true)
    expect(v.attrs.has('data-hd-paused')).toBe(true)
    expect(ding.paused).toBe(true)
    expect(ding.attrs.size).toBe(0)
    p.run(RESUME_SCRIPT)
    expect(v.plays).toBe(1)
    // pas de vieux « ding » au retour sur le site
    expect(ding.plays).toBe(0)
  })

  it('après la reprise, une vidéo relancée par la page n’est plus retenue', () => {
    const v = media('VIDEO', { paused: true })
    const p = page([v])
    p.run(PAUSE_SCRIPT)
    p.run(RESUME_SCRIPT)
    p.play(v)
    expect(v.paused).toBe(false)
  })
})

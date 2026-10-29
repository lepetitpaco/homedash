#!/usr/bin/env node
// L'icône de l'appli dev : l'éclair bleu devient orange (rouge et bleu échangés).
// Node seul : le PNG est décodé, ses pixels modifiés, puis réencodé.
//
//   node scripts/icon-dev.mjs public/icon-512.png desktop/build/icon-dev.png

import fs from 'node:fs'
import zlib from 'node:zlib'

const [, , src, dest] = process.argv
const png = fs.readFileSync(src)
let pos = 8
let width = 0
let height = 0
let depth = 0
let colorType = 0
const idat = []
while (pos < png.length) {
  const len = png.readUInt32BE(pos)
  const type = png.toString('latin1', pos + 4, pos + 8)
  const data = png.subarray(pos + 8, pos + 8 + len)
  if (type === 'IHDR') {
    width = data.readUInt32BE(0)
    height = data.readUInt32BE(4)
    depth = data[8]
    colorType = data[9]
  } else if (type === 'IDAT') idat.push(data)
  pos += 12 + len
}
const channels = { 2: 3, 6: 4 }[colorType]
if (depth !== 8 || !channels) throw new Error('PNG RVB(A) 8 bits attendu')
const raw = zlib.inflateSync(Buffer.concat(idat))
const stride = width * channels
const pixels = Buffer.alloc(height * stride)
// Défiltrage ligne par ligne (filtres PNG 0 à 4)
for (let y = 0; y < height; y++) {
  const f = raw[y * (stride + 1)]
  const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? pixels[y * stride + x - channels] : 0
    const b = y > 0 ? pixels[(y - 1) * stride + x] : 0
    const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    const add = [0, a, b, (a + b) >> 1, paeth][f]
    pixels[y * stride + x] = (line[x] + add) & 0xff
  }
}
// Bleu → orange : rouge et bleu échangés (le fond gris foncé ne bouge pas).
for (let i = 0; i < pixels.length; i += channels) {
  const r = pixels[i]
  pixels[i] = pixels[i + 2]
  pixels[i + 2] = r
}
const out = Buffer.alloc(height * (stride + 1))
for (let y = 0; y < height; y++) pixels.copy(out, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(width, 0)
ihdr.writeUInt32BE(height, 4)
ihdr[8] = 8
ihdr[9] = colorType
fs.writeFileSync(dest, Buffer.concat([png.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out)), chunk('IEND', Buffer.alloc(0))]))
console.log(`✓ ${dest}`)

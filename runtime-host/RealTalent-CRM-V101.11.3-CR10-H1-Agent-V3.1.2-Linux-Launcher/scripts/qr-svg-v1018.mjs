// Minimal QR encoder for RealTalent Connect pairing URLs.
// Fixed at QR version 5-L (37x37, 108 data codewords, 26 EC codewords), byte mode, mask 0.
// This keeps the launcher dependency-free and is sufficient for local pairing URLs under 106 UTF-8 bytes.

const VERSION = 5
const SIZE = 17 + VERSION * 4
const DATA_CODEWORDS = 108
const EC_CODEWORDS = 26
const FORMAT_L_MASK_0 = 0x77c4

const gfExp = new Uint8Array(512)
const gfLog = new Uint8Array(256)
let x = 1
for (let i = 0; i < 255; i += 1) {
  gfExp[i] = x
  gfLog[x] = i
  x <<= 1
  if (x & 0x100) x ^= 0x11d
}
for (let i = 255; i < 512; i += 1) gfExp[i] = gfExp[i - 255]
const gfMul = (a, b) => (!a || !b) ? 0 : gfExp[gfLog[a] + gfLog[b]]

function generatorPolynomial(degree) {
  let result = [1]
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(result.length + 1).fill(0)
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= result[j]
      next[j + 1] ^= gfMul(result[j], gfExp[i])
    }
    result = next
  }
  return result
}

function reedSolomon(data, degree) {
  const gen = generatorPolynomial(degree)
  const rem = new Array(degree).fill(0)
  for (const value of data) {
    const factor = value ^ rem[0]
    rem.shift(); rem.push(0)
    for (let i = 0; i < degree; i += 1) rem[i] ^= gfMul(gen[i + 1], factor)
  }
  return rem
}

function bitBuffer(text) {
  const bytes = [...new TextEncoder().encode(text)]
  if (bytes.length > 106) throw new Error('URL de pareamento longa demais para o QR local.')
  const bits = []
  const append = (value, count) => { for (let i = count - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1) }
  append(0b0100, 4)
  append(bytes.length, 8)
  for (const byte of bytes) append(byte, 8)
  const capacity = DATA_CODEWORDS * 8
  for (let i = 0; i < Math.min(4, capacity - bits.length); i += 1) bits.push(0)
  while (bits.length % 8) bits.push(0)
  const data = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0))
  let pad = 0
  while (data.length < DATA_CODEWORDS) { data.push(pad % 2 === 0 ? 0xec : 0x11); pad += 1 }
  const ec = reedSolomon(data, EC_CODEWORDS)
  return [...data, ...ec].flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1))
}

function matrixFor(text) {
  const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false))
  const reserved = Array.from({ length: SIZE }, () => Array(SIZE).fill(false))
  const setFunction = (row, col, dark) => {
    if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) return
    modules[row][col] = Boolean(dark)
    reserved[row][col] = true
  }
  const finder = (row, col) => {
    for (let dy = -1; dy <= 7; dy += 1) for (let dx = -1; dx <= 7; dx += 1) {
      const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
      setFunction(row + dy, col + dx, dist !== 2 && dist !== 4)
    }
  }
  finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0)
  for (let i = 8; i < SIZE - 8; i += 1) {
    setFunction(6, i, i % 2 === 0)
    setFunction(i, 6, i % 2 === 0)
  }
  const alignment = (cy, cx) => {
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) setFunction(cy + dy, cx + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  alignment(30, 30)

  // Reserve and render format information for ECC L, mask 0.
  const bits = FORMAT_L_MASK_0
  const bit = (i) => ((bits >>> i) & 1) !== 0
  for (let i = 0; i <= 5; i += 1) setFunction(i, 8, bit(i))
  setFunction(7, 8, bit(6)); setFunction(8, 8, bit(7)); setFunction(8, 7, bit(8))
  for (let i = 9; i < 15; i += 1) setFunction(8, 14 - i, bit(i))
  for (let i = 0; i < 8; i += 1) setFunction(8, SIZE - 1 - i, bit(i))
  for (let i = 8; i < 15; i += 1) setFunction(SIZE - 15 + i, 8, bit(i))
  setFunction(SIZE - 8, 8, true)

  const dataBits = bitBuffer(text)
  let index = 0
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < SIZE; vert += 1) {
      const upward = (((right + 1) & 2) === 0)
      const row = upward ? SIZE - 1 - vert : vert
      for (let j = 0; j < 2; j += 1) {
        const col = right - j
        if (reserved[row][col]) continue
        let dark = index < dataBits.length ? Boolean(dataBits[index]) : false
        index += 1
        if ((row + col) % 2 === 0) dark = !dark
        modules[row][col] = dark
      }
    }
  }
  return modules
}

export function qrSvg(text, scale = 6, border = 4) {
  const modules = matrixFor(text)
  const dim = (SIZE + border * 2) * scale
  const paths = []
  for (let row = 0; row < SIZE; row += 1) for (let col = 0; col < SIZE; col += 1) if (modules[row][col]) paths.push(`M${(col + border) * scale},${(row + border) * scale}h${scale}v${scale}h-${scale}z`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join('')}" fill="#111827"/></svg>`
}

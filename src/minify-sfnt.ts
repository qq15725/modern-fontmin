import { minifyGlyphs } from './minify-glyphs'
import type { GlyphCodePoint, Tables } from './types'

// https://developer.apple.com/fonts/TrueType-Reference-Manual
// using "OpenType Collections", formerly known as "TrueType collections"
export function minifySfnt(tables: Tables, subset: string) {
  const glyphs = minifyGlyphs(tables, subset)
  const numGlyphs = glyphs.length

  const glyphCodePoints: GlyphCodePoint[] = glyphs
    .flatMap(glyph => glyph.codePoints.map(codePoint => ({
      codePoint,
      glyphIndex: codePoint !== 0xFFFF ? glyph.glyphIndex : 0,
    })))
    .sort((a, b) => a.codePoint - b.codePoint)

  // head
  const head = tables.get('head')!
  head.setUint32(8, 0, false) // checkSumAdjustment
  head.setUint32(12, 0x5F0F3CF5, false) // magickNumber
  // TODO created
  // TODO modified
  head.setInt16(50, 1, false) // indexToLocFormat

  // maxp
  const maxp = tables.get('maxp')!
  maxp.setUint16(4, numGlyphs, false) // numGlyphs

  // loca
  const newLoca = new DataView(new ArrayBuffer((numGlyphs + 1) * 4))
  let newLocaOffset = 0
  glyphs.forEach((glyf, i) => {
    newLoca.setUint32(i * 4, newLocaOffset, false)
    newLocaOffset += glyf.buffer.byteLength
  })
  newLoca.setUint32(numGlyphs * 4, newLocaOffset, false) // extra
  tables.set('loca', newLoca)

  // cmap
  const format4Segments = getSegments(glyphCodePoints, 0xFFFF)
  const format4Size = 24 + format4Segments.length * 8
  const format0Segments = getFormat0Segment(glyphCodePoints)
  const format0Size = 262
  const hasGLyphsOver2Bytes = glyphCodePoints.some(glyph => glyph.codePoint > 0xFFFF)
  let format12Segments: any[] | undefined
  let format12Size: number | undefined
  if (hasGLyphsOver2Bytes) {
    format12Segments = getSegments(glyphCodePoints)
    format12Size = 16 + format12Segments.length * 12
  }
  const subTableOffset = 4 + (hasGLyphsOver2Bytes ? 32 : 24)
  const subTables = [
    [0, 3, subTableOffset], // subtable 4, unicode
    [1, 0, subTableOffset + format4Size], // subtable 0, mac standard
    [3, 1, subTableOffset], // subtable 4, windows standard
    hasGLyphsOver2Bytes && [3, 10, subTableOffset + format4Size + format0Size], // hasGLyphsOver2Bytes
  ].filter(Boolean) as [number, number, number][]
  const newCmapSize = 4 // cmap header
      + subTables.length * 8 // sub-tables header
      + format0Size // format 0 sub-table
      + format4Size // format 4 sub-table
      + (hasGLyphsOver2Bytes ? format12Size! : 0) // format 12 sub-table
  const newCmap = new DataView(new ArrayBuffer(newCmapSize))
  let cmapOffset = 0
  newCmap.setUint16(cmapOffset, 0, false) // version
  newCmap.setUint16(cmapOffset += 2, subTables.length, false) // count
  cmapOffset += 2
  subTables.forEach(([platform, encoding, offset]) => {
    newCmap.setUint16(cmapOffset, platform, false) // platform
    newCmap.setUint16(cmapOffset += 2, encoding, false) // encoding
    newCmap.setUint32(cmapOffset += 2, offset, false) // offset
    cmapOffset += 4
  })
  const data = new Uint8Array(newCmap.buffer)
  data.set(new Uint8Array(createSubTable4(format4Size, format4Segments).buffer), cmapOffset)
  cmapOffset += format4Size
  data.set(new Uint8Array(createSubTable0(format0Size, format0Segments).buffer), cmapOffset)
  cmapOffset += format0Size
  if (hasGLyphsOver2Bytes) {
    data.set(new Uint8Array(createSubTable12(format12Size!, format12Segments!).buffer), cmapOffset)
    cmapOffset += format12Size!
  }
  tables.set('cmap', new DataView(data.buffer))

  // glyf
  const newGlyf = new Uint8Array(glyphs.reduce((sum, glyf) => sum + glyf.buffer.byteLength, 0))
  let glyfOffset = 0
  glyphs.forEach(glyf => {
    newGlyf.set(new Uint8Array(glyf.buffer), glyfOffset)
    glyfOffset += glyf.buffer.byteLength
  })
  tables.set('glyf', new DataView(newGlyf.buffer))

  // hhea
  tables.get('hhea')!.setUint16(34, numGlyphs, false) // numOfLongHorMetrics

  // hmtx
  const newHmtx = new DataView(new ArrayBuffer(4 * numGlyphs))
  for (let i = 0; i < numGlyphs; i++) {
    newHmtx.setUint16(i * 4, glyphs[i].advanceWidth, false)
    newHmtx.setInt16(i * 4 + 2, glyphs[i].leftSideBearing, false)
  }
  tables.set('hmtx', newHmtx)

  // vhea
  tables.get('vhea')?.setUint16(34, numGlyphs, false) // numOfLongVerMetrics

  // vmtx
  if (tables.has('vmtx')) {
    const newVmtx = new DataView(new ArrayBuffer(4 * numGlyphs))
    for (let i = 0; i < numGlyphs; i++) {
      newVmtx.setUint16(i * 4, glyphs[i].advanceHeight, false)
      newVmtx.setInt16(i * 4 + 2, glyphs[i].topSideBearing, false)
    }
    tables.set('vmtx', newVmtx)
  }

  // post
  const newPost = new DataView(new ArrayBuffer(32))
  newPost.setInt32(0, Math.round(3 * 65536), false) // format
  newPost.setInt32(4, 0, false) // italicAngle
  newPost.setInt16(8, 0, false) // underlinePosition
  newPost.setInt16(10, 0, false) // underlineThickness
  newPost.setUint32(12, 0, false) // isFixedPitch
  newPost.setUint32(16, 0, false) // minMemType42
  newPost.setUint32(20, 0, false) // maxMemType42
  newPost.setUint32(24, 0, false) // minMemType1
  newPost.setUint32(28, numGlyphs, false) // maxMemType1
  tables.set('post', newPost)
}

function getSegments(glyphCodePoints: GlyphCodePoint[], bound?: number) {
  let prevGlyph: GlyphCodePoint | null = null
  const result: Record<string, any>[] = []
  let segment: Record<string, any> = {}
  glyphCodePoints.forEach(glyph => {
    if (bound === undefined || glyph.codePoint <= bound) {
      if (prevGlyph === null
          || glyph.codePoint !== prevGlyph.codePoint + 1
          || glyph.glyphIndex !== prevGlyph.glyphIndex + 1
      ) {
        if (prevGlyph !== null) {
          segment.end = prevGlyph.codePoint
          result.push(segment)
          segment = {
            start: glyph.codePoint,
            startId: glyph.glyphIndex,
            delta: encodeDelta(glyph.glyphIndex - glyph.codePoint),
          }
        } else {
          segment.start = glyph.codePoint
          segment.startId = glyph.glyphIndex
          segment.delta = encodeDelta(glyph.glyphIndex - glyph.codePoint)
        }
      }
      prevGlyph = glyph
    }
  })
  if (prevGlyph !== null) {
    segment.end = (prevGlyph as any).codePoint
    result.push(segment)
  }
  return result
}

function getFormat0Segment(glyphCodePoints: GlyphCodePoint[]) {
  const unicodes: [number, number][] = []
  glyphCodePoints.forEach(glyph => {
    if (glyph.codePoint !== undefined && glyph.codePoint < 256) {
      unicodes.push([glyph.codePoint, glyph.glyphIndex])
    }
  })
  unicodes.sort((a, b) => a[0] - b[0])
  return unicodes
}

function encodeDelta(delta: number) {
  return delta > 0x7FFF
    ? delta - 0x10000
    : (delta < -0x7FFF ? delta + 0x10000 : delta)
}

function createSubTable0(size: number, unicodes: any[]) {
  const view = new DataView(new ArrayBuffer(size))

  let offset = 0

  view.setUint16(offset, 0, false) // format
  view.setUint16(offset += 2, size, false) // length
  view.setUint16(offset += 2, 0, false) // language

  offset += 2

  // Array of unicodes 0..255
  let i = -1
  let unicode: any[]
  // eslint-disable-next-line no-cond-assign
  while (unicode = unicodes.shift()) {
    while (++i < unicode[0]) {
      view.setUint8(offset++, 0)
    }
    view.setUint8(offset++, unicode[1])
    i = unicode[0]
  }

  while (++i < (size - 6)) {
    view.setUint8(offset++, 0)
  }

  return view
}

function createSubTable4(size: number, segments: Record<string, any>[]) {
  const view = new DataView(new ArrayBuffer(size))

  let offset = 0

  view.setUint16(offset, 4, false) // format
  view.setUint16(offset += 2, 24 + segments.length * 8, false) // length
  view.setUint16(offset += 2, 0, false) // language

  const segCount = segments.length + 1
  const maxExponent = Math.floor(Math.log(segCount) / Math.LN2)
  const searchRange = 2 * Math.pow(2, maxExponent)

  view.setUint16(offset += 2, segCount * 2, false) // segCountX2
  view.setUint16(offset += 2, searchRange, false) // searchRange
  view.setUint16(offset += 2, maxExponent, false) // entrySelector
  view.setUint16(offset += 2, 2 * segCount - searchRange, false) // rangeShift

  // end list
  segments.forEach(segment => {
    view.setUint16(offset += 2, segment.end, false)
  })
  view.setUint16(offset += 2, 0xFFFF, false) // end code
  view.setUint16(offset += 2, 0, false) // reservedPad

  // start list
  segments.forEach((segment) => {
    view.setUint16(offset += 2, segment.start, false)
  })
  view.setUint16(offset += 2, 0xFFFF, false) // start code

  // id delta
  segments.forEach((segment) => {
    view.setUint16(offset += 2, segment.delta, false)
  })
  view.setUint16(offset += 2, 1, false)

  // Array of range offsets, it doesn't matter when deltas present
  for (let i = 0, l = segments.length; i < l; i++) {
    view.setUint16(offset += 2, 0, false)
  }
  view.setUint16(offset += 2, 0, false) // rangeOffsetArray should be finished with 0

  return view
}

function createSubTable12(size: number, segments: Record<string, any>[]) {
  const view = new DataView(new ArrayBuffer(size))

  let offset = 0 - 2

  view.setUint16(offset += 2, 12, false) // format
  view.setUint16(offset += 2, 0, false) // reserved
  view.setUint32(offset += 2, 16 + segments.length * 12, false) // length
  view.setUint32(offset += 4, 0, false) // language
  view.setUint32(offset += 4, segments.length, false) // nGroups

  segments.forEach((segment) => {
    view.setUint32(offset += 4, segment.start, false)
    view.setUint32(offset += 4, segment.end, false)
    view.setUint32(offset += 4, segment.startId, false)
  })

  return view
}

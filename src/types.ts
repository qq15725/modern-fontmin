export type Table = 'cmap' | 'glyf' | 'head' | 'hhea' | 'hmtx' | 'loca' | 'maxp' | 'name' | 'post' | string

export type Tables = Map<Table, DataView>

export interface Glyph {
  codePoints: number[]
  glyphIndex: number
  advanceWidth: number
  advanceHeight: number
  leftSideBearing: number
  topSideBearing: number
  buffer: ArrayBuffer
}

export type GlyphCodePoint = {
  codePoint: number
  glyphIndex: number
}

import { readCmapToCodes } from './read-cmap-to-codes'
import type { Glyph, Tables } from './types'

export function minifyGlyphs(tables: Tables, subset: string): Glyph[] {
  // 'head' table, total 54 bytes
  // Fixed version 0x00010000 if (version 1.0)
  // Fixed fontRevision set by font manufacturer
  // uint32 checkSumAdjustment To compute: set it to 0, calculate the checksum for the 'head' table and put it in the table directory, sum the entire font as a uint32_t, then store 0xB1B0AFBA - sum. (The checksum for the 'head' table will be wrong as a result. That is OK; do not reset it.)
  // uint32 magicNumber set to 0x5F0F3CF5
  // uint16 flags bit 0 - y value of 0 specifies baseline
  // uint16 unitsPerEm range from 64 to 16384
  // longDateTime created international date
  // longDateTime modified international date
  // FWord xMin for all glyph bounding boxes
  // FWord yMin for all glyph bounding boxes
  // FWord xMax for all glyph bounding boxes
  // FWord yMax for all glyph bounding boxes
  // uint16 macStyle bit 0 bold
  // uint16 lowestRecPPEM smallest readable size in pixels
  // int16 fontDirectionHint 0 Mixed directional glyphs
  // int16 indexToLocFormat 0 for short offsets, 1 for long
  // int16 glyphDataFormat 0 for current format
  const head = tables.get('head')!
  const indexToLocFormat = head.getInt16(50, false)

  // maxp table get, total 32 bytes
  // Fixed version 0x00010000 (1.0)
  // uint16 numGlyphs the number of glyphs in the font
  // uint16 maxPoints points in non-compound glyph
  // uint16 maxContours contours in non-compound glyph
  // uint16 maxComponentPoints points in compound glyph
  // uint16 maxComponentContours contours in compound glyph
  // uint16 maxZones set to 2
  // uint16 maxTwilightPoints points used in Twilight Zone (Z0)
  // uint16 maxStorage number of Storage Area locations
  // uint16 maxFunctionDefs number of FDEFs
  // uint16 maxInstructionDefs number of IDEFs
  // uint16 maxStackElements maximum stack depth
  // uint16 maxSizeOfInstructions byte count for glyph instructions
  // uint16 maxComponentElements number of glyphs referenced at top level
  // uint16 maxComponentDepth levels of recursion, set to 0 if font has only simple glyphs
  const maxp = tables.get('maxp')!
  const numGlyphs = maxp.getUint16(4, false)

  // loca table get
  const loca = tables.get('loca')!
  const location = Array.from(new Array(numGlyphs)).map((_, i) => {
    return indexToLocFormat
      ? loca.getUint32(i * 4, false)
      : loca.getUint16(i * 2, false) * 2
  })

  // cmap table get
  const cmap = tables.get('cmap')!
  const codePointToGlyphIndex = readCmapToCodes(new Uint8Array(cmap.buffer), numGlyphs)
  const codePoints = Array.from(
    new Set(
      subset.split('')
        .map(val => val.codePointAt(0)!)
        .filter(v => v !== undefined && codePointToGlyphIndex[v] !== undefined)
        .sort(),
    ),
  )

  // hhea table, total 36 bytes
  // Fixed version 0x00010000 (1.0)
  // FWord ascent Distance from baseline of highest ascender
  // FWord descent Distance from baseline of lowest descender
  // FWord lineGap typographic line gap
  // uFWord advanceWidthMax must be consistent with horizontal metrics
  // FWord minLeftSideBearing must be consistent with horizontal metrics
  // FWord minRightSideBearing must be consistent with horizontal metrics
  // FWord xMaxExtent max(lsb + (xMax-xMin))
  // int16 caretSlopeRise used to calculate the slope of the caret (rise/run) set to 1 for vertical caret
  // int16 caretSlopeRun 0 for vertical
  // FWord caretOffset set value to 0 for non-slanted fonts
  // int16 reserved set value to 0
  // int16 reserved set value to 0
  // int16 reserved set value to 0
  // int16 reserved set value to 0
  // int16 metricDataFormat 0 for current format
  // uint16 numOfLongHorMetrics number of advance widths in metrics table
  const hhea = tables.get('hhea')
  const numOfLongHorMetrics = hhea?.getUint16(34, false) ?? 0

  // hmtx
  const hmtx = tables.get('hmtx')
  let advanceWidth = 0
  let hmtxOffset = 0
  const hMetrics = Array.from(new Array(numGlyphs)).map((_, i) => {
    if (i < numOfLongHorMetrics) {
      advanceWidth = hmtx?.getUint16(hmtxOffset, false) ?? 0
      hmtxOffset += 2
    }
    const hMetric = {
      advanceWidth,
      leftSideBearing: hmtx?.getInt16(hmtxOffset, false) ?? 0,
    }
    hmtxOffset += 2
    return hMetric
  })

  // vhea table, total 36 bytes
  // fixed32 version Version number of the Vertical Header Table (0x00011000 for the current version).
  // int16 vertTypoAscender The vertical typographic ascender for this font. It is the distance in FUnits from the vertical center baseline to the right of the design space. This will usually be set to half the horizontal advance of full-width glyphs. For example, if the full width is 1000 FUnits, this field will be set to 500.
  // int16 vertTypoDescender The vertical typographic descender for this font. It is the distance in FUnits from the vertical center baseline to the left of the design space. This will usually be set to half the horizontal advance of full-width glyphs. For example, if the full width is 1000 FUnits, this field will be set to -500.
  // int16 vertTypoLineGap The vertical typographic line gap for this font.
  // int16 advanceHeightMax The maximum advance height measurement in FUnits found in the font. This value must be consistent with the entries in the vertical metrics table.
  // int16 minTopSideBearing The minimum top side bearing measurement in FUnits found in the font, in FUnits. This value must be consistent with the entries in the vertical metrics table.
  // int16 minBottomSideBearing The minimum bottom side bearing measurement in FUnits found in the font, in FUnits. This value must be consistent with the entries in the vertical metrics table.
  // int16 yMaxExtent This is defined as the value of the minTopSideBearing field added to the result of the value of the yMin field subtracted from the value of the yMax field.
  // int16 caretSlopeRise The value of the caretSlopeRise field divided by the value of the caretSlopeRun field determines the slope of the caret. A value of 0 for the rise and a value of 1 for the run specifies a horizontal caret. A value of 1 for the rise and a value of 0 for the run specifies a vertical caret. A value between 0 for the rise and 1 for the run is desirable for fonts whose glyphs are oblique or italic. For a vertical font, a horizontal caret is best.
  // int16 caretSlopeRun See the caretSlopeRise field. Value = 0 for non-slanted fonts.
  // int16 caretOffset The amount by which the highlight on a slanted glyph needs to be shifted away from the glyph in order to produce the best appearance. Set value equal to 0 for non-slanted fonts.
  // int16 reserved Set to 0.
  // int16 reserved Set to 0.
  // int16 reserved Set to 0.
  // int16 reserved Set to 0.
  // int16 metricDataFormat Set to 0.
  // uint16 numOfLongVerMetrics Number of advance heights in the Vertical Metrics table.
  const vhea = tables.get('vhea')
  const numOfLongVerMetrics = vhea?.getUint16(34, false) ?? 0

  // vmtx
  const vmtx = tables.get('vmtx')
  let advanceHeight = 0
  let vmtxOffset = 0
  const vMetrics = Array.from(new Array(numGlyphs)).map((_, i) => {
    if (i < numOfLongVerMetrics) {
      advanceHeight = vmtx?.getUint16(vmtxOffset, false) ?? 0
      vmtxOffset += 2
    }
    const vMetric = {
      advanceHeight,
      topSideBearing: vmtx?.getInt16(vmtxOffset, false) ?? 0,
    }
    vmtxOffset += 2
    return vMetric
  })

  // glyf
  const glyf = tables.get('glyf')!
  const glyphIndexToCodePoints: Record<number, number[]> = {}
  const glyphIndexes = Array.from(
    new Set(
      codePoints.map(codePoint => {
        const glyphIndex = codePointToGlyphIndex[codePoint]
        if (glyphIndexToCodePoints[glyphIndex]) {
          glyphIndexToCodePoints[glyphIndex].push(codePoint)
        } else {
          glyphIndexToCodePoints[glyphIndex] = [codePoint]
        }
        return glyphIndex
      }),
    ),
  )

  const glyphs: Glyph[] = glyphIndexes.map((glyphIndex, index) => {
    const buffer = glyf.buffer.slice(location[glyphIndex], location[glyphIndex + 1])
    const codePoints = glyphIndexToCodePoints[glyphIndex]
    if (buffer.byteLength) {
      const glyph = new DataView(buffer)
      const numContours = glyph.getInt16(0, false)
      if (numContours < 0) {
        // TODO 支持复合形状
        throw new Error(`Failed to minifyGlyphs, composite shapes are not supported. characters: ${ codePoints.map(codePoint => `"${ String.fromCharCode(codePoint) }"`).join(', ') }`)
      }
    }
    return {
      ...hMetrics[glyphIndex],
      ...vMetrics[glyphIndex],
      codePoints,
      glyphIndex: index + 1,
      buffer,
    } as any
  })

  glyphs.unshift(
    {
      ...hMetrics[0],
      ...vMetrics[0],
      codePoints: [],
      glyphIndex: 0,
      buffer: glyf.buffer.slice(location[0], location[1]),
    } as any,
  )

  return glyphs
}

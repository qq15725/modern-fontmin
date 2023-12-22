import { createReader } from './create-reader'

export function readCmapToCodes(uint8Array: Uint8Array, numGlyphs: number) {
  const { getCursor, setCursor, readUInt8BE, readUInt16BE, readUInt24BE, readUInt32BE } = createReader(uint8Array)

  const cmapCursor = getCursor()
  readUInt16BE() // version
  const numberSubtables = readUInt16BE()

  const tables = [...new Array(numberSubtables)]
    .map(() => ({
      platformID: readUInt16BE(),
      encodingID: readUInt16BE(),
      offset: readUInt32BE(),
    }))
    .map((table: Record<string, any>) => {
      const startOffset = cmapCursor + table.offset

      setCursor(startOffset)

      table.format = readUInt16BE()

      if (table.format === 0) {
        table.length = readUInt16BE()
        table.language = readUInt16BE()
        table.glyphIdArray = [...new Array(table.length - 6)].map(readUInt8BE)
      } else if (table.format === 2) {
        table.length = readUInt16BE()
        table.language = readUInt16BE()
        const subHeadKeys = []
        let maxSubHeadKey = 0
        let maxPos = -1
        for (let i = 0, l = 256; i < l; i++) {
          subHeadKeys[i] = readUInt16BE() / 8
          if (subHeadKeys[i] > maxSubHeadKey) {
            maxSubHeadKey = subHeadKeys[i]
            maxPos = i
          }
        }
        const subHeads = []
        for (let i = 0; i <= maxSubHeadKey; i++) {
          subHeads[i] = {
            firstCode: readUInt16BE(),
            entryCount: readUInt16BE(),
            idDelta: readUInt16BE(),
            idRangeOffset: (readUInt16BE() - (maxSubHeadKey - i) * 8 - 2) / 2,
          }
        }
        const glyphCount = (startOffset + table.length - getCursor()) / 2
        table.subHeadKeys = subHeadKeys
        table.maxPos = maxPos
        table.subHeads = subHeads
        table.glyphs = [...new Array(glyphCount)].map(readUInt16BE)
      } else if (table.format === 4) {
        table.length = readUInt16BE()
        table.language = readUInt16BE()
        table.segCountX2 = readUInt16BE()
        table.searchRange = readUInt16BE()
        table.entrySelector = readUInt16BE()
        table.rangeShift = readUInt16BE()
        const segCount = table.segCountX2 / 2
        table.endCode = [...new Array(segCount)].map(readUInt16BE)
        table.reservedPad = readUInt16BE()
        table.startCode = [...new Array(segCount)].map(readUInt16BE)
        table.idDelta = [...new Array(segCount)].map(readUInt16BE)
        table.idRangeOffsetCursor = getCursor()
        table.idRangeOffset = [...new Array(segCount)].map(readUInt16BE)
        const glyphCount = (table.length - (getCursor() - startOffset)) / 2
        table.glyphIdArrayCursor = getCursor()
        table.glyphIdArray = [...new Array(glyphCount)].map(readUInt16BE)
      } else if (table.format === 6) {
        table.length = readUInt16BE()
        table.language = readUInt16BE()
        table.firstCode = readUInt16BE()
        table.entryCount = readUInt16BE()
        table.glyphIdArrayCursor = getCursor()
        table.glyphIdArray = [...new Array(table.entryCount)].map(readUInt16BE)
      } else if (table.format === 12) {
        table.reserved = readUInt16BE()
        table.length = readUInt32BE()
        table.language = readUInt32BE()
        table.nGroups = readUInt32BE()
        const groups: Record<string, any>[] = []
        const nGroups = table.nGroups
        for (let i = 0; i < nGroups; ++i) {
          const group: Record<string, any> = {}
          group.start = readUInt32BE()
          group.end = readUInt32BE()
          group.startId = readUInt32BE()
          groups.push(group)
        }
        table.groups = groups
      } else if (table.format === 14) {
        table.length = readUInt32BE()
        const numVarSelectorRecords = readUInt32BE()
        const groups = []
        let offset = getCursor()
        for (let i = 0; i < numVarSelectorRecords; i++) {
          setCursor(offset)
          const varSelector = readUInt24BE()
          const defaultUVSOffset = readUInt32BE()
          const nonDefaultUVSOffset = readUInt32BE()
          offset += 11

          if (defaultUVSOffset) {
            setCursor(startOffset + defaultUVSOffset)
            const numUnicodeValueRanges = readUInt32BE()
            for (let j = 0; j < numUnicodeValueRanges; j++) {
              const startUnicode = readUInt24BE()
              const additionalCount = readUInt8BE()
              groups.push({
                start: startUnicode,
                end: startUnicode + additionalCount,
                varSelector,
              })
            }
          }
          if (nonDefaultUVSOffset) {
            setCursor(startOffset + nonDefaultUVSOffset)
            const numUVSMappings = readUInt32BE()
            for (let j = 0; j < numUVSMappings; j++) {
              const unicode = readUInt24BE()
              const glyphId = readUInt16BE()
              groups.push({
                unicode,
                glyphId,
                varSelector,
              })
            }
          }
        }
        table.groups = groups
      }

      return table
    })

  const format0 = tables.find(item => item.format === 0)
  const format12 = tables.find(item => item.platformID === 3 && item.encodingID === 10 && item.format === 12)
  const format4 = tables.find(item => item.platformID === 3 && item.encodingID === 1 && item.format === 4)
  const format2 = tables.find(item => item.platformID === 3 && item.encodingID === 3 && item.format === 2)
  const format14 = tables.find(item => item.platformID === 0 && item.encodingID === 5 && item.format === 14)
  const codes: Record<number, number> = {}

  if (format0) {
    for (let i = 0, l = format0.glyphIdArray.length; i < l; i++) {
      if (format0.glyphIdArray[i]) {
        codes[i] = format0.glyphIdArray[i]
      }
    }
  }

  if (format14) {
    for (let i = 0, l = format14.groups.length; i < l; i++) {
      const { unicode, glyphId } = format14.groups[i]
      if (unicode) {
        codes[unicode] = glyphId
      }
    }
  }

  if (format12) {
    for (let i = 0, l = format12.nGroups; i < l; i++) {
      const group = format12.groups[i]
      let startId = group.startId
      let start = group.start
      const end = group.end
      for (;start <= end;) {
        codes[start++] = startId++
      }
    }
  } else if (format4) {
    const segCount = format4.segCountX2 / 2
    const graphIdArrayIndexOffset = (format4.glyphIdArrayCursor - format4.idRangeOffsetCursor) / 2

    for (let i = 0; i < segCount; ++i) {
      for (let start = format4.startCode[i], end = format4.endCode[i]; start <= end; ++start) {
        if (format4.idRangeOffset[i] === 0) {
          codes[start] = (start + format4.idDelta[i]) % 0x10000
        } else {
          const index = i + format4.idRangeOffset[i] / 2
            + (start - format4.startCode[i])
            - graphIdArrayIndexOffset

          const graphId = format4.glyphIdArray[index]
          if (graphId !== 0) {
            codes[start] = (graphId + format4.idDelta[i]) % 0x10000
          } else {
            codes[start] = 0
          }
        }
      }
    }

    delete codes[65535]
  } else if (format2) {
    const subHeadKeys = format2.subHeadKeys
    const subHeads = format2.subHeads
    const glyphs = format2.glyphs
    let index = 0
    for (let i = 0; i < 256; i++) {
      if (subHeadKeys[i] === 0) {
        if (i >= format2.maxPos) {
          index = 0
        } else if (i < subHeads[0].firstCode
          || i >= subHeads[0].firstCode + subHeads[0].entryCount
          || subHeads[0].idRangeOffset + (i - subHeads[0].firstCode) >= glyphs.length) {
          index = 0
          // eslint-disable-next-line no-cond-assign
        } else if ((index = glyphs[subHeads[0].idRangeOffset + (i - subHeads[0].firstCode)]) !== 0) {
          index = index + subHeads[0].idDelta
        }
        if (index !== 0 && index < numGlyphs) {
          codes[i] = index
        }
      } else {
        const k = subHeadKeys[i]
        for (let j = 0, entryCount = subHeads[k].entryCount; j < entryCount; j++) {
          if (subHeads[k].idRangeOffset + j >= glyphs.length) {
            index = 0
            // eslint-disable-next-line no-cond-assign
          } else if ((index = glyphs[subHeads[k].idRangeOffset + j]) !== 0) {
            index = index + subHeads[k].idDelta
          }

          if (index !== 0 && index < numGlyphs) {
            const unicode = ((i << 8) | (j + subHeads[k].firstCode)) % 0xFFFF
            codes[unicode] = index
          }
        }
      }
    }
  }

  return codes
}

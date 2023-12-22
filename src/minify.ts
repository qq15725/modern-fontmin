import { inflate } from 'pako'
import { WOFF_HEADER_SIZE, WOFF_SIGNATURE, WOFF_TABLE_DIRECTORY_ENTRY_SIZE, checkSum, round4 } from './utils'
import { minifySfnt } from './minify-sfnt'
import type { Table } from './types'

// https://chromium.googlesource.com/external/ots/+/v6.1.1/src/ots.cc
// https://chromium.googlesource.com/external/ots/+/v6.1.1/src/ots.h
export function minify(fontBuffer: ArrayBuffer, subset: string) {
  const font = new DataView(fontBuffer)

  const signature = String.fromCharCode(
    font.getUint8(0),
    font.getUint8(1),
    font.getUint8(2),
    font.getUint8(3),
  )

  if (![WOFF_SIGNATURE].includes(signature)) {
    throw new Error(`Not support font file format, signature: ${ signature }`)
  }

  const sfnt = new Map<Table, DataView>()

  // WOFF File
  // https://www.w3.org/TR/WOFF
  // WOFFHeader File header with basic font type and version, along with offsets to metadata and private data blocks.
  // TableDirectory Directory of font tables, indicating the original size, compressed size and location of each table within the WOFF file.
  // FontTables The font data tables from the input sfnt font, compressed to reduce bandwidth requirements.
  // ExtendedMetadata An optional block of extended metadata, represented in XML format and compressed for storage in the WOFF file.
  // PrivateData An optional block of private data for the font designer, foundry, or vendor to use.
  if (signature === WOFF_SIGNATURE) {
    // WOFFHeader, total 44 bytes
    // UInt32 signature 0x774F4646 'wOFF'
    // UInt32 flavor The "sfnt version" of the input font.
    // UInt32 length Total size of the WOFF file.
    // UInt16 numTables Number of entries in directory of font tables.
    // UInt16 reserved Reserved; set to zero.
    // UInt32 totalSfntSize Total size needed for the uncompressed font data, including the sfnt header, directory, and font tables (including padding).
    // UInt16 majorVersion Major version of the WOFF file.
    // UInt16 minorVersion Minor version of the WOFF file.
    // UInt32 metaOffset Offset to metadata block, from beginning of WOFF file.
    // UInt32 metaLength Length of compressed metadata block.
    // UInt32 metaOrigLength Uncompressed size of metadata block.
    // UInt32 privOffset Offset to private data block, from beginning of WOFF file.
    // UInt32 privLength Length of private data block.
    const numTables = font.getUint16(12, false)

    let restOffset = 0
    // TableDirectory, total numTables * 20 bytes
    for (let i = 0; i < numTables; i++) {
      // TableDirectoryEntry, total 20 bytes
      // UInt32 tag 4-byte sfnt table identifier.
      // UInt32 offset Offset to the data, from beginning of WOFF file.
      // UInt32 compLength Length of the compressed data, excluding padding.
      // UInt32 origLength Length of the uncompressed table, excluding padding.
      // UInt32 origChecksum Checksum of the uncompressed table.
      const entryOffset = WOFF_HEADER_SIZE + i * WOFF_TABLE_DIRECTORY_ENTRY_SIZE
      const tag = String.fromCharCode(
        font.getUint8(entryOffset),
        font.getUint8(entryOffset + 1),
        font.getUint8(entryOffset + 2),
        font.getUint8(entryOffset + 3),
      ) as Table
      const offset = font.getUint32(entryOffset + 4, false)
      const compLength = font.getUint32(entryOffset + 8, false)
      const origLength = font.getUint32(entryOffset + 12, false)

      let table: DataView
      const end = offset + compLength
      if (compLength >= origLength) {
        table = new DataView(font.buffer.slice(offset, end))
      } else {
        const data = inflate(new Uint8Array(font.buffer.slice(offset, end)))
        table = new DataView(data.buffer)
      }

      restOffset = Math.max(restOffset, end)
      sfnt.set(tag, table)
    }

    const rest = new Uint8Array(font.buffer.slice(round4(restOffset)))

    // minify SFNT
    minifySfnt(sfnt, subset)

    // TODO
    sfnt.delete('GPOS') // 字形定位
    sfnt.delete('GSUB') // 字形替换
    sfnt.delete('hdmx') // 仅适用于 Macintosh 平台上的字体
    // sfnt.delete('FFTM')
    // sfnt.delete('GDEF') // Glyph Definition Table
    // sfnt.delete('gasp') // grid-fitting and scan-conversion procedure
    // sfnt.delete('prep') // control value program

    // start recreate woff file
    const tableDirectorySize = WOFF_TABLE_DIRECTORY_ENTRY_SIZE * sfnt.size
    const sfntSize = Array.from(sfnt.values()).reduce((sum, table) => sum + round4(table.byteLength), 0)
    const restSize = rest.byteLength
    const length = WOFF_HEADER_SIZE + tableDirectorySize + sfntSize + restSize
    const woff = new Uint8Array(length)

    // WOFFHeader
    const woffHeader = new DataView(font.buffer.slice(0, WOFF_HEADER_SIZE))
    woffHeader.setUint32(8, length, false) // length
    woffHeader.setUint16(12, sfnt.size, false) // numTables
    woffHeader.setUint32(
      16,
      12 //
      + 16 * sfnt.size // TableDirectoryEntry
      + sfntSize, // FontTable
      false,
    ) // totalSfntSize
    woff.set(new Uint8Array(woffHeader.buffer), 0)

    // TableDirectory
    let offset = WOFF_HEADER_SIZE + tableDirectorySize
    Array.from(sfnt.keys())
      .sort((a, b) => a === b ? 0 : a < b ? -1 : 1)
      .forEach((tag, i) => {
        const table = sfnt.get(tag)!
        const dataView = new DataView(new ArrayBuffer(20))
        const compLength = table.byteLength
        const origLength = compLength
        const origChecksum = checkSum(table)

        // TableDirectoryEntry
        tag.split('').map(val => val.charCodeAt(0)).forEach((charCode, i) => dataView.setUint8(i, charCode))
        dataView.setUint32(4, offset, false)
        dataView.setUint32(8, compLength, false)
        dataView.setUint32(12, origLength, false)
        dataView.setUint32(16, origChecksum, false)
        woff.set(new Uint8Array(dataView.buffer), WOFF_HEADER_SIZE + i * 20)

        // FontTable
        woff.set(new Uint8Array(table.buffer), offset)

        offset += round4(compLength)
      })

    // ExtendedMetadata
    // PrivateData
    if (restSize) {
      woff.set(rest, offset)
    }

    return woff.buffer
  }

  return new ArrayBuffer(0)
}

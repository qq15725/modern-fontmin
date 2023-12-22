export function createReader(uint8Array: Uint8Array) {
  const dataView = new DataView(uint8Array.buffer)
  let cursor = 0

  const getCursor = () => cursor
  const setCursor = (value: number) => cursor = value
  const readBytes = (length: number): Uint8Array => uint8Array.subarray(cursor, cursor += length)
  const readString = (length: number): string => Array.from(readBytes(length)).map(val => String.fromCharCode(val)).join('')
  const readUInt8BE = (): number => uint8Array[cursor++]
  const readInt16BE = (): number => [dataView.getInt16(cursor, false), cursor += 2][0]
  const readUInt24BE = (): number => {
    const [i, j, k] = readBytes(3)
    return (i << 16) + (j << 8) + k
  }
  const readUInt16BE = (): number => [dataView.getUint16(cursor, false), cursor += 2][0]
  const readUInt32BE = (): number => [dataView.getUint32(cursor, false), cursor += 4][0]
  const readFixed = (): number => Math.ceil(readUInt32BE() / 65536.0 * 100000) / 100000
  const readLongDateTime = (): number => [readUInt32BE(), readUInt32BE()][1]

  return {
    getCursor,
    setCursor,

    readBytes,
    readString,
    readUInt8BE,
    readInt16BE,
    readUInt16BE,
    readUInt24BE,
    readUInt32BE,
    readFixed,
    readLongDateTime,
  }
}

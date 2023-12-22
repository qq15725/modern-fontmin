// WOFF
export const WOFF_SIGNATURE = 'wOFF'
export const WOFF_HEADER_SIZE = 44
export const WOFF_TABLE_DIRECTORY_ENTRY_SIZE = 20

export const round4 = (value: number) => (value + 3) & ~3

export function checkSum(view: DataView) {
  const length = view.byteLength
  const nLongs = Math.floor(length / 4)
  let sum = 0
  let i = 0

  while (i < nLongs) {
    sum += view.getUint32(4 * i++, false)
  }

  let leftBytes = length - nLongs * 4
  if (leftBytes) {
    let offset = nLongs * 4
    while (leftBytes > 0) {
      sum += view.getUint8(offset) << (leftBytes * 8)
      offset++
      leftBytes--
    }
  }
  return sum % 0x100000000
}

export function arrayBufferToDataUrl(buffer: ArrayBuffer, type: string) {
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  let binary = ''
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return `data:${ type };base64,${ window.btoa(binary) }`
}

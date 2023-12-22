<h1 align="center">modern-fontmin</h1>

<p align="center">
  <a href="https://unpkg.com/modern-fontmin">
    <img src="https://img.shields.io/bundlephobia/minzip/modern-fontmin" alt="Minzip">
  </a>
  <a href="https://www.npmjs.com/package/modern-fontmin">
    <img src="https://img.shields.io/npm/v/modern-fontmin.svg" alt="Version">
  </a>
  <a href="https://www.npmjs.com/package/modern-fontmin">
    <img src="https://img.shields.io/npm/dm/modern-fontmin" alt="Downloads">
  </a>
  <a href="https://github.com/qq15725/modern-fontmin/issues">
    <img src="https://img.shields.io/github/issues/qq15725/modern-fontmin" alt="Issues">
  </a>
  <a href="https://github.com/qq15725/modern-fontmin/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/modern-fontmin.svg" alt="License">
  </a>
</p>

Install

```shell
npm i modern-fontmin

# peerDependencies
npm i pako
```

## Usage

```ts
import { minify, arrayBufferToDataUrl } from 'modern-fontmin'

window.fetch('./font.woff')
  .then(rep => rep.arrayBuffer())
  .then(font => {
    const min = minify(font, 'You want a subset of the text')
    console.log('raw size', font.byteLength / 1024, 'kb')
    console.log('min size', min.byteLength / 1024, 'kb')
    const dataUrl = arrayBufferToDataUrl(min, 'font/woff')
    const style = document.createElement('style')
    style.appendChild(
      document.createTextNode(`
@font-face {
  font-family: "CustomFont";
  src: url(${ dataUrl }) format("woff");
}
`),
    )
    document.head.append(style)
  })
```

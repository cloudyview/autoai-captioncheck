#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + read('styles.css') + '</style>');
for (const name of ['core.js', 'app.js']) {
  const script = read(name).replace(/<\/script/gi, '<\\/script');
  html = html.replace('<script src="' + name + '"></script>', '<script>' + script + '</script>');
}
if (html.includes('src="core.js"') || html.includes('src="app.js"') || html.includes('href="styles.css"')) throw new Error('内联打包不完整');
fs.writeFileSync(path.join(__dirname, 'standalone.html'), html);
console.log('standalone.html: ' + Buffer.byteLength(html) + ' bytes, no external CSS or JS');

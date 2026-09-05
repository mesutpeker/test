import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('dist/client');
const html = await readFile(resolve(root, 'test/index.html'), 'utf8');
assert.match(html, /Test Atölyesi/);
const resources = new Set(
  [...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map((match) => match[1]),
);
assert.ok(
  resources.size > 5,
  'The exported page must include its scripts, styles and fonts',
);
for (const resource of resources) {
  assert.ok(
    resource.startsWith('/test/'),
    `Resource escapes the project path: ${resource}`,
  );
  assert.ok(
    (await stat(resolve(root, `.${resource}`))).isFile(),
    `Missing asset: ${resource}`,
  );
}
for (const resource of [
  'pdfjs/pdf.worker.min.mjs',
  'pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap',
  'pdfjs/standard_fonts/LiberationSans-Regular.ttf',
  'pdfjs/wasm/openjpeg.wasm',
  'pdfjs/wasm/qcms_bg.wasm',
  'pdfjs/wasm/jbig2.wasm',
  'fonts/DejaVuSans.ttf',
  'ornek-sorular.pdf',
]) {
  assert.ok(
    (await stat(resolve(root, 'test', resource))).size > 0,
    `Missing PDF resource: ${resource}`,
  );
}
console.log(
  'GitHub Pages export: HTML, scripts, styles, fonts and PDF resources verified.',
);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  createCanvas,
  loadImage,
  DOMMatrix,
  ImageData,
  Path2D,
} from '@napi-rs/canvas';

Object.assign(globalThis, {
  DOMMatrix,
  ImageData,
  Path2D,
  document: { createElement: () => createCanvas(1, 1) },
});
const { getPdfjs, renderSource, detectQuestions } =
  await import('../lib/pdf-engine.ts');
const pdfjs = await getPdfjs();
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).href;

const W = 600,
  H = 800;
const orange = rgb(0.91, 0.55, 0.18);

async function pdfBytes(draw) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([W, H]);
  await draw(page, font, bold);
  return { bytes: await doc.save(), font, bold };
}
async function sourceFrom(bytes, columns = 2) {
  const pdf = await pdfjs.getDocument({
    data: bytes.slice(),
    standardFontDataUrl: new URL(
      '../node_modules/pdfjs-dist/standard_fonts/',
      import.meta.url,
    ).pathname,
  }).promise;
  return {
    id: 'fixture',
    kind: 'pdf',
    name: 'Fixture',
    bytes,
    pdf,
    pages: 1,
    columns,
    scale: 100,
  };
}
/** The same page as a scan: one embedded image and no text layer. */
async function scanned(bytes, scale = 2) {
  const source = await sourceFrom(bytes);
  try {
    const png = (await renderSource(source, 1, scale)).canvas.toBuffer(
      'image/png',
    );
    const doc = await PDFDocument.create();
    const image = await doc.embedPng(png);
    doc.addPage([W, H]).drawImage(image, { x: 0, y: 0, width: W, height: H });
    return { bytes: await doc.save(), png };
  } finally {
    await source.pdf.loadingTask.destroy();
  }
}

/** A hanging-indent question: number in the gutter, body and choices indented. */
function question(page, font, bold, x, y, n) {
  page.drawText(`${n}.`, { x, y, size: 10, font: bold, color: orange });
  page.drawText('Question stem text with several words', {
    x: x + 18,
    y,
    size: 9,
    font,
  });
  page.drawText('and a second stem line?', {
    x: x + 18,
    y: y - 13,
    size: 9,
    font,
  });
  let cy = y - 32;
  for (const letter of 'ABCD') {
    page.drawText(`${letter})`, { x: x + 18, y: cy, size: 9, font });
    page.drawText('Choice text that wraps onto', {
      x: x + 32,
      y: cy,
      size: 9,
      font,
    });
    page.drawText('the next line', { x: x + 32, y: cy - 13, size: 9, font });
    cy -= 32;
  }
}
/** Baseline of a question's last choice line. */
const lastLine = (q) => q.y - 32 - 3 * 32 - 13;
const questions = [
  { x: 40, y: 720, n: 1 },
  { x: 40, y: 470, n: 2 },
  { x: 320, y: 720, n: 3 },
  { x: 320, y: 470, n: 4 },
];
async function workbookPage() {
  const { bytes, font, bold } = await pdfBytes((page, font, bold) => {
    // Tinted paper, header, rules and a large page number as in printed books.
    page.drawRectangle({
      x: 0,
      y: 0,
      width: W,
      height: H,
      color: rgb(0.97, 0.95, 0.89),
    });
    page.drawText('UNIT REVIEW - 2', { x: 40, y: 765, size: 14, font: bold });
    page.drawLine({
      start: { x: 40, y: 755 },
      end: { x: 560, y: 755 },
      thickness: 1.5,
      color: rgb(0.1, 0.2, 0.4),
    });
    page.drawLine({
      start: { x: 300, y: 740 },
      end: { x: 300, y: 70 },
      thickness: 1,
      color: rgb(0.1, 0.2, 0.4),
    });
    for (const q of questions) question(page, font, bold, q.x, q.y, q.n);
    page.drawText('107', {
      x: 40,
      y: 20,
      size: 32,
      font,
      color: rgb(0.7, 0.7, 0.7),
    });
    page.drawText('TURKCE', { x: 480, y: 24, size: 12, font: bold });
  });
  return {
    bytes,
    labelWidth: bold.widthOfTextAtSize('1.', 10),
    textRight: Math.max(
      18 + font.widthOfTextAtSize('Question stem text with several words', 9),
      32 + font.widthOfTextAtSize('Choice text that wraps onto', 9),
    ),
  };
}

function assertWorkbookRects(rects, unit, { labelWidth, textRight }) {
  assert.equal(rects.length, 4);
  rects.forEach((rect, i) => {
    const q = questions[i];
    const r = {
      x: rect.x / unit,
      y: rect.y / unit,
      right: (rect.x + rect.w) / unit,
      bottom: (rect.y + rect.h) / unit,
    };
    assert.ok(
      r.x >= q.x + labelWidth - 0.5 && r.x <= q.x + 18,
      `${q.n}. crop must start between label and body, got ${r.x}`,
    );
    // Above the first line's capitals, below the header rule.
    assert.ok(r.y <= H - q.y - 7 && r.y > 50, `${q.n}. top ${r.y}`);
    assert.ok(
      r.bottom >= H - lastLine(q),
      `${q.n}. must keep its last choice line, bottom ${r.bottom}`,
    );
    const limit = q.y === 720 ? H - 470 - 10 : 740;
    assert.ok(r.bottom < limit, `${q.n}. must stop before ${limit}`);
    assert.ok(
      r.right >= q.x + textRight && r.right < q.x + 260,
      `${q.n}. right edge ${r.right}`,
    );
  });
}

test('Scanned two-column pages find hanging-number questions without a text layer', async () => {
  const page = await workbookPage();
  const scan = await scanned(page.bytes);
  const source = await sourceFrom(scan.bytes);
  try {
    assert.equal(
      (await (await source.pdf.getPage(1)).getTextContent()).items.length,
      0,
    );
    for (const scale of [1.6, 3]) {
      const rendered = await renderSource(source, 1, scale);
      const rects = await detectQuestions(rendered, 2);
      assertWorkbookRects(rects, 1, page);
      const sx = rendered.canvas.width / rendered.width;
      for (const rect of rects) {
        const pixels = rendered.canvas
          .getContext('2d')
          .getImageData(
            Math.ceil(rect.x * sx),
            Math.ceil(rect.y * sx),
            Math.floor(rect.w * sx),
            Math.floor(rect.h * sx),
          ).data;
        for (let p = 0; p < pixels.length; p += 4)
          assert.ok(
            !(pixels[p] - pixels[p + 2] > 90 && pixels[p + 1] > 90),
            'No orange source-number pixels may remain',
          );
      }
    }
  } finally {
    await source.pdf.loadingTask.destroy();
  }
});

test('Image sources use the same detection as scanned PDFs', async () => {
  const page = await workbookPage();
  const { png } = await scanned(page.bytes, 2);
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const render = {
    canvas,
    width: image.width,
    height: image.height,
    viewport: null,
    page: null,
    rotation: 0,
  };
  // Images default to the single-column setting; a clear gutter still splits.
  assertWorkbookRects(await detectQuestions(render, 1), image.width / W, page);
});

test('Text PDFs keep text-layer labels and gain footer-free crops', async () => {
  const page = await workbookPage();
  const source = await sourceFrom(page.bytes);
  try {
    const rects = await detectQuestions(await renderSource(source, 1, 1.6), 2);
    assertWorkbookRects(rects, 1, page);
  } finally {
    await source.pdf.loadingTask.destroy();
  }
});

test('A single-column page is not cut at the middle under a two-column setting', async () => {
  const words =
    'this single column question stem is long enough to cross the page middle and it keeps going'.split(
      ' ',
    );
  // Every line starts at a different word so word gaps never line up.
  const line = (i) =>
    [...words.slice(i % words.length), ...words.slice(0, i % words.length)]
      .join(' ')
      .slice(0, 68);
  const { bytes } = await pdfBytes((page, font, bold) => {
    let i = 0;
    for (const [n, y] of [
      [1, 720],
      [2, 470],
    ]) {
      page.drawText(`${n}.`, { x: 40, y, size: 10, font: bold });
      page.drawText(line(i++), { x: 58, y, size: 11, font });
      page.drawText(line(i++), { x: 58, y: y - 15, size: 11, font });
      ['A', 'B', 'C', 'D'].forEach((letter, k) =>
        page.drawText(`${letter}) ${line(i++)}`, {
          x: 58,
          y: y - 40 - k * 17,
          size: 11,
          font,
        }),
      );
    }
  });
  for (const make of [
    async () => bytes,
    async () => (await scanned(bytes)).bytes,
  ]) {
    const source = await sourceFrom(await make());
    try {
      const rects = await detectQuestions(
        await renderSource(source, 1, 1.6),
        2,
      );
      assert.equal(rects.length, 2);
      for (const rect of rects) {
        assert.ok(rect.x > 48 && rect.x <= 58);
        assert.ok(rect.x + rect.w > 400, `right edge ${rect.x + rect.w}`);
      }
    } finally {
      await source.pdf.loadingTask.destroy();
    }
  }
});

test('Answer choices aligned under the number are never returned as questions', async () => {
  const { bytes } = await pdfBytes((page, font, bold) => {
    for (const [n, y] of [
      [1, 720],
      [2, 450],
    ]) {
      page.drawText(`${n}.`, { x: 40, y, size: 10, font: bold });
      page.drawText('Question stem text', { x: 58, y, size: 9, font });
      page.drawText('second stem line', { x: 58, y: y - 13, size: 9, font });
      ['A', 'B', 'C', 'D'].forEach((letter, i) => {
        page.drawText(`${letter})`, {
          x: 40,
          y: y - 32 - i * 16,
          size: 9,
          font,
        });
        page.drawText('Choice', { x: 58, y: y - 32 - i * 16, size: 9, font });
      });
    }
  });
  for (const make of [
    async () => bytes,
    async () => (await scanned(bytes)).bytes,
  ]) {
    const source = await sourceFrom(await make());
    try {
      assert.deepEqual(
        await detectQuestions(await renderSource(source, 1, 1.6), 2),
        [],
        'Choices in the number gutter make a rectangular crop unsafe',
      );
    } finally {
      await source.pdf.loadingTask.destroy();
    }
  }
});

test('Boxed numbers without punctuation are found from rendered pixels', async () => {
  const { bytes } = await pdfBytes((page, font, bold) => {
    for (const [n, y] of [
      [7, 700],
      [8, 450],
    ]) {
      page.drawRectangle({
        x: 38,
        y: y - 4,
        width: 16,
        height: 15,
        color: rgb(0.16, 0.3, 0.52),
      });
      page.drawText(String(n), {
        x: 43,
        y,
        size: 10,
        font: bold,
        color: rgb(1, 1, 1),
      });
      page.drawText('Question body starts here', { x: 64, y, size: 9, font });
      page.drawText('and continues on this line', {
        x: 64,
        y: y - 13,
        size: 9,
        font,
      });
      page.drawText('A) Choice one   B) Choice two', {
        x: 64,
        y: y - 32,
        size: 9,
        font,
      });
    }
  });
  const source = await sourceFrom(bytes, 1);
  try {
    const rects = await detectQuestions(await renderSource(source, 1, 1.6), 1);
    assert.equal(rects.length, 2);
    for (const rect of rects) assert.ok(rect.x > 54 && rect.x <= 64);
  } finally {
    await source.pdf.loadingTask.destroy();
  }
});

test('Premises and long answer choices inside a question never split it', async () => {
  // Numbers in the gutter; "I."/"II." premises and three-line choices start
  // at the body edge, as in printed workbooks.
  const { bytes } = await pdfBytes((page, font, bold) => {
    for (const [n, x, y] of [
      [5, 40, 740],
      [8, 320, 740],
    ]) {
      page.drawText(`${n}.`, { x, y, size: 10, font: bold, color: orange });
      let cy = y;
      for (const premise of ['I.', 'II.', 'III.']) {
        page.drawText(premise, {
          x: x + 30 - bold.widthOfTextAtSize(premise, 9),
          y: cy,
          size: 9,
          font: bold,
        });
        page.drawText('Premise sentence that wraps', {
          x: x + 36,
          y: cy,
          size: 9,
          font,
        });
        page.drawText('onto a second line', {
          x: x + 36,
          y: cy - 13,
          size: 9,
          font,
        });
        cy -= 34;
      }
      page.drawText('Which premises agree?', {
        x: x + 18,
        y: cy,
        size: 9,
        font: bold,
      });
      cy -= 22;
      for (const letter of 'ABCDE') {
        page.drawText(`${letter})`, { x: x + 18, y: cy, size: 9, font });
        for (let line = 0; line < 3; line++)
          page.drawText('Long choice text line', {
            x: x + 32,
            y: cy - line * 13,
            size: 9,
            font,
          });
        cy -= 50;
      }
    }
  });
  for (const make of [
    async () => bytes,
    async () => (await scanned(bytes)).bytes,
  ]) {
    const source = await sourceFrom(await make());
    try {
      const rects = await detectQuestions(
        await renderSource(source, 1, 1.6),
        2,
      );
      assert.equal(rects.length, 2, 'One crop per question');
      for (const [i, rect] of rects.entries()) {
        const x = i ? 320 : 40;
        assert.ok(rect.x > x + 8 && rect.x < x + 18, `crop x ${rect.x}`);
        // The crop reaches the last line of choice E.
        assert.ok(rect.y + rect.h >= H - (740 - 3 * 34 - 22 - 4 * 50 - 26));
      }
    } finally {
      await source.pdf.loadingTask.destroy();
    }
  }
});

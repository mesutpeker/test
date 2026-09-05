import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

Object.assign(globalThis, {
  DOMMatrix,
  ImageData,
  Path2D,
  document: { createElement: () => createCanvas(1, 1) },
});
const { getPdfjs, renderSource, detectQuestions, makeQuestion } =
  await import('../lib/pdf-engine.ts');
const pdfjs = await getPdfjs();
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).href;

async function sourceFor(draw) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  await draw(doc.addPage([600, 800]), font, bold);
  const bytes = await doc.save();
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
    name: 'Number boundaries',
    bytes,
    pdf,
    pages: 1,
    columns: 2,
    scale: 100,
  };
}

test('Single, double and triple digit source labels are excluded in both columns', async () => {
  const source = await sourceFor((page, font, bold) => {
    for (const x of [40, 340]) {
      ['1.', '12.', '123.'].forEach((label, i) => {
        const y = 720 - i * 230;
        page.drawText(label, {
          x,
          y,
          size: 10,
          font: bold,
          color: rgb(0, 0.5, 0.8),
        });
        page.drawText('Question body starts here.', {
          x: x + 30,
          y,
          size: 9,
          font,
        });
        page.drawText('A) Choice one   B) Choice two', {
          x: x + 30,
          y: y - 24,
          size: 9,
          font,
        });
      });
    }
  });
  try {
    for (const scale of [1.6, 3]) {
      const rendered = await renderSource(source, 1, scale);
      const rects = await detectQuestions(rendered, 2);
      assert.equal(rects.length, 6);
      for (const [i, rect] of rects.entries()) {
        const x = i < 3 ? 40 : 340;
        assert.ok(
          rect.x > x + 5 && rect.x <= x + 30,
          'Exclude the label without clipping the body',
        );
        const q = await makeQuestion(source, 1, rect, rendered, true);
        assert.equal(
          q.fontSize,
          9,
          'Source body font measurement is unchanged',
        );
        const sx = rendered.canvas.width / rendered.width;
        const sy = rendered.canvas.height / rendered.height;
        const pixels = rendered.canvas
          .getContext('2d')
          .getImageData(
            Math.ceil(q.rect.x * sx),
            Math.ceil(q.rect.y * sy),
            Math.floor(q.rect.w * sx),
            Math.floor(q.rect.h * sy),
          ).data;
        for (let p = 0; p < pixels.length; p += 4) {
          assert.ok(
            !(pixels[p + 2] - pixels[p] > 50 && pixels[p + 1] - pixels[p] > 30),
            'No blue source-number pixels may remain',
          );
        }
      }
    }
  } finally {
    await source.pdf.loadingTask.destroy();
  }
});

test('Number prefixes sharing a text item use the gap after punctuation', async () => {
  const labels = ['1.', '12.', '123.', '1)', '12)'];
  const source = await sourceFor((page, font) => {
    labels.forEach((label, i) =>
      page.drawText(`${label}  Question body`, {
        x: 40,
        y: 720 - i * 125,
        size: 12,
        font,
      }),
    );
  });
  source.columns = 1;
  try {
    const font = await PDFDocument.create();
    const metrics = await font.embedFont(StandardFonts.Helvetica);
    for (const scale of [1.6, 2.5]) {
      const rendered = await renderSource(source, 1, scale);
      const rects = await detectQuestions(rendered, 1);
      assert.equal(rects.length, labels.length);
      rects.forEach((rect, i) => {
        const labelEnd = 40 + metrics.widthOfTextAtSize(labels[i], 12);
        const bodyStart = 40 + metrics.widthOfTextAtSize(`${labels[i]}  `, 12);
        assert.ok(
          rect.x >= labelEnd && rect.x <= bodyStart + 0.5,
          `${labels[i]} crop must start in the label/body gap, got ${rect.x}`,
        );
      });
    }
  } finally {
    await source.pdf.loadingTask.destroy();
  }
});

test('An overstated label advance cannot crop a separately positioned first word', async () => {
  const source = await sourceFor((page, font, bold) => {
    page.drawText('8.', { x: 40, y: 720, size: 10, font: bold });
    page.drawText('First word must survive', { x: 70, y: 720, size: 9, font });
  });
  try {
    const page = await source.pdf.getPage(1);
    const originalStream = page.streamTextContent.bind(page);
    page.streamTextContent = (...args) =>
      originalStream(...args).pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            controller.enqueue({
              ...chunk,
              items: chunk.items.map((item) =>
                item.str === '8.' ? { ...item, width: 90 } : item,
              ),
            });
          },
        }),
      );
    assert.deepEqual(
      await detectQuestions(await renderSource(source, 1, 1.6), 2),
      [],
    );
  } finally {
    await source.pdf.loadingTask.destroy();
  }
});

test('Automatic removal never cuts lower text or diagrams extending beneath a label', async () => {
  const source = await sourceFor((page, font, bold) => {
    page.drawText('8.', { x: 40, y: 720, size: 10, font: bold });
    page.drawText('Body', { x: 70, y: 720, size: 9, font });
    page.drawText('A) Full width choice', { x: 40, y: 690, size: 9, font });
    page.drawText('9.', { x: 340, y: 720, size: 10, font: bold });
    page.drawText('Body', { x: 370, y: 720, size: 9, font });
    page.drawRectangle({
      x: 340,
      y: 650,
      width: 100,
      height: 40,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });
  });
  try {
    assert.deepEqual(
      await detectQuestions(await renderSource(source, 1, 1.6), 2),
      [],
      'Unsafe rectangular crops must remain manually selectable',
    );
  } finally {
    await source.pdf.loadingTask.destroy();
  }
});

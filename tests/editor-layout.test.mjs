import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  createCanvas,
  loadImage,
  DOMMatrix,
  ImageData,
  Path2D,
} from '@napi-rs/canvas';
import {
  defaults,
  PAGE,
  layoutQuestions,
  printedFontSize,
  placementsOverlap,
  movePlacedQuestion,
  adjustQuestionsForHeader,
  removeEmptyLayoutPage,
  testHeader,
  headerStyles,
  columnDividerSegments,
  renderSource,
  makeQuestion,
  rasterCrop,
  createPdf,
  getPdfjs,
} from '../lib/pdf-engine.ts';
import { transformCrop } from '../lib/editor-geometry.ts';
const source = {
  id: 'source',
  name: 'Test',
  kind: 'pdf',
  bytes: new Uint8Array(),
  pages: 1,
  columns: 2,
  scale: 100,
};
const q = (id, overrides = {}) => ({
  id: String(id),
  sourceId: 'source',
  page: 1,
  rect: { x: 0, y: 0, w: 180, h: 100 },
  fontSize: 9.5,
  pageWidth: 600,
  referenceWidth: 252,
  rotation: 0,
  thumb: '',
  answer: 'A',
  wide: false,
  ...overrides,
});
const items = (pages) => pages.flatMap((p) => p.items);

test('Large width and height crops cannot shrink existing questions', () => {
  const regular = q(1);
  const original = items(layoutQuestions([regular], [source], defaults))[0];
  for (const rect of [
    { x: 0, y: 0, w: 450, h: 100 },
    { x: 0, y: 0, w: 200, h: 1500 },
  ]) {
    const placed = items(
      layoutQuestions([regular, q(2, { rect })], [source], defaults),
    );
    assert.equal(placed[0].scale, original.scale);
    assert.equal(printedFontSize(placed[0]), 9.5);
    assert.ok(printedFontSize(placed[1]) < defaults.minFontSize);
  }
});

test('Independent size, full width and own page provide distinct layout remedies', () => {
  const first = q(1),
    wide = q(2, { rect: { x: 0, y: 0, w: 450, h: 150 } });
  const small = items(layoutQuestions([first, wide], [source], defaults))[1];
  const full = items(
    layoutQuestions([first, { ...wide, wide: true }], [source], defaults),
  )[1];
  assert.ok(printedFontSize(full) > printedFontSize(small));
  const scaled = items(
    layoutQuestions([first, q(3, { scale: 60 })], [source], defaults),
  );
  assert.equal(printedFontSize(scaled[0]), 9.5);
  assert.ok(Math.abs(printedFontSize(scaled[1]) - 5.7) < 0.001);
  const separate = layoutQuestions(
    [first, { ...wide, ownPage: true }, q(3)],
    [source],
    defaults,
  );
  assert.deepEqual(
    separate.map((p) => p.items.map((i) => i.q.id)),
    [['1'], ['2'], ['3']],
  );
});

test('Page and column breaks start at the requested boundary without empty leading pages', () => {
  const settings = { ...defaults, balance: false };
  const columns = layoutQuestions(
    [q(1), q(2, { breakBefore: 'column' })],
    [source],
    settings,
  );
  assert.equal(columns.length, 1);
  assert.ok(columns[0].items[1].x > columns[0].items[0].x);
  assert.equal(columns[0].items[1].y, columns[0].contentTop);
  const pages = layoutQuestions(
    [q(1), q(2, { breakBefore: 'page' }), q(3)],
    [source],
    settings,
  );
  assert.deepEqual(
    pages.map((p) => p.items.map((i) => i.q.id)),
    [['1'], ['2', '3']],
  );
  assert.equal(
    layoutQuestions([q(1, { breakBefore: 'page' })], [source], settings).length,
    1,
  );
});

test('Manual placement reserves space, preserves numbering and rejects collisions including numbers', () => {
  const fixed = q(2, { position: { page: 1, x: 80, y: 90 } });
  const pages = layoutQuestions([q(1), fixed, q(3)], [source], defaults);
  const it = pages[1].items.find((i) => i.q.id === '2');
  assert.equal(it.x, 80);
  assert.equal(it.y, 90);
  assert.equal(it.index, 1);
  assert.throws(
    () =>
      layoutQuestions(
        [fixed, q(3, { position: { page: 1, x: 90, y: 90 } })],
        [source],
        defaults,
      ),
    /aynı alan/,
  );
  assert.throws(
    () =>
      layoutQuestions(
        [q(1, { position: { page: 0, x: 1, y: 1 } })],
        [source],
        defaults,
      ),
    /dışında/,
  );
  const numbered = q(3, { position: { page: 1, x: 265, y: 90 } });
  assert.throws(
    () => layoutQuestions([fixed, numbered], [source], defaults),
    /aynı alan/,
  );
  const reserved = q(2, { position: { page: 0, x: 60, y: 150 } });
  const around = layoutQuestions([q(1), reserved, q(3)], [source], defaults);
  for (const p of around)
    for (let a = 0; a < p.items.length; a++)
      for (let b = a + 1; b < p.items.length; b++)
        assert.equal(placementsOverlap(p.items[a], p.items[b]), false);
});

test('Changing header designs keeps manual questions below the header and preserves later pages', () => {
  for (const previousStyle of headerStyles) {
    const previous = { ...defaults, headerStyle: previousStyle.value };
    const questions = [q(1), q(2), q(3)];
    const pinned = movePlacedQuestion(
      questions,
      layoutQuestions(questions, [source], previous),
      '3',
      { page: 1, x: 80, y: 90 },
    );
    const before = layoutQuestions(pinned, [source], previous);
    const snapshot = structuredClone(pinned);
    for (const nextStyle of headerStyles) {
      const next = { ...previous, headerStyle: nextStyle.value };
      const adjusted = adjustQuestionsForHeader(
        pinned,
        [source],
        previous,
        next,
      );
      const after = layoutQuestions(adjusted, [source], next);
      const shift =
        testHeader(next, 3).contentTop - testHeader(previous, 3).contentTop;
      assert.equal(after.length, before.length);
      for (let page = 0; page < before.length; page++) {
        for (const old of before[page].items) {
          const item = after[page].items.find((it) => it.q.id === old.q.id);
          assert.equal(item.x, old.x);
          assert.ok(
            Math.abs(item.y - old.y - (page === 0 ? shift : 0)) < 0.001,
          );
          assert.ok(item.y >= after[page].contentTop - 0.001);
          assert.equal(item.scale, old.scale);
          assert.equal(item.index, old.index);
        }
      }
      const restored = adjustQuestionsForHeader(
        adjusted,
        [source],
        next,
        previous,
      );
      assert.deepEqual(layoutQuestions(restored, [source], previous), before);
    }
    assert.deepEqual(
      pinned,
      snapshot,
      'Header changes do not mutate the saved question state',
    );
  }
});

test('A taller header reflows only manual questions that no longer fit', () => {
  const bottom = PAGE.h - (defaults.margin * 72) / 25.4 - 22;
  const questions = [
    q(1, {
      position: { page: 0, x: 60, y: testHeader(defaults, 3).contentTop },
    }),
    q(2, { position: { page: 0, x: 60, y: bottom - 100 } }),
    q(3, { position: { page: 1, x: 80, y: 90 } }),
  ];
  layoutQuestions(questions, [source], defaults);
  const next = { ...defaults, headerStyle: 'band' };
  const adjusted = adjustQuestionsForHeader(
    questions,
    [source],
    defaults,
    next,
  );
  assert.equal(adjusted[1].position, undefined);
  assert.deepEqual(adjusted[2].position, questions[2].position);
  assert.equal(adjusted[0].position.y, testHeader(next, 3).contentTop);
  const pages = layoutQuestions(adjusted, [source], next);
  assert.deepEqual(
    items(pages)
      .map((it) => it.q.id)
      .sort(),
    ['1', '2', '3'],
  );
  for (const page of pages) {
    for (const item of page.items) {
      assert.ok(item.y >= page.contentTop - 0.001);
      assert.ok(item.y + item.h <= bottom + 0.001);
      assert.equal(printedFontSize(item), 9.5);
    }
    for (let a = 0; a < page.items.length; a++)
      for (let b = a + 1; b < page.items.length; b++)
        assert.equal(placementsOverlap(page.items[a], page.items[b]), false);
  }
});

test('Deleting an empty middle page closes the gap without removing or moving question content', () => {
  const questions = [
    q(1, { position: { page: 0, x: 70, y: 150 } }),
    q(2, { position: { page: 2, x: 85, y: 90 } }),
  ];
  const before = layoutQuestions(questions, [source], defaults);
  assert.equal(before[1].items.length, 0);
  assert.equal(
    removeEmptyLayoutPage(questions, [source], defaults, before, 0),
    questions,
    'A populated page cannot be deleted',
  );
  const adjusted = removeEmptyLayoutPage(
    questions,
    [source],
    defaults,
    before,
    1,
  );
  const after = layoutQuestions(adjusted, [source], defaults);
  assert.equal(after.length, 2);
  assert.deepEqual(
    after.map((p) => p.items.map((it) => it.q.id)),
    [['1'], ['2']],
  );
  for (const old of items(before)) {
    const item = items(after).find((it) => it.q.id === old.q.id);
    assert.deepEqual(
      [item.x, item.y, item.w, item.h, item.index],
      [old.x, old.y, old.w, old.h, old.index],
    );
  }
  assert.equal(questions[1].position.page, 2, 'Undo state remains intact');
});

test('Deleting an empty first page reserves header space and reflows any overflow', () => {
  const margin = (defaults.margin * 72) / 25.4;
  const bottom = PAGE.h - margin - 22;
  const questions = [
    q(1, { position: { page: 1, x: 70, y: margin } }),
    q(2, { position: { page: 1, x: 70, y: bottom - 100 } }),
    q(3, { position: { page: 2, x: 85, y: 90 } }),
  ];
  const before = layoutQuestions(questions, [source], defaults);
  const adjusted = removeEmptyLayoutPage(
    questions,
    [source],
    defaults,
    before,
    0,
  );
  const after = layoutQuestions(adjusted, [source], defaults);
  assert.equal(after.length, 2);
  assert.ok(after.every((page) => page.items.length));
  assert.deepEqual(
    items(after)
      .map((it) => it.q.id)
      .sort(),
    ['1', '2', '3'],
  );
  assert.equal(adjusted[0].position.y, testHeader(defaults, 3).contentTop);
  assert.equal(adjusted[1].position, undefined);
  assert.deepEqual(adjusted[2].position, { page: 1, x: 85, y: 90 });
  for (const page of after)
    for (const item of page.items) {
      assert.ok(item.y >= page.contentTop - 0.001);
      assert.ok(item.y + item.h <= bottom + 0.001);
    }
});

test('Full-width blocks can fill remaining page space and column dividers avoid moved crops', () => {
  const pages = layoutQuestions(
    [q(1), q(2, { wide: true, rect: { x: 0, y: 0, w: 400, h: 100 } }), q(3)],
    [source],
    { ...defaults, balance: true, columnDivider: true },
  );
  assert.equal(pages.length, 1);
  for (const page of pages)
    for (let a = 0; a < page.items.length; a++)
      for (let b = a + 1; b < page.items.length; b++)
        assert.equal(placementsOverlap(page.items[a], page.items[b]), false);
  const cross = q(1, { position: { page: 0, x: 220, y: 300 } });
  const moved = layoutQuestions([cross], [source], {
    ...defaults,
    columnDivider: true,
  });
  assert.ok(
    columnDividerSegments(moved[0], { ...defaults, columnDivider: true }).every(
      (s) => s.bottom <= 300 || s.top >= 400,
    ),
  );
});

test('Moving and resizing a crop respects all edges and minimum dimensions', () => {
  const r = { x: 20, y: 30, w: 100, h: 80 };
  assert.deepEqual(transformCrop(r, -100, 1000, 'move', 300, 200), {
    x: 0,
    y: 120,
    w: 100,
    h: 80,
  });
  assert.deepEqual(transformCrop(r, 1000, 1000, 'nw', 300, 200), {
    x: 115,
    y: 105,
    w: 5,
    h: 5,
  });
  assert.deepEqual(transformCrop(r, 1000, 1000, 'se', 300, 200), {
    x: 20,
    y: 30,
    w: 280,
    h: 170,
  });
  assert.deepEqual(transformCrop(r, 10, -10, 'ne', 300, 200), {
    x: 20,
    y: 20,
    w: 110,
    h: 90,
  });
});

test('Moving a tall or own-page question preserves its size and freezes other positions', () => {
  for (const question of [
    q(1, { rect: { x: 0, y: 0, w: 180, h: 1600 } }),
    q(1, { ownPage: true, rect: { x: 0, y: 0, w: 430, h: 260 } }),
  ]) {
    const questions = [question, q(2), q(3)];
    const before = layoutQuestions(questions, [source], defaults);
    const first = items(before).find((it) => it.q.id === '1');
    const next = movePlacedQuestion(questions, before, '1', {
      page: 3,
      x: first.x,
      y: first.y,
    });
    const after = layoutQuestions(next, [source], defaults);
    const moved = after[3].items.find((it) => it.q.id === '1');
    assert.equal(moved.w, first.w);
    assert.equal(moved.h, first.h);
    assert.equal(moved.scale, first.scale);
    assert.equal(moved.q.ownPage, false);
    for (let page = 0; page < before.length; page++) {
      for (const old of before[page].items.filter((it) => it.q.id !== '1')) {
        const kept = after[page].items.find((it) => it.q.id === old.q.id);
        assert.deepEqual(
          [kept.x, kept.y, kept.w, kept.h],
          [old.x, old.y, old.w, old.h],
        );
      }
    }
  }
});

Object.assign(globalThis, {
  DOMMatrix,
  ImageData,
  Path2D,
  document: {
    createElement: () => {
      const canvas = createCanvas(1, 1);
      canvas.toBlob = (callback) =>
        callback(
          new Blob([canvas.toBuffer('image/png')], { type: 'image/png' }),
        );
      return canvas;
    },
  },
});

test('All image rotations keep crop pixels identical in preview and PDF raster export', async () => {
  const fixture = createCanvas(120, 80),
    ctx = fixture.getContext('2d');
  for (const [color, x, y] of [
    ['red', 0, 0],
    ['green', 60, 0],
    ['blue', 0, 40],
    ['yellow', 60, 40],
  ]) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 60, 40);
  }
  const image = await loadImage(fixture.toBuffer('image/png'));
  Object.defineProperties(image, {
    naturalWidth: { value: 120 },
    naturalHeight: { value: 80 },
  });
  const src = { ...source, kind: 'image', image, columns: 1 };
  for (const rotation of [0, 90, 180, 270]) {
    const rendered = await renderSource(src, 1, 1, rotation);
    assert.equal(rendered.width, rotation % 180 ? 80 : 120);
    assert.equal(rendered.height, rotation % 180 ? 120 : 80);
    const rect = { x: 10, y: 10, w: 55, h: 50 };
    const question = await makeQuestion(src, 1, rect, rendered, false);
    assert.equal(question.rotation, rotation);
    const output = await loadImage(await rasterCrop(src, question, 55, 300));
    const crop = createCanvas(55, 50);
    crop.getContext('2d').drawImage(output, 0, 0);
    assert.deepEqual(
      Array.from(crop.getContext('2d').getImageData(0, 0, 55, 50).data),
      Array.from(
        rendered.canvas.getContext('2d').getImageData(10, 10, 55, 50).data,
      ),
    );
  }
});

test('Exported vector PDF uses manual page coordinates and actual displayed font size', async () => {
  const original = await PDFDocument.create(),
    font = await original.embedFont(StandardFonts.Helvetica);
  original
    .addPage([600, 800])
    .drawText('POSITION_CHECK', { x: 20, y: 750, size: 10, font });
  const bytes = await original.save();
  const src = { ...source, bytes };
  const question = q(1, {
    rect: { x: 10, y: 30, w: 160, h: 60 },
    pdfRect: { left: 10, right: 170, bottom: 710, top: 770 },
    fontSize: 10,
    position: { page: 1, x: 90, y: 130 },
  });
  const settings = { ...defaults, student: false };
  const layout = layoutQuestions([question], [src], settings);
  const fonts = new Uint8Array(
    await readFile(new URL('../public/fonts/DejaVuSans.ttf', import.meta.url)),
  );
  const result = await createPdf([question], [src], settings, fonts);
  const pdfjs = await getPdfjs();
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    import.meta.url,
  ).href;
  const pdf = await pdfjs.getDocument({
    data: result.bytes.slice(),
    standardFontDataUrl: fileURLToPath(
      new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url),
    ),
  }).promise;
  try {
    assert.equal(pdf.numPages, 2);
    const text = await (await pdf.getPage(2)).getTextContent();
    const word = text.items.find((i) => i.str === 'POSITION_CHECK');
    assert.ok(word);
    const item = layout[1].items[0];
    assert.ok(Math.abs(word.transform[0] - printedFontSize(item)) < 0.01);
    assert.ok(Math.abs(word.transform[4] - (item.x + 10 * item.scale)) < 0.01);
    assert.ok(
      Math.abs(word.transform[5] - (PAGE.h - item.y - 20 * item.scale)) < 0.01,
    );
  } finally {
    await pdf.loadingTask.destroy();
  }
});

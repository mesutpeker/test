import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, PDFName, PDFDict } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import {
  PAGE,
  defaults,
  headerStyles,
  layoutQuestions,
  columnDividerSegments,
  testHeader,
  createPdf,
  getPdfjs,
} from '../lib/pdf-engine.ts';

const source = {
  id: 'source',
  name: 'Test source',
  kind: 'pdf',
  bytes: new Uint8Array(),
  pages: 1,
  columns: 2,
  scale: 100,
};
const question = (id, overrides = {}) => ({
  id: String(id),
  sourceId: source.id,
  page: 1,
  rect: { x: 50, y: 100, w: 260, h: 100 },
  pageWidth: 600,
  referenceWidth: 252,
  fontSize: 9.5,
  rotation: 0,
  thumb: '',
  answer: 'A',
  wide: false,
  ...overrides,
});
const mm = (value) => (value * 72) / 25.4;

function assertFits(pages, settings) {
  const margin = mm(settings.margin);
  const bottom = PAGE.h - margin - 22;
  const colWidth =
    (PAGE.w - margin * 2 - (settings.columns === 2 ? 24 : 0)) /
    settings.columns;
  for (const page of pages) {
    assert.ok(page.items.length, 'No empty pages');
    for (const item of page.items) {
      assert.ok(item.x >= margin && item.y >= page.contentTop - 0.001);
      assert.ok(item.y + item.h <= bottom + 0.001, 'Fits page height');
      const maxWidth = item.q.wide ? PAGE.w - 2 * margin - 17 : colWidth - 17;
      assert.ok(item.w <= maxWidth + 0.001, 'Fits column width');
      assert.ok(item.x + item.w <= PAGE.w - margin + 0.001, 'Fits page width');
      assert.ok(
        Math.abs(item.w / item.h - item.q.rect.w / item.q.rect.h) < 0.00001,
        'Aspect ratio preserved',
      );
    }
    for (let i = 0; i < page.items.length; i++)
      for (let j = i + 1; j < page.items.length; j++) {
        const a = page.items[i],
          b = page.items[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        assert.ok(
          overlapX <= 0.001 || overlapY <= 0.001,
          'Questions never overlap',
        );
      }
  }
}

test('105% and larger sizes retain every A4 question within its column', () => {
  for (const columns of [1, 2])
    for (const scale of [40, 75, 100, 105, 140])
      for (const balance of [false, true]) {
        const settings = { ...defaults, columns, scale, balance };
        const questions = Array.from({ length: 12 }, (_, i) => question(i));
        const pages = layoutQuestions(questions, [source], settings);
        assert.deepEqual(
          pages.flatMap((p) => p.items.map((i) => i.q.id)),
          questions.map((q) => q.id),
        );
        assertFits(pages, settings);
      }
});

test('Scale increases when there is space and caps each question independently', () => {
  const narrow = question(1, { rect: { x: 0, y: 0, w: 100, h: 100 } });
  const at100 = layoutQuestions([narrow], [source], defaults)[0].items[0];
  const at105 = layoutQuestions([narrow], [source], {
    ...defaults,
    scale: 105,
  })[0].items[0];
  assert.ok(Math.abs(at105.scale / at100.scale - 1.05) < 0.00001);
  const other = { ...source, id: 'other', scale: 125 };
  const mixed = [
    question(1),
    question(2, { sourceId: other.id, fontSize: 12 }),
  ];
  const pages = layoutQuestions(mixed, [source, other], {
    ...defaults,
    scale: 140,
  });
  const items = pages.flatMap((p) => p.items);
  for (const item of items) {
    const alone = layoutQuestions([item.q], [source, other], {
      ...defaults,
      scale: 140,
    })[0].items[0];
    assert.equal(
      item.scale,
      alone.scale,
      'Other sources do not alter this question scale',
    );
  }
  assertFits(pages, defaults);
});

test('Continuation pages and column dividers start at the top margin', () => {
  for (const student of [false, true]) {
    const settings = { ...defaults, student, perPage: 2, columnDivider: true };
    const pages = layoutQuestions(
      Array.from({ length: 6 }, (_, i) => question(i)),
      [source],
      settings,
    );
    assert.equal(pages.length, 3);
    assert.equal(pages[0].contentTop, testHeader(settings, 6).contentTop);
    for (const page of pages.slice(1)) {
      assert.equal(page.contentTop, mm(settings.margin));
      assert.equal(page.items[0].y, mm(settings.margin));
      assert.equal(
        columnDividerSegments(page, settings)[0].top,
        mm(settings.margin),
      );
    }
    assertFits(pages, settings);
  }
});

test('Tall questions move intact to continuation pages; full-width bands remain clear', () => {
  const settings = {
    ...defaults,
    balance: true,
    perPage: 0,
    columnDivider: true,
  };
  const bottom = PAGE.h - mm(settings.margin) - 22;
  const tall = bottom - testHeader(settings, 2).contentTop + 30;
  const questions = [
    question(1, { rect: { x: 0, y: 0, w: 100, h: 100 } }),
    question(2, { rect: { x: 0, y: 0, w: 100, h: tall } }),
    question(3, { wide: true, rect: { x: 0, y: 0, w: 430, h: 130 } }),
    question(4, { rect: { x: 0, y: 0, w: 100, h: 100 } }),
    question(5, { rect: { x: 0, y: 0, w: 100, h: 100 } }),
  ];
  const pages = layoutQuestions(questions, [source], settings);
  assert.equal(pages[1].items[0].q.id, '2');
  assert.equal(pages[1].items[0].y, mm(settings.margin));
  assertFits(pages, settings);
  for (const page of pages)
    for (const segment of columnDividerSegments(page, settings)) {
      for (const wide of page.items.filter((i) => i.q.wide)) {
        assert.ok(
          segment.bottom <= wide.y || segment.top >= wide.y + wide.h,
          'Divider avoids wide questions',
        );
      }
    }
  const huge = layoutQuestions(
    [question(1, { rect: { x: 0, y: 0, w: 200, h: 1600 } })],
    [source],
    settings,
  );
  assertFits(huge, settings);
});

test('Long Turkish header text stays inside the page and above the first question', async () => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(new URL('../public/fonts/DejaVuSans.ttf', import.meta.url)),
  );
  const settings = {
    ...defaults,
    margin: 25,
    school:
      'Özel Şehit Öğretmen Cumhuriyet Eğitim Kurumları Anadolu ve Fen Lisesi'
        .repeat(2)
        .slice(0, 100),
    title:
      'ÇOKGENLER, ÜÇGENLER VE GEOMETRİK ŞEKİLLER: KONU DEĞERLENDİRME VE AKADEMİK BAŞARI SINAVI'.slice(
        0,
        100,
      ),
    subtitle:
      'İkinci dönem / 2026-2027 eğitim öğretim yılı / 8. sınıf matematik / Ölçme ve değerlendirme çalışması'
        .repeat(2)
        .slice(0, 130),
  };
  for (const { value: headerStyle } of headerStyles) {
    for (const title of [settings.title, 'W'.repeat(100), 'Ş'.repeat(100)]) {
      const header = testHeader({ ...settings, title, headerStyle }, 24);
      for (const text of header.texts) {
        const width = font.widthOfTextAtSize(text.text, text.size);
        const left = text.x - (text.align === 'center' ? width / 2 : 0);
        assert.ok(left >= mm(settings.margin), text.text);
        assert.ok(left + width <= PAGE.w - mm(settings.margin), text.text);
        assert.ok(text.y < header.contentTop);
      }
      const titleRows = header.texts.filter((t) => t.size === 13.5);
      assert.ok(titleRows.length > 1, 'Long titles wrap instead of shrinking');
      for (const text of titleRows) {
        assert.equal(text.align, 'center');
        assert.equal(text.x, PAGE.w / 2);
      }
      const pages = layoutQuestions(
        Array.from({ length: 8 }, (_, i) => question(i)),
        [source],
        { ...settings, title, headerStyle, scale: 105 },
      );
      assertFits(pages, settings);
      for (const page of pages.slice(1))
        assert.equal(page.contentTop, mm(settings.margin));
    }
  }
});

test('Export prints the institutional header and student fields only on the first page', async () => {
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const original = await PDFDocument.create();
  const font = await original.embedFont(StandardFonts.Helvetica);
  const page = original.addPage([600, 800]);
  page.drawText('Which expression is equal to 24?', {
    x: 60,
    y: 680,
    size: 12,
    font,
  });
  page.drawText('A) 6 x 4   B) 6 + 4   C) 6 - 4   D) 6 / 4', {
    x: 60,
    y: 650,
    size: 10,
    font,
  });
  const exportedSource = { ...source, bytes: await original.save() };
  const questions = Array.from({ length: 7 }, (_, i) =>
    question(i + 1, {
      rect: { x: 50, y: 100, w: 260, h: 100 },
      pdfRect: { left: 50, right: 310, top: 700, bottom: 600 },
    }),
  );
  const settings = {
    ...defaults,
    scale: 105,
    perPage: 2,
    answerKey: true,
    columnDivider: true,
    school: 'Cumhuriyet Anadolu Lisesi',
    title: 'Matematik Konu Değerlendirme Testi',
    subtitle: '9. sınıf / Sayılar ve işlemler',
  };
  const fontBytes = new Uint8Array(
    await readFile(new URL('../public/fonts/DejaVuSans.ttf', import.meta.url)),
  );
  const pdfjs = await getPdfjs();
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    import.meta.url,
  ).href;
  for (const { value: headerStyle } of headerStyles) {
    const variant = { ...settings, headerStyle };
    const result = await createPdf(
      questions,
      [exportedSource],
      variant,
      fontBytes,
    );
    const saved = await PDFDocument.load(result.bytes);
    const fonts = saved
      .getPages()[0]
      .node.Resources()
      .lookup(PDFName.of('Font'), PDFDict);
    const baseFonts = fonts
      .values()
      .map((ref) =>
        saved.context
          .lookup(ref, PDFDict)
          .get(PDFName.of('BaseFont'))
          ?.toString(),
      );
    assert.ok(
      baseFonts.some((name) => name?.includes('Helvetica-Bold')),
      'Question numbers use bold by default',
    );
    const pdf = await pdfjs.getDocument({
      data: result.bytes.slice(),
      standardFontDataUrl: fileURLToPath(
        new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url),
      ),
    }).promise;
    try {
      assert.equal(pdf.numPages, 5);
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        const content = await p.getTextContent();
        const text = content.items.map((t) => t.str).join(' ');
        for (const label of [
          'CUMHURİYET ANADOLU LİSESİ',
          'Matematik Konu Değerlendirme Testi',
          '9. sınıf / Sayılar ve işlemler',
          'ADI SOYADI',
          'SINIF / NO',
          'TARİH',
        ]) {
          assert.equal(
            text.includes(label),
            i === 1,
            `Header presence on page ${i}: ${label}`,
          );
        }
        if (i === 1) {
          for (const value of [
            settings.school.toLocaleUpperCase('tr-TR'),
            settings.title,
            settings.subtitle,
          ]) {
            const entry = content.items.find((item) => item.str === value);
            assert.ok(entry, `Header text found: ${value}`);
            assert.ok(
              Math.abs(entry.transform[4] + entry.width / 2 - PAGE.w / 2) < 0.5,
              `${headerStyle}: ${value} is centered in the exported PDF`,
            );
          }
        }
        if (i < 5) assert.ok(text.includes('Which expression is equal to 24?'));
        else assert.ok(text.includes('Cevap anahtarı'));
      }
    } finally {
      await pdf.loadingTask.destroy();
    }
    if (process.env.PDF_LAYOUT_QA_DIR) {
      await mkdir(process.env.PDF_LAYOUT_QA_DIR, { recursive: true });
      await writeFile(
        `${process.env.PDF_LAYOUT_QA_DIR}/${headerStyle}-header.pdf`,
        result.bytes,
      );
    }
  }
  if (process.env.PDF_LAYOUT_QA_DIR) {
    const long = await createPdf(
      questions,
      [exportedSource],
      {
        ...settings,
        title:
          'ÜÇGENLER VE ÇOKGENLER: GEOMETRİK İLİŞKİLER İLE PROBLEM ÇÖZME BECERİLERİ DEĞERLENDİRME TESTİ',
        subtitle:
          '2026-2027 Eğitim Öğretim Yılı / İkinci Dönem / Ölçme ve Değerlendirme',
        margin: 25,
        answerKey: false,
      },
      fontBytes,
    );
    await writeFile(
      `${process.env.PDF_LAYOUT_QA_DIR}/long-header.pdf`,
      long.bytes,
    );
  }
});

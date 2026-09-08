import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import {
  PDFDocument,
  rgb,
  degrees,
  StandardFonts,
  type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { imageRotation } from './editor-geometry.ts';
export function publicAsset(path: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/${path.replace(/^\/+/, '')}`;
}
export type Rect = { x: number; y: number; w: number; h: number };
export type Source = {
  id: string;
  name: string;
  kind: 'pdf' | 'image';
  bytes: Uint8Array;
  pages: number;
  pdf?: PDFDocumentProxy;
  image?: HTMLImageElement;
  columns: number;
  scale: number;
};
export type Question = {
  id: string;
  sourceId: string;
  page: number;
  rect: Rect;
  pdfRect?: { left: number; bottom: number; right: number; top: number };
  rotation: number;
  pageWidth: number;
  referenceWidth: number;
  fontSize?: number;
  thumb: string;
  answer: string;
  wide: boolean;
  scale?: number;
  breakBefore?: 'page' | 'column';
  ownPage?: boolean;
  position?: { page: number; x: number; y: number };
};
export const headerStyles = [
  { value: 'institutional', label: 'Kurumsal' },
  { value: 'band', label: 'Şerit' },
  { value: 'minimal', label: 'Sade' },
  { value: 'framed', label: 'Çerçeve' },
] as const;
export type Settings = {
  title: string;
  subtitle: string;
  school: string;
  headerStyle: (typeof headerStyles)[number]['value'];
  columns: 1 | 2;
  margin: number;
  gap: number;
  scale: number;
  perPage: number;
  balance: boolean;
  numberColor: string;
  numberStyle: 'plain' | 'bold' | 'italic' | 'circle' | 'square';
  columnDivider: boolean;
  lineColor: string;
  student: boolean;
  answerKey: boolean;
  quality: 'vector' | '300' | '600';
  normalization: 'font' | 'column';
  minFontSize: number;
};
export const defaults: Settings = {
  title: 'Konu değerlendirme testi',
  subtitle: '',
  school: '',
  headerStyle: 'institutional',
  columns: 2,
  margin: 14,
  gap: 8,
  scale: 100,
  perPage: 6,
  balance: true,
  numberColor: '',
  numberStyle: 'bold',
  columnDivider: false,
  lineColor: '',
  student: true,
  answerKey: false,
  quality: 'vector',
  normalization: 'font',
  minFontSize: 8,
};
export const PAGE = { w: 595.2756, h: 841.8898 };
export function testHeader(
  settings: Settings,
  questionCount: number,
  showQuestionCount = true,
) {
  const margin = (settings.margin * 72) / 25.4;
  const width = PAGE.w - margin * 2;
  const style = settings.headerStyle || 'institutional';
  const monochrome = style === 'minimal' || style === 'framed';
  const ink = monochrome ? '#26333e' : '#223a5a';
  const muted = monochrome ? '#63707b' : '#61738a';
  const accent = '#294c83';
  const lineColor = settings.lineColor || (monochrome ? '#9da8b1' : '#bccbde');
  const texts: {
    text: string;
    x: number;
    y: number;
    size: number;
    color: string;
    align?: 'center';
  }[] = [];
  const lines: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    color: string;
  }[] = [];
  const boxes: {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
  }[] = [];
  // Conservative advances leave room for DejaVu Sans in both SVG and PDF.
  // Shared line breaks also keep long titles and unbroken words in the header.
  function wrapped(text: string, size: number, maxWidth: number) {
    const advance = (value: string) =>
      Array.from(value).reduce((sum, char) => {
        const units = /[WMwm@%]/u.test(char)
          ? 1.05
          : /[\s.,:;!'ıilIİ|]/u.test(char)
            ? 0.36
            : /[A-ZÇĞÖŞÜ]/u.test(char)
              ? 0.85
              : /[a-zçğıöşü0-9\-()/]/u.test(char)
                ? 0.68
                : 1.1;
        return sum + units * size;
      }, 0);
    const result: string[] = [];
    let current = '';
    for (const word of text.trim().split(/\s+/u).filter(Boolean)) {
      if (current && advance(`${current} ${word}`) > maxWidth) {
        result.push(current);
        current = '';
      }
      for (const char of `${current ? ' ' : ''}${word}`) {
        if (advance(current + char) > maxWidth && current) {
          result.push(current);
          current = '';
        }
        current += char;
      }
    }
    if (current) result.push(current);
    return result;
  }
  function textBlock(
    text: string,
    size: number,
    color: string,
    maxWidth = width - 28,
  ) {
    for (const row of wrapped(text, size, maxWidth)) {
      texts.push({
        text: row,
        x: PAGE.w / 2,
        y: cursor + size,
        size,
        color,
        align: 'center',
      });
      cursor += size * 1.28;
    }
  }
  function rule(y: number, thickness = 0.6, color = lineColor) {
    lines.push({
      x1: margin,
      y1: y,
      x2: PAGE.w - margin,
      y2: y,
      width: thickness,
      color,
    });
  }
  // All identity text shares the page's center line. Only the short metadata
  // row reserves symmetric space for the question count in the right corner.
  let cursor = margin + 8;
  const metadataTop = cursor;
  if (settings.school.trim()) {
    textBlock(
      settings.school.toLocaleUpperCase('tr-TR'),
      8,
      muted,
      width - 144,
    );
  } else {
    cursor += 8 * 1.28;
  }
  if (showQuestionCount) {
    const count = `${questionCount} SORU`;
    const countSize = Math.min(7, 44 / (count.length * 0.7));
    if (!monochrome)
      boxes.push({
        x: PAGE.w - margin - 62,
        y: metadataTop - 1,
        w: 54,
        h: 14,
        color: '#edf2fa',
      });
    texts.push({
      text: count,
      x: PAGE.w - margin - 35,
      y: metadataTop + 8,
      size: countSize,
      color: muted,
      align: 'center',
    });
  }
  cursor += 5;
  if (style === 'band') {
    const bandTop = cursor;
    cursor += 5;
    textBlock(settings.title || 'Test', 13.5, '#ffffff');
    cursor += 5;
    boxes.push({
      x: margin,
      y: bandTop,
      w: width,
      h: cursor - bandTop,
      color: accent,
    });
  } else {
    textBlock(settings.title || 'Test', 13.5, ink);
  }
  if (settings.subtitle.trim()) {
    cursor += 3;
    textBlock(settings.subtitle, 8, muted);
  }
  cursor += 8;
  if (style === 'institutional')
    rule(margin, 1.8, settings.lineColor || accent);
  else if (style !== 'minimal') rule(margin);
  if (settings.student) {
    const studentTop = cursor;
    const studentHeight = 24;
    boxes.push({
      x: margin,
      y: studentTop,
      w: width,
      h: studentHeight,
      color: monochrome ? '#ffffff' : '#f5f7fb',
    });
    rule(studentTop);
    const fields = [
      { label: 'ADI SOYADI', start: 0, end: 0.5, labelWidth: 48 },
      { label: 'SINIF / NO', start: 0.5, end: 0.75, labelWidth: 46 },
      { label: 'TARİH', start: 0.75, end: 1, labelWidth: 30 },
    ];
    for (const field of fields) {
      const x = margin + width * field.start;
      texts.push({
        text: field.label,
        x: x + 8,
        y: studentTop + 15,
        size: 7,
        color: muted,
      });
      lines.push({
        x1: x + 8 + field.labelWidth,
        y1: studentTop + 17,
        x2: margin + width * field.end - 10,
        y2: studentTop + 17,
        width: 0.45,
        color: lineColor,
      });
      if (field.start && style !== 'minimal')
        lines.push({
          x1: x,
          y1: studentTop,
          x2: x,
          y2: studentTop + studentHeight,
          width: 0.45,
          color: lineColor,
        });
    }
    cursor += studentHeight;
  }
  rule(cursor, style === 'minimal' ? 0.8 : 0.6);
  if (style !== 'minimal') {
    for (const x of [margin, PAGE.w - margin]) {
      lines.push({
        x1: x,
        y1: margin,
        x2: x,
        y2: cursor,
        width: 0.6,
        color: lineColor,
      });
    }
  }
  if (style === 'framed') {
    for (const y of [margin + 3, cursor - 3]) {
      lines.push({
        x1: margin + 3,
        y1: y,
        x2: PAGE.w - margin - 3,
        y2: y,
        width: 0.35,
        color: lineColor,
      });
    }
    for (const x of [margin + 3, PAGE.w - margin - 3]) {
      lines.push({
        x1: x,
        y1: margin + 3,
        x2: x,
        y2: cursor - 3,
        width: 0.35,
        color: lineColor,
      });
    }
  }
  return { texts, lines, boxes, contentTop: cursor + 12 };
}
export type Placement = {
  q: Question;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
};
export type LayoutPage = { items: Placement[]; contentTop: number };
export function movePlacedQuestion(
  questions: Question[],
  pages: LayoutPage[],
  id: string,
  position: NonNullable<Question['position']>,
): Question[] {
  const positions = new Map(
    pages.flatMap((page, index) =>
      page.items.map(
        (item) => [item.q.id, { page: index, x: item.x, y: item.y }] as const,
      ),
    ),
  );
  return questions.map((q) =>
    q.id === id
      ? { ...q, position, wide: q.wide || !!q.ownPage, ownPage: false }
      : { ...q, position: positions.get(q.id) || q.position },
  );
}
export function printedFontSize(item: Placement) {
  return item.q.fontSize ? item.q.fontSize * item.scale : null;
}
export function placementsOverlap(a: Placement, b: Placement, gap = 0) {
  // Include the number gutter, not only the cropped image.
  return (
    a.x - 17 < b.x + b.w + gap - 0.01 &&
    a.x + a.w + gap > b.x - 17 + 0.01 &&
    a.y < b.y + b.h + gap - 0.01 &&
    a.y + a.h + gap > b.y + 0.01
  );
}
export function adjustQuestionsForHeader(
  questions: Question[],
  sources: Source[],
  previous: Settings,
  next: Settings,
): Question[] {
  const top = testHeader(next, questions.length).contentTop;
  const shift = top - testHeader(previous, questions.length).contentTop;
  if (Math.abs(shift) < 0.01 || !questions.some((q) => q.position))
    return questions;

  return fitManualQuestions(
    questions.map((q) =>
      q.position?.page === 0
        ? { ...q, position: { ...q.position, y: q.position.y + shift } }
        : q,
    ),
    sources,
    next,
  );
}
export function removeLayoutPage(
  questions: Question[],
  sources: Source[],
  settings: Settings,
  pages: LayoutPage[],
  pageIndex: number,
): Question[] {
  if (!pages[pageIndex]) return questions;
  const removedIds = new Set(pages[pageIndex].items.map((item) => item.q.id));
  const remaining = questions.filter((q) => !removedIds.has(q.id));
  const headerSpace =
    testHeader(settings, remaining.length).contentTop -
    (settings.margin * 72) / 25.4;
  const positions = new Map(
    pages.flatMap((page, index) =>
      page.items.map(
        (item) =>
          [
            item.q.id,
            {
              page: index > pageIndex ? index - 1 : index,
              x: item.x,
              y: item.y + (pageIndex === 0 && index === 1 ? headerSpace : 0),
            },
          ] as const,
      ),
    ),
  );
  return fitManualQuestions(
    remaining.map((q) => ({ ...q, position: positions.get(q.id) })),
    sources,
    settings,
  );
}
function fitManualQuestions(
  questions: Question[],
  sources: Source[],
  next: Settings,
): Question[] {
  const top = testHeader(next, questions.length).contentTop;

  // Measure with the same sizing rules as preview/export, without reserving
  // coordinates that may no longer fit the page.
  const sizes = new Map(
    layoutQuestions(
      questions.map((q) => ({ ...q, position: undefined })),
      sources,
      next,
    ).flatMap((page) => page.items.map((item) => [item.q.id, item] as const)),
  );
  const margin = (next.margin * 72) / 25.4;
  const bottom = PAGE.h - margin - 22;
  const reserved = new Map<number, Placement[]>();
  return questions.map((q) => {
    if (!q.position) return q;
    const position = q.position;
    const item = { ...sizes.get(q.id)!, x: position.x, y: position.y };
    const others = reserved.get(position.page) || [];
    if (
      item.x < margin + 17 - 0.01 ||
      item.y < (position.page === 0 ? top : margin) - 0.01 ||
      item.x + item.w > PAGE.w - margin + 0.01 ||
      item.y + item.h > bottom + 0.01 ||
      others.some(
        (other) =>
          q.ownPage || other.q.ownPage || placementsOverlap(item, other),
      )
    ) {
      // Reflow only questions that no longer fit; retain all other anchors.
      return { ...q, position: undefined };
    }
    reserved.set(position.page, [...others, item]);
    return q;
  });
}
export function columnDividerSegments(page: LayoutPage, settings: Settings) {
  if (
    !settings.columnDivider ||
    settings.columns !== 2 ||
    !page.items.some((i) => !i.q.wide)
  )
    return [];
  const bottom = PAGE.h - (settings.margin * 72) / 25.4 - 22;
  let top = page.contentTop;
  const segments: { top: number; bottom: number }[] = [];
  for (const item of page.items
    .filter(
      (i) =>
        i.q.wide ||
        i.q.ownPage ||
        (i.x - 17 < PAGE.w / 2 && i.x + i.w > PAGE.w / 2),
    )
    .sort((a, b) => a.y - b.y)) {
    const end = Math.min(bottom, item.y - 6);
    if (end > top) segments.push({ top, bottom: end });
    top = Math.max(top, item.y + item.h + 6);
  }
  if (bottom > top) segments.push({ top, bottom });
  return segments;
}
export function layoutQuestions(
  questions: Question[],
  sources: Source[],
  settings: Settings,
): LayoutPage[] {
  const margin = (settings.margin * 72) / 25.4;
  const gutter = settings.columns === 2 ? 24 : 0;
  const colWidth = (PAGE.w - margin * 2 - gutter) / settings.columns;
  const numberGutter = 17;
  const contentWidth = colWidth - numberGutter;
  const firstTop = testHeader(settings, questions.length).contentTop;
  const bottom = PAGE.h - margin - 22;
  const baseGap = (settings.gap * 72) / 25.4;
  const nominalScale = (q: Question) => {
    const src = sources.find((s) => s.id === q.sourceId);
    if (!src) throw new Error('Kaynak bulunamadı.');
    const reference =
      src.kind === 'pdf'
        ? q.pageWidth * (src.columns === 2 ? 0.42 : 0.85)
        : q.pageWidth * (src.columns === 2 ? 0.48 : 1);
    return (
      ((settings.normalization === 'font' && q.fontSize
        ? 9.5 / q.fontSize
        : contentWidth / reference) *
        src.scale) /
      100
    );
  };
  if (!questions.length) return [];
  const pages: LayoutPage[] = [];
  const exclusive = new Set<number>();
  const pageAt = (n: number) => {
    while (pages.length <= n)
      pages.push({ items: [], contentTop: pages.length ? margin : firstTop });
    return pages[n];
  };
  const dimensions = (q: Question, index: number) => {
    const maxWidth =
      q.wide || q.ownPage ? PAGE.w - margin * 2 - numberGutter : contentWidth;
    // Keep dimensions independent of the drop destination. A moved question
    // must not grow, shrink or change the other questions while being placed.
    const top = index === 0 && !q.breakBefore ? firstTop : margin;
    const baseline = nominalScale(q);
    // Cap only this question. A large crop never changes another question's size.
    const scale = Math.min(
      (((baseline * settings.scale) / 100) * (q.scale ?? 100)) / 100,
      maxWidth / q.rect.w,
      (bottom - top) / q.rect.h,
    );
    if (!Number.isFinite(scale) || scale <= 0)
      throw new Error(
        `${index + 1}. sorunun boyutu geçersiz. Kırpmayı düzenleyin.`,
      );
    return { q, index, w: q.rect.w * scale, h: q.rect.h * scale, scale };
  };
  // Reserve manual positions before flowing automatic questions around them.
  questions.forEach((q, index) => {
    if (!q.position) return;
    const { page, x, y } = q.position;
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      page > 999 ||
      !Number.isFinite(x + y)
    )
      throw new Error(`${index + 1}. sorunun sayfa konumu geçersiz.`);
    const target = pageAt(page);
    const item = { ...dimensions(q, index), x, y };
    if (
      x < margin + numberGutter - 0.01 ||
      y < target.contentTop - 0.01 ||
      x + item.w > PAGE.w - margin + 0.01 ||
      y + item.h > bottom + 0.01
    )
      throw new Error(
        `${index + 1}. soru sayfanın yazdırılabilir alanının dışında. Konumunu değiştirin veya otomatik yerleşime alın.`,
      );
    const collision = target.items.find((other) =>
      placementsOverlap(item, other),
    );
    if (collision || exclusive.has(page) || (q.ownPage && target.items.length))
      throw new Error(
        `${index + 1}. soru${collision ? ` ile ${collision.index + 1}. soru` : ''} aynı alanı kullanıyor. Boş bir alana taşıyın.`,
      );
    target.items.push(item);
    if (q.ownPage) exclusive.add(page);
  });
  let pageIndex = 0,
    col = 0,
    cursor = firstTop,
    count = 0;
  const maxPerCol = settings.perPage
    ? Math.ceil(settings.perPage / settings.columns)
    : Infinity;
  const nextPage = () => {
    pageIndex++;
    col = 0;
    cursor = pageAt(pageIndex).contentTop;
    count = 0;
  };
  const nextColumn = () => {
    col++;
    count = 0;
    cursor = pageAt(pageIndex).contentTop;
    if (col >= settings.columns) nextPage();
  };
  questions.forEach((q, index) => {
    if (q.position) return;
    if (q.breakBefore === 'page' && pageAt(pageIndex).items.length) nextPage();
    else if (q.breakBefore === 'column' && pageAt(pageIndex).items.length)
      nextColumn();
    if (q.ownPage) {
      while (pageAt(pageIndex).items.length || exclusive.has(pageIndex))
        nextPage();
    }
    const size = dimensions(q, index);
    for (;;) {
      if (exclusive.has(pageIndex)) {
        nextPage();
        continue;
      }
      const current = pageAt(pageIndex);
      const fullWidth = q.wide || q.ownPage;
      if (!fullWidth && count >= maxPerCol) {
        nextColumn();
        continue;
      }
      const x =
        margin + (fullWidth ? 0 : col * (colWidth + gutter)) + numberGutter;
      let y = fullWidth
        ? Math.max(
            current.contentTop,
            ...current.items.map((it) => it.y + it.h + baseGap),
          )
        : Math.max(cursor, current.contentTop);
      let item = { ...size, x, y };
      for (;;) {
        const collision = current.items.find((other) =>
          placementsOverlap(item, other, baseGap),
        );
        if (!collision) break;
        y = collision.y + collision.h + baseGap;
        item = { ...item, y };
      }
      if (item.y + item.h > bottom + 0.01) {
        if (fullWidth) nextPage();
        else nextColumn();
        continue;
      }
      current.items.push(item);
      cursor = item.y + item.h + baseGap;
      count++;
      if (fullWidth) {
        col = 0;
        count = 0;
      }
      if (q.ownPage) {
        exclusive.add(pageIndex);
        nextPage();
      }
      break;
    }
  });
  while (pages.length && !pages[pages.length - 1].items.length) pages.pop();
  if (settings.balance) {
    for (const page of pages) {
      // Manual placements stay exactly where the user put them.
      if (page.items.some((it) => it.q.position)) continue;
      const bands = page.items
        .filter((it) => it.q.wide || it.q.ownPage)
        .sort((a, b) => a.y - b.y);
      for (let c = 0; c < settings.columns; c++) {
        const x = margin + c * (colWidth + gutter) + numberGutter;
        for (let band = 0; band <= bands.length; band++) {
          const top = band
            ? bands[band - 1].y + bands[band - 1].h
            : page.contentTop;
          const end = band < bands.length ? bands[band].y - baseGap : bottom;
          const items = page.items
            .filter(
              (it) =>
                !it.q.wide &&
                !it.q.ownPage &&
                Math.abs(it.x - x) < 1 &&
                it.y >= top - 0.01 &&
                it.y < end,
            )
            .sort((a, b) => a.y - b.y);
          if (items.length < 2) continue;
          const last = items[items.length - 1];
          const extra = Math.min(
            60,
            Math.max(0, (end - last.y - last.h) / (items.length - 1)),
          );
          items.forEach((it, j) => {
            it.y += j * extra;
          });
        }
      }
    }
  }
  pages.forEach((p) => p.items.sort((a, b) => a.index - b.index));
  return pages;
}
let pdfjsPromise:
  | Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>
  | undefined;
export function getPdfjs() {
  return (pdfjsPromise ??= (async () => {
    const p = await import('pdfjs-dist/legacy/build/pdf.mjs');
    p.GlobalWorkerOptions.workerSrc = publicAsset('pdfjs/pdf.worker.min.mjs');
    return p;
  })());
}
export async function loadSource(file: File): Promise<Source> {
  if (file.size > 100 * 1024 * 1024)
    throw new Error(`${file.name}: dosya 100 MB sınırını aşıyor.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const p = await getPdfjs();
    let pdf;
    try {
      pdf = await p.getDocument({
        data: bytes.slice(),
        cMapUrl: publicAsset('pdfjs/cmaps/'),
        cMapPacked: true,
        standardFontDataUrl: publicAsset('pdfjs/standard_fonts/'),
        wasmUrl: publicAsset('pdfjs/wasm/'),
      }).promise;
    } catch (e: unknown) {
      throw new Error(
        e instanceof Error && e.name === 'PasswordException'
          ? 'Bu PDF şifreli. Şifresiz bir kopyasını seçin.'
          : `${file.name} açılamadı. Dosyanın geçerli bir PDF olduğunu kontrol edin.`,
      );
    }
    return {
      id: crypto.randomUUID(),
      name: file.name,
      kind: 'pdf',
      bytes,
      pages: pdf.numPages,
      pdf,
      columns: 2,
      scale: 100,
    };
  }
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
    !/\.(png|jpe?g|webp)$/i.test(file.name)
  )
    throw new Error('PDF, PNG, JPG veya WebP dosyası seçin.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      id: crypto.randomUUID(),
      name: file.name,
      kind: 'image',
      bytes,
      pages: 1,
      image,
      columns: 1,
      scale: 100,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function renderSource(
  source: Source,
  pageNumber: number,
  scale = 1.6,
  rotation = 0,
) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  if (source.kind === 'pdf') {
    const page = await source.pdf!.getPage(pageNumber);
    const totalRotation = (page.rotate + rotation + 360) % 360;
    const viewport = page.getViewport({ scale: 1, rotation: totalRotation });
    const actual = Math.min(
      scale,
      Math.sqrt(14000000 / (viewport.width * viewport.height)),
    );
    const renderViewport = page.getViewport({
      scale: actual,
      rotation: totalRotation,
    });
    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    await page.render({
      canvasContext: ctx,
      canvas,
      viewport: renderViewport,
      background: 'white',
    }).promise;
    return {
      canvas,
      width: viewport.width,
      height: viewport.height,
      viewport,
      page,
      rotation: totalRotation,
    };
  }
  const image = source.image!;
  const rotated = imageRotation(
    image.naturalWidth,
    image.naturalHeight,
    rotation,
  );
  const actual = Math.min(1, 1800 / Math.max(rotated.width, rotated.height));
  canvas.width = Math.round(rotated.width * actual);
  canvas.height = Math.round(rotated.height * actual);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(actual, actual);
  ctx.translate(rotated.x, rotated.y);
  ctx.rotate(rotated.radians);
  ctx.drawImage(image, 0, 0);
  return {
    canvas,
    width: rotated.width,
    height: rotated.height,
    viewport: null,
    page: null,
    rotation: rotated.angle,
  };
}
export type RenderedSource = Awaited<ReturnType<typeof renderSource>>;
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'İşlem tamamlanamadı.';
}
export function trimRect(
  canvas: HTMLCanvasElement,
  rect: Rect,
  width: number,
  height: number,
): Rect {
  const sx = canvas.width / width,
    sy = canvas.height / height;
  const x = Math.max(0, Math.floor(rect.x * sx)),
    y = Math.max(0, Math.floor(rect.y * sy)),
    w = Math.min(canvas.width - x, Math.ceil(rect.w * sx)),
    h = Math.min(canvas.height - y, Math.ceil(rect.h * sy));
  if (w < 3 || h < 3) return rect;
  const d = canvas.getContext('2d')!.getImageData(x, y, w, h).data;
  let l = w,
    t = h,
    r = -1,
    b = -1;
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4;
      if (d[i + 3] > 40 && Math.min(d[i], d[i + 1], d[i + 2]) < 225) {
        l = Math.min(l, xx);
        r = Math.max(r, xx);
        t = Math.min(t, yy);
        b = Math.max(b, yy);
      }
    }
  if (r < l) return rect;
  const pad = 3;
  return {
    x: Math.max(rect.x, (x + l - pad) / sx),
    y: Math.max(rect.y, (y + t - pad) / sy),
    w:
      Math.min(rect.x + rect.w, (x + r + pad + 1) / sx) -
      Math.max(rect.x, (x + l - pad) / sx),
    h:
      Math.min(rect.y + rect.h, (y + b + pad + 1) / sy) -
      Math.max(rect.y, (y + t - pad) / sy),
  };
}
type PageText = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;
const pageTextCache = new WeakMap<PDFPageProxy, Promise<PageText>>();
/** Safari may not expose ReadableStream async iteration. Consume through its reader. */
export function readPageText(page: PDFPageProxy): Promise<PageText> {
  const cached = pageTextCache.get(page);
  if (cached) return cached;
  const pending = (async () => {
    const reader = page.streamTextContent().getReader();
    const text: PageText = { items: [], styles: {}, lang: null };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = value as PageText;
        text.lang ??= chunk.lang;
        Object.assign(text.styles, chunk.styles);
        text.items.push(...chunk.items);
      }
      return text;
    } finally {
      reader.releaseLock();
    }
  })();
  pageTextCache.set(page, pending);
  void pending.catch(() => pageTextCache.delete(page));
  return pending;
}
export async function makeQuestion(
  source: Source,
  page: number,
  rect: Rect,
  render: RenderedSource,
  trim: boolean,
): Promise<Question> {
  const referenceWidth =
    source.kind === 'pdf'
      ? render.width * (source.columns === 2 ? 0.42 : 0.85)
      : render.width;
  if (trim) rect = trimRect(render.canvas, rect, render.width, render.height);
  const thumb = document.createElement('canvas');
  const s = Math.min(1, 420 / rect.w);
  thumb.width = Math.max(1, Math.round(rect.w * s));
  thumb.height = Math.max(1, Math.round(rect.h * s));
  thumb
    .getContext('2d')!
    .drawImage(
      render.canvas,
      (rect.x / render.width) * render.canvas.width,
      (rect.y / render.height) * render.canvas.height,
      (rect.w / render.width) * render.canvas.width,
      (rect.h / render.height) * render.canvas.height,
      0,
      0,
      thumb.width,
      thumb.height,
    );
  let pdfRect, fontSize;
  if (render.viewport) {
    const a = render.viewport.convertToPdfPoint(rect.x, rect.y),
      b = render.viewport.convertToPdfPoint(rect.x + rect.w, rect.y + rect.h);
    pdfRect = {
      left: Math.min(a[0], b[0]),
      right: Math.max(a[0], b[0]),
      bottom: Math.min(a[1], b[1]),
      top: Math.max(a[1], b[1]),
    };
    // Font measurement is optional: a missing text layer must not prevent a valid crop.
    const text = await readPageText(render.page).catch(() => ({ items: [] }));
    const sizes: Record<string, number> = {};
    for (const it of text.items) {
      if (!('str' in it)) continue;
      if (!it.str?.trim() || it.str.length < 3) continue;
      const pt = render.viewport.convertToViewportPoint(
        it.transform[4],
        it.transform[5],
      );
      if (
        pt[0] >= rect.x - 2 &&
        pt[0] < rect.x + rect.w + 2 &&
        pt[1] >= rect.y &&
        pt[1] < rect.y + rect.h + 20
      ) {
        const size =
          Math.round(Math.hypot(it.transform[2], it.transform[3]) * 2) / 2;
        if (size >= 5 && size <= 20)
          sizes[size] = (sizes[size] || 0) + it.str.length;
      }
    }
    const size = Object.entries(sizes).sort((a, b) => b[1] - a[1])[0];
    fontSize = size ? Number(size[0]) : undefined;
  }
  return {
    id: crypto.randomUUID(),
    sourceId: source.id,
    page,
    rect,
    pdfRect,
    rotation: render.rotation,
    pageWidth: render.width,
    referenceWidth,
    fontSize,
    thumb: thumb.toDataURL('image/png'),
    answer: '',
    wide: false,
  };
}
/** Locate a prefix inside a text run using rendered glyphs, never a character/width ratio. */
async function inlineNumberEnd(
  render: RenderedSource,
  x: number,
  baseline: number,
  size: number,
  width: number,
  digits: string,
  punctuation: string,
): Promise<number | null> {
  // Render only this short line at a stable resolution so punctuation does not
  // merge into a digit when the source preview is zoomed out.
  const sx = 4,
    sy = 4;
  const left = Math.max(0, Math.floor(x * sx));
  const top = Math.max(0, Math.floor((baseline - size * 1.1) * sy));
  const w = Math.min(
    Math.ceil(render.width * sx) - left,
    Math.ceil(Math.min(width, size * (digits.length + 2)) * sx),
  );
  const h = Math.min(
    Math.ceil(render.height * sy) - top,
    Math.ceil(size * 1.35 * sy),
  );
  if (w < 1 || h < 1) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d')!;
  await render.page!.render({
    canvas,
    canvasContext: context,
    viewport: render.page!.getViewport({
      scale: sx,
      rotation: render.rotation,
    }),
    transform: [1, 0, 0, 1, -left, -top],
    background: 'white',
  }).promise;
  const data = context.getImageData(0, 0, w, h).data;
  const runs: { left: number; right: number; top: number; bottom: number }[] =
    [];
  let run: (typeof runs)[number] | undefined;
  for (let xx = 0; xx < w; xx++) {
    let minY = h,
      maxY = -1;
    for (let yy = 0; yy < h; yy++) {
      const i = (yy * w + xx) * 4;
      if (
        data[i + 3] > 40 &&
        Math.min(data[i], data[i + 1], data[i + 2]) < 225
      ) {
        minY = Math.min(minY, yy);
        maxY = yy;
      }
    }
    if (maxY < 0) {
      run = undefined;
    } else if (run) {
      run.right = xx + 1;
      run.top = Math.min(run.top, minY);
      run.bottom = Math.max(run.bottom, maxY + 1);
    } else {
      run = { left: xx, right: xx + 1, top: minY, bottom: maxY + 1 };
      runs.push(run);
    }
  }
  const mark = runs[digits.length],
    body = runs[digits.length + 1];
  if (!mark || !body || body.left <= mark.right) return null;
  if (
    runs
      .slice(0, digits.length)
      .some(
        (r) =>
          r.bottom - r.top < size * sy * 0.45 || r.right - r.left > size * sx,
      )
  )
    return null;
  if (punctuation === '.') {
    if (
      mark.bottom - mark.top > size * sy * 0.4 ||
      (top + mark.top) / sy < baseline - size * 0.35
    )
      return null;
  } else if (mark.bottom - mark.top < size * sy * 0.5) return null;
  if (mark.right - mark.left > size * sx * 0.55) return null;
  return (left + (mark.right + body.left) / 2) / sx;
}

/** A rectangular crop must not discard text, choices or diagrams below the label. */
function hasContentBelowNumber(
  render: RenderedSource,
  left: number,
  right: number,
  top: number,
  bottom: number,
) {
  const sx = render.canvas.width / render.width;
  const sy = render.canvas.height / render.height;
  const x = Math.max(0, Math.floor(left * sx));
  const y = Math.max(0, Math.floor(top * sy));
  const w = Math.min(render.canvas.width - x, Math.ceil(right * sx) - x);
  const h = Math.min(render.canvas.height - y, Math.ceil(bottom * sy) - y);
  if (w <= 0 || h <= 0) return false;
  const data = render.canvas.getContext('2d')!.getImageData(x, y, w, h).data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 40 && Math.min(data[i], data[i + 1], data[i + 2]) < 225)
      return true;
  }
  return false;
}

export async function detectQuestions(
  render: RenderedSource,
  columns: number,
): Promise<Rect[]> {
  // Candidate boxes use numbered text anchors. Scans remain manually selectable.
  if (!render.page) return [];
  const tc = await readPageText(render.page);
  const anchors: {
    x: number;
    y: number;
    baseline: number;
    size: number;
    left: number | null;
  }[] = [];
  for (const item of tc.items) {
    if (!('str' in item)) continue;
    const m = item.str?.match(/^\s*(\d{1,3})\s*([.)])(?!\d)\s*/);
    if (!m) continue;
    const p = render.viewport.convertToViewportPoint(
      item.transform[4],
      item.transform[5],
    );
    const direction = render.viewport.convertToViewportPoint(
      item.transform[4] + item.transform[0],
      item.transform[5] + item.transform[1],
    );
    // Sideways text has no safe left-to-right number gutter; it remains manually selectable.
    if (direction[0] <= p[0] || Math.abs(direction[1] - p[1]) > 0.1) continue;
    if (p[1] < render.height * 0.065 || p[1] > render.height * 0.93) continue;
    const col = columns === 2 && p[0] > render.width * 0.48 ? 1 : 0;
    const local = p[0] - (col * render.width) / 2;
    if (local < render.width * 0.15) {
      const size = Math.hypot(item.transform[2], item.transform[3]);
      let left = item.str.slice(m[0].length).trim()
        ? await inlineNumberEnd(
            render,
            p[0],
            p[1],
            size,
            item.width,
            m[1],
            m[2],
          )
        : p[0] + item.width;
      // A text run's advance can include large trailing spaces. Never let it cover
      // a separately positioned word on the first line.
      if (
        left !== null &&
        tc.items.some((other) => {
          if (other === item || !('str' in other) || !other.str.trim())
            return false;
          const at = render.viewport.convertToViewportPoint(
            other.transform[4],
            other.transform[5],
          );
          return (
            Math.abs(at[1] - p[1]) < size * 0.5 &&
            at[0] >= p[0] - 2 &&
            at[0] < left! &&
            at[0] + other.width > p[0]
          );
        })
      )
        left = null;
      anchors.push({
        x: p[0],
        y: p[1] - size,
        baseline: p[1],
        size,
        left,
      });
    }
  }
  const result: Rect[] = [];
  for (let c = 0; c < columns; c++) {
    const items = anchors
      .filter((a) => columns === 1 || (a.x > render.width * 0.48 ? 1 : 0) === c)
      .sort((a, b) => a.y - b.y);
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (i && a.y - items[i - 1].y < 20) continue;
      const right = ((c + 1) * render.width) / columns - render.width * 0.008;
      const end = items[i + 1]?.y ?? render.height * 0.96;
      const left = a.left;
      if (
        left === null ||
        left >= right ||
        hasContentBelowNumber(
          render,
          a.x - 2,
          left,
          a.baseline + a.size * 0.3,
          end - 4,
        )
      )
        continue;
      result.push({
        x: Math.max(0, left),
        y: Math.max(0, a.y - 3),
        w: right - left,
        h: Math.max(20, end - a.y - 4),
      });
    }
  }
  return result.slice(0, 30);
}
export async function rasterCrop(
  source: Source,
  q: Question,
  targetWidth: number,
  dpi: number,
) {
  const canvas = document.createElement('canvas');
  const desired = (targetWidth / 72) * dpi;
  const scale =
    source.kind === 'image'
      ? Math.min(1, Math.sqrt(24000000 / (q.rect.w * q.rect.h)))
      : Math.min(
          desired / q.rect.w,
          Math.sqrt(24000000 / (q.rect.w * q.rect.h)),
        );
  canvas.width = Math.max(1, Math.round(q.rect.w * scale));
  canvas.height = Math.max(1, Math.round(q.rect.h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (source.kind === 'image') {
    const image = source.image!;
    const rotated = imageRotation(
      image.naturalWidth,
      image.naturalHeight,
      q.rotation,
    );
    ctx.scale(scale, scale);
    ctx.translate(-q.rect.x, -q.rect.y);
    ctx.translate(rotated.x, rotated.y);
    ctx.rotate(rotated.radians);
    ctx.drawImage(image, 0, 0);
  } else {
    const page = await source.pdf!.getPage(q.page);
    const viewport = page.getViewport({ scale, rotation: q.rotation });
    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      transform: [1, 0, 0, 1, -q.rect.x * scale, -q.rect.y * scale],
      background: 'white',
    }).promise;
  }
  return new Uint8Array(
    await (
      await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Görsel oluşturulamadı.'))),
          'image/png',
        ),
      )
    ).arrayBuffer(),
  );
}
export async function createPdf(
  questions: Question[],
  sources: Source[],
  settings: Settings,
  fontBytes: Uint8Array,
  onProgress?: (n: number) => void,
  rasterProvider = rasterCrop,
) {
  const pages = layoutQuestions(questions, sources, settings);
  if (!pages.length) throw new Error('Önce en az bir soru ekleyin.');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const loaded = new Map<string, PDFDocument>();
  let done = 0;
  const ink = rgb(0.1, 0.15, 0.18),
    muted = rgb(0.4, 0.44, 0.48);
  const hexColor = (value: string, fallback: ReturnType<typeof rgb>) =>
    /^#[\da-f]{6}$/i.test(value)
      ? rgb(
          parseInt(value.slice(1, 3), 16) / 255,
          parseInt(value.slice(3, 5), 16) / 255,
          parseInt(value.slice(5, 7), 16) / 255,
        )
      : fallback;
  const lineInk = hexColor(settings.lineColor, rgb(0.72, 0.76, 0.78));
  const numberInk = hexColor(settings.numberColor, ink);
  const numberFont =
    settings.numberStyle === 'bold'
      ? await doc.embedFont(StandardFonts.HelveticaBold)
      : settings.numberStyle === 'italic'
        ? await doc.embedFont(StandardFonts.HelveticaOblique)
        : font;
  const margin = (settings.margin * 72) / 25.4;
  function line(page: PDFPage, y: number) {
    page.drawLine({
      start: { x: margin, y: PAGE.h - y },
      end: { x: PAGE.w - margin, y: PAGE.h - y },
      thickness: 0.5,
      color: lineInk,
    });
  }
  function fitted(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    size: number,
    max: number,
    colorDots = false,
  ) {
    let f = size;
    while (font.widthOfTextAtSize(text, f) > max && f > 6) f -= 0.3;
    if (colorDots && settings.lineColor) {
      let cursor = x;
      for (const part of text.split(/(\.+)/)) {
        if (!part) continue;
        page.drawText(part, {
          x: cursor,
          y: PAGE.h - y,
          font,
          size: f,
          color: /^\.+$/.test(part) ? lineInk : ink,
        });
        cursor += font.widthOfTextAtSize(part, f);
      }
      return;
    }
    page.drawText(text, {
      x,
      y: PAGE.h - y,
      font,
      size: f,
      color: ink,
      maxWidth: max,
    });
  }
  for (let pi = 0; pi < pages.length; pi++) {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    if (pi === 0) {
      const header = testHeader(settings, questions.length, false);
      for (const box of header.boxes) {
        page.drawRectangle({
          x: box.x,
          y: PAGE.h - box.y - box.h,
          width: box.w,
          height: box.h,
          color: hexColor(box.color, ink),
        });
      }
      for (const rule of header.lines) {
        page.drawLine({
          start: { x: rule.x1, y: PAGE.h - rule.y1 },
          end: { x: rule.x2, y: PAGE.h - rule.y2 },
          thickness: rule.width,
          color: hexColor(rule.color, lineInk),
        });
      }
      for (const text of header.texts) {
        page.drawText(text.text, {
          x:
            text.x -
            (text.align === 'center'
              ? font.widthOfTextAtSize(text.text, text.size) / 2
              : 0),
          y: PAGE.h - text.y,
          font,
          size: text.size,
          color: hexColor(text.color, ink),
        });
      }
    }
    for (const segment of columnDividerSegments(pages[pi], settings)) {
      page.drawLine({
        start: { x: PAGE.w / 2, y: PAGE.h - segment.top },
        end: { x: PAGE.w / 2, y: PAGE.h - segment.bottom },
        thickness: 0.5,
        color: lineInk,
      });
    }
    for (const item of pages[pi].items) {
      const q = item.q,
        source = sources.find((s) => s.id === q.sourceId)!;
      const y = PAGE.h - item.y - item.h;
      if (settings.quality === 'vector' && source.kind === 'pdf' && q.pdfRect) {
        try {
          let original = loaded.get(source.id);
          if (!original) {
            original = await PDFDocument.load(source.bytes, {
              updateMetadata: false,
            });
            loaded.set(source.id, original);
          }
          const embedded = await doc.embedPage(
            original.getPage(q.page - 1),
            q.pdfRect,
          );
          let x = item.x,
            dy = y,
            angle = 0;
          if (q.rotation === 90) {
            dy += item.h;
            angle = -90;
          }
          if (q.rotation === 180) {
            x += item.w;
            dy += item.h;
            angle = 180;
          }
          if (q.rotation === 270) {
            x += item.w;
            angle = 90;
          }
          page.drawPage(embedded, {
            x,
            y: dy,
            xScale: item.scale,
            yScale: item.scale,
            rotate: degrees(angle),
          });
        } catch {
          throw new Error(
            `${item.index + 1}. soru özgün PDF olarak aktarılamadı. Çıktı kalitesinden 300 veya 600 DPI seçerek yeniden deneyin.`,
          );
        }
      } else {
        const bytes = await rasterProvider(
          source,
          q,
          item.w,
          settings.quality === '600' ? 600 : 300,
        );
        const img = await doc.embedPng(bytes);
        page.drawImage(img, { x: item.x, y, width: item.w, height: item.h });
      }

      {
        const framed =
          settings.numberStyle === 'circle' ||
          settings.numberStyle === 'square';
        const label = `${item.index + 1}${framed ? '' : '.'}`;
        const x = item.x - 17;
        const top = PAGE.h - item.y;
        if (settings.numberStyle === 'circle')
          page.drawCircle({
            x: x + 7,
            y: top - 7,
            size: 7,
            borderWidth: 0.5,
            borderColor: lineInk,
          });
        if (settings.numberStyle === 'square')
          page.drawRectangle({
            x,
            y: top - 14,
            width: 14,
            height: 14,
            borderWidth: 0.5,
            borderColor: lineInk,
          });
        const size =
          settings.numberStyle === 'plain'
            ? 9
            : Math.min(
                9,
                (framed ? 10 : 14) / numberFont.widthOfTextAtSize(label, 1),
              );
        page.drawText(label, {
          x: framed
            ? x + (14 - numberFont.widthOfTextAtSize(label, size)) / 2
            : x,
          y: framed ? top - 7 - size * 0.35 : top - 9,
          font: numberFont,
          size,
          color: numberInk,
        });
      }
      onProgress?.(++done / questions.length);
    }
    line(page, PAGE.h - 30);
    const pageLabel = `${pi + 1} / ${pages.length}`;
    page.drawText(pageLabel, {
      x: PAGE.w - margin - font.widthOfTextAtSize(pageLabel, 8),
      y: 17,
      font,
      size: 8,
      color: muted,
    });
  }
  if (settings.answerKey) {
    const rowsPerPage = 35;
    for (let start = 0; start < questions.length; start += rowsPerPage * 4) {
      const p = doc.addPage([PAGE.w, PAGE.h]);
      fitted(p, 'Cevap anahtarı', margin, 50, 18, PAGE.w - 2 * margin);
      line(p, 65);
      questions.slice(start, start + rowsPerPage * 4).forEach((q, j) => {
        fitted(
          p,
          `${start + j + 1}.   ${q.answer || '—'}`,
          margin + Math.floor(j / rowsPerPage) * 126,
          90 + (j % rowsPerPage) * 19,
          10,
          120,
        );
      });
    }
  }
  doc.setTitle(settings.title);
  doc.setCreator('Test Atölyesi');
  doc.setProducer('Test Atölyesi · Özgün PDF / kayıpsız görsel');
  return { bytes: await doc.save(), pages: doc.getPageCount() };
}
export function download(
  bytes: Uint8Array,
  name: string,
  type = 'application/pdf',
) {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

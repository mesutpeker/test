import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import {
  PDFDocument,
  rgb,
  degrees,
  StandardFonts,
  type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
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
};
export type Settings = {
  title: string;
  subtitle: string;
  school: string;
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
};
export const defaults: Settings = {
  title: 'Konu değerlendirme testi',
  subtitle: '',
  school: '',
  columns: 2,
  margin: 14,
  gap: 8,
  scale: 100,
  perPage: 6,
  balance: true,
  numberColor: '',
  numberStyle: 'plain',
  columnDivider: false,
  lineColor: '',
  student: true,
  answerKey: false,
  quality: 'vector',
  normalization: 'font',
};
export const PAGE = { w: 595.2756, h: 841.8898 };
export type Placement = {
  q: Question;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
};
export type LayoutPage = { items: Placement[] };
export function columnDividerSegments(page: LayoutPage, settings: Settings) {
  if (
    !settings.columnDivider ||
    settings.columns !== 2 ||
    !page.items.some((i) => !i.q.wide)
  )
    return [];
  const bottom = PAGE.h - (settings.margin * 72) / 25.4 - 22;
  let top = settings.student ? 116 : 89;
  const segments: { top: number; bottom: number }[] = [];
  for (const item of page.items
    .filter((i) => i.q.wide)
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
  const top = settings.student ? 116 : 89;
  const bottom = PAGE.h - margin - 22;
  const available = bottom - top;
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
  const fitFactor = Math.min(
    1,
    ...questions.map(
      (q) =>
        (q.wide ? PAGE.w - margin * 2 - numberGutter : contentWidth) /
        (q.rect.w * nominalScale(q)),
    ),
  );
  const pages: LayoutPage[] = [];
  let current: LayoutPage = { items: [] };
  let col = 0;
  let cursor = top;
  let count = 0;
  let bandTop = top;
  const maxPerCol = settings.perPage
    ? Math.ceil(settings.perPage / settings.columns)
    : Infinity;
  const flush = () => {
    if (current.items.length) pages.push(current);
    current = { items: [] };
    col = 0;
    cursor = top;
    count = 0;
    bandTop = top;
  };
  questions.forEach((q, index) => {
    const source = sources.find((s) => s.id === q.sourceId);
    if (!source) throw new Error('Bir sorunun kaynak dosyası bulunamadı.');
    const scale = (nominalScale(q) * fitFactor * settings.scale) / 100;
    const w = q.rect.w * scale,
      h = q.rect.h * scale;
    const maxWidth = q.wide ? PAGE.w - margin * 2 - numberGutter : contentWidth;
    if (w > maxWidth + 1)
      throw new Error(
        `${index + 1}. soru sütundan geniş. Soruyu tam genişliğe alın veya ortak soru boyutunu küçültün.`,
      );
    if (h > available + 1)
      throw new Error(
        `${index + 1}. soru bir sayfadan uzun. Ortak soru boyutunu küçültün veya seçimi daraltın.`,
      );
    if (q.wide && settings.columns === 2) {
      if (current.items.length) flush();
      current.items.push({
        q,
        index,
        x: margin + numberGutter,
        y: top,
        w,
        h,
        scale,
      });
      bandTop = top + h + baseGap;
      cursor = bandTop;
      count = 0;
      return;
    }
    if (cursor + h > bottom || count >= maxPerCol) {
      col++;
      cursor = bandTop;
      count = 0;
      if (col >= settings.columns || cursor + h > bottom) flush();
    }
    current.items.push({
      q,
      index,
      x: margin + col * (colWidth + gutter) + numberGutter,
      y: cursor,
      w,
      h,
      scale,
    });
    cursor += h + baseGap;
    count++;
  });
  flush();
  if (settings.balance) {
    for (const page of pages) {
      for (let col = 0; col < settings.columns; col++) {
        const x = margin + col * (colWidth + gutter) + numberGutter;
        const items = page.items.filter(
          (i) => !i.q.wide && Math.abs(i.x - x) < 1,
        );
        if (items.length < 2) continue;

        const last = items[items.length - 1];
        const extra = Math.min(
          60,
          Math.max(0, (bottom - last.y - last.h) / (items.length - 1)),
        );
        items.forEach((it, j) => (it.y += j * extra));
      }
    }
  }
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
  const actual = Math.min(1, 1800 / image.naturalWidth);
  canvas.width = Math.round(image.naturalWidth * actual);
  canvas.height = Math.round(image.naturalHeight * actual);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    canvas,
    width: image.naturalWidth,
    height: image.naturalHeight,
    viewport: null,
    page: null,
    rotation: 0,
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
    ctx.drawImage(
      source.image!,
      q.rect.x,
      q.rect.y,
      q.rect.w,
      q.rect.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
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
    fitted(page, settings.school, margin, 30, 9, PAGE.w - 2 * margin);
    fitted(page, settings.title || 'Test', margin, 54, 18, PAGE.w - 2 * margin);
    fitted(page, settings.subtitle, margin, 73, 9, PAGE.w - 2 * margin);
    line(page, 84);
    if (settings.student) {
      fitted(
        page,
        'Adı Soyadı: ........................................   Sınıf / No: ...................   Tarih: .................',
        margin,
        102,
        8,
        PAGE.w - 2 * margin,
        true,
      );
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
    page.drawText(`${questions.length} soru`, {
      x: margin,
      y: 17,
      font,
      size: 8,
      color: muted,
    });
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

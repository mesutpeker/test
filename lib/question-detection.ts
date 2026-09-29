/**
 * Raster page analysis for automatic question detection.
 *
 * Works on rendered pixels, so it also covers scanned PDFs, PDFs whose text
 * was converted to outlines and PNG/JPG sources. Text-layer anchors from a
 * PDF are passed in as trusted anchors and share the same region logic.
 * All coordinates here are canvas pixels.
 */
export type PixelRect = { x: number; y: number; w: number; h: number };
export type Band = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  ink: number;
};
export type LayoutColumn = { start: number; end: number; bands: Band[] };
export type PageLayout = {
  width: number;
  height: number;
  ink: Uint8Array;
  /** Median text line height. */
  lineHeight: number;
  columns: LayoutColumn[];
};
export type Anchor = {
  column: number;
  /** Band containing the number, or -1 when no rendered line matches. */
  band: number;
  /** Left and right ink edge of the number label. */
  left: number;
  right: number;
  /** Crop start between the label and the question body; null when unsafe. */
  cut: number | null;
  top: number;
  bottom: number;
  /** Text-layer numbers are known digits; raster labels are only number-shaped. */
  trusted: boolean;
};

/** Ink mask with a local paper estimate so scans, tinted paper and photos work. */
function inkMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const value = (i: number) =>
    data[i + 3] <= 40 ? 255 : Math.min(data[i], data[i + 1], data[i + 2]);
  const block = Math.max(16, Math.round(Math.max(width, height) / 48));
  const gw = Math.ceil(width / block),
    gh = Math.ceil(height / block);
  const paper = new Uint8Array(gw * gh);
  const histogram = new Uint32Array(256);
  for (let by = 0; by < gh; by++)
    for (let bx = 0; bx < gw; bx++) {
      histogram.fill(0);
      const x1 = Math.min(width, (bx + 1) * block),
        y1 = Math.min(height, (by + 1) * block);
      let n = 0;
      for (let y = by * block; y < y1; y++)
        for (let x = bx * block; x < x1; x++) {
          histogram[value((y * width + x) * 4)]++;
          n++;
        }
      // The brightest quarter of a block is paper even in dense text.
      let v = 255;
      for (let seen = histogram[255]; v > 0 && seen < n / 4;)
        seen += histogram[--v];
      paper[by * gw + bx] = v;
    }
  // Spread paper brightness so large dark figures are not treated as paper.
  const threshold = new Uint8Array(gw * gh);
  for (let by = 0; by < gh; by++)
    for (let bx = 0; bx < gw; bx++) {
      let v = 0;
      for (let y = Math.max(0, by - 2); y <= Math.min(gh - 1, by + 2); y++)
        for (let x = Math.max(0, bx - 2); x <= Math.min(gw - 1, bx + 2); x++)
          v = Math.max(v, paper[y * gw + x]);
      threshold[by * gw + bx] = Math.min(225, v - Math.max(30, v * 0.12));
    }
  const raw = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / block) * gw;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (value(i * 4) < threshold[row + Math.floor(x / block)]) raw[i] = 1;
    }
  }
  // Scanner and camera speckles have fewer than two ink neighbours; glyph
  // strokes, dots and rules always have more.
  const ink = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1, i = y * width + 1; x < width - 1; x++, i++) {
      if (!raw[i]) continue;
      const neighbours =
        raw[i - width - 1] +
        raw[i - width] +
        raw[i - width + 1] +
        raw[i - 1] +
        raw[i + 1] +
        raw[i + width - 1] +
        raw[i + width] +
        raw[i + width + 1];
      if (neighbours >= 2) ink[i] = 1;
    }
  return ink;
}

/**
 * Column rules and table borders would join every text line into one band.
 * A small window follows slightly skewed scans; whole thin runs are cleared so
 * anti-aliased rule edges do not survive.
 */
function removeVerticalRules(ink: Uint8Array, width: number, height: number) {
  const thin = Math.max(4, Math.round(width * 0.004));
  const long = Math.max(20, Math.round(height * 0.05));
  const reach = 2;
  /** The thin horizontal run through the window at row y, or null. */
  const thinRun = (x: number, y: number) => {
    const row = y * width;
    let seed = -1;
    for (
      let k = Math.max(0, x - reach);
      k <= Math.min(width - 1, x + reach);
      k++
    )
      if (ink[row + k]) {
        seed = k;
        break;
      }
    if (seed < 0) return null;
    let l = seed,
      r = seed;
    while (l > 0 && ink[row + l - 1] && r - l < thin) l--;
    while (r < width - 1 && ink[row + r + 1] && r - l < thin) r++;
    return r - l + 1 <= thin ? { l, r } : null;
  };
  const present = (x: number, y: number) => {
    const row = y * width;
    for (
      let k = Math.max(0, x - reach);
      k <= Math.min(width - 1, x + reach);
      k++
    )
      if (ink[row + k]) return true;
    return false;
  };
  for (let x = reach; x < width; x += reach) {
    let y = 0;
    while (y < height) {
      if (!present(x, y)) {
        y++;
        continue;
      }
      const start = y;
      while (y < height && present(x, y)) y++;
      if (y - start < long) continue;
      let thinRows = 0;
      for (let k = 0; k < 9; k++)
        if (thinRun(x, start + Math.floor(((y - start - 1) * k) / 8)))
          thinRows++;
      if (thinRows < 7) continue;
      for (let yy = start; yy < y; yy++) {
        const run = thinRun(x, yy);
        if (run) ink.fill(0, yy * width + run.l, yy * width + run.r + 1);
      }
    }
  }
}

function findColumns(
  ink: Uint8Array,
  width: number,
  height: number,
  hint: number,
): { start: number; end: number }[] {
  const single = [{ start: 0, end: width }];
  const y0 = Math.round(height * 0.06),
    y1 = Math.round(height * 0.94);
  const profile = new Float64Array(width);
  for (let y = y0; y < y1; y++)
    for (let x = 0, i = y * width; x < width; x++, i++) profile[x] += ink[i];
  const mass = (from: number, to: number) => {
    let sum = 0;
    for (let x = Math.max(0, from); x < Math.min(width, to); x++)
      sum += profile[x];
    return sum;
  };
  // Header rules and scan noise may cross a gutter; text columns fill it.
  const empty = Math.max(2, Math.round((y1 - y0) * 0.012));
  const thin = Math.max(4, Math.round(width * 0.004));
  const from = Math.round(width * 0.3),
    to = Math.round(width * 0.7);
  const valleys: { start: number; end: number }[] = [];
  for (let x = from; x <= to; x++) {
    if (profile[x] > empty) continue;
    const previous = valleys[valleys.length - 1];
    // Bridge what is left of a rule inside the gutter.
    if (previous && x - previous.end <= thin) previous.end = x + 1;
    else valleys.push({ start: x, end: x + 1 });
  }
  for (const valley of valleys) {
    while (valley.start > 0 && profile[valley.start - 1] <= empty)
      valley.start--;
    while (valley.end < width && profile[valley.end] <= empty) valley.end++;
  }
  /**
   * Width of the inked region left of a valley, up to the previous sustained
   * blank. Ragged line endings leave only slivers of blank inside a column.
   */
  const inkedLeft = (x: number) => {
    const need = Math.max(3, Math.round(width * 0.012));
    let edge = x,
      blank = 0;
    for (let k = x - 1; k >= 0; k--) {
      if (profile[k] > empty) {
        blank = 0;
        edge = k;
      } else if (++blank >= need) break;
    }
    return x - edge;
  };
  // The gap between hanging numbers and their text is blank as well, but only
  // a narrow strip of numbers lies left of it. A real gutter follows a column.
  let gutter = valleys
    .filter(
      (v) =>
        v.end - v.start >= Math.max(3, width * 0.006) &&
        inkedLeft(v.start) >= width * 0.08,
    )
    .sort(
      (a, b) =>
        Math.abs((a.start + a.end) / 2 - width / 2) -
        Math.abs((b.start + b.end) / 2 - width / 2),
    )[0];
  if (!gutter && hint === 2) {
    // No blank gutter: split at the least crossed position unless most text
    // lines run through it, which means a single column.
    const r = Math.max(2, Math.round(width * 0.005));
    let best = -1,
      bestValue = Infinity;
    for (let x = from; x <= to; x++) {
      const v = mass(x - r, x + r + 1);
      if (
        v < bestValue ||
        (v === bestValue &&
          Math.abs(x - width / 2) < Math.abs(best - width / 2))
      ) {
        best = x;
        bestValue = v;
      }
    }
    let inkRows = 0,
      crossing = 0;
    for (let y = y0; y < y1; y++) {
      let any = false;
      for (let x = 0, i = y * width; x < width; x++, i++)
        if (ink[i]) {
          any = true;
          if (Math.abs(x - best) <= r) {
            crossing++;
            break;
          }
        }
      if (any) inkRows++;
    }
    if (best >= 0 && crossing <= inkRows * 0.45)
      gutter = { start: best, end: best + 1 };
  }
  if (!gutter) return single;
  const balance =
    Math.min(mass(0, gutter.start), mass(gutter.end, width)) /
    Math.max(1, mass(0, gutter.start), mass(gutter.end, width));
  // A single-column hint needs a clear, balanced gutter before splitting.
  if (
    hint === 2
      ? balance < 0.05
      : balance < 0.25 || gutter.end - gutter.start < width * 0.012
  )
    return single;
  // The valley may still hold ragged line endings of the left column and
  // sparse numbers of the right one. Split between the two.
  const word = Math.max(4, Math.round(width * 0.01));
  let tail = gutter.start,
    head = gutter.end;
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    let from = gutter.start;
    let last = -1;
    for (let k = gutter.start - 1; k >= Math.max(0, gutter.start - word); k--)
      if (ink[row + k]) {
        last = k;
        break;
      }
    if (last >= 0) {
      // Follow a line that runs into the valley until a gap wider than a word space.
      for (let k = last + 1, blank = 0; k < gutter.end && blank < word; k++)
        if (ink[row + k]) {
          last = k;
          blank = 0;
        } else blank++;
      // A rule or full-width element crosses the valley; it belongs to neither side.
      if (last >= gutter.end - word) continue;
      tail = Math.max(tail, last + 1);
      from = last + word;
    }
    for (let k = from; k < Math.min(head, gutter.end); k++)
      if (ink[row + k]) {
        head = k;
        break;
      }
  }
  const middle =
    tail < head
      ? Math.round((tail + head) / 2)
      : Math.round((gutter.start + gutter.end) / 2);
  return [
    { start: 0, end: middle },
    { start: middle, end: width },
  ];
}

function findBands(
  ink: Uint8Array,
  width: number,
  height: number,
  start: number,
  end: number,
): Band[] {
  const bands: Band[] = [];
  let band: Band | undefined;
  for (let y = 0; y < height; y++) {
    let left = -1,
      right = -1,
      count = 0;
    for (let x = start, i = y * width + start; x < end; x++, i++)
      if (ink[i]) {
        if (left < 0) left = x;
        right = x + 1;
        count++;
      }
    if (!count) {
      band = undefined;
      continue;
    }
    if (band) {
      band.bottom = y + 1;
      band.left = Math.min(band.left, left);
      band.right = Math.max(band.right, right);
      band.ink += count;
    } else {
      band = { top: y, bottom: y + 1, left, right, ink: count };
      bands.push(band);
    }
  }
  return bands;
}

function medianLineHeight(bands: Band[]) {
  const heights = bands
    .map((b) => b.bottom - b.top)
    .filter((h) => h >= 3)
    .sort((a, b) => a - b);
  if (!heights.length) return 12;
  const floor = heights[Math.floor(heights.length * 0.75)] * 0.4;
  const text = heights.filter((h) => h >= floor);
  return text[Math.floor(text.length / 2)];
}

/** Diacritics, dots and underlines can be separated from their line by a pixel gap. */
function mergeFragments(bands: Band[], lineHeight: number) {
  const merged: Band[] = [];
  for (const band of bands) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      band.top - previous.bottom <= Math.max(1, Math.round(lineHeight * 0.3)) &&
      (band.bottom - band.top < lineHeight * 0.5 ||
        previous.bottom - previous.top < lineHeight * 0.5) &&
      band.bottom - previous.top <= lineHeight * 1.6
    ) {
      previous.bottom = band.bottom;
      previous.left = Math.min(previous.left, band.left);
      previous.right = Math.max(previous.right, band.right);
      previous.ink += band.ink;
    } else merged.push({ ...band });
  }
  return merged;
}

export function analyzeLayout(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  columnsHint: number,
): PageLayout {
  const ink = inkMask(data, width, height);
  removeVerticalRules(ink, width, height);
  const ranges = findColumns(ink, width, height, columnsHint);
  const raw = ranges.map((c) => findBands(ink, width, height, c.start, c.end));
  const lineHeight = medianLineHeight(raw.flat());
  return {
    width,
    height,
    ink,
    lineHeight,
    columns: ranges.map((c, i) => ({
      ...c,
      bands: mergeFragments(raw[i], lineHeight),
    })),
  };
}

function inkIn(
  layout: PageLayout,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  let count = 0;
  x0 = Math.max(0, Math.floor(x0));
  x1 = Math.min(layout.width, Math.ceil(x1));
  for (let y = Math.max(0, y0); y < Math.min(layout.height, y1); y++)
    for (let x = x0, i = y * layout.width + x0; x < x1; x++, i++)
      count += layout.ink[i];
  return count;
}

type Blob = { left: number; right: number; top: number; bottom: number };
/** The first parts of a line, split at blank gaps of at least `gap` pixels. */
function leadingBlobs(
  layout: PageLayout,
  column: LayoutColumn,
  band: Band,
  gap: number,
  limit: number,
) {
  const { ink, width, lineHeight } = layout;
  const tiny = lineHeight * 0.2;
  const blobs: Blob[] = [];
  let blob: Blob | undefined,
    blank = 0;
  const close = () => {
    if (
      blob &&
      (blob.right - blob.left >= tiny || blob.bottom - blob.top >= tiny)
    )
      blobs.push(blob);
    blob = undefined;
  };
  for (let x = band.left; x < column.end && blobs.length < limit; x++) {
    let top = -1,
      bottom = -1;
    for (let y = band.top; y < band.bottom; y++)
      if (ink[y * width + x]) {
        if (top < 0) top = y;
        bottom = y + 1;
      }
    if (top < 0) {
      if (blob && ++blank >= gap) close();
      continue;
    }
    blank = 0;
    if (blob) {
      blob.right = x + 1;
      blob.top = Math.min(blob.top, top);
      blob.bottom = Math.max(blob.bottom, bottom);
    } else blob = { left: x, right: x + 1, top, bottom };
  }
  if (blobs.length < limit) close();
  return blobs;
}

/** Number-shaped labels in front of a line, e.g. "7." or a boxed number. */
function rasterAnchors(layout: PageLayout): Anchor[] {
  const { height, lineHeight: m } = layout;
  const anchors: Anchor[] = [];
  layout.columns.forEach((column, c) => {
    const columnWidth = column.end - column.start;
    column.bands.forEach((band, b) => {
      const bandHeight = band.bottom - band.top;
      if (
        band.top < height * 0.05 ||
        band.bottom > height * 0.95 ||
        bandHeight < m * 0.4 ||
        bandHeight > m * 3
      )
        return;
      // Split at gaps wider than a normal word space.
      const [label, body] = leadingBlobs(
        layout,
        column,
        band,
        Math.max(2, Math.round(m * 0.3)),
        2,
      );
      if (!label || !body) return;
      // "A) 8   B) 10   C) 12" is a row of choices, not a question's first line.
      if (
        leadingBlobs(layout, column, band, Math.round(m * 1.2), 3).length >= 3
      )
        return;
      const h = label.bottom - label.top,
        w = label.right - label.left;
      if (
        h < m * 0.4 ||
        h > m * 2.5 ||
        w > h * 3.2 ||
        w < h * 0.12 ||
        w > columnWidth * 0.25 ||
        label.left - column.start > columnWidth * 0.35 ||
        body.left - label.right > m * 5 ||
        body.bottom - body.top < m * 0.3
      )
        return;
      anchors.push({
        column: c,
        band: b,
        left: label.left,
        right: label.right,
        cut: Math.round((label.right + body.left) / 2),
        top: band.top,
        bottom: band.bottom,
        trusted: false,
      });
    });
  });
  return anchors;
}

/** Index of the rendered line that contains a text-layer number. */
export function bandAt(
  layout: PageLayout,
  column: number,
  y0: number,
  y1: number,
) {
  const bands = layout.columns[column]?.bands || [];
  let best = -1,
    overlap = 0;
  bands.forEach((band, i) => {
    const o = Math.min(band.bottom, y1) - Math.max(band.top, y0);
    if (o > overlap) {
      best = i;
      overlap = o;
    }
  });
  return best;
}

export function columnAt(layout: PageLayout, x: number) {
  let index = 0;
  layout.columns.forEach((column, i) => {
    if (x >= column.start - layout.lineHeight) index = i;
  });
  return index;
}

/**
 * Turns number anchors into question crops. A crop starts after the number
 * and ends before the next number, a footer or a clearly separate block.
 * Anything below a number that a rectangular crop would cut stays manual.
 */
export function questionRects(
  layout: PageLayout,
  textAnchors: Anchor[],
  /** Rejects pixel labels that a text layer shows are not numbers. */
  isNumberLabel: (anchor: Anchor) => boolean = () => true,
): PixelRect[] {
  const { height, lineHeight: m } = layout;
  const tolerance = Math.max(2, m * 0.6);
  const pad = Math.max(2, Math.round(m * 0.15));
  const minInk = Math.max(2, Math.round(m * m * 0.004));
  const all = textAnchors.map((a) => ({ ...a }));
  for (const candidate of rasterAnchors(layout).filter(isNumberLabel)) {
    const same = all.find(
      (a) => a.column === candidate.column && a.band === candidate.band,
    );
    if (!same) {
      all.push(candidate);
    } else if (
      same.cut === null &&
      Math.abs(same.left - candidate.left) <= tolerance
    ) {
      // A pixel gap is exact where the text layer overstated the label width.
      same.cut = candidate.cut;
    }
  }
  const sibling = (a: Anchor, b: Anchor) =>
    a.column === b.column &&
    (Math.abs(a.left - b.left) <= tolerance ||
      Math.abs(a.right - b.right) <= tolerance);
  const isContent = (band: Band) =>
    band.top >= height * 0.06 &&
    band.bottom <= height * 0.94 &&
    band.bottom - band.top >= m * 0.4;
  // A question number sits in a gutter that ordinary lines leave empty.
  // Option letters and short words at the body edge fail this test.
  const accepted = all.filter((a) => {
    if (a.trusted || a.cut === null) return true;
    const siblings = new Set(
      all.filter((b) => sibling(a, b)).map((b) => b.band),
    );
    const pool = layout.columns[a.column].bands.filter(
      (band, i) => isContent(band) && !siblings.has(i),
    );
    const intruders = pool.filter((band) => band.left < a.cut!).length;
    return intruders <= pool.length * 0.34;
  });
  // Questions of a column share one number gutter. A label that starts at or
  // right of another number's body edge (a choice "B)", a premise "II.")
  // lies inside a question and never starts one.
  const numbers = accepted.filter(
    (a) =>
      !accepted.some(
        (b) =>
          b !== a &&
          b.column === a.column &&
          b.cut !== null &&
          b.left < a.left - tolerance &&
          a.left >= b.cut - tolerance,
      ),
  );
  const rects: PixelRect[] = [];
  layout.columns.forEach((column, c) => {
    const bands = column.bands;
    const realBetween = (from: number, to: number) =>
      bands
        .slice(from + 1, to)
        .some((band) => band.bottom - band.top >= m * 0.4);
    const sorted = numbers
      .filter((a) => a.column === c)
      .sort((a, b) => a.top - b.top);
    // Three or more closely spaced aligned labels are answer choices or a
    // list. Pixel-only labels there must not split the question they belong to.
    const choices = new Set<Anchor>();
    for (let i = 0; i < sorted.length;) {
      let j = i + 1;
      while (
        j < sorted.length &&
        sibling(sorted[i], sorted[j]) &&
        sorted[j].top - sorted[j - 1].top <= m * 4.5
      )
        j++;
      if (j - i >= 3)
        for (let k = i; k < j; k++)
          if (!sorted[k].trusted) choices.add(sorted[k]);
      i = j;
    }
    const anchors: Anchor[] = [];
    for (const a of sorted) {
      if (choices.has(a)) continue;
      const previous = anchors[anchors.length - 1];
      const linked = previous && previous.band >= 0 && a.band >= 0;
      if (linked && previous.band === a.band) continue;
      if (linked && !realBetween(previous.band, a.band)) {
        // A one-line "question" is a label inside the previous question.
        if (a.trusted && !previous.trusted) anchors.pop();
        else if (!a.trusted) continue;
      }
      anchors.push(a);
    }
    const contentBands = bands.filter(isContent);
    const right = Math.min(
      column.end,
      Math.max(...contentBands.map((b) => b.right), 0) + pad,
    );
    anchors.forEach((a, i) => {
      if (a.cut === null || a.cut >= right) return;
      const next = anchors[i + 1];
      const limit = next ? next.top : height;
      const stripLeft = a.left - Math.max(2, Math.round(m * 0.08));
      const intrudes = (band: Band) =>
        inkIn(layout, stripLeft, band.top, a.cut!, band.bottom) >= minInk;
      const isFooter = (band: Band, gap: number) =>
        band.top >= height * 0.955 ||
        (band.top >= height * 0.88 &&
          (gap >= m * 1.5 ||
            (gap >= m * 0.8 && band.bottom - band.top >= m * 1.8)));
      let bottom = Math.max(a.bottom, a.band >= 0 ? bands[a.band].bottom : 0);
      let unsafe = false;
      const first =
        a.band >= 0
          ? a.band + 1
          : bands.findIndex((band) => band.top >= a.bottom);
      for (let j = first; j >= 0 && j < bands.length; j++) {
        const band = bands[j];
        if (band.top >= limit) break;
        if (band.ink < minInk * 3 && band.bottom - band.top < m * 0.25)
          continue;
        const gap = band.top - bottom;
        if (isFooter(band, gap)) break;
        if (!intrudes(band)) {
          bottom = band.bottom;
          continue;
        }
        const separator =
          band.bottom - band.top <= Math.max(3, m * 0.3) &&
          band.right - band.left >= (column.end - column.start) * 0.6;
        if (separator) {
          // A rule ends the question unless the block below it also reaches
          // under the number, as a framed passage would.
          unsafe = bands
            .slice(j + 1)
            .some(
              (later) =>
                later.top < limit &&
                later.top < height * 0.88 &&
                intrudes(later),
            );
          break;
        }
        // Content after a wide blank is a separate block, not this question.
        if (gap >= m * 3) break;
        unsafe = true;
        break;
      }
      if (unsafe) return;
      const top = Math.max(
        0,
        Math.min(a.top, a.band >= 0 ? bands[a.band].top : a.top) - pad,
      );
      const end = Math.min(bottom + pad, limit - 1, height);
      rects.push({
        x: a.cut,
        y: top,
        w: right - a.cut,
        h: Math.max(1, end - top),
      });
    });
  });
  return rects;
}

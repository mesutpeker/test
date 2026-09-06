/* oxlint-disable react/react-compiler, next/no-img-element, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
// The crop canvas uses role=application for direct arrow-key manipulation.
// Local canvas previews use data URLs; pointer crop and drag actions have button alternatives.
'use client';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { LayoutEditor } from '@/components/layout-editor';
import {
  QuestionOptions,
  QuestionQuality,
} from '@/components/question-options';
import { transformCrop, type CropHandle } from '@/lib/editor-geometry';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FilePlus2,
  House,
  ScanLine,
  ArrowRight,
  FileText,
  ShieldCheck,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Scissors,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  LoaderCircle,
  LayoutTemplate,
  Image as ImageIcon,
  Expand,
  MousePointer2,
  Undo2,
  Eye,
  X,
  Palette,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  defaults,
  PAGE,
  loadSource,
  renderSource,
  makeQuestion,
  detectQuestions,
  layoutQuestions,
  printedFontSize,
  movePlacedQuestion,
  adjustQuestionsForHeader,
  removeEmptyLayoutPage,
  testHeader,
  headerStyles,
  createPdf,
  download,
  getPdfjs,
  publicAsset,
  type RenderedSource,
  errorMessage,
  type Source,
  type Question,
  type Settings,
  type Rect,
} from '@/lib/pdf-engine';
function Choice({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (s: string) => void;
  options: [string, string][];
  label: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v && onChange(v)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue>
          {options.find((o) => o[0] === value)?.[1] || value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, t]) => (
          <SelectItem key={v} value={v}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="field output-color-field">
      <label htmlFor={id}>{label}</label>
      <div className="color-control">
        <input
          id={id}
          type="color"
          aria-label={label}
          value={value || fallback}
          onChange={(e) => onChange(e.target.value)}
        />
        <span aria-hidden="true">{value || 'Varsayılan'}</span>
        <button
          type="button"
          className="color-reset"
          disabled={!value}
          onClick={() => onChange('')}
          aria-label={`${label}: varsayılana dön`}
          title="Varsayılan renge dön"
        >
          <Undo2 size={16} />
        </button>
      </div>
    </div>
  );
}
function AnswerPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (answer: string) => void;
  disabled: boolean;
}) {
  return (
    <RadioGroup
      className="answer-picker"
      aria-label="Seçilen sorunun doğru cevabı"
      value={value || '-'}
      onValueChange={(v) => onChange(v === '-' ? '' : String(v))}
      disabled={disabled}
    >
      {['A', 'B', 'C', 'D', 'E', '-'].map((answer) => (
        <label key={answer} className="answer-choice">
          <RadioGroupItem
            value={answer}
            aria-label={
              answer === '-' ? 'Cevap belirtilmedi' : `Cevap ${answer}`
            }
          />
          <span>{answer === '-' ? '—' : answer}</span>
        </label>
      ))}
    </RadioGroup>
  );
}
function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className="icon-btn"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
function HeaderGraphic({
  header,
  ...props
}: React.SVGProps<SVGSVGElement> & { header: ReturnType<typeof testHeader> }) {
  return (
    <svg viewBox={`0 0 ${PAGE.w} ${header.contentTop}`} {...props}>
      <title>Test başlığı ve öğrenci bilgileri</title>
      {header.boxes.map((box, i) => (
        <rect
          key={i}
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          fill={box.color}
        />
      ))}
      {header.lines.map((line, i) => (
        <line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={line.color}
          strokeWidth={line.width}
        />
      ))}
      {header.texts.map((text, i) => (
        <text
          key={i}
          x={text.x}
          y={text.y}
          fontSize={text.size}
          fill={text.color}
          textAnchor={text.align === 'center' ? 'middle' : 'start'}
        >
          {text.text}
        </text>
      ))}
    </svg>
  );
}
const headerDesigns = headerStyles.map((design) => ({
  ...design,
  preview: testHeader(
    {
      ...defaults,
      headerStyle: design.value,
      school: 'Örnek Anadolu Lisesi',
      subtitle: 'Matematik · 9. sınıf',
    },
    12,
  ),
}));
function PdfPreview({ data }: { data: Uint8Array | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!data || !ref.current) return;
    let cancelled = false;
    let pdf: PDFDocumentProxy | undefined;
    setError('');
    ref.current.replaceChildren();
    void (async () => {
      try {
        const p = await getPdfjs();
        pdf = await p.getDocument({
          data: data.slice(),
          cMapUrl: publicAsset('pdfjs/cmaps/'),
          cMapPacked: true,
          standardFontDataUrl: publicAsset('pdfjs/standard_fonts/'),
          wasmUrl: publicAsset('pdfjs/wasm/'),
        }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) break;
          const page = await pdf.getPage(i);
          const canvas = document.createElement('canvas');
          canvas.setAttribute('aria-label', `PDF sayfa ${i}`);
          const vp = page.getViewport({ scale: 1.5 });
          canvas.width = vp.width;
          canvas.height = vp.height;
          await page.render({
            canvas,
            canvasContext: canvas.getContext('2d')!,
            viewport: vp,
          }).promise;
          if (!cancelled) ref.current?.appendChild(canvas);
        }
      } catch {
        if (!cancelled)
          setError(
            'PDF önizlemesi açılamadı. İndirdiğiniz dosyayı PDF okuyucuda açabilirsiniz.',
          );
      }
    })();
    return () => {
      cancelled = true;
      void pdf?.loadingTask.destroy();
    };
  }, [data]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div ref={ref} className="pdf-pages" />
    </>
  );
}
export default function Home() {
  const [sources, setSources] = useState<Source[]>([]),
    [activeId, setActiveId] = useState(''),
    [page, setPage] = useState(1),
    [rotation, setRotation] = useState(0),
    [zoom, setZoom] = useState(100),
    [questions, setQuestions] = useState<Question[]>([]),
    [settings, setSettings] = useState<Settings>(defaults),
    [tab, setTab] = useState('questions'),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [render, setRender] = useState<RenderedSource | null>(null),
    [selection, setSelection] = useState<Rect | null>(null),
    [cropOpen, setCropOpen] = useState(false),
    [showHome, setShowHome] = useState(false),
    [selectionReady, setSelectionReady] = useState(false),
    [draftAnswer, setDraftAnswer] = useState(''),
    [cropError, setCropError] = useState(''),
    [candidates, setCandidates] = useState<Rect[]>([]),
    [trim, setTrim] = useState(true),
    [editing, setEditing] = useState<string | null>(null),
    [previewData, setPreviewData] = useState<Uint8Array | null>(null),
    [modal, setModal] = useState(false),
    [progress, setProgress] = useState(0),
    [undo, setUndo] = useState<Question[] | null>(null);
  const input = useRef<HTMLInputElement>(null),
    resumeButton = useRef<HTMLButtonElement>(null),
    homeButton = useRef<HTMLButtonElement>(null),
    sourceStage = useRef<HTMLDivElement>(null),
    selectionFrame = useRef<HTMLDivElement>(null),
    pendingEdit = useRef<Question | null>(null),
    selectedCandidate = useRef<Rect | null>(null),
    pointer = useRef<{
      id: number;
      x: number;
      y: number;
      rect?: Rect;
      handle?: CropHandle;
    } | null>(null),
    addingQuestion = useRef(false),
    dragged = useRef<number | null>(null);
  const active = sources.find((s) => s.id === activeId);
  const change = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    const next = { ...settings, [k]: v };
    if (['headerStyle', 'title', 'subtitle', 'school', 'student'].includes(k)) {
      try {
        const adjusted = adjustQuestionsForHeader(
          questions,
          sources,
          settings,
          next,
        );
        if (adjusted !== questions) {
          let adjustedUndo = undo;
          if (undo) {
            try {
              adjustedUndo = adjustQuestionsForHeader(
                undo,
                sources,
                settings,
                next,
              );
            } catch {
              adjustedUndo = null;
            }
          }
          setQuestions(adjusted);
          setUndo(adjustedUndo);
          if (adjusted.some((q, i) => questions[i].position && !q.position))
            notice(
              'Yeni başlığa yer açmak için sığmayan sorular otomatik yerleştirildi.',
            );
        }
        setError('');
      } catch (e) {
        setError(errorMessage(e));
        return;
      }
    }
    setSettings(next);
  };
  const layout = useMemo(() => {
    try {
      return {
        pages: layoutQuestions(questions, sources, settings),
        error: '',
      };
    } catch (e: unknown) {
      return { pages: [], error: errorMessage(e) };
    }
  }, [questions, sources, settings]);
  const header = useMemo(
    () => testHeader(settings, questions.length),
    [settings, questions.length],
  );
  const remember = () => setUndo(questions);
  const notice = (s: string) => {
    setMessage(s);
    setTimeout(() => setMessage(''), 4500);
  };
  useEffect(() => {
    if (showHome) resumeButton.current?.focus();
  }, [showHome]);
  useEffect(() => {
    if (!questions.length) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required for the beforeunload prompt in older Safari versions.
      // oxlint-disable-next-line typescript/no-deprecated
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [questions.length]);
  useEffect(() => {
    if (!active || !cropOpen) return;
    let cancelled = false;
    pointer.current = null;
    setSelectionReady(false);
    setRender(null);
    setCandidates([]);
    selectedCandidate.current = null;
    setSelection(null);
    setError('');
    setCropError('');
    void (async () => {
      try {
        const r = await renderSource(active, page, 2, rotation);
        if (!cancelled) {
          setRender(r);
          const previous = pendingEdit.current;
          if (
            previous &&
            previous.sourceId === active.id &&
            previous.page === page &&
            previous.rotation === r.rotation
          ) {
            setSelection(previous.rect);
            setSelectionReady(true);
            pendingEdit.current = null;
          }
        }
      } catch (e: unknown) {
        if (!cancelled) setError(errorMessage(e) || 'Sayfa açılamadı.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Source scale/columns affect placement only, not the rendered source page.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, page, rotation, cropOpen]);
  const attachCanvas = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (node && render) node.replaceChildren(render.canvas);
    },
    [render],
  );
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, []);
  async function addFiles(files: File[]) {
    if (!files.length || addingQuestion.current) return;
    setBusy('Dosyalar açılıyor…');
    setError('');
    const added: Source[] = [],
      errors: string[] = [];
    for (const file of files) {
      try {
        added.push(await loadSource(file));
      } catch (e: unknown) {
        errors.push(errorMessage(e));
      }
    }
    if (added.length) {
      setShowHome(false);
      setSources((s) => [...s, ...added]);
      setActiveId(added[0].id);
      setEditing(null);
      setPage(1);
      setRotation(0);
      pendingEdit.current = null;
      setDraftAnswer('');
      setCropOpen(true);
      setTab('questions');
      notice(`${added.length} kaynak eklendi`);
    }
    setError(errors.join(' '));
    setBusy('');
  }
  async function demo() {
    try {
      setBusy('Örnek hazırlanıyor…');
      const response = await fetch(publicAsset('ornek-sorular.pdf'));
      const source = await loadSource(
        new File([await response.blob()], 'Örnek matematik.pdf', {
          type: 'application/pdf',
        }),
      );
      source.columns = 1;
      const r = await renderSource(source, 1);
      const qs: Question[] = [];
      for (let i = 0; i < 4; i++)
        qs.push(
          await makeQuestion(
            source,
            1,
            { x: 43, y: 95 + i * 160, w: 450, h: i === 1 ? 116 : 72 },
            r,
            true,
          ),
        );
      setSources((s) => [...s, source]);
      setActiveId(source.id);
      setPage(1);
      setQuestions((q) => [...q, ...qs]);
      setSettings((s) => ({ ...s, columns: 1, perPage: 4 }));
      setShowHome(false);
      notice('Özgün örnek belge eklendi.');
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  const selectSource = (id: string) => {
    if (busy) return;
    setShowHome(false);
    pendingEdit.current = null;
    setActiveId(id);
    setPage(1);
    setRotation(0);
    setEditing(null);
    setDraftAnswer('');
    setCropOpen(true);
    setTab('questions');
  };
  function changeCropOpen(open: boolean) {
    if (busy || addingQuestion.current) return;
    pointer.current = null;
    pendingEdit.current = null;
    setEditing(null);
    setSelection(null);
    setSelectionReady(false);
    setDraftAnswer('');
    setCropError('');
    setCropOpen(open);
  }
  function returnHome() {
    if (busy || addingQuestion.current) return;
    changeCropOpen(false);
    setShowHome(true);
  }
  function resumeTest() {
    setShowHome(false);
    requestAnimationFrame(() => homeButton.current?.focus());
  }
  function changePage(next: number) {
    if (busy) return;
    pendingEdit.current = null;
    setPage(next);
    setEditing(null);
    setDraftAnswer('');
  }
  function point(e: React.PointerEvent) {
    if (!render) return { x: 0, y: 0 };
    const box = sourceStage.current!.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          render.width,
          ((e.clientX - box.left) / box.width) * render.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          render.height,
          ((e.clientY - box.top) / box.height) * render.height,
        ),
      ),
    };
  }
  function selectionRect(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): Rect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
  }
  function confirmSelection(rect: Rect) {
    if (rect.w < 5 || rect.h < 5) return;
    setSelection(rect);
    setCropError('');
    setSelectionReady(true);
  }
  function down(e: React.PointerEvent) {
    if (!render || busy || !e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = { id: e.pointerId, ...point(e) };
    selectedCandidate.current = null;
    setSelection(null);
    setSelectionReady(false);
  }
  function move(e: React.PointerEvent) {
    if (!pointer.current || pointer.current.id !== e.pointerId || !render)
      return;
    const start = pointer.current,
      at = point(e);
    setSelection(
      start.rect && start.handle
        ? transformCrop(
            start.rect,
            at.x - start.x,
            at.y - start.y,
            start.handle,
            render.width,
            render.height,
          )
        : selectionRect(start, at),
    );
  }
  function up(e: React.PointerEvent) {
    const start = pointer.current;
    if (!start || start.id !== e.pointerId) return;
    if (!render) return;
    const at = point(e);
    const rect =
      start.rect && start.handle
        ? transformCrop(
            start.rect,
            at.x - start.x,
            at.y - start.y,
            start.handle,
            render.width,
            render.height,
          )
        : selectionRect(start, at);
    pointer.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (rect.w < 5 || rect.h < 5) {
      setSelection(null);
      return;
    }
    confirmSelection(rect);
    requestAnimationFrame(() =>
      selectionFrame.current?.focus({ preventScroll: true }),
    );
  }
  function cancelPointer() {
    if (!pointer.current) return;
    const old = pointer.current.rect;
    pointer.current = null;
    setSelection(old || null);
  }
  function transformStart(e: React.PointerEvent, handle: CropHandle) {
    e.stopPropagation();
    if (!selection || !render || busy || e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    pointer.current = { id: e.pointerId, ...point(e), rect: selection, handle };
    sourceStage.current?.setPointerCapture(e.pointerId);
  }
  function cropKeyboard(e: React.KeyboardEvent, handle: CropHandle = 'move') {
    if (!selection || !render || busy) return;
    if (e.currentTarget !== e.target) return;
    const step = e.shiftKey ? 10 : 1;
    const dx =
      e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (dx || dy) {
      e.preventDefault();
      e.stopPropagation();
      confirmSelection(
        transformCrop(selection, dx, dy, handle, render.width, render.height),
      );
    }
  }
  async function addSelection() {
    if (
      !selection ||
      !active ||
      !render ||
      busy ||
      selection.w < 5 ||
      selection.h < 5 ||
      addingQuestion.current
    )
      return;
    addingQuestion.current = true;
    setCropError('');
    setError('');
    setBusy('Soru hazırlanıyor…');
    try {
      const q = await makeQuestion(active, page, selection, render, trim);
      q.answer = draftAnswer;
      remember();
      if (editing) {
        setQuestions((prev) =>
          prev.map((old) =>
            old.id === editing
              ? {
                  ...old,
                  ...q,
                  id: old.id,
                  wide: old.wide,
                  position: undefined,
                }
              : old,
          ),
        );
        setEditing(null);
        notice('Soru kırpması güncellendi.');
      } else {
        setQuestions((prev) => [...prev, q]);
        notice('Soru eklendi. Sıradaki soruyu seçebilirsiniz.');
      }
      setSelection(null);
      setSelectionReady(false);
      setDraftAnswer('');
      const addedCandidate = selectedCandidate.current;
      if (addedCandidate)
        setCandidates((previous) =>
          previous.filter((r) => r !== addedCandidate),
        );
      selectedCandidate.current = null;
    } catch (e: unknown) {
      setCropError(errorMessage(e));
      setError(errorMessage(e));
    } finally {
      addingQuestion.current = false;
      setBusy('');
    }
  }
  async function detect() {
    if (!render || !active || busy || addingQuestion.current) return;
    setCropError('');
    setError('');
    setCandidates([]);
    selectedCandidate.current = null;
    setBusy('Sorular otomatik bulunuyor…');
    try {
      const rects = await detectQuestions(render, active.columns);
      setCandidates(rects);
      notice(
        rects.length
          ? `${rects.length} olası soru bulundu. Tek tek seçebilir veya tümünü ekleyebilirsiniz.`
          : 'Numaralı soru sınırı bulunamadı. Sorunun etrafında sürükleyerek seçin.',
      );
    } catch {
      setError('Otomatik seçim yapılamadı. Elle kırpmaya devam edebilirsiniz.');
    } finally {
      setBusy('');
    }
  }
  async function addDetectedQuestions() {
    if (
      !active ||
      !render ||
      !candidates.length ||
      busy ||
      addingQuestion.current
    )
      return;
    addingQuestion.current = true;
    setCropError('');
    setError('');
    const added: Question[] = [];
    try {
      for (const [index, rect] of candidates.entries()) {
        setBusy(`Sorular ekleniyor… ${index + 1}/${candidates.length}`);
        const selected = rect === selectedCandidate.current && selection;
        const question = await makeQuestion(
          active,
          page,
          selected || rect,
          render,
          trim,
        );
        if (selected) question.answer = draftAnswer;
        const duplicate = [...questions, ...added].some(
          (q) =>
            q.sourceId === question.sourceId &&
            q.page === question.page &&
            q.rotation === question.rotation &&
            (['x', 'y', 'w', 'h'] as const).every(
              (key) => Math.abs(q.rect[key] - question.rect[key]) < 1,
            ),
        );
        if (!duplicate) added.push(question);
      }
      if (added.length) {
        remember();
        setQuestions((previous) => [...previous, ...added]);
      }
      setCandidates([]);
      selectedCandidate.current = null;
      setSelection(null);
      setSelectionReady(false);
      setEditing(null);
      setDraftAnswer('');
      notice(
        added.length
          ? `${added.length} soru eklendi.${candidates.length > added.length ? ' Daha önce eklenen sorular atlandı.' : ''}`
          : 'Bulunan sorular zaten testte; tekrar eklenmedi.',
      );
    } catch (e) {
      setCropError(errorMessage(e));
      setError(errorMessage(e));
    } finally {
      addingQuestion.current = false;
      setBusy('');
    }
  }
  const placements = layout.pages.flatMap((p) => p.items);
  const smallQuestions = placements.filter((it) => {
    const size = printedFontSize(it);
    return size !== null && size < settings.minFontSize;
  });
  function updateQuestion(id: string, update: Partial<Question>) {
    const next = questions.map((it) =>
      it.id === id ? { ...it, ...update } : it,
    );
    try {
      layoutQuestions(next, sources, settings);
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    remember();
    setQuestions(next);
    setError('');
  }
  function moveQuestion(id: string, pageIndex: number, x: number, y: number) {
    // Freeze the visible layout so dropping into a gap never moves other questions.
    const next = movePlacedQuestion(questions, layout.pages, id, {
      page: pageIndex,
      x,
      y,
    });
    try {
      layoutQuestions(next, sources, settings);
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
    remember();
    setQuestions(next);
    setError('');
    notice(`Soru ${pageIndex + 1}. sayfaya yerleştirildi.`);
    return true;
  }
  function resetPlacement() {
    remember();
    setQuestions((qs) => qs.map((q) => ({ ...q, position: undefined })));
    setError('');
    notice('Sorular otomatik yerleşime alındı.');
  }
  function removeEmptyPage(pageIndex: number) {
    try {
      const next = removeEmptyLayoutPage(
        questions,
        sources,
        settings,
        layout.pages,
        pageIndex,
      );
      if (next === questions) return;
      layoutQuestions(next, sources, settings);
      remember();
      setQuestions(next);
      setError('');
      notice('Boş sayfa silindi.');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function undoQuestions() {
    if (undo) {
      setQuestions(undo);
      setUndo(null);
      setError('');
    }
  }
  function reorder(from: number, to: number) {
    if (to < 0 || to >= questions.length) return;
    remember();
    setQuestions((q) => {
      const next = [...q];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  }
  async function editQuestion(q: Question) {
    if (busy) return;
    const source = sources.find((s) => s.id === q.sourceId)!;
    setBusy('Soru açılıyor…');
    try {
      const angle =
        source.kind === 'pdf'
          ? (q.rotation - (await source.pdf!.getPage(q.page)).rotate + 360) %
            360
          : q.rotation;
      pendingEdit.current = q;
      setActiveId(q.sourceId);
      setPage(q.page);
      setRotation(angle);
      setEditing(q.id);
      setDraftAnswer(q.answer);
      setShowHome(false);
      setCropOpen(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  async function exportPdf(preview = false) {
    setBusy('PDF oluşturuluyor…');
    setError('');
    setProgress(0);
    try {
      const font = new Uint8Array(
        await (await fetch(publicAsset('fonts/DejaVuSans.ttf'))).arrayBuffer(),
      );
      const result = await createPdf(
        questions,
        sources,
        settings,
        font,
        setProgress,
      );
      if (preview) {
        setPreviewData(result.bytes);
        setModal(true);
      } else {
        download(
          result.bytes,
          `${(settings.title || 'test').replace(/[<>:"/\\|?*]/g, '-')}.pdf`,
        );
        notice(`${result.pages} sayfalık A4 PDF hazır.`);
      }
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  function fileDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length)
      void addFiles(Array.from(e.dataTransfer.files));
  }
  const sourceControls = active && (
    <>
      <div className="source-config">
        <span className="source-label">Kaynağın sütun düzeni</span>
        <Choice
          label="Kaynağın sütun düzeni"
          value={String(active.columns)}
          onChange={(v) =>
            setSources((s) =>
              s.map((it) =>
                it.id === active.id ? { ...it, columns: +v } : it,
              ),
            )
          }
          options={[
            ['2', 'İki sütun'],
            ['1', 'Tek sütun / görsel'],
          ]}
        />
        <label>
          Bu kaynağın boyutu <b>%{active.scale}</b>
        </label>
        <Slider
          aria-label="Kaynak boyutu"
          min={50}
          max={150}
          step={5}
          value={[active.scale]}
          onValueChange={(v) =>
            setSources((s) =>
              s.map((it) =>
                it.id === active.id
                  ? { ...it, scale: Array.isArray(v) ? v[0] : v }
                  : it,
              ),
            )
          }
        />
        <small>Farklı yayınların yazı boyutlarını burada eşitleyin.</small>
      </div>
    </>
  );
  return (
    <main
      className={
        sources.length && !showHome
          ? `editor-app ${tab === 'layout' ? 'preview-active' : ''}`
          : undefined
      }
      onDragOver={(e) => e.preventDefault()}
      onDrop={fileDrop}
    >
      <input
        ref={input}
        aria-label="Kaynak dosyaları"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      <header className="topbar">
        <button
          type="button"
          className="brand"
          aria-label="Test Atölyesi — Ana sayfaya dön"
          disabled={!!busy}
          onClick={returnHome}
        >
          <span className="brandmark">
            <ScanLine />
          </span>
          Test Atölyesi
        </button>
        <span className="quiet">
          <ShieldCheck size={16} /> Dosyalarınız cihazınızda kalır
        </span>
        <div className="header-actions">
          {sources.length > 0 && !showHome && (
            <button
              ref={homeButton}
              type="button"
              className="secondary home-button"
              aria-label="Ana sayfaya dön"
              disabled={!!busy}
              onClick={returnHome}
            >
              <House size={17} /> Ana sayfa
            </button>
          )}
          {questions.length > 0 && !showHome && (
            <>
              <button
                className="secondary"
                disabled={!!busy || !!layout.error}
                onClick={() => exportPdf(true)}
              >
                <Eye size={17} /> Önizle
              </button>
              <button
                className="primary"
                disabled={!!busy || !!layout.error}
                onClick={() => exportPdf()}
              >
                <Download size={17} /> PDF indir
              </button>
            </>
          )}
        </div>
      </header>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <IconButton label="Uyarıyı kapat" onClick={() => setError('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {busy && (
        <output className="status-bar">
          <LoaderCircle size={16} className="spin" />
          {busy}
          {progress > 0 && <span>%{Math.round(progress * 100)}</span>}
        </output>
      )}
      {message && (
        <output className="toast">
          <Check size={16} />
          {message}
        </output>
      )}

      {(!sources.length || showHome) && (
        <>
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">PDF & GÖRSELDEN TEST HAZIRLA</div>
              <h1>İyi sorular. Kusursuz sayfalar.</h1>
              <p>Kaynağınızı açın, sorularınızı seçin, A4 PDF’nizi alın.</p>
            </div>
            <div className="workflow">
              <b>
                1 <span>Kaynak ekle</span>
              </b>
              <ArrowRight size={16} />
              <span>2 Soruları seç</span>
              <ArrowRight size={16} />
              <span>3 PDF oluştur</span>
            </div>
          </div>
          <section className="initial-grid">
            <div className="upload-card">
              <div className="upload-icon">
                <FilePlus2 size={32} />
              </div>
              <h2>
                {sources.length
                  ? 'Testinize devam edin'
                  : 'İlk kaynağınızı ekleyin'}
              </h2>
              <p>
                {sources.length
                  ? `${sources.length} kaynak · ${questions.length} soru · Test ayarlarınız korunuyor.`
                  : 'PDF veya görsellerinizi buraya sürükleyin.'}
              </p>
              {sources.length > 0 && (
                <button
                  ref={resumeButton}
                  type="button"
                  className="primary"
                  disabled={!!busy}
                  onClick={resumeTest}
                >
                  <ArrowRight size={17} /> Teste devam et
                </button>
              )}
              <button
                className={
                  sources.length ? 'secondary resume-add-source' : 'primary'
                }
                onClick={() => input.current?.click()}
                disabled={!!busy}
              >
                <Plus size={17} />
                {sources.length ? 'Kaynak ekle' : 'Dosya seç'}
              </button>
              <small>PDF, PNG, JPG, WebP · Dosya başına 100 MB</small>
              {!sources.length && (
                <button
                  className="text-btn demo"
                  onClick={demo}
                  disabled={!!busy}
                >
                  Örnek belgeyle dene <ArrowRight size={15} />
                </button>
              )}
            </div>
            <aside className="intro-note">
              <FileText size={26} />
              <h2>Sayfa düzeni en baştan doğru.</h2>
              <p>
                Ortak soru ölçeği, dengeli sütunlar ve bozulmayan en-boy oranı.
              </p>
              <div className="note-line">
                01 <span>Kaynak kalitesini koru</span>
              </div>
              <div className="note-line">
                02 <span>Soruları aynı ölçekte tut</span>
              </div>
              <div className="note-line">
                03 <span>Bölünmeyen sorularla A4 çıktı al</span>
              </div>
            </aside>
          </section>
          <div className="empty-footer">
            <ShieldCheck size={15} /> Dosyalar sunucuya yüklenmez. İşlemler bu
            tarayıcıda yapılır.
          </div>
        </>
      )}
      {sources.length > 0 && (
        <div className="editor-content" hidden={showHome}>
          <div className="projectbar">
            <div className="project-summary">
              <h1>Testinizi hazırlayın</h1>
              <span className="project-caption">
                Soruları seçin, sayfanızı düzenleyin.
              </span>
            </div>
            <div className="project-sources">
              <Popover>
                <PopoverTrigger
                  render={
                    <button
                      className="source-picker-trigger"
                      aria-label={`Kaynaklar (${sources.length}): ${active?.name || 'Kaynak seç'}`}
                    />
                  }
                >
                  <FileText size={18} />
                  <span className="source-picker-text">
                    <strong>
                      Kaynaklar{' '}
                      <span className="panel-count">{sources.length}</span>
                    </strong>
                    <span title={active?.name}>
                      {active?.name || 'Kaynak seç'}
                    </span>
                  </span>
                  <ChevronDown size={16} />
                </PopoverTrigger>
                <PopoverContent className="source-picker-popover" align="end">
                  <div className="panel-heading">
                    <PopoverTitle>Kaynaklar</PopoverTitle>
                    <IconButton
                      label="Kaynak ekle"
                      disabled={!!busy}
                      onClick={() => input.current?.click()}
                    >
                      <Plus size={18} />
                    </IconButton>
                  </div>
                  <div className="source-list">
                    {sources.map((s) => (
                      <button
                        key={s.id}
                        className={`source-item ${s.id === activeId ? 'active' : ''}`}
                        aria-pressed={s.id === activeId}
                        onClick={() => selectSource(s.id)}
                      >
                        {s.kind === 'pdf' ? (
                          <FileText size={20} />
                        ) : (
                          <ImageIcon size={20} />
                        )}
                        <span>
                          <strong>{s.name}</strong>
                          <small>
                            {s.pages} sayfa ·{' '}
                            {s.kind === 'pdf' ? 'PDF' : 'Görsel'}
                          </small>
                        </span>
                        {s.id === activeId && <span className="active-dot" />}
                      </button>
                    ))}
                  </div>
                  {sourceControls}
                </PopoverContent>
              </Popover>
            </div>
            <div className="project-stats">
              <span>
                <b>{questions.length}</b> soru
              </span>
              <span>
                <b>{layout.pages.length}</b> sayfa
              </span>
              <span className="a4-chip">A4 · 210 × 297 mm</span>
            </div>
          </div>
          <section className="editor-grid">
            <div className="center-panel">
              <div className="stage-header">
                <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                  <TabsList>
                    <TabsTrigger value="questions">
                      <FileText size={15} /> Seçilen sorular
                    </TabsTrigger>
                    <TabsTrigger value="layout">
                      <LayoutTemplate size={15} /> A4 Önizleme
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => changeCropOpen(true)}
                >
                  <Plus size={17} /> Soru seç
                </button>
              </div>
              {smallQuestions.length > 0 && (
                <details
                  key={tab}
                  className="readability-warning"
                  open={tab === 'questions'}
                >
                  <summary>
                    {smallQuestions.length} soruda yazı {settings.minFontSize}{' '}
                    pt sınırının altında.
                  </summary>
                  <span>
                    Tam genişlik, ayrı sayfa veya soruya özel boyut
                    seçebilirsiniz.
                  </span>
                  <div>
                    {smallQuestions.map((it) => (
                      <Popover key={it.q.id}>
                        <PopoverTrigger
                          render={
                            <button
                              className="warning-question"
                              aria-label={`${it.index + 1}. sorunun küçük yazı uyarısını düzenle`}
                            />
                          }
                        >
                          {it.index + 1}. soru · ≈
                          {printedFontSize(it)!.toLocaleString('tr-TR', {
                            maximumFractionDigits: 1,
                          })}{' '}
                          pt
                        </PopoverTrigger>
                        <PopoverContent className="question-options-popover">
                          <QuestionOptions
                            question={it.q}
                            index={it.index}
                            item={it}
                            settings={settings}
                            onChange={(update) =>
                              updateQuestion(it.q.id, update)
                            }
                          />
                        </PopoverContent>
                      </Popover>
                    ))}
                  </div>
                </details>
              )}
              {tab === 'questions' ? (
                <div className="question-tray question-workspace">
                  <div className="tray-heading">
                    <h2>
                      Sorular <span>{questions.length}</span>
                    </h2>
                    <span className="quiet">Sürükleyerek sıralayın</span>
                    <IconButton
                      label="Son soru düzenlemesini geri al"
                      disabled={!undo}
                      onClick={undoQuestions}
                    >
                      <Undo2 size={17} />
                    </IconButton>
                  </div>
                  {questions.length ? (
                    <div className="question-cards">
                      {questions.map((q, i) => (
                        <article
                          key={q.id}
                          className={`question-card ${q.wide ? 'wide' : ''}`}
                          draggable
                          onDragStart={() => (dragged.current = i)}
                          onDragEnd={() => (dragged.current = null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (dragged.current !== null)
                              reorder(dragged.current, i);
                            dragged.current = null;
                          }}
                        >
                          <div className="question-top">
                            <b>{i + 1}. soru</b>
                            <small>s. {q.page}</small>
                            <IconButton
                              label={`${i + 1}. soruyu sil`}
                              onClick={() => {
                                remember();
                                setQuestions((s) =>
                                  s.filter((it) => it.id !== q.id),
                                );
                              }}
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          </div>
                          <button
                            className="thumb-button"
                            aria-label={`${i + 1}. sorunun kırpmasını düzenle`}
                            onClick={() => editQuestion(q)}
                          >
                            <img
                              src={q.thumb}
                              alt={`${i + 1}. soru kırpması`}
                            />
                          </button>
                          <div className="q-actions">
                            <IconButton
                              label={`${i + 1}. soruyu önceye taşı`}
                              disabled={i === 0}
                              onClick={() => reorder(i, i - 1)}
                            >
                              <ArrowUp size={14} />
                            </IconButton>
                            <IconButton
                              label={`${i + 1}. soruyu sonraya taşı`}
                              disabled={i === questions.length - 1}
                              onClick={() => reorder(i, i + 1)}
                            >
                              <ArrowDown size={14} />
                            </IconButton>
                            <button
                              className={`width-toggle ${q.wide || q.ownPage ? 'on' : ''}`}
                              disabled={q.ownPage}
                              onClick={() =>
                                updateQuestion(q.id, {
                                  wide: !q.wide,
                                  position: undefined,
                                })
                              }
                            >
                              {q.ownPage
                                ? 'Ayrı sayfa'
                                : q.wide
                                  ? 'Tam genişlik'
                                  : 'Tek sütun'}
                            </button>
                          </div>
                          <Choice
                            label={`${i + 1}. soru cevabı`}
                            value={q.answer || '-'}
                            onChange={(v) =>
                              updateQuestion(q.id, {
                                answer: v === '-' ? '' : v,
                              })
                            }
                            options={[
                              ['-', 'Cevap: —'],
                              ...['A', 'B', 'C', 'D', 'E'].map(
                                (v) => [v, `Cevap: ${v}`] as [string, string],
                              ),
                            ]}
                          />

                          <QuestionQuality
                            item={placements.find((it) => it.q.id === q.id)}
                            threshold={settings.minFontSize}
                          />
                          <Popover>
                            <PopoverTrigger
                              render={
                                <button
                                  className="secondary question-options-button"
                                  aria-label={`${i + 1}. sorunun boyut ve yerleşimi`}
                                />
                              }
                            >
                              <SlidersHorizontal size={14} /> Boyut / yerleşim
                            </PopoverTrigger>
                            <PopoverContent className="question-options-popover">
                              <QuestionOptions
                                question={q}
                                index={i}
                                item={placements.find((it) => it.q.id === q.id)}
                                settings={settings}
                                onChange={(update) =>
                                  updateQuestion(q.id, update)
                                }
                              />
                            </PopoverContent>
                          </Popover>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="tray-empty">
                      <Scissors size={20} />
                      <span>Seçtiğiniz sorular burada birikir.</span>
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => changeCropOpen(true)}
                      >
                        İlk soruyu seç
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="layout-surface">
                  {layout.error ? (
                    <div className="layout-error">
                      <LayoutTemplate size={28} />
                      <h2>Yerleşimi ayarlayalım</h2>
                      <p>{layout.error}</p>
                      {questions.some((q) => q.position) && (
                        <button className="secondary" onClick={resetPlacement}>
                          Elle yerleşimi sıfırla
                        </button>
                      )}
                    </div>
                  ) : !questions.length ? (
                    <div className="layout-error">
                      <Scissors size={28} />
                      <h2>İlk sorunuzla başlayın</h2>
                      <p>Kaynak üzerinden bir soru seçip ekleyin.</p>
                      <button
                        className="secondary"
                        onClick={() => changeCropOpen(true)}
                      >
                        Soruları seç
                      </button>
                    </div>
                  ) : (
                    <LayoutEditor
                      pages={layout.pages}
                      settings={settings}
                      header={
                        <HeaderGraphic
                          header={header}
                          className="paper-header"
                          style={{
                            height: `${(header.contentTop / PAGE.h) * 100}%`,
                          }}
                          aria-label="Test başlığı ve öğrenci bilgileri"
                        />
                      }
                      onEdit={editQuestion}
                      onUpdate={updateQuestion}
                      onMove={moveQuestion}
                      onRemoveEmptyPage={removeEmptyPage}
                      onUndo={undoQuestions}
                      canUndo={!!undo}
                    />
                  )}
                </div>
              )}
            </div>
            <aside className="settings-panel">
              <div className="panel-heading">
                <h2>
                  <SlidersHorizontal size={17} /> Test ayarları
                </h2>
                <span className="a4-chip">A4</span>
              </div>
              <div className="settings-body">
                <Tabs defaultValue="layout" className="settings-tabs">
                  <TabsList
                    className="settings-tab-list"
                    aria-label="Sayfa düzeni araçları"
                    activateOnFocus
                  >
                    <TabsTrigger value="info">
                      <FileText size={17} />
                      Bilgi
                    </TabsTrigger>
                    <TabsTrigger value="layout">
                      <LayoutTemplate size={17} />
                      Düzen
                    </TabsTrigger>
                    <TabsTrigger value="style">
                      <Palette size={17} />
                      Stil
                    </TabsTrigger>
                    <TabsTrigger value="output">
                      <Download size={17} />
                      Çıktı
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="info" className="settings-tab-panel">
                    <label className="field">
                      Test başlığı
                      <input
                        maxLength={100}
                        value={settings.title}
                        onChange={(e) => change('title', e.target.value)}
                        placeholder="Testin adı"
                      />
                    </label>
                    <label className="field">
                      Alt başlık
                      <input
                        maxLength={130}
                        value={settings.subtitle}
                        onChange={(e) => change('subtitle', e.target.value)}
                        placeholder="Ders, konu veya açıklama"
                      />
                    </label>
                    <label className="field">
                      Okul / kurum
                      <input
                        maxLength={100}
                        value={settings.school}
                        onChange={(e) => change('school', e.target.value)}
                        placeholder="İsteğe bağlı"
                      />
                    </label>
                    <Toggle
                      label="Öğrenci bilgi alanı"
                      checked={settings.student}
                      onChange={(v) => change('student', v)}
                    />
                  </TabsContent>
                  <TabsContent
                    value="layout"
                    className="settings-tab-panel layout-settings"
                  >
                    <div className="two-fields">
                      <label className="field">
                        Sütun sayısı
                        <Choice
                          label="Çıktı sütun sayısı"
                          value={String(settings.columns)}
                          onChange={(v) => change('columns', +v as 1 | 2)}
                          options={[
                            ['2', 'İki sütun'],
                            ['1', 'Tek sütun'],
                          ]}
                        />
                      </label>
                      <label className="field">
                        Soru / sayfa
                        <Choice
                          label="Sayfa başına soru hedefi"
                          value={String(settings.perPage)}
                          onChange={(v) => change('perPage', +v)}
                          options={[
                            ['0', 'İçeriğe göre'],
                            ['2', '2 soru'],
                            ['4', '4 soru'],
                            ['6', '6 soru'],
                            ['8', '8 soru'],
                            ['10', '10 soru'],
                          ]}
                        />
                      </label>
                    </div>
                    <small className="help-text">
                      Sığmayan soru bölünmeden sonraki sütuna veya sayfaya
                      geçer.
                    </small>
                    <label className="field">
                      Boyutlandırma
                      <Choice
                        label="Boyutlandırma yöntemi"
                        value={settings.normalization}
                        onChange={(v) =>
                          change(
                            'normalization',
                            v as Settings['normalization'],
                          )
                        }
                        options={[
                          ['font', 'Yazı boyutlarını eşitle'],
                          ['column', 'Kaynak sütun ölçeğini koru'],
                        ]}
                      />
                    </label>
                    <small className="help-text">
                      Metinli PDF’de yazı ölçüsü eşitlenir. Taramalarda kaynak
                      sütunu temel alınır.
                    </small>
                    <div className="range-field">
                      <label>
                        Ortak soru boyutu <b>%{settings.scale}</b>
                      </label>
                      <Slider
                        aria-label="Ortak soru boyutu"
                        min={40}
                        max={140}
                        step={5}
                        value={[settings.scale]}
                        onValueChange={(v) =>
                          change('scale', Array.isArray(v) ? v[0] : v)
                        }
                      />
                    </div>
                    <small className="help-text">
                      Her soru kendi sınırında durur; büyük bir soru diğerlerini
                      küçültmez.
                    </small>
                    <div className="two-fields">
                      <label className="field">
                        Kenar (mm)
                        <input
                          aria-label="Kenar boşluğu"
                          type="number"
                          min={8}
                          max={25}
                          value={settings.margin}
                          onChange={(e) =>
                            change(
                              'margin',
                              Math.max(8, Math.min(25, +e.target.value)),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        Aralık (mm)
                        <input
                          aria-label="Soru aralığı"
                          type="number"
                          min={3}
                          max={30}
                          value={settings.gap}
                          onChange={(e) =>
                            change(
                              'gap',
                              Math.max(3, Math.min(30, +e.target.value)),
                            )
                          }
                        />
                      </label>
                    </div>
                    <Toggle
                      label="Boşlukları dengeli dağıt"
                      checked={settings.balance}
                      onChange={(v) => change('balance', v)}
                    />
                  </TabsContent>
                  <TabsContent value="style" className="settings-tab-panel">
                    <fieldset className="header-style-field">
                      <legend>Başlık tasarımı</legend>
                      <RadioGroup
                        className="header-style-picker"
                        aria-label="Başlık tasarımı"
                        value={settings.headerStyle || defaults.headerStyle}
                        onValueChange={(value) =>
                          change(
                            'headerStyle',
                            value as Settings['headerStyle'],
                          )
                        }
                      >
                        {headerDesigns.map((design) => (
                          <label
                            key={design.value}
                            className="header-style-option"
                            htmlFor={`header-style-${design.value}`}
                          >
                            <HeaderGraphic
                              header={design.preview}
                              className="header-style-preview"
                              viewBox={`0 ${(defaults.margin * 72) / 25.4 - 3} ${PAGE.w} ${design.preview.contentTop - (defaults.margin * 72) / 25.4}`}
                              aria-hidden="true"
                            />
                            <span className="header-style-label">
                              <RadioGroupItem
                                id={`header-style-${design.value}`}
                                value={design.value}
                                aria-label={`${design.label} başlık`}
                              />
                              <span>{design.label}</span>
                            </span>
                          </label>
                        ))}
                      </RadioGroup>
                    </fieldset>
                    {settings.columns === 2 && (
                      <Toggle
                        label="Sütunlar arasına çizgi"
                        checked={settings.columnDivider}
                        onChange={(v) => change('columnDivider', v)}
                      />
                    )}
                    <ColorField
                      label="Tüm çizgilerin rengi"
                      value={settings.lineColor}
                      fallback="#b8c2c7"
                      onChange={(v) => change('lineColor', v)}
                    />

                    <>
                      <label className="field">
                        Soru numarası stili
                        <Choice
                          label="Soru numarası stili"
                          value={settings.numberStyle}
                          onChange={(v) =>
                            change('numberStyle', v as Settings['numberStyle'])
                          }
                          options={[
                            ['plain', 'Normal · 1.'],
                            ['bold', 'Kalın · 1.'],
                            ['italic', 'İtalik · 1.'],
                            ['circle', 'Daire içinde'],
                            ['square', 'Kare içinde'],
                          ]}
                        />
                      </label>
                      <ColorField
                        label="Soru numarası rengi"
                        value={settings.numberColor}
                        fallback="#1a262e"
                        onChange={(v) => change('numberColor', v)}
                      />
                    </>
                  </TabsContent>
                  <TabsContent value="output" className="settings-tab-panel">
                    <label className="field">
                      Okunabilirlik uyarısı sınırı
                      <Choice
                        label="En küçük baskı puntosu"
                        value={String(settings.minFontSize)}
                        onChange={(v) => change('minFontSize', +v)}
                        options={[
                          [6, '6 pt'],
                          [7, '7 pt'],
                          [8, '8 pt'],
                          [9, '9 pt'],
                          [10, '10 pt'],
                          [12, '12 pt'],
                        ].map(([v, label]) => [String(v), String(label)])}
                      />
                    </label>
                    <small className="help-text">
                      Metinli PDF’de baskıdaki baskın yazı boyutu hesaplanır.
                      Görsel ve taramalarda punto ölçülemez.
                    </small>
                    <Toggle
                      label="Cevap anahtarı ekle"
                      checked={settings.answerKey}
                      onChange={(v) => change('answerKey', v)}
                    />
                    <label className="field">
                      Çıktı kalitesi
                      <Choice
                        label="Çıktı kalitesi"
                        value={settings.quality}
                        onChange={(v) =>
                          change('quality', v as Settings['quality'])
                        }
                        options={[
                          ['vector', 'Özgün PDF · En net'],
                          ['300', '300 DPI · Kayıpsız PNG'],
                          ['600', '600 DPI · Kayıpsız PNG'],
                        ]}
                      />
                    </label>
                    <div className="quality-note">
                      <ShieldCheck size={18} />
                      <p>
                        PDF yazı ve çizimleri özgün hâliyle korunur. Görsellerde
                        netlik kaynak çözünürlüğüne bağlıdır.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="settings-actions">
                  {layout.error && (
                    <div className="inline-error" role="alert">
                      {layout.error}
                      <button
                        className="text-btn"
                        onClick={() => setTab('layout')}
                      >
                        Yerleşimi göster
                      </button>
                      {questions.some((q) => q.position) && (
                        <button className="text-btn" onClick={resetPlacement}>
                          Elle yerleşimi sıfırla
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    className="primary full"
                    disabled={!questions.length || !!busy || !!layout.error}
                    onClick={() => exportPdf()}
                  >
                    <Download size={17} /> A4 PDF indir
                  </button>
                </div>
              </div>
            </aside>
          </section>
        </div>
      )}
      <Dialog
        open={cropOpen}
        onOpenChange={changeCropOpen}
        disablePointerDismissal
      >
        <DialogContent
          className="crop-dialog"
          showCloseButton={false}
          finalFocus={showHome ? resumeButton : undefined}
        >
          <DialogTitle className="sr-only">
            {editing ? 'Soruyu düzenle' : 'PDF veya görselden soru seç'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Soru sınırlarını çizip cevabını seçin.
          </DialogDescription>
          <div className="crop-topbar">
            <div className="crop-heading">
              <button
                type="button"
                className="secondary home-button"
                aria-label="Ana sayfaya dön"
                disabled={!!busy}
                onClick={returnHome}
              >
                <House size={17} /> Ana sayfa
              </button>
              <div>
                <strong>
                  {editing ? 'Soruyu düzenle' : 'Kaynağınızdan soru seçin'}
                </strong>
                <span>Seçin · Cevaplayın · Ekleyin</span>
              </div>
            </div>
            <FileText size={18} className="crop-source-icon" />
            <Choice
              label="Soru seçilecek kaynak"
              value={activeId}
              onChange={selectSource}
              disabled={!!busy}
              options={sources.map((s) => [s.id, s.name])}
            />
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => input.current?.click()}
            >
              <Plus size={16} /> Dosya ekle
            </button>
            <span className="crop-question-count">
              <Check size={14} /> {questions.length} soru
            </span>
            <DialogClose
              disabled={!!busy}
              render={
                <button
                  type="button"
                  className="secondary crop-done"
                  aria-label="Soru seçimini bitir"
                />
              }
            >
              <Check size={17} /> Seçimi bitir
            </DialogClose>
          </div>
          <>
            <div className="crop-toolbar">
              <div className="page-nav">
                <span className="tool-label">Sayfa</span>
                <IconButton
                  label="Önceki sayfa"
                  disabled={page <= 1 || !!busy}
                  onClick={() => changePage(page - 1)}
                >
                  <ChevronLeft size={17} />
                </IconButton>
                <input
                  aria-label="Kaynak sayfa numarası"
                  type="number"
                  min={1}
                  max={active?.pages || 1}
                  value={page}
                  disabled={!!busy}
                  onChange={(e) => {
                    const n = +e.target.value;
                    if (n >= 1 && n <= (active?.pages || 1)) {
                      changePage(n);
                    }
                  }}
                />
                <span>/ {active?.pages}</span>
                <IconButton
                  label="Sonraki sayfa"
                  disabled={page >= (active?.pages || 1) || !!busy}
                  onClick={() => changePage(page + 1)}
                >
                  <ChevronRight size={17} />
                </IconButton>
              </div>
              <div className="zoom-control">
                <IconButton
                  label="Uzaklaştır"
                  disabled={zoom <= 50 || !!busy}
                  onClick={() => setZoom((z) => Math.max(50, z - 25))}
                >
                  <ZoomOut size={17} />
                </IconButton>
                <span>%{zoom}</span>
                <IconButton
                  label="Yaklaştır"
                  disabled={zoom >= 250 || !!busy}
                  onClick={() => setZoom((z) => Math.min(250, z + 25))}
                >
                  <ZoomIn size={17} />
                </IconButton>
                <IconButton
                  label="Genişliğe sığdır"
                  className="icon-btn labeled-tool"
                  disabled={!!busy}
                  onClick={() => setZoom(100)}
                >
                  <Expand size={16} />
                  <span>Sığdır</span>
                </IconButton>
                {active && (
                  <IconButton
                    label="Sayfayı döndür"
                    className="icon-btn labeled-tool"
                    disabled={!!busy}
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                  >
                    <RotateCw size={16} />
                    <span>Döndür</span>
                  </IconButton>
                )}
              </div>
            </div>
            <div className="crop-workbench">
              <div className="crop-scroll">
                {!render ? (
                  <div className="canvas-loading">
                    <LoaderCircle className="spin" /> Sayfa açılıyor…
                  </div>
                ) : (
                  <div
                    className="source-stage"
                    ref={sourceStage}
                    style={{
                      width: `${zoom}%`,
                      aspectRatio: `${render.width}/${render.height}`,
                    }}
                    onPointerDown={down}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={cancelPointer}
                    onLostPointerCapture={cancelPointer}
                  >
                    <div className="canvas-host" ref={attachCanvas} />
                    {candidates.map((r: Rect, i: number) => (
                      <button
                        key={i}
                        disabled={!!busy}
                        title={`${i + 1}. olası soruyu seç`}
                        aria-label={`${i + 1}. olası soruyu seç`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          selectedCandidate.current = r;
                          confirmSelection(r);
                        }}
                        className="candidate"
                        style={{
                          left: `${(r.x / render.width) * 100}%`,
                          top: `${(r.y / render.height) * 100}%`,
                          width: `${(r.w / render.width) * 100}%`,
                          height: `${(r.h / render.height) * 100}%`,
                        }}
                      >
                        <span>{i + 1}</span>
                      </button>
                    ))}
                    {selection && (
                      <div
                        className="selection interactive-selection"
                        ref={selectionFrame}
                        role="application"
                        aria-label="Seçilen soru çerçevesi; ok tuşlarıyla taşıyın"
                        tabIndex={0}
                        onPointerDown={(e) => transformStart(e, 'move')}
                        onKeyDown={(e) => cropKeyboard(e)}
                        style={{
                          left: `${(selection.x / render.width) * 100}%`,
                          top: `${(selection.y / render.height) * 100}%`,
                          width: `${(selection.w / render.width) * 100}%`,
                          height: `${(selection.h / render.height) * 100}%`,
                        }}
                      >
                        <span>Seçilen alan · Taşı / köşeden boyutlandır</span>
                        {(['nw', 'ne', 'sw', 'se'] as const).map(
                          (handle, i) => (
                            <button
                              key={handle}
                              className={`crop-handle handle-${handle}`}
                              type="button"
                              aria-label={`${['Sol üst', 'Sağ üst', 'Sol alt', 'Sağ alt'][i]} köşeyi boyutlandır`}
                              onPointerDown={(e) => transformStart(e, handle)}
                              onKeyDown={(e) => cropKeyboard(e, handle)}
                            />
                          ),
                        )}
                      </div>
                    )}
                    {selection && selectionReady && (
                      <div
                        className="floating-crop-answer"
                        style={{
                          top: `calc(${((selection.y + selection.h) / render.height) * 100}% + 10px)`,
                          left: `clamp(0px, ${(selection.x / render.width) * 100}%, max(0px, 100% - 300px))`,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerMove={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                      >
                        <span>
                          {editing
                            ? questions.findIndex((q) => q.id === editing) + 1
                            : questions.length + 1}
                          . soru · Cevap
                        </span>
                        <div className="floating-answer-row">
                          <AnswerPicker
                            value={draftAnswer}
                            onChange={setDraftAnswer}
                            disabled={!!busy}
                          />
                          <button
                            type="button"
                            className="floating-add"
                            aria-label={
                              editing
                                ? 'Seçilen sorunun kırpmasını güncelle'
                                : 'Seçilen soruyu ekle'
                            }
                            disabled={
                              !!busy || selection.w < 5 || selection.h < 5
                            }
                            onClick={() => void addSelection()}
                          >
                            {busy ? (
                              <LoaderCircle size={13} className="spin" />
                            ) : (
                              <Plus size={13} />
                            )}
                            {editing ? 'Güncelle' : 'Ekle'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <aside
                className="crop-inspector"
                aria-label="Soru seçimi araçları"
              >
                <div className="crop-instruction">
                  <span className="step-number">01</span>
                  <h2>Soru alanını seçin</h2>
                  <p>
                    Alanı çizin; çerçeveyi taşıyın veya köşelerinden
                    boyutlandırın. Ok tuşları: 1 birim, Shift + ok: 10 birim.
                  </p>
                </div>
                <div className="crop-actions">
                  <div className="crop-tool-options">
                    <Toggle
                      label="Kenarları kırp"
                      checked={trim}
                      onChange={setTrim}
                    />
                    <button
                      className="secondary detect-button"
                      disabled={!render || !!busy || active?.kind !== 'pdf'}
                      onClick={detect}
                    >
                      <ScanLine size={16} /> Soruları otomatik bul
                    </button>
                    {candidates.length > 0 && (
                      <div className="detected-question-actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={!!busy || !render}
                          onClick={() => void addDetectedQuestions()}
                        >
                          {busy.startsWith('Sorular ekleniyor') ? (
                            <LoaderCircle size={16} className="spin" />
                          ) : (
                            <Plus size={16} />
                          )}
                          {busy.startsWith('Sorular ekleniyor')
                            ? busy
                            : `Tüm soruları ekle (${candidates.length})`}
                        </button>
                        <small>
                          Bu sayfada bulunan soruları ekler. Cevapları sonra
                          düzenleyebilirsiniz.
                        </small>
                      </div>
                    )}
                    <Popover>
                      <PopoverTrigger
                        disabled={!!busy}
                        render={
                          <button
                            type="button"
                            className="secondary"
                            aria-label="Hassas kesim"
                          />
                        }
                      >
                        <SlidersHorizontal size={16} /> Hassas kesim
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        className="precise-popover"
                        aria-label="Hassas kesim araçları"
                      >
                        <strong>Hassas kesim</strong>
                        <div className="precise-controls">
                          <button
                            className="secondary"
                            disabled={!render || !!busy}
                            onClick={() => {
                              selectedCandidate.current = null;
                              if (render)
                                confirmSelection({
                                  x: 0,
                                  y: 0,
                                  w: render.width,
                                  h: render.height,
                                });
                            }}
                          >
                            Tüm sayfayı seç
                          </button>
                          {render &&
                            selection &&
                            (['x', 'y', 'w', 'h'] as const).map((key, i) => (
                              <label key={key}>
                                {
                                  [
                                    'Sol %',
                                    'Üst %',
                                    'Genişlik %',
                                    'Yükseklik %',
                                  ][i]
                                }
                                <input
                                  type="number"
                                  disabled={!!busy}
                                  min={0}
                                  max={100}
                                  step={0.1}
                                  value={
                                    Math.round(
                                      (selection[key] /
                                        (key === 'x' || key === 'w'
                                          ? render.width
                                          : render.height)) *
                                        1000,
                                    ) / 10
                                  }
                                  onChange={(e) => {
                                    const dimension =
                                      key === 'x' || key === 'w'
                                        ? render.width
                                        : render.height;
                                    const next = {
                                      ...selection,
                                      [key]:
                                        (Math.max(
                                          0,
                                          Math.min(100, +e.target.value),
                                        ) *
                                          dimension) /
                                        100,
                                    };
                                    next.x = Math.min(next.x, render.width - 1);
                                    next.y = Math.min(
                                      next.y,
                                      render.height - 1,
                                    );
                                    next.w = Math.min(
                                      next.w,
                                      render.width - next.x,
                                    );
                                    next.h = Math.min(
                                      next.h,
                                      render.height - next.y,
                                    );
                                    confirmSelection(next);
                                  }}
                                />
                              </label>
                            ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="crop-answer-section">
                    <div className="crop-section-title">
                      <span className="step-number">02</span>
                      <h2>Cevabı işaretleyin</h2>
                    </div>
                    {selection && selectionReady && (
                      <p className="selected-answer-summary">
                        Cevap: <b>{draftAnswer || 'Belirtilmedi'}</b>
                        <br />
                        Çerçevenin altındaki kutulardan seçin.
                      </p>
                    )}
                    {(!selection || !selectionReady) && (
                      <p className="answer-placeholder">
                        Cevap kutuları seçtiğiniz çerçevenin hemen altında
                        görünür.
                      </p>
                    )}
                  </div>
                  <div className="crop-submit-actions">
                    {selection && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={!!busy}
                        onClick={() => {
                          setSelection(null);
                          setSelectionReady(false);
                          selectedCandidate.current = null;
                          if (!editing) setDraftAnswer('');
                        }}
                      >
                        <X size={17} /> Seçimi sil
                      </button>
                    )}
                    <button
                      className="primary"
                      disabled={
                        !selection ||
                        selection.w < 5 ||
                        selection.h < 5 ||
                        !!busy
                      }
                      onClick={() => void addSelection()}
                    >
                      <Plus size={17} />
                      {editing ? 'Kırpmayı güncelle' : 'Soruyu ekle'}
                    </button>
                  </div>
                </div>
                <div className="crop-inspector-note">
                  <MousePointer2 size={15} />
                  <span>Ekledikten sonra sıradaki soruyu seçebilirsiniz.</span>
                </div>
              </aside>
            </div>
          </>
          {(cropError || error) && (
            <p className="crop-dialog-error" role="alert">
              {cropError || error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="preview-dialog">
          <DialogTitle>PDF baskı önizlemesi</DialogTitle>
          <DialogDescription>
            İndireceğiniz PDF’nin gerçek sayfaları · A4
          </DialogDescription>
          <PdfPreview data={previewData} />
          <button
            className="primary"
            onClick={() =>
              previewData &&
              download(previewData, `${settings.title || 'test'}.pdf`)
            }
          >
            <Download size={17} /> Bu PDF’yi indir
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

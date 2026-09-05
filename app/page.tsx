/* oxlint-disable react/react-compiler, next/no-img-element, jsx-a11y/no-noninteractive-element-interactions */
// Local canvas previews use data URLs; pointer crop and drag actions have button alternatives.
'use client';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FilePlus2,
  ScanLine,
  ArrowRight,
  FileText,
  ShieldCheck,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
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
  columnDividerSegments,
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
    sourceStage = useRef<HTMLDivElement>(null),
    answerBar = useRef<HTMLDivElement>(null),
    pendingEdit = useRef<Question | null>(null),
    pointer = useRef<{ id: number; x: number; y: number } | null>(null),
    addingQuestion = useRef(false),
    dragged = useRef<number | null>(null);
  const active = sources.find((s) => s.id === activeId);
  const change = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));
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
  const remember = () => setUndo(questions);
  const notice = (s: string) => {
    setMessage(s);
    setTimeout(() => setMessage(''), 4500);
  };
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
    if (selectionReady)
      answerBar.current?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
  }, [selectionReady, selection]);
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
      notice('Özgün örnek belge eklendi.');
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  const selectSource = (id: string) => {
    if (busy) return;
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
    setSelection(null);
    setSelectionReady(false);
  }
  function move(e: React.PointerEvent) {
    if (!pointer.current || pointer.current.id !== e.pointerId || !render)
      return;
    setSelection(selectionRect(pointer.current, point(e)));
  }
  function up(e: React.PointerEvent) {
    const start = pointer.current;
    if (!start || start.id !== e.pointerId) return;
    const rect = selectionRect(start, point(e));
    pointer.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (rect.w < 5 || rect.h < 5) {
      setSelection(null);
      return;
    }
    confirmSelection(rect);
  }
  function cancelPointer() {
    if (!pointer.current) return;
    pointer.current = null;
    setSelection(null);
  }
  async function addSelection() {
    if (
      !selection ||
      !active ||
      !render ||
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
                  ...q,
                  id: old.id,
                  wide: old.wide,
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
    } catch (e: unknown) {
      setCropError(errorMessage(e));
      setError(errorMessage(e));
    } finally {
      addingQuestion.current = false;
      setBusy('');
    }
  }
  async function detect() {
    if (!render || !active) return;
    setBusy('Soru sınırları aranıyor…');
    try {
      const rects = await detectQuestions(render, active.columns);
      setCandidates(rects);
      notice(
        rects.length
          ? `${rects.length} olası soru bulundu. Eklemek için bir çerçeve seçin.`
          : 'Numaralı soru sınırı bulunamadı. Sorunun etrafında sürükleyerek seçin.',
      );
    } catch {
      setError('Otomatik seçim yapılamadı. Elle kırpmaya devam edebilirsiniz.');
    } finally {
      setBusy('');
    }
  }
  function updateQuestion(id: string, update: Partial<Question>) {
    setQuestions((q) =>
      q.map((it) => (it.id === id ? { ...it, ...update } : it)),
    );
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
          : 0;
      pendingEdit.current = q;
      setActiveId(q.sourceId);
      setPage(q.page);
      setRotation(angle);
      setEditing(q.id);
      setDraftAnswer(q.answer);
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
    <main onDragOver={(e) => e.preventDefault()} onDrop={fileDrop}>
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
        <div className="brand">
          <span className="brandmark">
            <ScanLine />
          </span>
          Test Atölyesi
        </div>
        <span className="quiet">
          <ShieldCheck size={16} /> Dosyalarınız cihazınızda kalır
        </span>
        <div className="header-actions">
          {questions.length > 0 && (
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

      {!sources.length ? (
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
              <h2>İlk kaynağınızı ekleyin</h2>
              <p>PDF veya görsellerinizi buraya sürükleyin.</p>
              <button
                className="primary"
                onClick={() => input.current?.click()}
                disabled={!!busy}
              >
                <Plus size={17} />
                Dosya seç
              </button>
              <small>PDF, PNG, JPG, WebP · Dosya başına 100 MB</small>
              <button
                className="text-btn demo"
                onClick={demo}
                disabled={!!busy}
              >
                Örnek belgeyle dene <ArrowRight size={15} />
              </button>
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
      ) : (
        <>
          <div className="projectbar">
            <div>
              <span className="eyebrow">ÇALIŞMA ALANI</span>
              <h1>Testinizi hazırlayın</h1>
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
            <aside className="source-panel">
              <div className="panel-heading">
                <h2>Kaynaklar</h2>
                <IconButton
                  label="Kaynak ekle"
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
                        {s.pages} sayfa · {s.kind === 'pdf' ? 'PDF' : 'Görsel'}
                      </small>
                    </span>
                    {s.id === activeId && <span className="active-dot" />}
                  </button>
                ))}
              </div>
              {sourceControls}
              <div className="source-tip">
                <MousePointer2 size={18} />
                <p>
                  Soru seçmek için bir kaynağı açın. Seçtiğiniz sorular ana
                  alanda birikir.
                </p>
              </div>
            </aside>
            <div className="center-panel">
              <div className="stage-header">
                <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                  <TabsList>
                    <TabsTrigger value="questions">
                      <FileText size={15} /> Seçilen sorular
                    </TabsTrigger>
                    <TabsTrigger value="layout">
                      <LayoutTemplate size={15} /> A4 yerleşimi
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
              {tab === 'questions' ? (
                <div className="question-tray question-workspace">
                  <div className="tray-heading">
                    <h2>
                      Sorular <span>{questions.length}</span>
                    </h2>
                    <span className="quiet">Sürükleyerek sıralayın</span>
                    <IconButton
                      label="Son silme veya sıralamayı geri al"
                      disabled={!undo}
                      onClick={() => {
                        if (undo) {
                          setQuestions(undo);
                          setUndo(null);
                        }
                      }}
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
                              className={`width-toggle ${q.wide ? 'on' : ''}`}
                              onClick={() =>
                                updateQuestion(q.id, { wide: !q.wide })
                              }
                            >
                              {q.wide ? 'Tam genişlik' : 'Tek sütun'}
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

                          <small className="q-quality">
                            {q.fontSize
                              ? `${q.fontSize} pt · Özgün PDF`
                              : sources.find((s) => s.id === q.sourceId)
                                    ?.kind === 'pdf'
                                ? 'Özgün PDF'
                                : (() => {
                                    const placement = layout.pages
                                      .flatMap((p) => p.items)
                                      .find((i) => i.q.id === q.id);
                                    return placement
                                      ? `${Math.round((72 / placement.scale) * Math.min(1, Math.sqrt(24000000 / (q.rect.w * q.rect.h))))} DPI · Görsel`
                                      : 'Orijinal görsel';
                                  })()}
                          </small>
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
                <div className="layout-scroll">
                  {layout.error ? (
                    <div className="layout-error">
                      <LayoutTemplate size={28} />
                      <h2>Yerleşimi ayarlayalım</h2>
                      <p>{layout.error}</p>
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
                    layout.pages.map((p, pi) => (
                      <div key={pi} className="paper-wrap">
                        <div
                          className="paper"
                          style={{ aspectRatio: `${PAGE.w}/${PAGE.h}` }}
                        >
                          <div
                            className="paper-school"
                            style={{
                              left: `${(settings.margin / 210) * 100}%`,
                            }}
                          >
                            {settings.school}
                          </div>
                          <div
                            className="paper-title"
                            style={{
                              left: `${(settings.margin / 210) * 100}%`,
                              right: `${(settings.margin / 210) * 100}%`,
                            }}
                          >
                            {settings.title}
                          </div>
                          <div
                            className="paper-subtitle"
                            style={{
                              left: `${(settings.margin / 210) * 100}%`,
                            }}
                          >
                            {settings.subtitle}
                          </div>
                          <div
                            className="paper-rule"
                            style={{
                              borderColor: settings.lineColor || undefined,
                            }}
                          />
                          {settings.student && (
                            <div className="paper-student">
                              Adı Soyadı:{' '}
                              <span
                                style={{
                                  color: settings.lineColor || undefined,
                                }}
                              >
                                ....................................
                              </span>{' '}
                              Sınıf / No:{' '}
                              <span
                                style={{
                                  color: settings.lineColor || undefined,
                                }}
                              >
                                ...........
                              </span>{' '}
                              Tarih:{' '}
                              <span
                                style={{
                                  color: settings.lineColor || undefined,
                                }}
                              >
                                ...........
                              </span>
                            </div>
                          )}
                          {columnDividerSegments(p, settings).map(
                            (segment, i) => (
                              <div
                                key={i}
                                className="paper-column-divider"
                                style={{
                                  top: `${(segment.top / PAGE.h) * 100}%`,
                                  height: `${((segment.bottom - segment.top) / PAGE.h) * 100}%`,
                                  borderColor: settings.lineColor || '#b8c2c7',
                                }}
                              />
                            ),
                          )}
                          {p.items.map((it) => (
                            <div
                              key={it.q.id}
                              className="placed-question"
                              style={{
                                left: `${(it.x / PAGE.w) * 100}%`,
                                top: `${(it.y / PAGE.h) * 100}%`,
                                width: `${(it.w / PAGE.w) * 100}%`,
                                height: `${(it.h / PAGE.h) * 100}%`,
                              }}
                            >
                              <span
                                className={`paper-number number-${settings.numberStyle}`}
                                style={{
                                  color: settings.numberColor || undefined,
                                  borderColor: settings.lineColor || '#b8c2c7',
                                  ...(settings.numberStyle !== 'plain'
                                    ? {
                                        fontSize: `${(Math.min(9, settings.numberStyle === 'circle' || settings.numberStyle === 'square' ? 10 / (String(it.index + 1).length * 0.636) : 14 / ((String(it.index + 1).length + 0.5) * 0.556)) / PAGE.w) * 100}cqw`,
                                      }
                                    : {}),
                                }}
                              >
                                {it.index + 1}
                                {settings.numberStyle === 'circle' ||
                                settings.numberStyle === 'square'
                                  ? ''
                                  : '.'}
                              </span>
                              <img
                                src={it.q.thumb}
                                alt={`${it.index + 1}. soru`}
                              />
                            </div>
                          ))}
                          <div
                            className="paper-footer"
                            style={{
                              borderColor: settings.lineColor || undefined,
                            }}
                          >
                            <span>{questions.length} soru</span>
                            <span>
                              {pi + 1} / {layout.pages.length}
                            </span>
                          </div>
                        </div>
                        <span className="paper-label">Sayfa {pi + 1} · A4</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <aside className="settings-panel">
              <div className="panel-heading">
                <h2>Sayfa düzeni</h2>
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
                  <TabsContent value="layout" className="settings-tab-panel">
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
                      Sayfa başına soru hedefi
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
                    <Toggle
                      label="Boşlukları dengeli dağıt"
                      checked={settings.balance}
                      onChange={(v) => change('balance', v)}
                    />
                  </TabsContent>
                  <TabsContent value="style" className="settings-tab-panel">
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
        </>
      )}
      <Dialog
        open={cropOpen}
        onOpenChange={changeCropOpen}
        disablePointerDismissal
      >
        <DialogContent className="crop-dialog" showCloseButton={false}>
          <DialogTitle className="sr-only">
            {editing ? 'Soruyu düzenle' : 'PDF veya görselden soru seç'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Soru sınırlarını çizip cevabını seçin.
          </DialogDescription>
          <div className="crop-topbar">
            <FileText size={21} className="crop-source-icon" />
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
            <span className="crop-question-count">{questions.length} soru</span>
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
              <Check size={17} /> Bitti
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
                {active?.kind === 'pdf' && (
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
            <div className="crop-scroll">
              {!render ? (
                <div className="canvas-loading">
                  <LoaderCircle className="spin" /> Sayfa açılıyor…
                </div>
              ) : (
                <div
                  className={`source-stage ${selection && selectionReady ? 'has-answer-bar' : ''}`}
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
                      onClick={() => confirmSelection(r)}
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
                      className="selection"
                      style={{
                        left: `${(selection.x / render.width) * 100}%`,
                        top: `${(selection.y / render.height) * 100}%`,
                        width: `${(selection.w / render.width) * 100}%`,
                        height: `${(selection.h / render.height) * 100}%`,
                      }}
                    >
                      <span>Seçilen alan</span>
                    </div>
                  )}
                  {selection && selectionReady && (
                    <div
                      className="selection-answer-bar"
                      ref={answerBar}
                      style={{
                        left: `min(${(selection.x / render.width) * 100}%, max(0px, calc(100% - 292px)))`,
                        top: `calc(${((selection.y + selection.h) / render.height) * 100}% + 8px)`,
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerMove={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                    >
                      <strong>
                        {editing
                          ? questions.findIndex((q) => q.id === editing) + 1
                          : questions.length + 1}
                        . soru · Doğru cevap
                      </strong>
                      <AnswerPicker
                        value={draftAnswer}
                        onChange={setDraftAnswer}
                        disabled={!!busy}
                      />
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => void addSelection()}
                      >
                        {busy ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <Plus size={16} />
                        )}
                        {busy
                          ? 'Ekleniyor…'
                          : editing
                            ? 'Soruyu güncelle'
                            : 'Soruyu teste ekle'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="crop-actions">
              <div>
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
                  <ScanLine size={16} /> Sınırları bul
                </button>
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
                        onClick={() =>
                          render &&
                          confirmSelection({
                            x: 0,
                            y: 0,
                            w: render.width,
                            h: render.height,
                          })
                        }
                      >
                        Tüm sayfayı seç
                      </button>
                      {render &&
                        selection &&
                        (['x', 'y', 'w', 'h'] as const).map((key, i) => (
                          <label key={key}>
                            {['Sol %', 'Üst %', 'Genişlik %', 'Yükseklik %'][i]}
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
                                next.y = Math.min(next.y, render.height - 1);
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
              <div>
                {selection && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => {
                      setSelection(null);
                      setSelectionReady(false);
                      if (!editing) setDraftAnswer('');
                    }}
                  >
                    <X size={17} /> Seçimi sil
                  </button>
                )}
                <button
                  className="primary"
                  disabled={
                    !selection || selection.w < 5 || selection.h < 5 || !!busy
                  }
                  onClick={() => void addSelection()}
                >
                  <Plus size={17} />
                  {editing ? 'Kırpmayı güncelle' : 'Soruyu ekle'}
                </button>
              </div>
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

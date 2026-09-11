/* oxlint-disable next/no-img-element, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */
// The keyboard-operable A4 canvas uses role=application; all questions are buttons.
// Local source crops share the PDF layout; they are not remote images.
'use client';
import React, { useEffect, useRef, useState } from 'react';
import {
  Move,
  Plus,
  Scissors,
  SlidersHorizontal,
  Undo2,
  Info,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  QuestionOptions,
  QuestionQuality,
} from '@/components/question-options';
import {
  PAGE,
  columnDividerSegments,
  placementsOverlap,
  rasterCrop,
  type LayoutPage,
  type Placement,
  type Question,
  type Settings,
  type Source,
} from '@/lib/pdf-engine';

function QuestionPreview({
  question,
  source,
  width,
  alt,
}: {
  question: Question;
  source?: Source;
  width: number;
  alt: string;
}) {
  const [preview, setPreview] = useState<{
    question: Question;
    source: Source;
    width: number;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let url: string | undefined;
    // Render from the original source, never upscale the small list thumbnail.
    // A4 is displayed at at most 595 CSS pixels, so 300 DPI also covers Retina.
    const dpi = Math.max(300, 72 * (window.devicePixelRatio || 1));
    void rasterCrop(source, question, width, dpi)
      .then((bytes) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        setPreview({ question, source, width, url });
      })
      .catch(() => {
        // Keep the existing thumbnail available if a source cannot be rendered.
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, question, width]);

  return (
    <img
      src={
        preview?.question === question &&
        preview.source === source &&
        preview.width === width
          ? preview.url
          : question.thumb
      }
      alt={alt}
      draggable={false}
    />
  );
}

type Drop = { page: number; item: Placement; valid: boolean };
export function LayoutEditor({
  pages,
  sources,
  settings,
  header,
  onEdit,
  onUpdate,
  onMove,
  onRemoveQuestion,
  onRemovePage,
  onUndo,
  canUndo,
}: {
  pages: LayoutPage[];
  sources: Source[];
  settings: Settings;
  header: React.ReactNode;
  onEdit: (q: Question) => void;
  onUpdate: (id: string, update: Partial<Question>) => void;
  onMove: (id: string, page: number, x: number, y: number) => boolean;
  onRemoveQuestion: (id: string) => void;
  onRemovePage: (page: number) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [menuId, setMenuId] = useState('');
  const [menuView, setMenuView] = useState<'actions' | 'options'>('actions');
  const [extraPages, setExtraPages] = useState(0);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [placing, setPlacing] = useState(false);
  const [draggingId, setDraggingId] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const papers = useRef(new Map<number, HTMLDivElement>());
  const pageToReveal = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const drag = useRef<{
    item: Placement;
    id: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  const active = pages
    .flatMap((p) => p.items)
    .find((it) => it.q.id === selected);
  const visiblePages = [
    ...pages,
    ...Array.from({ length: extraPages }, () => ({
      items: [],
      contentTop: (settings.margin * 72) / 25.4,
    })),
  ];

  function locate(
    clientX: number,
    clientY: number,
    item: Placement,
    offsetX = 0,
    offsetY = 0,
  ): Drop | null {
    for (const [page, el] of papers.current) {
      const box = el.getBoundingClientRect();
      if (
        clientX < box.left ||
        clientX > box.right ||
        clientY < box.top ||
        clientY > box.bottom
      )
        continue;
      const margin = (settings.margin * 72) / 25.4;
      const top = visiblePages[page]?.contentTop ?? margin;
      const x = Math.max(
        margin + 17,
        Math.min(
          PAGE.w - margin - item.w,
          ((clientX - box.left) / box.width) * PAGE.w - offsetX,
        ),
      );
      const y = Math.max(
        top,
        Math.min(
          PAGE.h - margin - 22 - item.h,
          ((clientY - box.top) / box.height) * PAGE.h - offsetY,
        ),
      );
      const proposed = { ...item, x, y };
      const others =
        visiblePages[page]?.items.filter((other) => other.q.id !== item.q.id) ??
        [];
      return {
        page,
        item: proposed,
        valid:
          x + item.w <= PAGE.w - margin + 0.01 &&
          y + item.h <= PAGE.h - margin - 22 + 0.01 &&
          !others.some(
            (other) => other.q.ownPage || placementsOverlap(proposed, other),
          ),
      };
    }
    return null;
  }
  useEffect(() => {
    if (pageToReveal.current === null) return;
    const frame = requestAnimationFrame(() => {
      const last = papers.current.get(pageToReveal.current!);
      last?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      pageToReveal.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [extraPages, pages.length]);
  const locateRef = useRef(locate);
  useEffect(() => {
    locateRef.current = locate;
  });
  useEffect(() => {
    if (!draggingId) return;
    let frame = 0;
    function tick() {
      const d = drag.current,
        el = scroll.current;
      if (d?.moved && el) {
        const box = el.getBoundingClientRect();
        const speed = d.y < box.top + 60 ? -14 : d.y > box.bottom - 60 ? 14 : 0;
        if (speed) {
          el.scrollTop += speed;
          setDrop(locateRef.current(d.x, d.y, d.item, d.offsetX, d.offsetY));
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draggingId]);

  function start(e: React.PointerEvent<HTMLButtonElement>, item: Placement) {
    if (e.button !== 0 || !e.isPrimary) return;
    if (placing) return;
    const box = e.currentTarget.getBoundingClientRect();
    setSelected(item.q.id);
    setMenuId('');
    suppressClick.current = false;
    drag.current = {
      item,
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offsetX: ((e.clientX - box.left) / box.width) * item.w,
      offsetY: ((e.clientY - box.top) / box.height) * item.h,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved ||= Math.hypot(d.x - d.startX, d.y - d.startY) > 5;
    if (d.moved) {
      setDraggingId(d.item.q.id);
      setDrop(locate(d.x, d.y, d.item, d.offsetX, d.offsetY));
    }
  }
  function end(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    suppressClick.current = d.moved;
    if (d.moved) {
      const target = locate(e.clientX, e.clientY, d.item, d.offsetX, d.offsetY);
      if (target?.valid) {
        if (onMove(d.item.q.id, target.page, target.item.x, target.item.y))
          setExtraPages(0);
      }
    }
    setDrop(null);
    setDraggingId('');
  }
  function cancel() {
    setDraggingId('');
    drag.current = null;
    setDrop(null);
    suppressClick.current = true;
  }
  function removePage(page: number) {
    pageToReveal.current = null;
    setDrop(null);
    setPlacing(false);
    setMenuId('');
    if (visiblePages[page]?.items.some((it) => it.q.id === selected))
      setSelected('');
    if (page >= pages.length) setExtraPages((n) => Math.max(0, n - 1));
    else onRemovePage(page);
  }
  function keyboard(e: React.KeyboardEvent, item: Placement, page: number) {
    if (e.key === 'Escape') {
      cancel();
      setPlacing(false);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const dx =
      e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (dx || dy) {
      e.preventDefault();
      onMove(item.q.id, page, item.x + dx, item.y + dy);
    }
  }
  return (
    <div className="layout-editor">
      <div className="layout-tools">
        <span className="layout-hint">
          {placing && active
            ? `${active.index + 1}. soru için boş alana tıklayın`
            : 'Soruyu sürükleyin · Ayarlar için düğmesini kullanın'}
        </span>
        {placing && (
          <button
            className="icon-btn"
            title="Taşımayı iptal et"
            aria-label="Taşımayı iptal et"
            onClick={() => {
              setPlacing(false);
              setDrop(null);
            }}
          >
            <X size={15} />
          </button>
        )}
        <button
          className="secondary add-page-button"
          title="Sonuna boş bir sayfa açar. Üzerine soru taşıdığınızda PDF’ye eklenir."
          onClick={() => {
            pageToReveal.current = pages.length + extraPages;
            setExtraPages((n) => n + 1);
            setMenuId('');
          }}
        >
          <Plus size={15} /> Soru için sayfa ekle
        </button>
        <button
          className="icon-btn"
          title="Son düzenlemeyi geri al"
          aria-label="Son düzenlemeyi geri al"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={16} />
        </button>
        <Popover>
          <PopoverTrigger
            render={
              <button
                className="icon-btn"
                aria-label="A4 Önizleme kullanım ipuçları"
                title="Kullanım ipuçları"
              />
            }
          >
            <Info size={16} />
          </PopoverTrigger>
          <PopoverContent align="end" className="preview-help">
            <strong>A4 Önizleme</strong>
            <p>
              Soruyu boş bir alana sürükleyin. Sayfalar arasında taşımak için
              üst veya alt kenarda bekletin.
            </p>
            <p>
              Sorunun ayar düğmesinden kırpma, boyut ve konum araçlarını açın.{' '}
              <b>Konum seç</b> ile sürüklemeden de taşıyabilirsiniz.
            </p>
            <p>
              <b>Soru için sayfa ekle</b>, sona boş bir sayfa açar. Bu sayfa,
              üzerine soru taşıdığınızda PDF’ye eklenir.
            </p>
            <p>
              Ok tuşları 1, Shift + ok 10 birim taşır. Soru numaraları korunur;
              sorular üst üste bırakılamaz.
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <div
        className={`layout-scroll ${placing ? 'is-placing' : ''}`}
        ref={scroll}
      >
        {visiblePages.map((p, pi) => (
          <div key={pi} className="paper-wrap">
            <div
              className="paper"
              role="application"
              tabIndex={0}
              aria-label={`A4 sayfa ${pi + 1}; seçilen soruyu yerleştirin`}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  cancel();
                  setPlacing(false);
                }
              }}
              ref={(el) => {
                if (el) papers.current.set(pi, el);
                else papers.current.delete(pi);
              }}
              style={{ aspectRatio: `${PAGE.w}/${PAGE.h}` }}
              onPointerMove={(e) => {
                if (placing && active)
                  setDrop(locate(e.clientX, e.clientY, active));
              }}
              onClick={(e) => {
                if (!placing || !active) return;
                const target = locate(e.clientX, e.clientY, active);
                if (
                  target?.valid &&
                  onMove(active.q.id, target.page, target.item.x, target.item.y)
                ) {
                  setPlacing(false);
                  setDrop(null);
                  setExtraPages(0);
                }
              }}
            >
              {pi === 0 && header}
              {!p.items.length && (
                <div className="empty-page-actions">
                  <span>Boş sayfa · {pi + 1}</span>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`${pi + 1}. boş sayfayı sil`}
                    disabled={!!draggingId}
                    onClick={(e) => {
                      e.stopPropagation();
                      removePage(pi);
                    }}
                  >
                    <Trash2 size={14} /> Sayfayı sil
                  </button>
                </div>
              )}
              {!p.items.length && (
                <div className="empty-placement-page">
                  <Move size={28} />
                  <strong>
                    {placing && active
                      ? `${active.index + 1}. soruyu yerleştirmek için buraya tıklayın`
                      : 'Soruyu bu sayfaya taşıyın'}
                  </strong>
                  <p>
                    Sürükleyin veya sorunun ayar menüsünden <b>Konum seç</b>{' '}
                    aracını kullanın.
                  </p>
                  <small>Üzerine soru taşıdığınızda PDF’ye eklenir.</small>
                </div>
              )}
              {columnDividerSegments(p, settings).map((segment, i) => (
                <div
                  key={i}
                  className="paper-column-divider"
                  style={{
                    top: `${(segment.top / PAGE.h) * 100}%`,
                    height: `${((segment.bottom - segment.top) / PAGE.h) * 100}%`,
                    borderColor: settings.lineColor || '#b8c2c7',
                  }}
                />
              ))}
              {p.items.map((it) => (
                <div
                  key={it.q.id}
                  className={`placed-question ${selected === it.q.id ? 'selected' : ''} ${menuId === it.q.id ? 'menu-open' : ''} ${draggingId === it.q.id ? 'being-dragged' : ''}`}
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
                  <button
                    className="placed-image"
                    aria-label={`${it.index + 1}. soruyu seç veya taşı`}
                    aria-pressed={selected === it.q.id}
                    onPointerDown={(e) => start(e, it)}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={cancel}
                    onKeyDown={(e) => keyboard(e, it, pi)}
                    onClick={(e) => {
                      if (placing) return;
                      e.stopPropagation();
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      setSelected(it.q.id);
                      setMenuId('');
                    }}
                  >
                    <QuestionPreview
                      question={it.q}
                      source={sources.find(
                        (source) => source.id === it.q.sourceId,
                      )}
                      width={it.w}
                      alt={`${it.index + 1}. soru`}
                    />
                  </button>
                  <Popover
                    open={menuId === it.q.id}
                    onOpenChange={(open) => {
                      setMenuId(open ? it.q.id : '');
                      if (open) {
                        setSelected(it.q.id);
                        setMenuView('actions');
                        setPlacing(false);
                        setDrop(null);
                      }
                    }}
                  >
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className="placement-select"
                          aria-label={`${it.index + 1}. soru ayarları`}
                          title={`${it.index + 1}. soruyu ayarla`}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        />
                      }
                    >
                      <SlidersHorizontal size={15} />
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      side="bottom"
                      sideOffset={6}
                      className="preview-question-menu"
                      aria-label={`${it.index + 1}. soru düzenleme araçları`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {menuView === 'options' ? (
                        <>
                          <button
                            className="text-btn menu-back"
                            onClick={() => setMenuView('actions')}
                          >
                            <ChevronLeft size={14} /> Soru araçları
                          </button>
                          <QuestionOptions
                            question={it.q}
                            index={it.index}
                            item={it}
                            settings={settings}
                            onChange={(update) => onUpdate(it.q.id, update)}
                          />
                        </>
                      ) : (
                        <>
                          <div className="preview-question-heading">
                            <strong>{it.index + 1}. soru</strong>
                            <QuestionQuality
                              item={it}
                              threshold={settings.minFontSize}
                            />
                          </div>
                          <button
                            className="question-menu-action"
                            onClick={() => {
                              setMenuId('');
                              onEdit(it.q);
                            }}
                          >
                            <Scissors size={16} />
                            <span>Kırpmayı düzenle</span>
                            <ChevronRight size={14} />
                          </button>
                          <button
                            className="question-menu-action"
                            onClick={() => setMenuView('options')}
                          >
                            <SlidersHorizontal size={16} />
                            <span>Boyut / yerleşim</span>
                            <ChevronRight size={14} />
                          </button>
                          <button
                            className="question-menu-action"
                            onClick={() => {
                              setSelected(it.q.id);
                              setMenuId('');
                              setPlacing(true);
                            }}
                          >
                            <Move size={16} />
                            <span>Konum seç</span>
                            <ChevronRight size={14} />
                          </button>
                          <button
                            type="button"
                            className="question-menu-action"
                            aria-label={`${it.index + 1}. soruyu sil`}
                            onClick={() => {
                              setMenuId('');
                              setSelected('');
                              setPlacing(false);
                              setDrop(null);
                              onRemoveQuestion(it.q.id);
                            }}
                          >
                            <Trash2 size={16} />
                            <span>Soruyu sil</span>
                          </button>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
              {drop?.page === pi && (
                <div
                  className={`placement-ghost ${drop.valid ? 'valid' : 'invalid'}`}
                  style={{
                    left: `${(drop.item.x / PAGE.w) * 100}%`,
                    top: `${(drop.item.y / PAGE.h) * 100}%`,
                    width: `${(drop.item.w / PAGE.w) * 100}%`,
                    height: `${(drop.item.h / PAGE.h) * 100}%`,
                  }}
                >
                  <QuestionPreview
                    question={drop.item.q}
                    source={sources.find(
                      (source) => source.id === drop.item.q.sourceId,
                    )}
                    width={drop.item.w}
                    alt=""
                  />
                  <span>
                    {drop.valid ? 'Buraya bırak' : 'Bu alan uygun değil'}
                  </span>
                </div>
              )}
              <div
                className="paper-footer"
                style={{ borderColor: settings.lineColor || undefined }}
              >
                <span>{pages.flatMap((page) => page.items).length} soru</span>
                <span>
                  {pi + 1} / {visiblePages.length}
                </span>
              </div>
            </div>
            <div className="paper-label">
              <span>
                Sayfa {pi + 1} · A4
                {pi >= pages.length ? ' · Soru taşıyınca çıktıya eklenir' : ''}
              </span>
              {!!p.items.length && (
                <button
                  type="button"
                  className="secondary remove-page-button"
                  aria-label={`${pi + 1}. sayfayı ve içindeki soruları sil`}
                  title="Bu sayfayı içindeki sorularla birlikte sil"
                  disabled={!!draggingId}
                  onClick={() => removePage(pi)}
                >
                  <Trash2 size={14} /> Sayfayı sil
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <output
        className={drop && !drop.valid ? 'layout-feedback invalid' : 'sr-only'}
      >
        {drop
          ? drop.valid
            ? `Sayfa ${drop.page + 1}: boş alana yerleştirilebilir.`
            : 'Bu alan uygun değil; soruyu boş bir alana taşıyın.'
          : ''}
      </output>
    </div>
  );
}

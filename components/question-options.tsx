'use client';
import { useId } from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  printedFontSize,
  type Question,
  type Placement,
  type Settings,
} from '@/lib/pdf-engine';

export function QuestionQuality({
  item,
  threshold,
}: {
  item?: Placement;
  threshold: number;
}) {
  if (!item) return null;
  const font = printedFontSize(item);
  return (
    <span
      className={`question-quality ${font !== null && font < threshold ? 'low-quality' : ''}`}
    >
      {font !== null
        ? `Baskı: ≈${font.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} pt${font < threshold ? ' · Küçük yazı' : ''}`
        : 'Punto ölçülemiyor · Görsel / tarama'}
    </span>
  );
}

export function QuestionOptions({
  question: q,
  index,
  item,
  settings,
  onChange,
}: {
  question: Question;
  index: number;
  item?: Placement;
  settings: Settings;
  onChange: (update: Partial<Question>) => void;
}) {
  const startId = useId();
  return (
    <div className="question-options">
      <strong>{index + 1}. soru · Boyut ve yerleşim</strong>
      <QuestionQuality item={item} threshold={settings.minFontSize} />
      <label className="toggle-row">
        Tam sayfa genişliği
        <Switch
          aria-label={`${index + 1}. soru tam genişlik`}
          checked={q.wide || !!q.ownPage}
          disabled={q.ownPage}
          onCheckedChange={(wide) => onChange({ wide, position: undefined })}
        />
      </label>
      <label className="toggle-row">
        Bu soruya ayrı sayfa
        <Switch
          aria-label={`${index + 1}. soru ayrı sayfa`}
          checked={!!q.ownPage}
          onCheckedChange={(ownPage) =>
            onChange({ ownPage, position: undefined })
          }
        />
      </label>
      <div className="range-field">
        <label>
          Yalnız bu sorunun boyutu <b>%{q.scale ?? 100}</b>
        </label>
        <Slider
          aria-label={`${index + 1}. sorunun bağımsız boyutu`}
          min={40}
          max={200}
          step={5}
          value={[q.scale ?? 100]}
          onValueChange={(v) =>
            onChange({ scale: Array.isArray(v) ? v[0] : v })
          }
        />
      </div>
      <small>
        Sayfa sınırına ulaşınca büyüme durur. Diğer soruların boyutu değişmez.
      </small>
      <label className="field" htmlFor={startId}>
        Sorunun başlangıcı
        <Select
          value={q.breakBefore || 'auto'}
          disabled={q.ownPage}
          onValueChange={(value) =>
            onChange({
              breakBefore:
                value === 'auto' ? undefined : (value as 'page' | 'column'),
              position: undefined,
            })
          }
        >
          <SelectTrigger
            id={startId}
            className="choice"
            aria-label={`${index + 1}. sorunun başlangıcı`}
          >
            <SelectValue>
              {q.breakBefore === 'page'
                ? 'Yeni sayfadan başlat'
                : q.breakBefore === 'column'
                  ? 'Yeni sütundan başlat'
                  : 'Akışa göre'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Akışa göre</SelectItem>
            <SelectItem value="column">Yeni sütundan başlat</SelectItem>
            <SelectItem value="page">Yeni sayfadan başlat</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {q.position && (
        <button
          className="secondary"
          onClick={() => onChange({ position: undefined })}
        >
          Otomatik yerleşime dön
        </button>
      )}
    </div>
  );
}

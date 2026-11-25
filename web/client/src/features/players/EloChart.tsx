import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '@/i18n';
import type { EloHistoryPoint } from '@/types/api';
import { formatNumber, formatShortDate } from '@/utils/format';

interface EloChartProps {
  history: EloHistoryPoint[];
  accentColor?: string;
}

export function EloChart({ history, accentColor = '#5865F2' }: EloChartProps) {
  const { t } = useTranslation();
  const lang = getAppLanguage();

  if (!history || history.length < 2) {
    return (
      <div className="p-4 rounded-xl bg-bg-elevated/50 border border-slate-800 text-xs text-slate-400 text-center">
        {t('players.detail.noHistory')}
      </div>
    );
  }

  const width = 560;
  const height = 160;
  const padX = 16;
  const padY = 18;

  const values = history.map((pt) => pt.elo);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = Math.max(100, maxVal - minVal);

  const points = history.map((pt, idx) => {
    const x = padX + (idx / (history.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (pt.elo - minVal) / range) * (height - padY * 2);
    return { x, y, pt };
  });

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${padX},${height - padY} ${polyline} ${width - padX},${height - padY}`;

  return (
    <div className="p-4 rounded-xl bg-bg-elevated/60 border border-slate-800 space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{t('players.detail.eloHistory')}</span>
        <span>
          {formatNumber(minVal, lang)} – {formatNumber(maxVal, lang)} Elo
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36 overflow-visible">
        <defs>
          <linearGradient id="eloFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#eloFillGrad)" />
        <polyline
          fill="none"
          stroke={accentColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polyline}
        />
        {points.map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r="3.2" fill={accentColor}>
            <title>
              {formatShortDate(p.pt.timestamp, lang)}: {formatNumber(p.pt.elo, lang)} Elo
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

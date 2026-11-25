import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_LIMITS } from '@/config/constants';

export type DurationUnit = 'm' | 'h' | 'd';

const UNIT_MULTIPLIER: Record<DurationUnit, number> = {
  m: 1,
  h: 60,
  d: 1440,
};

function inferUnit(mins: number): DurationUnit {
  if (mins >= 1440 && mins % 1440 === 0) return 'd';
  if (mins >= 60 && mins % 60 === 0) return 'h';
  return 'm';
}

function getUnitMax(unit: DurationUnit, maxMinutes: number): number {
  return Math.max(1, Math.floor(maxMinutes / UNIT_MULTIPLIER[unit]));
}

interface DurationUnitInputProps {
  minutes: number;
  onChangeMinutes: (nextMinutes: number) => void;
  maxMinutes?: number;
  disabled?: boolean;
}

export function DurationUnitInput({
  minutes,
  onChangeMinutes,
  maxMinutes = API_LIMITS.ESCALATION_MAX_DURATION_MIN,
  disabled = false,
}: DurationUnitInputProps) {
  const { t } = useTranslation();
  const safeMinutes = Math.min(maxMinutes, Math.max(1, Math.round(minutes || 1)));

  const [unit, setUnit] = useState<DurationUnit>(() => inferUnit(safeMinutes));
  const [amount, setAmount] = useState<number>(() =>
    Math.max(1, Math.round(safeMinutes / UNIT_MULTIPLIER[inferUnit(safeMinutes)])),
  );

  useEffect(() => {
    const currentTotal = Math.min(
      maxMinutes,
      Math.max(1, Math.round(amount * UNIT_MULTIPLIER[unit])),
    );
    if (currentTotal !== safeMinutes) {
      const nextUnit = inferUnit(safeMinutes);
      const nextAmount = Math.max(1, Math.round(safeMinutes / UNIT_MULTIPLIER[nextUnit]));
      setUnit(nextUnit);
      setAmount(nextAmount);
    }
  }, [safeMinutes, maxMinutes, amount, unit]);

  const unitMax = getUnitMax(unit, maxMinutes);

  const handleAmountChange = (rawValue: string) => {
    const parsed = Math.max(1, Math.min(unitMax, Number(rawValue) || 1));
    setAmount(parsed);
    onChangeMinutes(Math.min(maxMinutes, Math.max(1, Math.round(parsed * UNIT_MULTIPLIER[unit]))));
  };

  const handleUnitChange = (nextUnit: DurationUnit) => {
    const nextMax = getUnitMax(nextUnit, maxMinutes);
    const nextAmount = Math.min(Math.max(1, amount), nextMax);
    setUnit(nextUnit);
    setAmount(nextAmount);
    onChangeMinutes(
      Math.min(maxMinutes, Math.max(1, Math.round(nextAmount * UNIT_MULTIPLIER[nextUnit]))),
    );
  };

  const units: ReadonlyArray<{ id: DurationUnit; label: string }> = [
    { id: 'm', label: t('moderation.units.minutes') },
    { id: 'h', label: t('moderation.units.hours') },
    { id: 'd', label: t('moderation.units.days') },
  ];

  return (
    <div className="flex items-center gap-2 shrink-0">
      <input
        type="number"
        min={1}
        max={unitMax}
        value={amount}
        disabled={disabled}
        onChange={(e) => handleAmountChange(e.target.value)}
        className="input-field w-20 sm:w-24"
      />
      <div className="inline-flex items-center p-1 rounded-xl bg-bg-base border border-slate-700 h-[42px] shrink-0">
        {units.map((u) => {
          const active = unit === u.id;
          return (
            <button
              key={u.id}
              type="button"
              disabled={disabled}
              onClick={() => handleUnitChange(u.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
                active ? 'bg-brand text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {u.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

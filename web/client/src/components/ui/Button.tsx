import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'dashed';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand hover:bg-brand-hover text-white font-semibold shadow-sm',
  secondary: 'bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-slate-200 font-medium',
  danger: 'bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-300 font-medium',
  ghost: 'bg-transparent hover:bg-bg-elevated text-slate-300 hover:text-white font-medium',
  dashed:
    'w-full border border-dashed border-slate-700 hover:border-brand/60 bg-bg-base/40 hover:bg-bg-elevated/60 text-slate-300 hover:text-white font-medium',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-xl gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingText,
  icon,
  children,
  disabled,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : icon}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
}

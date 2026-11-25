import type { InputHTMLAttributes } from 'react';

interface ToggleSwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({ checked, onChange, className = '', ...rest }: ToggleSwitchProps) {
  return (
    <label className={`toggle-switch ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        {...rest}
      />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

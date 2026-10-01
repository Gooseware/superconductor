import React, { ReactNode } from 'react';

export interface AstryxCheckboxProps {
  id?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  name?: string;
  value?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`astryx-skeleton h-6 w-24 rounded ${className}`.trim()} />;
}

export function AstryxCheckbox({
  id,
  checked = false,
  onChange,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className = '',
  name,
  value,
  'aria-label': ariaLabel,
  'data-testid': testId
}: AstryxCheckboxProps) {
  const generatedId = id || (label ? `astryx-cb-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const nextVal = e.target.checked;
    onChange?.(nextVal);
    onCheckedChange?.(nextVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLLabelElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const nextVal = !checked;
      onChange?.(nextVal);
      onCheckedChange?.(nextVal);
    }
  };

  const containerDisabledClass = disabled ? 'astryx-checkbox-container-disabled' : '';
  const boxCheckedClass = checked ? 'astryx-checkbox-box-checked' : '';

  return (
    <label
      htmlFor={generatedId}
      className={`astryx-checkbox-container ${containerDisabledClass} ${className}`.trim()}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <div className="astryx-checkbox-wrapper">
        <input
          id={generatedId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          name={name}
          value={value}
          onChange={handleChange}
          tabIndex={-1}
          aria-hidden="true"
          className="astryx-checkbox-native"
        />
        <div className={`astryx-checkbox-box ${boxCheckedClass}`}>
          {checked && (
            <svg
              className="astryx-checkbox-checkmark"
              viewBox="0 0 12 10"
              aria-hidden="true"
            >
              <polyline points="1.5 5 4.5 8 10.5 1.5" />
            </svg>
          )}
        </div>
      </div>

      {(label || description) && (
        <div className="astryx-checkbox-label-group">
          {label && <span className="astryx-checkbox-label">{label}</span>}
          {description && <span className="astryx-checkbox-description">{description}</span>}
        </div>
      )}
    </label>
  );
}

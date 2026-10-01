import React, { ReactNode } from 'react';

export type AstryxButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type AstryxButtonSize = 'sm' | 'md' | 'lg';

export interface AstryxButtonProps {
  variant?: AstryxButtonVariant;
  size?: AstryxButtonSize;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseUp?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  id?: string;
  name?: string;
  title?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
  'data-testid'?: string;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`astryx-skeleton h-10 w-28 rounded-sm ${className}`.trim()} />;
}

export function AstryxButton({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  isLoading = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  onMouseDown,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
  onKeyDown,
  id,
  name,
  title,
  tabIndex,
  'aria-label': ariaLabel,
  'aria-expanded': ariaExpanded,
  'aria-controls': ariaControls,
  'data-testid': testId
}: AstryxButtonProps) {
  const variantClass = `astryx-button-${variant}`;
  const sizeClass = `astryx-button-${size}`;
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={onKeyDown}
      id={id}
      name={name}
      title={title}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      data-testid={testId}
      className={`astryx-button ${variantClass} ${sizeClass} ${className}`.trim()}
    >
      {isLoading && <span className="astryx-button-spinner" aria-hidden="true" />}
      {!isLoading && icon && iconPosition === 'left' && (
        <span className="astryx-button-icon-left" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
      {!isLoading && icon && iconPosition === 'right' && (
        <span className="astryx-button-icon-right" aria-hidden="true">
          {icon}
        </span>
      )}
    </button>
  );
}

import React, { CSSProperties, ReactNode } from 'react';

export type RecommendationStrength = 'Strong' | 'Worth exploring' | 'Speculative';
export type AstryxBadgeVariant = 'strong' | 'exploring' | 'speculative' | 'default' | 'success' | 'warning' | 'info' | 'danger';

export interface AstryxBadgeProps {
  children?: ReactNode;
  strength?: RecommendationStrength;
  variant?: AstryxBadgeVariant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`astryx-skeleton h-6 w-16 rounded-sm ${className}`.trim()} />;
}

export interface AstryxBadgeComponent extends React.FC<AstryxBadgeProps> {
  Skeleton: typeof Skeleton;
}

export const AstryxBadge: AstryxBadgeComponent = ({
  children,
  strength,
  variant,
  size = 'md',
  icon,
  className = '',
  style = {}
}) => {
  // Normalize variant from strength prop if provided
  let effectiveVariant = variant || 'default';
  if (strength) {
    if (strength === 'Strong') effectiveVariant = 'strong';
    else if (strength === 'Worth exploring') effectiveVariant = 'exploring';
    else if (strength === 'Speculative') effectiveVariant = 'speculative';
  }

  // Dual-signaling default symbols for accessibility (Design Heuristics Rule 22)
  let defaultIcon: ReactNode = null;
  const label = children || strength;

  switch (effectiveVariant) {
    case 'strong':
    case 'success':
      defaultIcon = (
        <span aria-hidden="true" className="astryx-badge-icon">
          ✓
        </span>
      );
      break;

    case 'exploring':
    case 'warning':
      defaultIcon = (
        <span aria-hidden="true" className="astryx-badge-icon">
          ◆
        </span>
      );
      break;

    case 'speculative':
    case 'info':
      defaultIcon = (
        <span aria-hidden="true" className="astryx-badge-icon">
          ✦
        </span>
      );
      break;

    case 'danger':
      defaultIcon = (
        <span aria-hidden="true" className="astryx-badge-icon">
          ✕
        </span>
      );
      break;

    case 'default':
    default:
      defaultIcon = (
        <span aria-hidden="true" className="astryx-badge-icon-default">
          ●
        </span>
      );
      break;
  }

  const variantClass = `astryx-badge-${effectiveVariant}`;
  const sizeClass = `astryx-badge-${size}`;

  return (
    <span
      className={`astryx-badge ${variantClass} ${sizeClass} ${className}`.trim()}
      data-variant={effectiveVariant}
      data-strength={strength}
      style={style}
    >
      {icon !== undefined ? icon : defaultIcon}
      {label}
    </span>
  );
};

AstryxBadge.Skeleton = Skeleton;


import React, { ReactNode } from 'react';

export interface AstryxCardProps {
  children?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  headerAction?: ReactNode;
  footer?: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
  id?: string;
  'data-testid'?: string;
}

export interface AstryxCardHeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function AstryxCardBadge({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`astryx-card-badge-container ${className}`.trim()}>
      {children}
    </div>
  );
}

export function AstryxCardHeader({
  title,
  subtitle,
  badge,
  action,
  className = '',
  children
}: AstryxCardHeaderProps) {
  if (children) {
    return <div className={`astryx-card-header ${className}`.trim()}>{children}</div>;
  }

  return (
    <div className={`astryx-card-header ${className}`.trim()}>
      <div className="astryx-card-header-left">
        <div className="astryx-card-title-row">
          {title && <h3 className="astryx-card-title">{title}</h3>}
          {badge && <AstryxCardBadge>{badge}</AstryxCardBadge>}
        </div>
        {subtitle && <p className="astryx-card-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="astryx-card-header-action">{action}</div>}
    </div>
  );
}

export function AstryxCardContent({
  children,
  className = ''
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <div className={`astryx-card-body ${className}`.trim()}>{children}</div>;
}

export function AstryxCardFooter({
  children,
  className = ''
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <div className={`astryx-card-footer ${className}`.trim()}>{children}</div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`astryx-skeleton h-40 w-full rounded-md ${className}`.trim()} />;
}

export function AstryxCard({
  children,
  title,
  subtitle,
  badge,
  headerAction,
  footer,
  padding = 'lg',
  interactive = false,
  onClick,
  className = '',
  id,
  'data-testid': testId
}: AstryxCardProps) {
  const padClass =
    padding === 'none'
      ? 'astryx-card-padding-none'
      : padding === 'sm'
        ? 'astryx-card-padding-sm'
        : padding === 'md'
          ? 'astryx-card-padding-md'
          : 'astryx-card-padding-lg';

  const interactiveClass = interactive ? 'astryx-card-interactive' : '';

  const handleKeyDown = interactive && onClick
    ? (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  const hasHeader = Boolean(title || subtitle || badge || headerAction);

  return (
    <div
      id={id}
      data-testid={testId}
      className={`astryx-card ${padClass} ${interactiveClass} ${className}`.trim()}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={handleKeyDown}
    >
      {hasHeader && (
        <AstryxCardHeader
          title={title}
          subtitle={subtitle}
          badge={badge}
          action={headerAction}
        />
      )}

      <AstryxCardContent>{children}</AstryxCardContent>

      {footer && <AstryxCardFooter>{footer}</AstryxCardFooter>}
    </div>
  );
}

import React, { CSSProperties, ReactNode, useState } from 'react';
import { useAstryxTheme } from './AstryxThemeProvider.js';
import { AstryxButton } from './AstryxButton.js';

export interface AstryxNavigationItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  onClick?: () => void;
}

export interface AstryxLayoutProps {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  navItems?: AstryxNavigationItem[];
  activeNavId?: string;
  onNavSelect?: (id: string) => void;
  sidebar?: ReactNode;
  sidebarWidth?: number;
  className?: string;
  style?: CSSProperties;
}

export const AstryxLayout: React.FC<AstryxLayoutProps> = ({
  children,
  title = 'Astryx Architecture Intelligence',
  subtitle = 'Superconductor Swarm Analysis & Refactoring Report',
  headerActions,
  navItems,
  activeNavId,
  onNavSelect,
  sidebar,
  sidebarWidth = 280,
  className = '',
  style = {}
}) => {
  const { theme, toggleTheme } = useAstryxTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div
      className={`astryx-shell-layout ${className}`.trim()}
      style={style}
    >
      {/* Top Header */}
      <header className="astryx-layout-header">
        <div className="astryx-layout-header-left">
          {sidebar && (
            <button
              type="button"
              aria-label="Toggle sidebar"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="astryx-sidebar-toggle"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}

          {/* Logo & Brand */}
          <div className="astryx-layout-brand">
            <div className="astryx-layout-logo">
              ⚡
            </div>
            <div className="astryx-layout-title-group">
              <h1 className="astryx-layout-title">
                {title}
              </h1>
              {subtitle && (
                <p className="astryx-layout-subtitle">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="astryx-layout-header-actions">
          {headerActions}

          {/* Theme Toggle Button */}
          <AstryxButton
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </AstryxButton>
        </div>
      </header>

      {/* Navigation Bar (if items provided) */}
      {navItems && navItems.length > 0 && (
        <nav
          aria-label="Application navigation"
          className="astryx-layout-nav"
        >
          {navItems.map((item) => {
            const isActive = item.id === activeNavId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.onClick?.();
                  onNavSelect?.(item.id);
                }}
                className={`astryx-layout-nav-item ${isActive ? 'astryx-layout-nav-item-active' : ''}`.trim()}
              >
                {item.icon && <span aria-hidden="true">{item.icon}</span>}
                <span>{item.label}</span>
                {item.badge}
              </button>
            );
          })}
        </nav>
      )}

      {/* Body Area with Sidebar and Main */}
      <div className="astryx-layout-body">
        {/* Responsive Sidebar */}
        {sidebar && sidebarOpen && (
          <aside
            className="astryx-layout-sidebar"
            style={{
              width: `${sidebarWidth}px`,
              minWidth: `${sidebarWidth}px`
            }}
          >
            {sidebar}
          </aside>
        )}

        {/* Main Content Area */}
        <main className="astryx-layout-main">
          {children}
        </main>
      </div>
    </div>
  );
};

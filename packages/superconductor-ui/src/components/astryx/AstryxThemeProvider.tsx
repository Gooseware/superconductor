import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode, CSSProperties } from 'react';

export type AstryxThemeMode = 'light' | 'dark';

export interface AstryxThemeTokens {
  background: string;
  surface: string;
  surfaceSecondary: string;
  surfaceHover: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderHover: string;
  primary: string;
  primaryHover: string;
  primaryContrast: string;
  success: string;
  warning: string;
  info: string;
  danger: string;
  shadowSm: string;
  shadowMd: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  fontFamily: string;
}

export const lightTokens: AstryxThemeTokens = {
  background: 'oklch(0.985 0.002 247.8)',
  surface: 'oklch(1.0 0 0)',
  surfaceSecondary: 'oklch(0.96 0.005 247.8)',
  surfaceHover: 'oklch(0.94 0.008 247.8)',
  text: 'oklch(0.25 0.015 247.8)', // ~#2A2A2A, WCAG AA compliant
  textSecondary: 'oklch(0.40 0.012 247.8)', // ~#4A4A4A
  textMuted: 'oklch(0.55 0.010 247.8)', // ~#6B6B6B
  border: 'oklch(0.90 0.005 247.8)', // ~#E0E0E0
  borderHover: 'oklch(0.78 0.010 247.8)',
  primary: 'oklch(0.55 0.22 265)', // Royal Indigo accent
  primaryHover: 'oklch(0.48 0.23 265)',
  primaryContrast: 'oklch(1.0 0 0)',
  success: 'oklch(0.62 0.17 145)', // Emerald
  warning: 'oklch(0.72 0.16 75)', // Amber
  info: 'oklch(0.62 0.17 300)', // Purple
  danger: 'oklch(0.58 0.22 25)', // Crimson
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  shadowMd: '0 4px 12px rgba(0, 0, 0, 0.04)',
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '12px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
};

export const darkTokens: AstryxThemeTokens = {
  background: 'oklch(0.14 0.01 260)',
  surface: 'oklch(0.19 0.015 260)',
  surfaceSecondary: 'oklch(0.24 0.015 260)',
  surfaceHover: 'oklch(0.28 0.018 260)',
  text: 'oklch(0.95 0.005 260)',
  textSecondary: 'oklch(0.78 0.010 260)',
  textMuted: 'oklch(0.58 0.010 260)',
  border: 'oklch(0.28 0.015 260)',
  borderHover: 'oklch(0.38 0.020 260)',
  primary: 'oklch(0.68 0.20 265)',
  primaryHover: 'oklch(0.74 0.18 265)',
  primaryContrast: 'oklch(0.12 0.01 260)',
  success: 'oklch(0.70 0.16 145)',
  warning: 'oklch(0.80 0.15 75)',
  info: 'oklch(0.72 0.15 300)',
  danger: 'oklch(0.68 0.20 25)',
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.25)',
  shadowMd: '0 4px 12px rgba(0, 0, 0, 0.35)',
  radiusSm: '4px',
  radiusMd: '8px',
  radiusLg: '12px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
};

export interface AstryxThemeContextType {
  theme: AstryxThemeMode;
  setTheme: (theme: AstryxThemeMode) => void;
  toggleTheme: () => void;
  tokens: AstryxThemeTokens;
}

export const AstryxThemeContext = createContext<AstryxThemeContextType | undefined>(undefined);

export function useAstryxTheme(): AstryxThemeContextType {
  const context = useContext(AstryxThemeContext);
  if (!context) {
    throw new Error('useAstryxTheme must be used within an AstryxThemeProvider');
  }
  return context;
}

export interface AstryxThemeProviderProps {
  defaultTheme?: AstryxThemeMode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const AstryxThemeProvider: React.FC<AstryxThemeProviderProps> = ({
  defaultTheme = 'dark',
  children,
  className = '',
  style = {}
}) => {
  const [theme, setTheme] = useState<AstryxThemeMode>(defaultTheme);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const tokens = useMemo(() => (theme === 'light' ? lightTokens : darkTokens), [theme]);

  const cssVariables = useMemo<Record<string, string>>(() => ({
    '--astryx-bg': tokens.background,
    '--astryx-surface': tokens.surface,
    '--astryx-surface-secondary': tokens.surfaceSecondary,
    '--astryx-surface-hover': tokens.surfaceHover,
    '--astryx-text': tokens.text,
    '--astryx-text-secondary': tokens.textSecondary,
    '--astryx-text-muted': tokens.textMuted,
    '--astryx-border': tokens.border,
    '--astryx-border-hover': tokens.borderHover,
    '--astryx-primary': tokens.primary,
    '--astryx-primary-hover': tokens.primaryHover,
    '--astryx-primary-contrast': tokens.primaryContrast,
    '--astryx-success': tokens.success,
    '--astryx-warning': tokens.warning,
    '--astryx-info': tokens.info,
    '--astryx-danger': tokens.danger,
    '--astryx-shadow-sm': tokens.shadowSm,
    '--astryx-shadow-md': tokens.shadowMd,
    '--astryx-radius-sm': tokens.radiusSm,
    '--astryx-radius-md': tokens.radiusMd,
    '--astryx-radius-lg': tokens.radiusLg,
    '--astryx-font-family': tokens.fontFamily
  }), [tokens]);

  const contextValue = useMemo<AstryxThemeContextType>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      tokens
    }),
    [theme, tokens]
  );

  return (
    <AstryxThemeContext.Provider value={contextValue}>
      <div
        data-astryx-theme={theme}
        className={`astryx-theme-root ${className}`.trim()}
        style={{
          backgroundColor: tokens.background,
          color: tokens.text,
          fontFamily: tokens.fontFamily,
          minHeight: '100vh',
          transition: 'background-color 200ms ease, color 200ms ease',
          ...cssVariables as CSSProperties,
          ...style
        }}
      >
        {children}
      </div>
    </AstryxThemeContext.Provider>
  );
};

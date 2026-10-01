import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AstryxThemeProvider,
  AstryxBadge,
  AstryxBadgeSkeleton,
  AstryxLayout,
  AstryxCard,
  AstryxButton,
  AstryxCheckbox,
  useAstryxTheme
} from './index.js';

describe('Astryx Design System Primitives', () => {
  describe('AstryxThemeProvider', () => {
    it('throws error when useAstryxTheme is used outside provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const TestConsumer = () => {
        useAstryxTheme();
        return null;
      };
      expect(() => render(<TestConsumer />)).toThrow(
        'useAstryxTheme must be used within an AstryxThemeProvider'
      );
      consoleSpy.mockRestore();
    });

    it('injects OKLCH CSS variables into theme container', () => {
      const { container } = render(
        <AstryxThemeProvider defaultTheme="dark">
          <div>Content</div>
        </AstryxThemeProvider>
      );
      const root = container.querySelector('.astryx-theme-root');
      expect(root).not.toBeNull();
      const style = root?.getAttribute('style');
      expect(style).toContain('--astryx-bg');
      expect(style).toContain('--astryx-surface');
      expect(style).toContain('--astryx-primary');
    });
  });

  describe('AstryxBadge', () => {
    it('renders with recommendation strength variants', () => {
      render(
        <AstryxThemeProvider>
          <AstryxBadge strength="Strong" />
          <AstryxBadge strength="Worth exploring" />
          <AstryxBadge strength="Speculative" />
        </AstryxThemeProvider>
      );

      expect(screen.getByText('Strong')).toBeDefined();
      expect(screen.getByText('Worth exploring')).toBeDefined();
      expect(screen.getByText('Speculative')).toBeDefined();
    });

    it('renders Skeleton subcomponent via AstryxBadge.Skeleton and named export', () => {
      const { container: c1 } = render(<AstryxBadge.Skeleton className="custom-badge-skel-1" />);
      expect(c1.querySelector('.astryx-skeleton')).not.toBeNull();

      const { container: c2 } = render(<AstryxBadgeSkeleton className="custom-badge-skel-2" />);
      expect(c2.querySelector('.astryx-skeleton')).not.toBeNull();
    });
  });

  describe('AstryxLayout', () => {
    it('renders title, subtitle, sidebar, and main content', () => {
      render(
        <AstryxThemeProvider>
          <AstryxLayout
            title="Custom Shell"
            subtitle="Custom Subtitle"
            sidebar={<div>Sidebar Navigation</div>}
          >
            <div>Main View</div>
          </AstryxLayout>
        </AstryxThemeProvider>
      );

      expect(screen.getByText('Custom Shell')).toBeDefined();
      expect(screen.getByText('Custom Subtitle')).toBeDefined();
      expect(screen.getByText('Sidebar Navigation')).toBeDefined();
      expect(screen.getByText('Main View')).toBeDefined();
    });
  });

  describe('AstryxCard & AstryxButton & AstryxCheckbox', () => {
    it('handles interactions properly', () => {
      const handleClick = vi.fn();
      const handleToggle = vi.fn();

      render(
        <AstryxThemeProvider>
          <AstryxCard title="Test Card">
            <AstryxButton onClick={handleClick}>Click Me</AstryxButton>
            <AstryxCheckbox
              checked={false}
              onChange={handleToggle}
              label="Enable Feature"
            />
          </AstryxCard>
        </AstryxThemeProvider>
      );

      expect(screen.getByText('Test Card')).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: 'Click Me' }));
      expect(handleClick).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByLabelText('Enable Feature'));
      expect(handleToggle).toHaveBeenCalledWith(true);
    });
  });
});

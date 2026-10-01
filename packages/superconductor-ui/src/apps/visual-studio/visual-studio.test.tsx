import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PinningOverlay,
  calculatePopoverPosition,
  getCssSelector,
  VisualPin,
  AnimationScrubber,
  calculateSpringPhysics,
  GPU_ACCELERATED_PROPERTIES,
  STYLESEED_PRESETS,
  CopilotSidecar,
  FiberContext,
  CopilotMessage
} from './index.js';

describe('Visual Studio UI Components', () => {
  describe('PinningOverlay & Hit-Testing Dogma', () => {
    const mockPins: VisualPin[] = [
      {
        id: 'pin-1',
        x: 0.25,
        y: 0.35,
        selector: 'main > button.cta-primary',
        comment: 'Increase padding to 16px',
        category: 'component',
        fiberSource: { componentName: 'CtaButton', file: 'src/components/CtaButton.tsx', line: 42 },
        boundingRect: { x: 0.2, y: 0.3, width: 0.15, height: 0.08 }
      },
      {
        id: 'pin-2',
        x: 0.8,
        y: 0.9,
        selector: 'footer > span.legal',
        comment: 'Color contrast is too low',
        category: 'token'
      }
    ];

    it('adheres to Hit-Testing Dogma: host container has pointer-events: none', () => {
      const { container } = render(<PinningOverlay pins={mockPins} />);
      const overlayEl = container.querySelector('[data-testid="pinning-overlay-container"]');
      expect(overlayEl).not.toBeNull();
      // Container MUST pass through all mouse clicks to underlying application
      expect(overlayEl?.getAttribute('style')).toContain('pointer-events: none');
    });

    it('adheres to Hit-Testing Dogma: interactive pin markers have pointer-events: auto', () => {
      render(<PinningOverlay pins={mockPins} />);
      const pin1 = screen.getByTestId('pin-marker-pin-1');
      const pin2 = screen.getByTestId('pin-marker-pin-2');

      expect(pin1).toBeDefined();
      expect(pin2).toBeDefined();
      expect(pin1.getAttribute('style')).toContain('pointer-events: auto');
      expect(pin2.getAttribute('style')).toContain('pointer-events: auto');
    });

    it('adheres to Hit-Testing Dogma: toolbar and controls have pointer-events: auto', () => {
      render(<PinningOverlay pins={mockPins} />);
      const toolbar = screen.getByTestId('visual-studio-toolbar');
      expect(toolbar).toBeDefined();
      expect(toolbar.getAttribute('style')).toContain('pointer-events: auto');
    });

    it('renders bounding box in SVG layer for active or hovered pin', () => {
      render(<PinningOverlay pins={mockPins} activePinId="pin-1" />);
      const bbox = screen.getByTestId('pin-bounding-box');
      expect(bbox).toBeDefined();
      expect(bbox.getAttribute('x')).toBe('20%');
      expect(bbox.getAttribute('y')).toBe('30%');
    });

    it('calculates popover position with edge flipping and clamping (CSS popover math)', () => {
      // Normal placement: fits below pin
      const normalPos = calculatePopoverPosition(0.5, 0.2, 1000, 800, 320, 240);
      expect(normalPos.placement).toBe('bottom');
      expect(normalPos.top).toBeGreaterThan(0.2 * 800);

      // Bottom boundary overflow: should flip to top
      const flippedPos = calculatePopoverPosition(0.5, 0.9, 1000, 800, 320, 240);
      expect(flippedPos.placement).toBe('top');
      expect(flippedPos.top).toBeLessThan(0.9 * 800);

      // Left boundary clamping: pin near x=0 should not render offscreen
      const leftClampedPos = calculatePopoverPosition(0.02, 0.5, 1000, 800, 320, 240);
      expect(leftClampedPos.left).toBeGreaterThanOrEqual(12);

      // Right boundary clamping: pin near x=1 should not overflow right edge
      const rightClampedPos = calculatePopoverPosition(0.98, 0.5, 1000, 800, 320, 240);
      expect(rightClampedPos.left + 320).toBeLessThanOrEqual(1000 - 12);
    });

    it('extracts deterministic CSS selectors from DOM element hierarchy', () => {
      const container = document.createElement('div');
      container.id = 'root';
      const section = document.createElement('section');
      section.className = 'content-section';
      const button = document.createElement('button');
      button.className = 'submit-btn';

      container.appendChild(section);
      section.appendChild(button);
      document.body.appendChild(container);

      const selector = getCssSelector(button);
      expect(selector).toBe('#root > section.content-section > button.submit-btn');

      document.body.removeChild(container);
    });

    it('opens popover dialog when a pin is selected and supports editing & saving', () => {
      const onSelectPin = vi.fn();
      const onUpdatePin = vi.fn();
      const onDeletePin = vi.fn();

      const { rerender } = render(
        <PinningOverlay
          pins={mockPins}
          activePinId={null}
          onSelectPin={onSelectPin}
          onUpdatePin={onUpdatePin}
          onDeletePin={onDeletePin}
        />
      );

      // Click pin-1 marker to select it
      fireEvent.click(screen.getByTestId('pin-marker-pin-1'));
      expect(onSelectPin).toHaveBeenCalledWith('pin-1');

      // Re-render with activePinId="pin-1"
      rerender(
        <PinningOverlay
          pins={mockPins}
          activePinId="pin-1"
          onSelectPin={onSelectPin}
          onUpdatePin={onUpdatePin}
          onDeletePin={onDeletePin}
        />
      );

      const popover = screen.getByTestId('pin-popover-card');
      expect(popover).toBeDefined();
      expect(popover.getAttribute('style')).toContain('pointer-events: auto');

      // Edit comment and save
      const commentInput = screen.getByTestId('pin-comment-input');
      fireEvent.change(commentInput, { target: { value: 'Updated note comment' } });

      const saveBtn = screen.getByTestId('save-pin-btn');
      fireEvent.click(saveBtn);
      expect(onUpdatePin).toHaveBeenCalledWith('pin-1', {
        comment: 'Updated note comment',
        category: 'component'
      });

      // Test delete pin
      const deleteBtn = screen.getByTestId('delete-pin-btn');
      fireEvent.click(deleteBtn);
      expect(onDeletePin).toHaveBeenCalledWith('pin-1');
    });

    it('captures normalized coordinates and calls onAddPin when drop pin mode is active', () => {
      const onAddPin = vi.fn();
      const onToggleAddPin = vi.fn();

      const { rerender } = render(
        <PinningOverlay
          pins={[]}
          isAddingPin={false}
          onAddPin={onAddPin}
          onToggleAddPin={onToggleAddPin}
        />
      );

      // Click Drop Pin button to activate mode
      fireEvent.click(screen.getByTestId('toggle-add-pin-btn'));
      expect(onToggleAddPin).toHaveBeenCalledWith(true);

      // Re-render with isAddingPin=true
      rerender(
        <PinningOverlay
          pins={[]}
          isAddingPin={true}
          onAddPin={onAddPin}
          onToggleAddPin={onToggleAddPin}
        />
      );

      const dropTarget = screen.getByTestId('pin-drop-target');
      expect(dropTarget).toBeDefined();
      expect(dropTarget.getAttribute('style')).toContain('pointer-events: auto');

      // Mock getBoundingClientRect
      vi.spyOn(dropTarget.parentElement!, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 1000,
        height: 500,
        right: 1000,
        bottom: 500,
        x: 0,
        y: 0,
        toJSON: () => {}
      });

      // Click at (250, 100) -> normalized (0.25, 0.2)
      fireEvent.click(dropTarget, { clientX: 250, clientY: 100 });

      expect(onAddPin).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0.25,
          y: 0.2,
          category: 'component'
        })
      );
    });
  });

  describe('AnimationScrubber & 60fps GPU Acceleration', () => {
    it('enforces 60fps GPU acceleration whitelist: transform and opacity only', () => {
      expect(GPU_ACCELERATED_PROPERTIES).toEqual(['transform', 'opacity']);
      render(<AnimationScrubber />);
      const badge = screen.getByTestId('gpu-acceleration-badge');
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain('60fps GPU Safe');
    });

    it('calculates analytical spring physics accurately', () => {
      const config = { stiffness: 380, damping: 30, mass: 1 };
      // At t = 0, initial displacement is 0
      const initial = calculateSpringPhysics(0, config);
      expect(initial.displacement).toBeCloseTo(0, 2);

      // After settling time (e.g. t = 1.0s), displacement converges to 1.0
      const settled = calculateSpringPhysics(1.0, config);
      expect(settled.displacement).toBeCloseTo(1, 1);
    });

    it('provides playback speed controls for 10%, 25%, 50%, and 100%', () => {
      const onSpeedChange = vi.fn();
      render(<AnimationScrubber speed={1.0} onSpeedChange={onSpeedChange} />);

      const speed10 = screen.getByTestId('speed-btn-10');
      const speed25 = screen.getByTestId('speed-btn-25');
      const speed50 = screen.getByTestId('speed-btn-50');
      const speed100 = screen.getByTestId('speed-btn-100');

      expect(speed10).toBeDefined();
      expect(speed25).toBeDefined();
      expect(speed50).toBeDefined();
      expect(speed100).toBeDefined();

      fireEvent.click(speed25);
      expect(onSpeedChange).toHaveBeenCalledWith(0.25);

      fireEvent.click(speed10);
      expect(onSpeedChange).toHaveBeenCalledWith(0.1);
    });

    it('supports pause/scrub slider and updates specimen via transform and opacity only', () => {
      const onScrub = vi.fn();
      render(<AnimationScrubber durationMs={1000} onScrub={onScrub} />);

      const slider = screen.getByTestId('time-scrubber-slider');
      fireEvent.change(slider, { target: { value: '500' } });

      const timestamp = screen.getByTestId('scrubber-timestamp');
      expect(timestamp.textContent).toContain('500ms');

      // Specimen element style should strictly use transform and opacity
      const specimen = screen.getByTestId('animated-specimen');
      const style = specimen.getAttribute('style') || '';
      expect(style).toContain('transform: translate3d');
      expect(style).toContain('opacity:');
      expect(style).toContain('will-change: transform, opacity');

      // MUST NOT animate layout-reflow properties
      expect(style).not.toContain('width:');
      expect(style).not.toContain('height:');
    });

    it('allows tuning spring stiffness, damping, and mass', () => {
      const onSpringConfigChange = vi.fn();
      render(
        <AnimationScrubber
          springConfig={{ stiffness: 380, damping: 30, mass: 1 }}
          onSpringConfigChange={onSpringConfigChange}
        />
      );

      const stiffnessSlider = screen.getByTestId('spring-stiffness-slider');
      fireEvent.change(stiffnessSlider, { target: { value: '500' } });
      expect(onSpringConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ stiffness: 500 })
      );

      const dampingSlider = screen.getByTestId('spring-damping-slider');
      fireEvent.change(dampingSlider, { target: { value: '45' } });
      expect(onSpringConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ damping: 45 })
      );
    });

    it('switches StyleSeed presets (Spring, Silk, Snap, Float, Pulse)', () => {
      const onSpringConfigChange = vi.fn();
      render(<AnimationScrubber onSpringConfigChange={onSpringConfigChange} />);

      const snapBtn = screen.getByTestId('preset-btn-snap');
      fireEvent.click(snapBtn);
      expect(onSpringConfigChange).toHaveBeenCalledWith(STYLESEED_PRESETS.Snap);

      const silkBtn = screen.getByTestId('preset-btn-silk');
      fireEvent.click(silkBtn);
      expect(onSpringConfigChange).toHaveBeenCalledWith(STYLESEED_PRESETS.Silk);
    });
  });

  describe('CopilotSidecar', () => {
    const mockFiberContext: FiberContext = {
      componentName: 'DashboardMetrics',
      file: 'src/components/DashboardMetrics.tsx',
      line: 38,
      selector: 'div.dashboard > div.metrics-panel'
    };

    const mockMessages: CopilotMessage[] = [
      {
        id: 'msg-1',
        sender: 'user',
        content: 'Can you improve the contrast of this card?',
        timestamp: Date.now() - 5000
      },
      {
        id: 'msg-2',
        sender: 'agent',
        content: 'I created an in-DOM proposal updating --astryx-surface to oklch(0.24 0.015 260).',
        timestamp: Date.now() - 3000,
        proposalPayload: {
          title: 'OKLCH Surface Contrast Boost',
          diffSummary: 'Adjusts background token for 7:1 contrast',
          status: 'ready'
        }
      }
    ];

    it('displays active component name, source file & line from Fiber context', () => {
      render(<CopilotSidecar fiberContext={mockFiberContext} />);

      const compName = screen.getByTestId('active-component-name');
      expect(compName.textContent).toContain('<DashboardMetrics />');

      const sourceLoc = screen.getByTestId('active-source-location');
      expect(sourceLoc.textContent).toContain('src/components/DashboardMetrics.tsx:38');
    });

    it('displays placeholder when Fiber context is absent', () => {
      render(<CopilotSidecar fiberContext={null} />);
      const placeholder = screen.getByTestId('no-fiber-context');
      expect(placeholder).toBeDefined();
    });

    it('supports A/B toggle between [Current] and [Proposal]', () => {
      const onViewModeChange = vi.fn();
      const { rerender } = render(
        <CopilotSidecar
          fiberContext={mockFiberContext}
          activeViewMode="current"
          onViewModeChange={onViewModeChange}
        />
      );

      const currentBtn = screen.getByTestId('ab-toggle-current');
      const proposalBtn = screen.getByTestId('ab-toggle-proposal');

      fireEvent.click(proposalBtn);
      expect(onViewModeChange).toHaveBeenCalledWith('proposal');

      rerender(
        <CopilotSidecar
          fiberContext={mockFiberContext}
          activeViewMode="proposal"
          onViewModeChange={onViewModeChange}
        />
      );

      const notice = screen.getByTestId('proposal-status-notice');
      expect(notice).toBeDefined();
      expect(notice.textContent).toContain('Draft Proposal');
    });

    it('renders chat message stream and allows sending new messages', () => {
      const onSendMessage = vi.fn();
      render(
        <CopilotSidecar
          fiberContext={mockFiberContext}
          messages={mockMessages}
          onSendMessage={onSendMessage}
        />
      );

      expect(screen.getByText('Can you improve the contrast of this card?')).toBeDefined();
      expect(screen.getByText('OKLCH Surface Contrast Boost')).toBeDefined();

      const input = screen.getByTestId('copilot-input');
      fireEvent.change(input, { target: { value: 'Make the entrance spring snappier' } });

      const sendBtn = screen.getByTestId('copilot-send-btn');
      fireEvent.click(sendBtn);

      expect(onSendMessage).toHaveBeenCalledWith('Make the entrance spring snappier', mockFiberContext);
    });

    it('triggers message send on Enter key without shift', () => {
      const onSendMessage = vi.fn();
      render(
        <CopilotSidecar
          fiberContext={mockFiberContext}
          onSendMessage={onSendMessage}
        />
      );

      const input = screen.getByTestId('copilot-input');
      fireEvent.change(input, { target: { value: 'Apply 16px border-radius' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

      expect(onSendMessage).toHaveBeenCalledWith('Apply 16px border-radius', mockFiberContext);
    });

    it('adheres to Hit-Testing Dogma: sidecar container has pointer-events: auto', () => {
      const { container } = render(<CopilotSidecar />);
      const sidecar = container.querySelector('[data-testid="copilot-sidecar"]');
      expect(sidecar?.getAttribute('style')).toContain('pointer-events: auto');
    });
  });
});

import React, { useState, useRef, useEffect, useCallback, MouseEvent } from 'react';

export type PinCategory = 'token' | 'component' | 'view' | 'bug' | 'finesse' | 'accessibility';

export interface FiberSourceInfo {
  componentName?: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualPin {
  id: string;
  x: number; // Normalized coordinate 0.0 to 1.0
  y: number; // Normalized coordinate 0.0 to 1.0
  selector?: string; // CSS selector of target element
  fiberSource?: FiberSourceInfo;
  boundingRect?: BoundingBox;
  comment: string;
  category?: PinCategory;
  resolved?: boolean;
  createdAt?: number;
  author?: string;
}

export interface PopoverPosition {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
}

/**
 * Calculates CSS popover positioning anchored to a normalized pin location.
 * Implements viewport / container boundary clamping and flipping.
 */
export function calculatePopoverPosition(
  pinX: number,
  pinY: number,
  containerWidth: number,
  containerHeight: number,
  popoverWidth = 320,
  popoverHeight = 240,
  offset = 14
): PopoverPosition {
  const px = pinX * containerWidth;
  const py = pinY * containerHeight;

  let placement: 'top' | 'bottom' = 'bottom';
  let top = py + offset;

  // Flip to top if overflowing bottom container boundary and fits on top
  if (py + offset + popoverHeight > containerHeight && py - offset - popoverHeight >= 0) {
    placement = 'top';
    top = py - offset - popoverHeight;
  }

  // Horizontal clamping with padding from edges
  let left = px - popoverWidth / 2;
  const minLeft = 12;
  const maxLeft = Math.max(minLeft, containerWidth - popoverWidth - 12);
  left = Math.min(Math.max(left, minLeft), maxLeft);

  return { top, left, placement };
}

/**
 * Extracts a deterministic CSS selector from a DOM element.
 */
export function getCssSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'body' || tagName === 'html') {
    return tagName;
  }

  const parent = element.parentElement;
  if (!parent) return tagName;

  const classNames = Array.from(element.classList)
    .filter(c => !c.startsWith('visual-studio-') && !c.startsWith('astryx-'))
    .slice(0, 2);

  const classSelector = classNames.length > 0 ? `.${classNames.join('.')}` : '';
  const siblings = Array.from(parent.children).filter(el => el.tagName === element.tagName);
  const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(element) + 1})` : '';

  const currentSelector = `${tagName}${classSelector}${nth}`;
  if (parent.tagName.toLowerCase() === 'body') {
    return currentSelector;
  }

  return `${getCssSelector(parent)} > ${currentSelector}`;
}

export interface PinningOverlayProps {
  pins: VisualPin[];
  activePinId?: string | null;
  onAddPin?: (pin: Omit<VisualPin, 'id' | 'createdAt'>) => void;
  onSelectPin?: (pinId: string | null) => void;
  onUpdatePin?: (pinId: string, updates: Partial<VisualPin>) => void;
  onDeletePin?: (pinId: string) => void;
  isAddingPin?: boolean;
  onToggleAddPin?: (isAdding: boolean) => void;
  highlightedSelector?: string | null;
  containerRef?: React.RefObject<HTMLElement>;
  className?: string;
  showToolbar?: boolean;
}

const CATEGORY_COLORS: Record<PinCategory, { bg: string; text: string; label: string }> = {
  token: { bg: '#8b5cf6', text: '#ffffff', label: 'Token (L0)' },
  component: { bg: '#3b82f6', text: '#ffffff', label: 'Component (L1)' },
  view: { bg: '#10b981', text: '#ffffff', label: 'View (L2)' },
  bug: { bg: '#ef4444', text: '#ffffff', label: 'Bug' },
  finesse: { bg: '#f59e0b', text: '#ffffff', label: 'Finesse' },
  accessibility: { bg: '#06b6d4', text: '#ffffff', label: 'A11y' }
};

export function PinningOverlay({
  pins,
  activePinId = null,
  onAddPin,
  onSelectPin,
  onUpdatePin,
  onDeletePin,
  isAddingPin = false,
  onToggleAddPin,
  highlightedSelector = null,
  containerRef,
  className = '',
  showToolbar = true
}: PinningOverlayProps) {
  const localOverlayRef = useRef<HTMLDivElement>(null);
  const [editingComment, setEditingComment] = useState('');
  const [editingCategory, setEditingCategory] = useState<PinCategory>('component');
  const [containerSize, setContainerSize] = useState({ width: 1000, height: 800 });
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);

  // Sync active pin edit state
  const activePin = pins.find(p => p.id === activePinId) || null;

  useEffect(() => {
    if (activePin) {
      setEditingComment(activePin.comment);
      setEditingCategory(activePin.category || 'component');
    }
  }, [activePin?.id]);

  // Update container dimensions for CSS popover math and normalized coordinates
  useEffect(() => {
    const updateSize = () => {
      const el = containerRef?.current || localOverlayRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setContainerSize({ width: rect.width, height: rect.height });
        }
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [containerRef]);

  // Handle click on dropping canvas to capture normalized coordinates and selector
  const handleDropClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!isAddingPin || !onAddPin) return;

      const overlayEl = localOverlayRef.current;
      if (!overlayEl) return;

      const rect = overlayEl.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;

      const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      // Introspect target element under mouse point
      // Hide capture layer momentarily or query elementsFromPoint
      let selector: string | undefined;
      let boundingRect: BoundingBox | undefined;

      const elements = typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(clientX, clientY)
        : typeof (document as any).elementFromPoint === 'function'
        ? [(document as any).elementFromPoint(clientX, clientY)].filter(Boolean)
        : [];

      // Find first element not inside overlay
      const targetEl = elements.find(
        (el: Element) => !el.closest('[data-visual-studio-overlay="true"]')
      );

      if (targetEl) {
        selector = getCssSelector(targetEl);
        const targetRect = targetEl.getBoundingClientRect();
        boundingRect = {
          x: (targetRect.left - rect.left) / rect.width,
          y: (targetRect.top - rect.top) / rect.height,
          width: targetRect.width / rect.width,
          height: targetRect.height / rect.height
        };
      }

      onAddPin({
        x: normX,
        y: normY,
        selector,
        boundingRect,
        comment: '',
        category: 'component'
      });

      if (onToggleAddPin) {
        onToggleAddPin(false);
      }
    },
    [isAddingPin, onAddPin, onToggleAddPin]
  );

  const handleSaveActivePin = () => {
    if (!activePin || !onUpdatePin) return;
    onUpdatePin(activePin.id, {
      comment: editingComment,
      category: editingCategory
    });
    onSelectPin?.(null);
  };

  const popoverPosition = activePin
    ? calculatePopoverPosition(
        activePin.x,
        activePin.y,
        containerSize.width,
        containerSize.height
      )
    : null;

  return (
    <div
      ref={localOverlayRef}
      data-visual-studio-overlay="true"
      data-testid="pinning-overlay-container"
      className={`visual-studio-pinning-overlay ${className}`.trim()}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none', // HIT-TESTING DOGMA: Host container passes clicks through
        zIndex: 9000,
        overflow: 'hidden'
      }}
    >
      {/* SVG Layer for bounding box outlines and pin connection vectors */}
      <svg
        data-testid="pinning-overlay-svg"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none' // HIT-TESTING DOGMA: SVG canvas is pass-through
        }}
      >
        {/* Render bounding box of active or hovered pin */}
        {(activePin?.boundingRect || pins.find(p => p.id === hoveredPinId)?.boundingRect) && (
          (() => {
            const b = (activePin || pins.find(p => p.id === hoveredPinId))?.boundingRect;
            if (!b) return null;
            return (
              <rect
                data-testid="pin-bounding-box"
                x={`${b.x * 100}%`}
                y={`${b.y * 100}%`}
                width={`${b.width * 100}%`}
                height={`${b.height * 100}%`}
                fill="rgba(59, 130, 246, 0.08)"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray="4 2"
                rx="4"
                style={{ pointerEvents: 'none' }}
              />
            );
          })()
        )}
      </svg>

      {/* Pin Dropping Active Capture Surface (only active when in Add Pin mode) */}
      {isAddingPin && (
        <div
          data-testid="pin-drop-target"
          onClick={handleDropClick}
          style={{
            position: 'absolute',
            inset: 0,
            cursor: 'crosshair',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            pointerEvents: 'auto', // Explicitly interactive during pin placement
            zIndex: 9001
          }}
          title="Click anywhere to drop a feedback pin"
        />
      )}

      {/* Floating Toolbar Controls */}
      {showToolbar && (
        <div
          data-testid="visual-studio-toolbar"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            pointerEvents: 'auto', // HIT-TESTING DOGMA: Explicit interaction
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: 'rgba(26, 26, 26, 0.85)',
            backdropFilter: 'blur(8px)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            color: '#ffffff',
            fontSize: '13px',
            zIndex: 9005
          }}
        >
          <span style={{ fontWeight: 600, color: '#e5e7eb' }}>
            Pins: {pins.length}
          </span>
          <button
            type="button"
            data-testid="toggle-add-pin-btn"
            onClick={() => onToggleAddPin?.(!isAddingPin)}
            style={{
              pointerEvents: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              background: isAddingPin ? '#ef4444' : '#3b82f6',
              color: '#ffffff',
              fontWeight: 500,
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'transform 0.1s ease',
              transform: 'scale(1)'
            }}
          >
            {isAddingPin ? 'Cancel Pin' : '+ Drop Pin'}
          </button>
        </div>
      )}

      {/* Interactive Pin Markers */}
      {pins.map((pin, index) => {
        const isActive = pin.id === activePinId;
        const categoryColor = CATEGORY_COLORS[pin.category || 'component'];

        return (
          <button
            key={pin.id}
            type="button"
            data-testid={`pin-marker-${pin.id}`}
            data-pin-id={pin.id}
            aria-label={`Pin ${index + 1}: ${pin.comment || pin.selector || 'Note'}`}
            onMouseEnter={() => setHoveredPinId(pin.id)}
            onMouseLeave={() => setHoveredPinId(null)}
            onClick={e => {
              e.stopPropagation();
              onSelectPin?.(isActive ? null : pin.id);
            }}
            style={{
              position: 'absolute',
              left: `${pin.x * 100}%`,
              top: `${pin.y * 100}%`,
              transform: `translate(-50%, -100%) scale(${isActive ? 1.15 : 1})`,
              transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
              pointerEvents: 'auto', // HIT-TESTING DOGMA: Pin marker is interactive
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              zIndex: isActive ? 9010 : 9002
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '50% 50% 50% 0',
                transform: 'rotate(-45deg)',
                backgroundColor: categoryColor.bg,
                color: categoryColor.text,
                boxShadow: isActive
                  ? '0 0 0 3px rgba(255, 255, 255, 0.9), 0 4px 12px rgba(0, 0, 0, 0.4)'
                  : '0 2px 6px rgba(0, 0, 0, 0.3)',
                fontWeight: 700,
                fontSize: '12px'
              }}
            >
              <span style={{ transform: 'rotate(45deg)' }}>{index + 1}</span>
            </div>
          </button>
        );
      })}

      {/* Floating Pin Popover Card */}
      {activePin && popoverPosition && (
        <div
          role="dialog"
          aria-label={`Pin feedback note`}
          data-testid="pin-popover-card"
          style={{
            position: 'absolute',
            top: `${popoverPosition.top}px`,
            left: `${popoverPosition.left}px`,
            width: '320px',
            backgroundColor: '#1f242d',
            color: '#f3f4f6',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
            pointerEvents: 'auto', // HIT-TESTING DOGMA: Popover is interactive
            zIndex: 9020,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontSize: '13px'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Popover Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: CATEGORY_COLORS[editingCategory].bg,
                  color: '#ffffff'
                }}
              >
                Pin #{pins.findIndex(p => p.id === activePin.id) + 1}
              </span>
              {activePin.fiberSource?.componentName && (
                <span
                  title={`${activePin.fiberSource.file || ''}:${activePin.fiberSource.line || ''}`}
                  style={{
                    color: '#93c5fd',
                    fontFamily: 'monospace',
                    fontSize: '11px'
                  }}
                >
                  &lt;{activePin.fiberSource.componentName} /&gt;
                </span>
              )}
            </div>
            <button
              type="button"
              data-testid="close-popover-btn"
              onClick={() => onSelectPin?.(null)}
              style={{
                pointerEvents: 'auto',
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                fontSize: '16px',
                cursor: 'pointer',
                lineHeight: 1
              }}
              title="Close note"
            >
              &times;
            </button>
          </div>

          {/* Popover Body */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Target element / selector info */}
            {activePin.selector && (
              <div
                title={activePin.selector}
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#9ca3af',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                Target: {activePin.selector}
              </div>
            )}

            {/* Category Layer selector */}
            <div>
              <label
                htmlFor="pin-category-select"
                style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}
              >
                Category Layer
              </label>
              <select
                id="pin-category-select"
                data-testid="pin-category-select"
                value={editingCategory}
                onChange={e => setEditingCategory(e.target.value as PinCategory)}
                style={{
                  pointerEvents: 'auto',
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: '#2b303c',
                  color: '#ffffff',
                  fontSize: '12px'
                }}
              >
                <option value="token">Token (L0 Foundation)</option>
                <option value="component">Component (L1 Shared)</option>
                <option value="view">View (L2 Feature)</option>
                <option value="bug">Bug Report</option>
                <option value="finesse">Motion & Finesse</option>
                <option value="accessibility">Accessibility (A11y)</option>
              </select>
            </div>

            {/* Note text area */}
            <div>
              <label
                htmlFor="pin-comment-input"
                style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}
              >
                Feedback Note
              </label>
              <textarea
                id="pin-comment-input"
                data-testid="pin-comment-input"
                rows={3}
                value={editingComment}
                onChange={e => setEditingComment(e.target.value)}
                placeholder="Describe feedback, desired styling, or behavior..."
                style={{
                  pointerEvents: 'auto',
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: '#2b303c',
                  color: '#ffffff',
                  fontSize: '12px',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>

          {/* Popover Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(0, 0, 0, 0.2)'
            }}
          >
            <button
              type="button"
              data-testid="delete-pin-btn"
              onClick={() => {
                onDeletePin?.(activePin.id);
                onSelectPin?.(null);
              }}
              style={{
                pointerEvents: 'auto',
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px 8px'
              }}
            >
              Delete Pin
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                data-testid="save-pin-btn"
                onClick={handleSaveActivePin}
                style={{
                  pointerEvents: 'auto',
                  background: '#3b82f6',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '6px 14px'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

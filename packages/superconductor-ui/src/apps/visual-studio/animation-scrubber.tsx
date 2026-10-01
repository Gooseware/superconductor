import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export type PlaybackSpeed = 0.1 | 0.25 | 0.5 | 1.0;

export interface SpringConfig {
  stiffness: number; // k (e.g. 380)
  damping: number;   // c (e.g. 30)
  mass: number;      // m (e.g. 1.0)
}

export interface SpringState {
  displacement: number;
  velocity: number;
  progress: number;
  timeMs: number;
}

/**
 * 60fps GPU Acceleration whitelist strictly mandated by design-heuristics dogma.
 * Only properties that bypass layout reflow and paint (compositor-only) are allowed.
 */
export const GPU_ACCELERATED_PROPERTIES = ['transform', 'opacity'] as const;

/**
 * Default StyleSeed presets defined in design-heuristics reference.
 */
export const STYLESEED_PRESETS: Record<string, SpringConfig> = {
  Spring: { stiffness: 380, damping: 30, mass: 1 },
  Silk: { stiffness: 200, damping: 35, mass: 1 },
  Snap: { stiffness: 500, damping: 45, mass: 0.8 },
  Float: { stiffness: 100, damping: 20, mass: 2 },
  Pulse: { stiffness: 280, damping: 15, mass: 1 }
};

/**
 * Analytical damped harmonic oscillator calculation for realistic spring physics.
 * Yields normalized displacement where 0.0 is initial state and 1.0 is equilibrium.
 */
export function calculateSpringPhysics(
  tSeconds: number,
  config: SpringConfig
): { displacement: number; velocity: number } {
  const { stiffness: k, damping: c, mass: m } = config;
  if (m <= 0 || k <= 0) return { displacement: 1, velocity: 0 };

  const omega0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(m * k));

  if (zeta < 1) {
    // Underdamped (oscillates with decaying envelope)
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega0 * tSeconds);
    const cosTerm = Math.cos(omegaD * tSeconds);
    const sinTerm = Math.sin(omegaD * tSeconds);
    const factor = (zeta * omega0) / omegaD;

    const x = 1 - decay * (cosTerm + factor * sinTerm);
    const v = decay * (omegaD + zeta * omega0 * factor) * sinTerm;
    return { displacement: x, velocity: v };
  } else if (Math.abs(zeta - 1) < 1e-4) {
    // Critically damped (fastest return without bounce)
    const decay = Math.exp(-omega0 * tSeconds);
    const x = 1 - decay * (1 + omega0 * tSeconds);
    const v = decay * (omega0 * omega0 * tSeconds);
    return { displacement: x, velocity: v };
  } else {
    // Overdamped (sluggish return, no oscillation)
    const omegaD = omega0 * Math.sqrt(zeta * zeta - 1);
    const decay = Math.exp(-zeta * omega0 * tSeconds);
    const coshTerm = Math.cosh(omegaD * tSeconds);
    const sinhTerm = Math.sinh(omegaD * tSeconds);
    const factor = (zeta * omega0) / omegaD;

    const x = 1 - decay * (coshTerm + factor * sinhTerm);
    const v = decay * (omega0 * sinhTerm);
    return { displacement: x, velocity: v };
  }
}

export interface AnimationScrubberProps {
  springConfig?: SpringConfig;
  onSpringConfigChange?: (config: SpringConfig) => void;
  speed?: PlaybackSpeed;
  onSpeedChange?: (speed: PlaybackSpeed) => void;
  onScrub?: (progress: number, state: SpringState) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  durationMs?: number;
  className?: string;
  children?: React.ReactNode | ((state: SpringState, gpuStyle: React.CSSProperties) => React.ReactNode);
}

export function AnimationScrubber({
  springConfig: externalConfig,
  onSpringConfigChange,
  speed: externalSpeed,
  onSpeedChange,
  onScrub,
  onPlayStateChange,
  durationMs = 1200,
  className = '',
  children
}: AnimationScrubberProps) {
  // Local or controlled spring config
  const [internalConfig, setInternalConfig] = useState<SpringConfig>({
    stiffness: 380,
    damping: 30,
    mass: 1
  });
  const config = externalConfig || internalConfig;

  // Local or controlled playback speed
  const [internalSpeed, setInternalSpeed] = useState<PlaybackSpeed>(1.0);
  const speed = externalSpeed !== undefined ? externalSpeed : internalSpeed;

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  const requestRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  const handleConfigChange = (partial: Partial<SpringConfig>) => {
    const updated = { ...config, ...partial };
    setInternalConfig(updated);
    onSpringConfigChange?.(updated);
  };

  const handleSpeedSelect = (newSpeed: PlaybackSpeed) => {
    setInternalSpeed(newSpeed);
    onSpeedChange?.(newSpeed);
  };

  // Calculate current spring state
  const currentState: SpringState = useMemo(() => {
    const tSec = currentTimeMs / 1000;
    const { displacement, velocity } = calculateSpringPhysics(tSec, config);
    const progress = Math.max(0, Math.min(1, currentTimeMs / durationMs));
    return { displacement, velocity, progress, timeMs: currentTimeMs };
  }, [currentTimeMs, config, durationMs]);

  // Notify parent on scrub
  useEffect(() => {
    onScrub?.(currentState.progress, currentState);
  }, [currentState, onScrub]);

  // RequestAnimationFrame loop for continuous playback
  const tick = useCallback(
    (timestamp: number) => {
      if (lastTimestampRef.current !== null) {
        const delta = (timestamp - lastTimestampRef.current) * speed;
        setCurrentTimeMs(prev => {
          const next = prev + delta;
          if (next >= durationMs) {
            setIsPlaying(false);
            onPlayStateChange?.(false);
            return durationMs;
          }
          return next;
        });
      }
      lastTimestampRef.current = timestamp;
      if (isPlaying) {
        requestRef.current = requestAnimationFrame(tick);
      }
    },
    [isPlaying, speed, durationMs, onPlayStateChange]
  );

  useEffect(() => {
    if (isPlaying) {
      lastTimestampRef.current = null;
      requestRef.current = requestAnimationFrame(tick);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      lastTimestampRef.current = null;
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, tick]);

  const togglePlay = () => {
    const nextState = !isPlaying;
    if (nextState && currentTimeMs >= durationMs) {
      setCurrentTimeMs(0);
    }
    setIsPlaying(nextState);
    onPlayStateChange?.(nextState);
  };

  const handleReset = () => {
    setIsPlaying(false);
    onPlayStateChange?.(false);
    setCurrentTimeMs(0);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    onPlayStateChange?.(false);
    const val = parseFloat(e.target.value);
    setCurrentTimeMs(val);
  };

  // GPU Acceleration styles: strictly modulating transform and opacity
  const gpuStyle: React.CSSProperties = useMemo(() => {
    const d = currentState.displacement;
    // Entrance spring animation: starts offset by 30px with 0.2 opacity, scales 0.95 -> 1.0
    const translateY = (1 - d) * 30;
    const scale = 0.95 + d * 0.05;
    const clampedOpacity = Math.max(0, Math.min(1, 0.2 + d * 0.8));

    return {
      transform: `translate3d(0, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`,
      opacity: clampedOpacity,
      willChange: 'transform, opacity',
      transition: 'none' // Controlled directly by scrubber / RAF
    };
  }, [currentState.displacement]);

  // Generate SVG curve points for physics preview
  const curvePoints = useMemo(() => {
    const steps = 60;
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (durationMs / 1000);
      const { displacement } = calculateSpringPhysics(t, config);
      // Map to 240x60 SVG canvas (displacement 0 -> y=50, 1 -> y=15, 1.2 -> y=5)
      const x = (i / steps) * 240;
      const y = 50 - displacement * 35;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return points.join(' ');
  }, [config, durationMs]);

  const currentScrubX = (currentTimeMs / durationMs) * 240;
  const currentFrame = Math.round((currentTimeMs / 1000) * 60);

  return (
    <div
      data-testid="animation-scrubber"
      className={`visual-studio-animation-scrubber ${className}`.trim()}
      style={{
        backgroundColor: '#181b22',
        color: '#f3f4f6',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '16px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontSize: '13px',
        fontFamily: 'inherit',
        maxWidth: '560px'
      }}
    >
      {/* Header with Title and GPU Safety Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em' }}>
            Motion Design & Physics Scrubber
          </span>
        </div>
        <div
          data-testid="gpu-acceleration-badge"
          title="Strictly animates transform and opacity for 60fps compositor pipeline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            padding: '3px 8px',
            borderRadius: '999px',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            fontWeight: 600
          }}
        >
          ⚡ 60fps GPU Safe (transform & opacity)
        </div>
      </div>

      {/* Interactive Specimen Preview Area */}
      <div
        data-testid="scrubber-preview-area"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '140px',
          background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.08) 0%, rgba(0, 0, 0, 0.25) 100%)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
          padding: '20px'
        }}
      >
        {typeof children === 'function' ? (
          children(currentState, gpuStyle)
        ) : children ? (
          <div style={gpuStyle}>{children}</div>
        ) : (
          <div
            data-testid="animated-specimen"
            style={{
              ...gpuStyle,
              padding: '14px 24px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              borderRadius: '8px',
              fontWeight: 600,
              boxShadow: '0 4px 16px rgba(59, 130, 246, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              userSelect: 'none'
            }}
          >
            <span>Preview Card</span>
            <span style={{ fontSize: '11px', opacity: 0.85, fontWeight: 400 }}>
              x: {currentState.displacement.toFixed(2)} | v: {currentState.velocity.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Physics Waveform / Sparkline Curve */}
      <div
        style={{
          position: 'relative',
          height: '60px',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '6px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}
      >
        <svg
          data-testid="physics-curve-svg"
          viewBox="0 0 240 60"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {/* Target equilibrium baseline */}
          <line x1="0" y1="15" x2="240" y2="15" stroke="rgba(255, 255, 255, 0.15)" strokeDasharray="3 3" />
          {/* Spring displacement trajectory */}
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={curvePoints}
          />
          {/* Scrubber needle */}
          <line
            data-testid="scrubber-needle"
            x1={currentScrubX}
            y1="0"
            x2={currentScrubX}
            y2="60"
            stroke="#f59e0b"
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* Playback Controls & Frame Scrubber Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              data-testid="play-pause-btn"
              onClick={togglePlay}
              style={{
                background: isPlaying ? '#f59e0b' : '#3b82f6',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '12px',
                padding: '6px 14px',
                cursor: 'pointer'
              }}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              data-testid="reset-btn"
              onClick={handleReset}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                color: '#d1d5db',
                fontSize: '12px',
                padding: '6px 12px',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          </div>

          <div
            data-testid="scrubber-timestamp"
            style={{ fontSize: '12px', fontFamily: 'monospace', color: '#9ca3af' }}
          >
            {currentTimeMs.toFixed(0)}ms / {durationMs}ms (Frame {currentFrame})
          </div>
        </div>

        {/* Scrub Range Slider */}
        <input
          type="range"
          data-testid="time-scrubber-slider"
          aria-label="Animation timeline scrubber slider"
          min="0"
          max={durationMs}
          step="1"
          value={currentTimeMs}
          onChange={handleSliderChange}
          style={{
            width: '100%',
            cursor: 'ew-resize',
            accentColor: '#3b82f6'
          }}
        />
      </div>

      {/* Speed Controls (10%, 25%, 50%, 100%) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>Playback Speed:</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {([0.1, 0.25, 0.5, 1.0] as PlaybackSpeed[]).map(s => {
            const isSelected = speed === s;
            return (
              <button
                key={s}
                type="button"
                data-testid={`speed-btn-${Math.round(s * 100)}`}
                onClick={() => handleSpeedSelect(s)}
                style={{
                  background: isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.06)',
                  border: isSelected ? '1px solid #60a5fa' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: isSelected ? '#ffffff' : '#9ca3af',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {Math.round(s * 100)}%
              </button>
            );
          })}
        </div>
      </div>

      {/* Preset Selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>StyleSeed Presets:</span>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {Object.entries(STYLESEED_PRESETS).map(([name, pConfig]) => {
            const isMatch =
              config.stiffness === pConfig.stiffness &&
              config.damping === pConfig.damping &&
              config.mass === pConfig.mass;
            return (
              <button
                key={name}
                type="button"
                data-testid={`preset-btn-${name.toLowerCase()}`}
                onClick={() => {
                  setInternalConfig(pConfig);
                  onSpringConfigChange?.(pConfig);
                }}
                style={{
                  background: isMatch ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: isMatch ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: isMatch ? '#93c5fd' : '#9ca3af',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Spring Physics Tuning Inputs */}
      <div
        data-testid="physics-inputs-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          padding: '12px',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}
      >
        {/* Stiffness Input */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label htmlFor="spring-stiffness-input" style={{ fontSize: '11px', color: '#9ca3af' }}>
              Stiffness (k)
            </label>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#e5e7eb' }}>
              {config.stiffness}
            </span>
          </div>
          <input
            id="spring-stiffness-input"
            type="range"
            data-testid="spring-stiffness-slider"
            min="20"
            max="1000"
            step="10"
            value={config.stiffness}
            onChange={e => handleConfigChange({ stiffness: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
        </div>

        {/* Damping Input */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label htmlFor="spring-damping-input" style={{ fontSize: '11px', color: '#9ca3af' }}>
              Damping (c)
            </label>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#e5e7eb' }}>
              {config.damping}
            </span>
          </div>
          <input
            id="spring-damping-input"
            type="range"
            data-testid="spring-damping-slider"
            min="1"
            max="100"
            step="1"
            value={config.damping}
            onChange={e => handleConfigChange({ damping: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
        </div>

        {/* Mass Input */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label htmlFor="spring-mass-input" style={{ fontSize: '11px', color: '#9ca3af' }}>
              Mass (m)
            </label>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#e5e7eb' }}>
              {config.mass}
            </span>
          </div>
          <input
            id="spring-mass-input"
            type="range"
            data-testid="spring-mass-slider"
            min="0.1"
            max="5"
            step="0.1"
            value={config.mass}
            onChange={e => handleConfigChange({ mass: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
        </div>
      </div>
    </div>
  );
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UserFlowGraph, FlowNode, FlowTransition, RouteMarker } from './types.js';
import { FlowGraphBuilder } from './graph.js';

export interface LayoutConfig {
  cardWidth?: number;
  cardHeight?: number;
  gapX?: number;
  gapY?: number;
  startX?: number;
  startY?: number;
}

export interface NodeLayout {
  node: FlowNode;
  rank: number;
  order: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GenerateBoardOptions {
  title?: string;
  videoFileName?: string;
  videoMarkers?: RouteMarker[];
  standalone?: boolean;
  layoutConfig?: LayoutConfig;
}

export interface EmitDiskResult {
  htmlPath: string;
  jsonPath: string;
}

/**
 * Escapes HTML control characters to prevent XSS vulnerabilities.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes URLs to prevent javascript: or data: injection.
 */
export function sanitizeUri(uri: string): string {
  if (!uri) return '';
  const trimmed = uri.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return '#blocked';
  }
  return escapeHtml(trimmed);
}

/**
 * WireframeBoardEmitter emits standalone HTML artifacts visualizing user flow graphs,
 * utilizing Sugiyama hierarchical layouts, SVG cubic bezier splines, and embedded looping video previews.
 */
export class WireframeBoardEmitter {
  /**
   * Computes ranks and 2D grid coordinates for graph nodes using a Sugiyama topological layout algorithm.
   */
  public computeLayout(graph: UserFlowGraph, config?: LayoutConfig): Map<string, NodeLayout> {
    const cardWidth = config?.cardWidth ?? 420;
    const cardHeight = config?.cardHeight ?? 560;
    const gapX = config?.gapX ?? 140;
    const gapY = config?.gapY ?? 80;
    const startX = config?.startX ?? 80;
    const startY = config?.startY ?? 80;

    const builder = FlowGraphBuilder.fromJSON(graph);
    const ranked = builder.topologicalSort({ breakCycles: true });

    // Group vertices by rank
    const rankBuckets = new Map<number, FlowNode[]>();
    for (const item of ranked) {
      let bucket = rankBuckets.get(item.rank);
      if (!bucket) {
        bucket = [];
        rankBuckets.set(item.rank, bucket);
      }
      bucket.push(item.node);
    }

    const sortedRanks = Array.from(rankBuckets.keys()).sort((a, b) => a - b);
    const layoutMap = new Map<string, NodeLayout>();

    for (const rank of sortedRanks) {
      const bucket = rankBuckets.get(rank)!;
      bucket.forEach((node, orderIndex) => {
        const x = startX + rank * (cardWidth + gapX);
        const y = startY + orderIndex * (cardHeight + gapY);

        layoutMap.set(node.id, {
          node,
          rank,
          order: orderIndex,
          x,
          y,
          width: cardWidth,
          height: cardHeight,
        });
      });
    }

    return layoutMap;
  }

  /**
   * Generates a cubic bezier transition spline path between two cards.
   * Format: M x1 y1 C (x1 + dx) y1, (x2 - dx) y2, x2 y2
   */
  public generateSplinePath(source: NodeLayout, target: NodeLayout): string {
    const x1 = source.x + source.width;
    const y1 = source.y + source.height / 2;
    const x2 = target.x;
    const y2 = target.y + target.height / 2;

    const dx = x2 > x1 ? Math.max((x2 - x1) * 0.5, 40) : Math.max(Math.abs(x2 - x1) * 0.5, 60);

    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  /**
   * Generates the complete standalone HTML wireframe board document.
   */
  public generateBoardHtml(graph: UserFlowGraph, options: GenerateBoardOptions = {}): string {
    const title = options.title ?? 'Superconductor User Flow Board';
    const safeTitle = escapeHtml(title);
    const videoFileName = options.videoFileName ? sanitizeUri(options.videoFileName) : undefined;
    const videoMarkers = options.videoMarkers || [];

    const layout = this.computeLayout(graph, options.layoutConfig);

    // Compute bounding box for SVG canvas
    let maxX = 1600;
    let maxY = 1000;
    for (const l of layout.values()) {
      maxX = Math.max(maxX, l.x + l.width + 200);
      maxY = Math.max(maxY, l.y + l.height + 200);
    }

    // Build SVG Spline paths
    const splineElements: string[] = [];
    for (const transition of graph.transitions) {
      const source = layout.get(transition.sourceNodeId);
      const target = layout.get(transition.targetNodeId);
      if (!source || !target) continue;

      const pathData = this.generateSplinePath(source, target);
      const safeTransId = escapeHtml(transition.id);
      const safeTriggerText = escapeHtml(transition.triggerText || transition.triggerType);

      // Midpoint for transition badge
      const x1 = source.x + source.width;
      const y1 = source.y + source.height / 2;
      const x2 = target.x;
      const y2 = target.y + target.height / 2;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      splineElements.push(`
        <g class="transition-group" data-transition-id="${safeTransId}">
          <path d="${pathData}" class="transition-spline" marker-end="url(#arrowhead)" />
          <path d="${pathData}" class="transition-spline-hitbox" />
          <g class="transition-badge" transform="translate(${midX}, ${midY})">
            <rect x="-40" y="-12" width="80" height="24" rx="12" class="badge-bg" />
            <text x="0" y="4" text-anchor="middle" class="badge-text">${safeTriggerText}</text>
          </g>
        </g>
      `);
    }

    // Build HTML Screen Cards embedded via foreignObject
    const cardElements: string[] = [];
    for (const l of layout.values()) {
      const { node, x, y, width, height } = l;
      const safeNodeId = escapeHtml(node.id);
      const safeScreenId = escapeHtml(node.id.replace(/^route:/, 'screen_').replace(/[^a-zA-Z0-9_-]/g, '_'));
      const safeNodeTitle = escapeHtml(node.title || node.path);
      const safeNodePath = escapeHtml(node.path);

      // VSCode IDE deep link: only render if sourceFilePath is truthy and non-empty
      const hasSourceFile = Boolean(node.sourceFilePath && node.sourceFilePath.trim().length > 0);
      const ideLinkHtml = hasSourceFile
        ? `<a href="${sanitizeUri(`vscode://file/${node.sourceFilePath}`)}" class="ide-link" title="Open in VSCode">vscode</a>`
        : '';

      // Render screenshots container
      const desktopShot = node.screenshots?.desktop ? sanitizeUri(node.screenshots.desktop) : '';
      const tabletShot = node.screenshots?.tablet ? sanitizeUri(node.screenshots.tablet) : '';
      const mobileShot = node.screenshots?.mobile ? sanitizeUri(node.screenshots.mobile) : '';

      const screenshotsHtml = `
          <div class="card-screenshots-container">
            ${desktopShot ? `<img src="${desktopShot}" class="screenshot-img screenshot-desktop card-screenshot-desktop" alt="Desktop preview" />` : ''}
            ${tabletShot ? `<img src="${tabletShot}" class="screenshot-img screenshot-tablet card-screenshot-tablet" alt="Tablet preview" />` : ''}
            ${mobileShot ? `<img src="${mobileShot}" class="screenshot-img screenshot-mobile card-screenshot-mobile" alt="Mobile preview" />` : ''}
            ${!desktopShot && !tabletShot && !mobileShot ? `<div class="no-screenshot-placeholder"><span>No Captured Screenshot</span></div>` : ''}
          </div>
        `;

      let videoWrapperHtml = '';
      if (node.videoSlice && videoFileName) {
        const start = node.videoSlice.start;
        const end = node.videoSlice.end;
        const videoSrc = sanitizeUri(`${videoFileName}#t=${start},${end}`);
        videoWrapperHtml = `
          <div class="card-video-wrapper">
            <video src="${videoSrc}" loop autoplay muted playsinline class="card-video-preview" data-start="${start}" data-end="${end}"></video>
            <span class="video-slice-badge">Loop: ${start}s - ${end}s</span>
          </div>
        `;
      }

      const previewHtml = videoWrapperHtml ? `${videoWrapperHtml}\n${screenshotsHtml}` : screenshotsHtml;

      cardElements.push(`
        <foreignObject x="${x}" y="${y}" width="${width}" height="${height}" class="flow-card-object" data-node-id="${safeNodeId}" data-screen-id="${safeScreenId}">
          <div class="wireframe-card" data-node-type="${escapeHtml(node.type)}" data-node-id="${safeNodeId}" data-screen-id="${safeScreenId}">
            <header class="card-header">
              <div class="header-badges">
                <span class="type-badge badge-${escapeHtml(node.type)}">${escapeHtml(node.type.toUpperCase())}</span>
                ${node.authRequired ? `<span class="auth-badge">🔒 Auth</span>` : ''}
              </div>
              <h3 class="card-title" title="${safeNodeTitle}">${safeNodeTitle}</h3>
              <div class="card-route-info">
                <span class="card-route-path">${safeNodePath}</span>
                ${ideLinkHtml}
              </div>
            </header>
            <div class="card-body">
              ${previewHtml}
            </div>
            <footer class="card-footer">
              <span class="card-id-label">ID: ${safeNodeId}</span>
            </footer>
          </div>
        </foreignObject>
      `);
    }

    // Build Journey Video Player Timeline Markers
    let journeyPlayerHtml = '';
    if (videoFileName && videoMarkers.length > 0) {
      const maxTime = Math.max(...videoMarkers.map(m => m.relativeEndSec || m.relativeStartSec || 1), 1);
      const markerPins = videoMarkers.map(m => {
        const startSec = m.relativeStartSec || 0;
        const leftPct = Math.min(Math.max((startSec / maxTime) * 100, 0), 100).toFixed(2);
        return `
          <button class="timeline-marker-pin" data-seek-time="${startSec}" data-screen-id="${escapeHtml(m.screenId)}" style="left: ${leftPct}%;" title="${escapeHtml(m.route)} (${escapeHtml(m.action)})">
            <span class="marker-dot"></span>
            <span class="pin-label">${escapeHtml(m.screenId)}</span>
          </button>
        `;
      }).join('\n');

      journeyPlayerHtml = `
        <div class="journey-player-bar" id="journey-bar">
          <div class="player-left">
            <video id="journey-video" src="${videoFileName}" controls preload="metadata"></video>
            <div class="video-info">
              <span class="video-title">Journey Playback</span>
              <span class="video-sub">${escapeHtml(videoFileName)}</span>
            </div>
          </div>
          <div class="journey-timeline-wrapper">
            <div class="journey-timeline" id="journey-timeline">
              <div class="timeline-track"></div>
              <div class="timeline-progress" id="timeline-progress"></div>
              ${markerPins}
            </div>
          </div>
          <div class="player-controls">
            <button class="btn-ctrl" id="btn-toggle-player" title="Collapse / Expand Player">▼</button>
          </div>
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    :root {
      --astryx-bg: #090d16;
      --astryx-surface: #111827;
      --astryx-surface-secondary: #1f293d;
      --astryx-surface-hover: #27354f;
      --astryx-border: #1e293b;
      --astryx-border-hover: #06b6d4;
      --astryx-text: #f8fafc;
      --astryx-text-secondary: #94a3b8;
      --astryx-text-muted: #64748b;
      --astryx-primary: #06b6d4;
      --astryx-primary-hover: #22d3ee;
      --astryx-accent: #8b5cf6;
      --astryx-warning: #f59e0b;
      --astryx-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --astryx-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, html { width: 100%; height: 100%; overflow: hidden; background: var(--astryx-bg); color: var(--astryx-text); font-family: var(--astryx-font); }

    /* Top Navigation Toolbar */
    .top-toolbar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 56px;
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--astryx-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 100;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      font-size: 16px;
      font-weight: 700;
      color: var(--astryx-primary);
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .board-title {
      font-size: 14px;
      color: var(--astryx-text-secondary);
      border-left: 1px solid var(--astryx-border);
      padding-left: 12px;
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .button-group {
      display: flex;
      background: var(--astryx-surface-secondary);
      border-radius: 6px;
      padding: 3px;
      border: 1px solid var(--astryx-border);
    }

    .btn-tb {
      background: transparent;
      border: none;
      color: var(--astryx-text-secondary);
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s ease;
    }

    .btn-tb:hover {
      color: var(--astryx-text);
      background: var(--astryx-surface-hover);
    }

    .btn-tb.active {
      background: var(--astryx-primary);
      color: #041018;
      font-weight: 600;
    }

    /* Board Container & SVG Pan/Zoom Canvas */
    .board-container {
      width: 100vw;
      height: 100vh;
      position: absolute;
      top: 0;
      left: 0;
      cursor: grab;
      user-select: none;
    }

    .board-container.panning {
      cursor: grabbing;
    }

    #board-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* SVG Transitions & Splines */
    .transition-spline {
      fill: none;
      stroke: var(--astryx-primary);
      stroke-width: 2.5;
      stroke-linecap: round;
      filter: drop-shadow(0 0 4px rgba(6, 182, 212, 0.4));
      transition: stroke-width 0.2s ease, stroke 0.2s ease;
    }

    .transition-spline-hitbox {
      fill: none;
      stroke: transparent;
      stroke-width: 20;
      cursor: pointer;
    }

    .transition-group:hover .transition-spline {
      stroke: #38bdf8;
      stroke-width: 4;
      filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.8));
    }

    .badge-bg {
      fill: var(--astryx-surface-secondary);
      stroke: var(--astryx-border);
      stroke-width: 1;
    }

    .badge-text {
      fill: var(--astryx-text-secondary);
      font-size: 10px;
      font-family: var(--astryx-font-mono);
      pointer-events: none;
    }

    /* Screen Wireframe Cards */
    .wireframe-card {
      width: 100%;
      height: 100%;
      background: var(--astryx-surface);
      border: 1px solid var(--astryx-border);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    }

    .wireframe-card:hover {
      border-color: var(--astryx-border-hover);
      box-shadow: 0 12px 30px rgba(6, 182, 212, 0.25);
    }

    .wireframe-card.highlighted {
      border-color: #38bdf8;
      box-shadow: 0 0 24px rgba(56, 189, 248, 0.6);
    }

    .card-header {
      padding: 12px 14px;
      background: var(--astryx-surface-secondary);
      border-bottom: 1px solid var(--astryx-border);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .header-badges {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .type-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }

    .badge-route { background: rgba(6, 182, 212, 0.2); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.4); }
    .badge-modal { background: rgba(139, 92, 246, 0.2); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.4); }
    .badge-drawer { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }

    .auth-badge {
      font-size: 10px;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--astryx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-route-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .card-route-path {
      font-size: 11px;
      font-family: var(--astryx-font-mono);
      color: var(--astryx-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ide-link {
      font-size: 11px;
      font-family: var(--astryx-font-mono);
      color: var(--astryx-primary);
      text-decoration: none;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(6, 182, 212, 0.1);
      border: 1px solid rgba(6, 182, 212, 0.3);
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .ide-link:hover {
      background: var(--astryx-primary);
      color: #041018;
    }

    .card-body {
      flex: 1;
      background: #060911;
      overflow: hidden;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card-video-wrapper {
      width: 100%;
      height: 100%;
      position: relative;
      display: none;
      align-items: center;
      justify-content: center;
    }

    .card-video-preview {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }

    .video-slice-badge {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid var(--astryx-border);
      color: var(--astryx-text-secondary);
      font-size: 10px;
      font-family: var(--astryx-font-mono);
      padding: 2px 6px;
      border-radius: 4px;
      pointer-events: none;
    }

    .card-screenshots-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .screenshot-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: none;
    }

    /* Viewport switching rules */
    /* When data-active-viewport="desktop", display .card-video-wrapper (if present) or .card-screenshot-desktop */
    .board-container[data-active-viewport="desktop"] .card-video-wrapper {
      display: flex;
    }
    .board-container[data-active-viewport="desktop"] .card-body:has(.card-video-wrapper) .card-screenshots-container {
      display: none;
    }
    .board-container[data-active-viewport="desktop"] .card-body:not(:has(.card-video-wrapper)) .screenshot-desktop,
    .board-container[data-active-viewport="desktop"] .card-body:not(:has(.card-video-wrapper)) .card-screenshot-desktop {
      display: block;
    }

    /* When data-active-viewport="tablet", hide .card-video-wrapper and display .card-screenshot-tablet */
    .board-container[data-active-viewport="tablet"] .card-video-wrapper {
      display: none !important;
    }
    .board-container[data-active-viewport="tablet"] .screenshot-tablet,
    .board-container[data-active-viewport="tablet"] .card-screenshot-tablet {
      display: block;
    }

    /* When data-active-viewport="mobile", hide .card-video-wrapper and display .card-screenshot-mobile */
    .board-container[data-active-viewport="mobile"] .card-video-wrapper {
      display: none !important;
    }
    .board-container[data-active-viewport="mobile"] .screenshot-mobile,
    .board-container[data-active-viewport="mobile"] .card-screenshot-mobile {
      display: block;
    }

    /* When data-active-viewport="side-by-side", display side-by-side screenshots */
    .board-container[data-active-viewport="side-by-side"] .card-video-wrapper {
      display: none !important;
    }
    .board-container[data-active-viewport="side-by-side"] .card-screenshots-container {
      flex-direction: row;
      gap: 4px;
      padding: 4px;
    }
    .board-container[data-active-viewport="side-by-side"] .screenshot-img {
      display: block;
      max-width: 32%;
      border: 1px solid var(--astryx-border);
      border-radius: 4px;
    }

    /* Fallback if active viewport screenshot missing */
    .board-container[data-active-viewport="tablet"] .card-screenshots-container:not(:has(.screenshot-tablet)):not(:has(.card-screenshot-tablet)) .screenshot-desktop,
    .board-container[data-active-viewport="tablet"] .card-screenshots-container:not(:has(.screenshot-tablet)):not(:has(.card-screenshot-tablet)) .card-screenshot-desktop,
    .board-container[data-active-viewport="mobile"] .card-screenshots-container:not(:has(.screenshot-mobile)):not(:has(.card-screenshot-mobile)) .screenshot-desktop,
    .board-container[data-active-viewport="mobile"] .card-screenshots-container:not(:has(.screenshot-mobile)):not(:has(.card-screenshot-mobile)) .card-screenshot-desktop {
      display: block;
      opacity: 0.7;
    }

    .no-screenshot-placeholder {
      color: var(--astryx-text-muted);
      font-size: 12px;
      font-style: italic;
    }

    .card-footer {
      padding: 6px 12px;
      background: var(--astryx-surface-secondary);
      border-top: 1px solid var(--astryx-border);
      font-size: 10px;
      color: var(--astryx-text-muted);
      font-family: var(--astryx-font-mono);
      display: flex;
      justify-content: space-between;
    }

    /* Bottom Journey Video Player Bar */
    .journey-player-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 80px;
      background: rgba(17, 24, 39, 0.95);
      backdrop-filter: blur(12px);
      border-top: 1px solid var(--astryx-border);
      display: flex;
      align-items: center;
      padding: 0 20px;
      gap: 20px;
      z-index: 100;
      transition: transform 0.25s ease;
    }

    .journey-player-bar.collapsed {
      transform: translateY(calc(100% - 24px));
    }

    .player-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    #journey-video {
      width: 120px;
      height: 64px;
      background: #000;
      border-radius: 6px;
      border: 1px solid var(--astryx-border);
      object-fit: cover;
    }

    .video-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .video-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--astryx-text);
    }

    .video-sub {
      font-size: 10px;
      font-family: var(--astryx-font-mono);
      color: var(--astryx-text-muted);
    }

    .journey-timeline-wrapper {
      flex: 1;
      position: relative;
    }

    .journey-timeline {
      width: 100%;
      height: 28px;
      position: relative;
      cursor: pointer;
      display: flex;
      align-items: center;
    }

    .timeline-track {
      position: absolute;
      top: 12px;
      left: 0;
      right: 0;
      height: 4px;
      background: var(--astryx-surface-hover);
      border-radius: 2px;
    }

    .timeline-progress {
      position: absolute;
      top: 12px;
      left: 0;
      height: 4px;
      width: 0%;
      background: var(--astryx-primary);
      border-radius: 2px;
      pointer-events: none;
    }

    .timeline-marker-pin {
      position: absolute;
      top: 4px;
      transform: translateX(-50%);
      background: none;
      border: none;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0;
      z-index: 2;
    }

    .marker-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--astryx-primary);
      border: 2px solid var(--astryx-surface);
      box-shadow: 0 0 6px rgba(6, 182, 212, 0.8);
      transition: transform 0.15s ease;
    }

    .timeline-marker-pin:hover .marker-dot,
    .timeline-marker-pin.active .marker-dot {
      transform: scale(1.4);
      background: #38bdf8;
    }

    .pin-label {
      font-size: 9px;
      font-family: var(--astryx-font-mono);
      color: var(--astryx-text-muted);
      margin-top: 4px;
      white-space: nowrap;
      pointer-events: none;
    }

    .btn-ctrl {
      background: transparent;
      border: 1px solid var(--astryx-border);
      color: var(--astryx-text-secondary);
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="top-toolbar">
    <div class="brand-section">
      <div class="brand-logo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span>Superconductor</span>
      </div>
      <div class="board-title">${safeTitle}</div>
    </div>

    <div class="toolbar-actions">
      <!-- Triple Viewport Switcher -->
      <div class="button-group viewport-switcher">
        <button class="btn-tb active" data-viewport="desktop">Desktop (1280×800)</button>
        <button class="btn-tb" data-viewport="tablet">Tablet (768×1024)</button>
        <button class="btn-tb" data-viewport="mobile">Mobile (390×844)</button>
        <button class="btn-tb" data-viewport="side-by-side">Side-by-Side</button>
      </div>

      <!-- Zoom / Pan Controls -->
      <div class="button-group zoom-controls">
        <button class="btn-tb" data-action="zoom-in" title="Zoom In">+</button>
        <button class="btn-tb" data-action="zoom-out" title="Zoom Out">−</button>
        <button class="btn-tb" data-action="zoom-reset" title="Reset Pan/Zoom">Reset</button>
      </div>
    </div>
  </div>

  <div class="board-container" id="board-container" data-active-viewport="desktop">
    <svg id="board-canvas" viewBox="0 0 ${maxX} ${maxY}">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#06b6d4" />
        </marker>
      </defs>

      <g id="viewport" transform="matrix(1, 0, 0, 1, 40, 60)">
        <g id="transitions-layer">
          ${splineElements.join('\n')}
        </g>
        <g id="nodes-layer">
          ${cardElements.join('\n')}
        </g>
      </g>
    </svg>
  </div>

  ${journeyPlayerHtml}

  <!-- Vanilla Pan/Zoom & Interactive Runtime (<3KB) -->
  <script>
    (function() {
      var container = document.getElementById('board-container');
      var viewport = document.getElementById('viewport');
      var scale = 1, panX = 40, panY = 60;
      var isPanning = false, startX = 0, startY = 0;

      function updateTransform() {
        viewport.setAttribute('transform', 'matrix(' + scale + ', 0, 0, ' + scale + ', ' + panX + ', ' + panY + ')');
      }

      container.addEventListener('pointerdown', function(e) {
        if (e.target.closest('.wireframe-card') || e.target.closest('.journey-player-bar') || e.target.closest('.top-toolbar')) return;
        isPanning = true;
        startX = e.clientX - panX;
        startY = e.clientY - panY;
        container.classList.add('panning');
        container.setPointerCapture(e.pointerId);
      });

      container.addEventListener('pointermove', function(e) {
        if (!isPanning) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        updateTransform();
      });

      function endPan(e) {
        if (!isPanning) return;
        isPanning = false;
        container.classList.remove('panning');
        try { container.releasePointerCapture(e.pointerId); } catch(err) {}
      }
      container.addEventListener('pointerup', endPan);
      container.addEventListener('pointercancel', endPan);

      container.addEventListener('wheel', function(e) {
        e.preventDefault();
        var rect = container.getBoundingClientRect();
        var cursorX = e.clientX - rect.left;
        var cursorY = e.clientY - rect.top;
        var zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        var newScale = Math.min(Math.max(scale * zoomFactor, 0.15), 4.0);
        panX = cursorX - (cursorX - panX) * (newScale / scale);
        panY = cursorY - (cursorY - panY) * (newScale / scale);
        scale = newScale;
        updateTransform();
      }, { passive: false });

      // Toolbar Viewport Switcher
      document.querySelectorAll('.viewport-switcher .btn-tb').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.viewport-switcher .btn-tb').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          container.setAttribute('data-active-viewport', btn.getAttribute('data-viewport'));
        });
      });

      // Zoom Controls
      document.querySelector('[data-action="zoom-in"]').addEventListener('click', function() {
        scale = Math.min(scale * 1.25, 4.0);
        updateTransform();
      });
      document.querySelector('[data-action="zoom-out"]').addEventListener('click', function() {
        scale = Math.max(scale * 0.8, 0.15);
        updateTransform();
      });
      document.querySelector('[data-action="zoom-reset"]').addEventListener('click', function() {
        scale = 1; panX = 40; panY = 60;
        updateTransform();
      });

      // Global Journey Video Timeline seeking
      var journeyVideo = document.getElementById('journey-video');
      var timelineProgress = document.getElementById('timeline-progress');
      if (journeyVideo && timelineProgress) {
        journeyVideo.addEventListener('timeupdate', function() {
          if (!journeyVideo.duration) return;
          var pct = (journeyVideo.currentTime / journeyVideo.duration) * 100;
          timelineProgress.style.width = pct + '%';
        });

        document.querySelectorAll('.timeline-marker-pin').forEach(function(pin) {
          pin.addEventListener('click', function() {
            var seek = parseFloat(pin.getAttribute('data-seek-time') || '0');
            journeyVideo.currentTime = seek;
            journeyVideo.play();
            var screenId = pin.getAttribute('data-screen-id');
            document.querySelectorAll('.wireframe-card').forEach(function(c) { c.classList.remove('highlighted'); });
            var targetObj = document.querySelector('[data-screen-id="' + screenId + '"] .wireframe-card') || document.querySelector('[data-node-id="' + screenId + '"] .wireframe-card');
            if (targetObj) targetObj.classList.add('highlighted');
          });
        });

        var toggleBtn = document.getElementById('btn-toggle-player');
        if (toggleBtn) {
          toggleBtn.addEventListener('click', function() {
            document.getElementById('journey-bar').classList.toggle('collapsed');
          });
        }
      }

      // Looping Video Previews Handler for Media Fragment Boundaries
      document.querySelectorAll('.card-video-preview').forEach(function(vid) {
        var start = parseFloat(vid.getAttribute('data-start') || '0');
        var end = parseFloat(vid.getAttribute('data-end') || '0');
        if (end > start) {
          vid.addEventListener('timeupdate', function() {
            if (vid.currentTime >= end || vid.currentTime < start) {
              vid.currentTime = start;
              vid.play().catch(function() {});
            }
          });
        }
      });
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Emits the wireframe board HTML and flow-graph.json to disk.
   */
  public async emitToDisk(
    outputDir = 'superconductor/wireframes',
    graph: UserFlowGraph,
    options: GenerateBoardOptions = {}
  ): Promise<EmitDiskResult> {
    await fs.promises.mkdir(outputDir, { recursive: true });

    const htmlContent = this.generateBoardHtml(graph, options);
    const htmlPath = path.join(outputDir, 'index.html');
    await fs.promises.writeFile(htmlPath, htmlContent, 'utf-8');

    const jsonContent = JSON.stringify(graph, null, 2);
    const jsonPath = path.join(outputDir, 'flow-graph.json');
    await fs.promises.writeFile(jsonPath, jsonContent, 'utf-8');

    return { htmlPath, jsonPath };
  }
}

import type { Page } from 'playwright';
import { captureWebPScreenshot } from './runner.js';
import type {
  FlowNode,
  FlowTransition,
  DiscoveredAffordance,
  BlockedMutation,
  AffordanceType,
} from './types.js';
import { FlowGraphBuilder } from './graph.js';
import { takeJevSnapshot } from './jevSnapshot.js';

export interface AffordanceProberOptions {
  timeoutMs?: number;
  blockMethods?: string[];
  destructiveKeywords?: string[];
  baseUrl?: string;
}

export interface ProbeModalOptions {
  timeoutMs?: number;
  useJev?: boolean;
}

export const MODAL_OVERLAY_SELECTOR = '[role="dialog"]:not([style*="display: none"]), [data-state="open"]:not(button):not(a):not([role="button"]), dialog[open], [aria-modal="true"]';
export const DRAWER_OVERLAY_SELECTOR = '[data-drawer]:not([style*="display: none"]), [aria-label*="drawer" i], [data-slot="sheet-content"], [data-slot="drawer-content"]';

export const DEFAULT_DESTRUCTIVE_KEYWORDS = [
  'delete',
  'remove',
  'drop',
  'logout',
  'sign out',
  'signout',
  'log out',
  'destroy',
  'purge',
  'unlink',
];

/**
 * AffordanceProber executes safe, read-only affordance discovery and interactive probing.
 * It strictly intercepts non-GET network mutations (POST, PUT, DELETE, PATCH),
 * discovers interactive navigation affordances (internal links, modals, drawers),
 * filters out destructive actions, and safely probes modal overlays with Escape-dismissal backtracking.
 */
export class AffordanceProber {
  private timeoutMs: number;
  private blockMethods: string[];
  private destructiveKeywords: string[];
  private blockedMutations: BlockedMutation[] = [];
  private isInterceptionAttached: boolean = false;
  private baseUrl?: string;

  constructor(options: AffordanceProberOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.blockMethods = (options.blockMethods ?? ['POST', 'PUT', 'DELETE', 'PATCH']).map(m => m.toUpperCase());
    this.destructiveKeywords = (options.destructiveKeywords ?? DEFAULT_DESTRUCTIVE_KEYWORDS).map(k => k.toLowerCase());
    this.baseUrl = options.baseUrl;
  }

  /**
   * Attaches route interception on the page.
   * Automatically aborts or rejects any non-GET request (POST, PUT, DELETE, PATCH)
   * to guarantee read-only crawling without destructive backend state mutations.
   * Strictly aborts requests attempting to contact cloud metadata IPs or external hosts.
   */
  async attachNetworkInterceptor(page: Page, baseUrl?: string): Promise<void> {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
    const currentBaseHost = this.baseUrl ? new URL(this.baseUrl).hostname.toLowerCase() : undefined;

    await page.route('**/*', async (route, request) => {
      const rawUrl = request.url();
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        await route.abort('blockedbyclient');
        return;
      }

      // Allow harmless internal data/blob/about URIs
      if (['data:', 'blob:', 'about:'].includes(parsedUrl.protocol)) {
        await route.continue();
        return;
      }

      const reqHost = parsedUrl.hostname.toLowerCase();
      const normalizedReqHost = reqHost.replace(/^\[|\]$/g, '');

      // Check cloud metadata endpoints
      const isCloudMetadata =
        normalizedReqHost === '169.254.169.254' ||
        normalizedReqHost.startsWith('169.254.') ||
        normalizedReqHost === 'metadata.google.internal' ||
        normalizedReqHost === 'metadata.azure.internal' ||
        normalizedReqHost === 'instance-data' ||
        normalizedReqHost === '100.100.100.200';

      if (isCloudMetadata) {
        this.blockedMutations.push({
          url: rawUrl,
          method: request.method().toUpperCase(),
          timestamp: Date.now(),
        });
        await route.abort('blockedbyclient');
        return;
      }

      // Check loopback / same host confinement
      const isLoopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(normalizedReqHost);
      const matchesBaseHost = currentBaseHost
        ? (reqHost === currentBaseHost || normalizedReqHost === currentBaseHost.replace(/^\[|\]$/g, ''))
        : false;

      // Abort requests to non-loopback external hosts that differ from baseUrl's host
      if (!isLoopback && !matchesBaseHost) {
        this.blockedMutations.push({
          url: rawUrl,
          method: request.method().toUpperCase(),
          timestamp: Date.now(),
        });
        await route.abort('blockedbyclient');
        return;
      }

      const method = request.method().toUpperCase();
      if (this.blockMethods.includes(method)) {
        this.blockedMutations.push({
          url: rawUrl,
          method,
          timestamp: Date.now(),
        });
        await route.abort('blockedbyclient');
      } else {
        await route.continue();
      }
    });
    this.isInterceptionAttached = true;
  }

  /**
   * Detaches the network route interception.
   */
  async detachNetworkInterceptor(page: Page): Promise<void> {
    try {
      await page.unroute('**/*');
    } catch {}
    this.isInterceptionAttached = false;
  }

  /**
   * Returns all recorded blocked network mutations.
   */
  getBlockedMutations(): BlockedMutation[] {
    return [...this.blockedMutations];
  }

  /**
   * Clears the recorded blocked network mutations log.
   */
  clearBlockedMutations(): void {
    this.blockedMutations = [];
  }

  /**
   * Checks whether a text string, attribute, or action name contains destructive keywords.
   */
  isDestructive(textOrAttr: string): boolean {
    if (!textOrAttr || typeof textOrAttr !== 'string') return false;
    const lower = textOrAttr.toLowerCase().trim();
    return this.destructiveKeywords.some(keyword => {
      // Check full word match or keyword contained with word boundary / separator
      const regex = new RegExp(`(^|[^a-z0-9])${keyword.replace(/\s+/g, '\\s*')}([^a-z0-9]|$)`, 'i');
      return regex.test(lower) || lower.includes(keyword);
    });
  }

  /**
   * Evaluates the hydrated DOM for interactive navigation elements.
   * Discovers:
   * - Internal links (<a href>, <Link to>) matching same origin
   * - Dialog / Modal triggers (button[data-state="closed"], [aria-haspopup="dialog"], [data-modal-target], Radix UI)
   * - Drawer / Sheet triggers ([data-drawer-target], [aria-controls*="drawer"])
   * Strictly excludes:
   * - Forms and buttons with type="submit"
   * - Elements with destructive keywords ('delete', 'remove', 'drop', 'logout', 'sign out')
   */
  async discoverAffordances(page: Page): Promise<DiscoveredAffordance[]> {
    const rawAffordances = await page.evaluate((destructiveKeywords: string[]) => {
      const results: Array<{
        type: 'link' | 'modal_trigger' | 'drawer_trigger';
        selector: string;
        text: string;
        target?: string;
        ariaLabel?: string;
        elementHtml?: string;
      }> = [];

      const isTextDestructive = (text: string | null | undefined): boolean => {
        if (!text) return false;
        const lower = text.toLowerCase().trim();
        return destructiveKeywords.some(keyword => {
          const regex = new RegExp(`(^|[^a-z0-9])${keyword.replace(/\\s+/g, '\\s*')}([^a-z0-9]|$)`, 'i');
          return regex.test(lower) || lower.includes(keyword);
        });
      };

      const isElementDestructive = (el: Element): boolean => {
        // 1. Strict submit exclusion
        const tag = el.tagName.toLowerCase();
        const typeAttr = el.getAttribute('type');

        if (typeAttr === 'submit') return true;

        if (tag === 'button' && (!typeAttr || typeAttr === 'submit')) {
          if (el.closest('form')) return true;
        }

        if (tag === 'input' && typeAttr === 'submit') return true;

        // 2. Destructive keyword exclusion across text, attributes, and classnames
        const text = el.textContent || '';
        if (isTextDestructive(text)) return true;

        const ariaLabel = el.getAttribute('aria-label');
        if (isTextDestructive(ariaLabel)) return true;

        const title = el.getAttribute('title');
        if (isTextDestructive(title)) return true;

        const name = el.getAttribute('name');
        if (isTextDestructive(name)) return true;

        const id = el.getAttribute('id');
        if (isTextDestructive(id)) return true;

        const dataAction = el.getAttribute('data-action');
        if (isTextDestructive(dataAction)) return true;

        const className = typeof el.className === 'string' ? el.className : '';
        if (/(danger|destructive|delete-btn|remove-btn)/i.test(className)) return true;

        return false;
      };

      const getUniqueSelector = (el: Element): string => {
        if (el.id) {
          return `#${CSS.escape(el.id)}`;
        }
        const testId = el.getAttribute('data-testid');
        if (testId) {
          return `[data-testid="${CSS.escape(testId)}"]`;
        }
        const modalTarget = el.getAttribute('data-modal-target');
        if (modalTarget) {
          return `[data-modal-target="${CSS.escape(modalTarget)}"]`;
        }
        const drawerTarget = el.getAttribute('data-drawer-target');
        if (drawerTarget) {
          return `[data-drawer-target="${CSS.escape(drawerTarget)}"]`;
        }
        const ariaControls = el.getAttribute('aria-controls');
        if (ariaControls) {
          return `[aria-controls="${CSS.escape(ariaControls)}"]`;
        }
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) {
          return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;
        }
        const href = el.getAttribute('href');
        if (href) {
          return `a[href="${CSS.escape(href)}"]`;
        }

        let sel = el.tagName.toLowerCase();
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(/\s+/).filter(c => c && !c.includes(':') && !c.includes('['));
          if (classes.length > 0) {
            sel += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
          }
        }
        const parent = el.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(el) + 1;
            sel += `:nth-of-type(${index})`;
          }
        }
        return sel;
      };

      const recordedSelectors = new Set<string>();

      // 1. Internal Links Discovery
      const linkElements = Array.from(document.querySelectorAll('a[href], [data-to], [to]'));
      let currentOrigin = '';
      try {
        if (window.location && window.location.origin && window.location.origin !== 'null') {
          currentOrigin = window.location.origin;
        }
      } catch {}

      for (const link of linkElements) {
        if (isElementDestructive(link)) continue;

        const href = link.getAttribute('href') || link.getAttribute('to') || link.getAttribute('data-to') || '';
        if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          continue;
        }

        // Origin check: internal links only within same origin
        if (href.startsWith('http://') || href.startsWith('https://')) {
          try {
            const parsed = new URL(href);
            if (!currentOrigin || currentOrigin === 'about:blank' || parsed.origin !== currentOrigin) {
              continue; // External link
            }
          } catch {
            continue;
          }
        }

        const selector = getUniqueSelector(link);
        if (recordedSelectors.has(selector)) continue;
        recordedSelectors.add(selector);

        results.push({
          type: 'link',
          selector,
          text: link.textContent?.trim() || '',
          target: href,
          ariaLabel: link.getAttribute('aria-label') || undefined,
        });
      }

      // 2. Dialog / Modal Triggers Discovery
      const modalTriggerSelector = [
        'button[data-state="closed"]',
        '[aria-haspopup="dialog"]',
        '[data-modal-target]',
        '[data-dialog-trigger]',
        '[data-slot="dialog-trigger"]',
        '[data-radix-collection-item][aria-haspopup="dialog"]',
        'button[aria-expanded="false"][aria-haspopup="dialog"]',
      ].join(', ');

      const modalTriggers = Array.from(document.querySelectorAll(modalTriggerSelector));
      for (const trigger of modalTriggers) {
        if (isElementDestructive(trigger)) continue;

        const selector = getUniqueSelector(trigger);
        if (recordedSelectors.has(selector)) continue;
        recordedSelectors.add(selector);

        results.push({
          type: 'modal_trigger',
          selector,
          text: trigger.textContent?.trim() || '',
          target: trigger.getAttribute('data-modal-target') || trigger.getAttribute('aria-controls') || undefined,
          ariaLabel: trigger.getAttribute('aria-label') || undefined,
        });
      }

      // 3. Drawer / Sheet Triggers Discovery
      const drawerTriggerSelector = [
        '[data-drawer-target]',
        '[aria-controls*="drawer" i]',
        '[data-sheet-target]',
        '[aria-controls*="sheet" i]',
        '[data-slot="drawer-trigger"]',
        '[data-slot="sheet-trigger"]',
      ].join(', ');

      const drawerTriggers = Array.from(document.querySelectorAll(drawerTriggerSelector));
      for (const trigger of drawerTriggers) {
        if (isElementDestructive(trigger)) continue;

        const selector = getUniqueSelector(trigger);
        if (recordedSelectors.has(selector)) continue;
        recordedSelectors.add(selector);

        results.push({
          type: 'drawer_trigger',
          selector,
          text: trigger.textContent?.trim() || '',
          target: trigger.getAttribute('data-drawer-target') || trigger.getAttribute('data-sheet-target') || trigger.getAttribute('aria-controls') || undefined,
          ariaLabel: trigger.getAttribute('aria-label') || undefined,
        });
      }

      return results;
    }, this.destructiveKeywords);

    return rawAffordances;
  }

  /**
   * Evaluates the hydrated DOM using Jev Ultrafast Semantic Snapshot Engine.
   * Leverages WeakMap-backed identity caching, WAI-ARIA accessible names,
   * true CSS visibility checks, and discrete action spaces.
   * Strictly enforces read-only guards:
   * - Excludes forms and elements with type="submit" or isSubmit
   * - Excludes elements matching destructive keywords ('delete', 'remove', 'drop', 'logout', etc.)
   */
  async discoverAffordancesWithJev(page: Page): Promise<DiscoveredAffordance[]> {
    const snapshot = await takeJevSnapshot(page);
    const results: DiscoveredAffordance[] = [];
    const recordedSelectors = new Set<string>();

    let currentOrigin = '';
    try {
      const pageUrl = page.url();
      if (pageUrl && pageUrl !== 'about:blank' && pageUrl.startsWith('http')) {
        currentOrigin = new URL(pageUrl).origin;
      }
    } catch {}

    for (const action of snapshot.actions) {
      if (['scroll', 'wait'].includes(action.kind)) continue;

      // 1. Strict submit exclusion
      if (action.isSubmit || action.explicitType === 'submit') continue;
      if (action.selector && (action.selector.includes('[type="submit"]') || action.selector.includes('type="submit"'))) {
        continue;
      }

      // 2. Destructive keyword exclusion
      const label = action.label || '';
      if (this.isDestructive(label)) continue;
      if (action.value && this.isDestructive(String(action.value))) continue;
      if (action.href && this.isDestructive(action.href)) continue;
      if (action.selector && this.isDestructive(action.selector)) continue;

      // 3. Classify affordance type
      let type: AffordanceType | null = null;
      let target = action.href || action.modalTarget || action.drawerTarget || action.ariaControls;

      const isDrawer = Boolean(
        action.drawerTarget ||
        action.ariaControls?.toLowerCase().includes('drawer') ||
        action.ariaControls?.toLowerCase().includes('sheet') ||
        label.toLowerCase().includes('drawer') ||
        label.toLowerCase().includes('sheet') ||
        (action.selector && (action.selector.includes('drawer') || action.selector.includes('sheet')))
      );

      const isModal = Boolean(
        action.modalTarget ||
        action.ariaHasPopup === 'dialog' ||
        action.role === 'dialog' ||
        (action.selector && (action.selector.includes('modal') || action.selector.includes('dialog'))) ||
        (action.role === 'button' && (label.toLowerCase().includes('modal') || label.toLowerCase().includes('dialog')))
      );

      if (isDrawer) {
        type = 'drawer_trigger';
      } else if (isModal) {
        type = 'modal_trigger';
      } else if (action.role === 'link' || action.href) {
        const href = action.href || '';
        if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          continue;
        }
        if (href.startsWith('http://') || href.startsWith('https://')) {
          try {
            const parsed = new URL(href);
            if (currentOrigin && parsed.origin !== currentOrigin) {
              continue; // External link
            }
          } catch {
            continue;
          }
        }
        type = 'link';
        target = href;
      }

      if (!type) continue;

      const selector = action.selector || `[data-jev-id="${action.id}"]`;
      if (recordedSelectors.has(selector)) continue;
      recordedSelectors.add(selector);

      results.push({
        type,
        selector,
        text: label,
        target,
        ariaLabel: action['aria-label'] || action.label,
        actionId: action.id,
        nodeId: action.node,
        rect: action.rect,
        role: action.role,
      });
    }

    return results;
  }

  /**
   * Safe Modal Probing Protocol:
   * 1. Captures base route state and Jev pre-click state guard.
   * 2. Clicks dialog trigger.
   * 3. Waits for modal overlay: `[role="dialog"]:not([style*="display: none"]), [data-state="open"]`.
   * 4. Captures modal overlay screenshot (WebP) and identifies modal title & dismiss button.
   * 5. Records modal node (`modal:<route>:<title>`) and directed edge (`trigger -> modal`).
   * 6. Presses `Escape` (or clicks `[aria-label="Close"]`) to dismiss modal and restores base state.
   */
  async probeModal(
    page: Page,
    trigger: DiscoveredAffordance,
    baseNodeId: string,
    route: string,
    graphBuilder?: FlowGraphBuilder,
    options: ProbeModalOptions = {}
  ): Promise<{ modalNode: FlowNode; transition: FlowTransition } | null> {
    const triggerLocator = page.locator(trigger.selector).first();
    const isVisible = await triggerLocator.isVisible().catch(() => false);
    if (!isVisible) {
      return null;
    }

    // 1. Capture base route
    const currentUrl = page.url();
    const baseRoute = route || (currentUrl.startsWith('http') ? new URL(currentUrl).pathname : currentUrl);

    // Verify Jev page_key and node guard before click if available
    await page.evaluate((nodeId) => {
      const cache = (window as any).__jevFast;
      if (!cache) return null;
      const node = nodeId ? cache.nodes.get(nodeId) : null;
      return {
        pageKey: cache.pageKey ? cache.pageKey() : null,
        guard: node && cache.guard ? cache.guard(node) : null,
      };
    }, trigger.nodeId).catch(() => null);

    // 2. Click dialog trigger
    await triggerLocator.click();

    // Verify Jev page state updated after click
    await page.evaluate(() => {
      const cache = (window as any).__jevFast;
      return cache && cache.pageKey ? cache.pageKey() : null;
    }).catch(() => null);

    // 3. Wait for modal overlay
    let overlayFound = false;
    try {
      await page.waitForSelector(MODAL_OVERLAY_SELECTOR, {
        state: 'visible',
        timeout: options.timeoutMs ?? this.timeoutMs,
      });
      overlayFound = true;
    } catch {
      return null;
    }

    if (!overlayFound) {
      return null;
    }

    // 4. Capture modal overlay screenshot (WebP) and identify modal title & dismiss button
    let screenshotWebP = '';
    try {
      screenshotWebP = await captureWebPScreenshot(page);
    } catch {
      try {
        const buf = await page.screenshot({ type: 'png' });
        screenshotWebP = buf.toString('base64');
      } catch {
        screenshotWebP = '';
      }
    }

    const modalMeta = await page.evaluate((modalSelector: string) => {
      const dialog = document.querySelector(modalSelector);
      if (!dialog) {
        return { title: '', dismissSelector: null };
      }

      // Title discovery
      let title = '';
      const titleEl = dialog.querySelector(
        'h1, h2, h3, h4, [role="heading"], [data-modal-title], [data-slot="dialog-title"], .modal-title, .dialog-title'
      );
      if (titleEl && titleEl.textContent) {
        title = titleEl.textContent.trim();
      } else if (dialog.getAttribute('aria-label')) {
        title = dialog.getAttribute('aria-label')!.trim();
      } else if (dialog.getAttribute('aria-labelledby')) {
        const id = dialog.getAttribute('aria-labelledby')!;
        const labelled = document.getElementById(id);
        if (labelled && labelled.textContent) {
          title = labelled.textContent.trim();
        }
      }

      // Dismiss button discovery
      let dismissSelector: string | null = null;
      const closeBtn = dialog.querySelector(
        '[aria-label="Close" i], [aria-label="close"], [aria-label="Dismiss" i], [data-modal-close], [data-dialog-close], button.close'
      );
      if (closeBtn) {
        if (closeBtn.id) {
          dismissSelector = `#${closeBtn.id}`;
        } else if (closeBtn.getAttribute('aria-label')) {
          dismissSelector = `[aria-label="${closeBtn.getAttribute('aria-label')}"]`;
        } else if (closeBtn.getAttribute('data-modal-close') !== null) {
          dismissSelector = '[data-modal-close]';
        } else if (closeBtn.getAttribute('data-dialog-close') !== null) {
          dismissSelector = '[data-dialog-close]';
        }
      }

      return { title, dismissSelector };
    }, MODAL_OVERLAY_SELECTOR);

    const modalTitle = modalMeta.title || trigger.text || 'Modal';

    // 5. Record modal node (`modal:<route>:<title>`) and directed edge (`trigger -> modal`)
    const modalNodeId = `modal:${baseRoute}:${modalTitle}`;
    const modalNode: FlowNode = {
      id: modalNodeId,
      type: 'modal',
      path: baseRoute,
      title: modalTitle,
      sourceFilePath: '',
      authRequired: false,
      screenshots: screenshotWebP ? { desktop: screenshotWebP } : {},
    };

    const transition: FlowTransition = {
      id: `${baseNodeId}->${modalNodeId}:modal_trigger`,
      sourceNodeId: baseNodeId,
      targetNodeId: modalNodeId,
      triggerType: 'modal_trigger',
      triggerText: trigger.text,
      triggerSelector: trigger.selector,
    };

    if (graphBuilder) {
      graphBuilder.addNode(modalNode);
      graphBuilder.addTransition(transition);
    }

    // 6. Press Escape (or click [aria-label="Close"]) to dismiss modal and restore base state
    await page.keyboard.press('Escape');

    // Verify modal overlay is dismissed; fallback to clicking dismiss button if still open
    const isStillOpen = await page.locator(MODAL_OVERLAY_SELECTOR).first().isVisible().catch(() => false);
    if (isStillOpen) {
      const dismissSelector = modalMeta.dismissSelector || '[aria-label="Close" i], [data-modal-close], [data-dialog-close], button:has-text("Close")';
      const closeLocator = page.locator(dismissSelector).first();
      if (await closeLocator.isVisible().catch(() => false)) {
        await closeLocator.click().catch(() => {});
      }
    }

    // Await hidden state to guarantee base state is restored
    await page.waitForSelector(MODAL_OVERLAY_SELECTOR, {
      state: 'hidden',
      timeout: 2500,
    }).catch(() => {});

    return { modalNode, transition };
  }

  /**
   * Discovers all affordances and probes all modal triggers on the page,
   * wiring the resulting nodes and transitions into the FlowGraphBuilder.
   */
  async probeRoute(
    page: Page,
    route: string,
    graphBuilder: FlowGraphBuilder,
    options: ProbeModalOptions = {}
  ): Promise<{
    affordances: DiscoveredAffordance[];
    modals: FlowNode[];
  }> {
    if (!this.isInterceptionAttached) {
      await this.attachNetworkInterceptor(page, this.baseUrl);
    }

    const baseNodeId = `route:${route}`;
    if (!graphBuilder.getNode(baseNodeId)) {
      graphBuilder.addNode({
        id: baseNodeId,
        type: 'route',
        path: route,
        title: route,
        sourceFilePath: '',
        authRequired: false,
        screenshots: {},
      });
    }

    let affordances: DiscoveredAffordance[];
    if (options.useJev !== false) {
      try {
        affordances = await this.discoverAffordancesWithJev(page);
      } catch {
        affordances = await this.discoverAffordances(page);
      }
    } else {
      affordances = await this.discoverAffordances(page);
    }
    const modals: FlowNode[] = [];

    // Probe modal triggers
    const modalTriggers = affordances.filter(a => a.type === 'modal_trigger');
    for (const trigger of modalTriggers) {
      const result = await this.probeModal(page, trigger, baseNodeId, route, graphBuilder, options);
      if (result) {
        modals.push(result.modalNode);
      }
    }

    return { affordances, modals };
  }
}

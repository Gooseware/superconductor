import type { Page } from 'playwright';
import crypto from 'node:crypto';

export interface JevRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface JevAction {
  id: string;
  kind: 'click' | 'fill' | 'select' | 'scroll' | 'wait';
  node?: number;
  role?: string;
  label: string;
  rect?: JevRect;
  selector?: string;
  value?: string;
  checked?: string;
  selected?: string;
  expanded?: string;
  current_value?: string;
  delta?: number;
  href?: string;
  modalTarget?: string;
  drawerTarget?: string;
  ariaHasPopup?: string;
  ariaControls?: string;
  [key: string]: any;
}

export interface JevScrollInfo {
  y: number;
  height: number;
}

export interface JevPageSnapshot {
  url: string;
  title: string;
  w: number;
  h: number;
  text: string;
  scroll: JevScrollInfo;
  actions: JevAction[];
  marker: any[];
  page_key: any[];
  guards: Record<string | number, any>;
  omitted_actions: number;
  fingerprint?: string;
}

/**
 * Client-side script evaluating WAI-ARIA semantics, true CSS visibility,
 * identity WeakMap caching, and discrete action space generation.
 */
export const JEV_CLIENT_SNAPSHOT_SCRIPT = `
(() => {
  if (!document.body) return null;
  const cache = window.__jevFast ||= { ids: new WeakMap(), nodes: new Map(), next: 1 };
  const identity = e => {
    if (!cache.ids.has(e)) cache.ids.set(e, cache.next++);
    const id = cache.ids.get(e);
    cache.nodes.set(id, e);
    return id;
  };
  for (const [id, e] of cache.nodes) {
    if (!e.isConnected) cache.nodes.delete(id);
  }
  const safe = e => !['password', 'file', 'hidden'].includes(e.type);
  const visible = e => {
    if (e.closest('[aria-hidden="true"],[inert]')) return false;
    if (typeof e.checkVisibility === 'function') {
      return e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    const style = window.getComputedStyle(e);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  const name = (e, seen = new Set()) => {
    if (!e || seen.has(e)) return '';
    seen.add(e);
    const referenced = (e.getAttribute('aria-labelledby') || '').split(/\\s+/)
      .map(id => name(document.getElementById(id), seen)).filter(Boolean).join(' ');
    return referenced || e.getAttribute('aria-label') ||
      [...(e.labels || [])].map(l => name(l, seen)).filter(Boolean).join(' ') ||
      (['button', 'submit', 'reset'].includes(e.type) ? e.value : '') || e.getAttribute('alt') ||
      (e.tagName === 'INPUT' ? '' : [...e.childNodes].map(n => n.nodeType === 3 ? n.textContent :
        n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true' ? name(n, seen) : '').join(' ').trim()) ||
      e.getAttribute('title') || e.getAttribute('placeholder') || '';
  };
  const roles = [
    'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemradio',
    'option', 'gridcell', 'combobox', 'textbox', 'searchbox', 'spinbutton', 'dialog'
  ];
  const selector = 'a[href],button,input,textarea,select,summary,[contenteditable="true"],dialog,' +
    roles.map(role => '[role="' + role + '"]').join(',');
  const role = e => {
    const explicit = e.getAttribute('role');
    if (roles.includes(explicit)) return explicit;
    if (e.tagName === 'BUTTON' || e.tagName === 'SUMMARY') return 'button';
    if (e.tagName === 'A') return 'link';
    if (e.tagName === 'SELECT') return 'combobox';
    if (e.tagName === 'TEXTAREA' || e.isContentEditable) return 'textbox';
    if (e.tagName === 'DIALOG') return 'dialog';
    if (e.tagName === 'INPUT') {
      if (['checkbox', 'radio'].includes(e.type)) return e.type;
      if (['button', 'submit', 'reset', 'image'].includes(e.type)) return 'button';
      if (e.type === 'search') return 'searchbox';
      if (e.type === 'number') return 'spinbutton';
      if (['text', 'email', 'url', 'tel'].includes(e.type)) return 'textbox';
    }
    return null;
  };
  const getUniqueSelector = el => {
    if (el.id) return '#' + CSS.escape(el.id);
    const testId = el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
    const modalTarget = el.getAttribute('data-modal-target');
    if (modalTarget) return '[data-modal-target="' + CSS.escape(modalTarget) + '"]';
    const drawerTarget = el.getAttribute('data-drawer-target');
    if (drawerTarget) return '[data-drawer-target="' + CSS.escape(drawerTarget) + '"]';
    const ariaControls = el.getAttribute('aria-controls');
    if (ariaControls) return '[aria-controls="' + CSS.escape(ariaControls) + '"]';
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return el.tagName.toLowerCase() + '[aria-label="' + CSS.escape(ariaLabel) + '"]';
    const href = el.getAttribute('href');
    if (href) return 'a[href="' + CSS.escape(href) + '"]';
    let sel = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(/\\s+/).filter(c => c && !c.includes(':') && !c.includes('['));
      if (classes.length > 0) sel += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
    }
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(el) + 1;
        sel += ':nth-of-type(' + index + ')';
      }
    }
    return sel;
  };
  cache.pageKey = () => [
    performance.timeOrigin,
    location.href,
    scrollX,
    scrollY,
    innerWidth,
    innerHeight,
    [...document.querySelectorAll('input,textarea,select')].filter(safe)
      .map(e => [identity(e), e.value, e.checked, e.selectedIndex, e.disabled, e.readOnly])
  ];
  cache.guard = e => {
    if (!e?.isConnected || !visible(e)) return null;
    const scope = e.closest('form,dialog,[role="dialog"],article,li,tr,[role="row"]') || e.parentElement;
    return [
      identity(e),
      role(e),
      name(e),
      e.value ?? null,
      e.checked ?? null,
      e.selectedIndex ?? null,
      e.readOnly ?? null,
      e.matches(':disabled'),
      e.getAttribute('aria-disabled'),
      e.getAttribute('aria-expanded'),
      e.getAttribute('aria-checked'),
      e.getAttribute('aria-selected'),
      e.getAttribute('href'),
      scope?.innerText?.slice(0, 6000) || ''
    ];
  };
  const actions = [];
  for (const e of document.querySelectorAll(selector)) {
    if (!safe(e) || !visible(e) || e.matches(':disabled') || e.closest('[aria-disabled="true"]')) continue;
    const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, rname = role(e);
    if (!rname || r.width <= 0 || r.height <= 0 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    if (rname === 'gridcell' && e.querySelector('button,[role="button"]')) continue;
    const base = {
      node: identity(e),
      role: rname,
      label: name(e) || rname,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      selector: getUniqueSelector(e)
    };
    for (const key of ['checked', 'selected', 'expanded']) {
      const value = e.getAttribute('aria-' + key);
      if (value !== null) base[key] = value;
    }
    if (['checkbox', 'radio'].includes(e.type)) base.checked = String(e.checked);
    if (e.getAttribute('href')) base.href = e.getAttribute('href');
    if (e.getAttribute('data-modal-target')) base.modalTarget = e.getAttribute('data-modal-target');
    if (e.getAttribute('data-drawer-target')) base.drawerTarget = e.getAttribute('data-drawer-target');
    if (e.getAttribute('aria-haspopup')) base.ariaHasPopup = e.getAttribute('aria-haspopup');
    if (e.getAttribute('aria-controls')) base.ariaControls = e.getAttribute('aria-controls');
    const typeAttr = e.getAttribute('type');
    if (typeAttr) base.explicitType = typeAttr;
    const isSubmit = typeAttr === 'submit' ||
      (Boolean(e.closest('form')) && (e.tagName === 'BUTTON' ? typeAttr !== 'button' && typeAttr !== 'reset' : typeAttr === 'submit'));
    if (isSubmit) {
      base.isSubmit = true;
    }

    if (e.tagName === 'SELECT') {
      for (const o of e.options) {
        if (!o.selected && !o.disabled && !o.closest('optgroup[disabled]')) {
          actions.push({
            ...base,
            kind: 'select',
            value: o.value,
            current_value: [...e.selectedOptions].map(opt => opt.label).join(', '),
            label: base.label + ' → ' + o.label
          });
        }
      }
    } else {
      const editable = !e.readOnly && e.getAttribute('aria-readonly') !== 'true' &&
        (['textbox', 'searchbox', 'spinbutton'].includes(rname) ||
          (rname === 'combobox' && ['INPUT', 'TEXTAREA'].includes(e.tagName)));
      const value = 'value' in e ? String(e.value) :
        e.isContentEditable || rname === 'combobox' ? e.innerText.trim() : '';
      actions.push({ ...base, kind: editable ? 'fill' : 'click', value });
      if (editable) {
        actions.push({ ...base, kind: 'click', value, label: 'Open ' + base.label });
      }
    }
  }
  const words = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let textNode, length = 0;
  while ((textNode = walker.nextNode()) && length < 6000) {
    const value = textNode.textContent.trim();
    const parent = textNode.parentElement;
    if (!value || !parent || parent.closest('script,style,noscript,template') || !visible(parent)) continue;
    range.selectNodeContents(textNode);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
      words.push(value);
      length += value.length;
    }
  }
  const text = words.join('\\n').slice(0, 6000);
  const height = document.documentElement.scrollHeight;
  const page_key = cache.pageKey();
  const guards = {};
  for (const a of actions) {
    if (a.node && !(a.node in guards)) {
      guards[a.node] = cache.guard(cache.nodes.get(a.node));
    }
  }
  const semantics = actions.map(({ rect, ...action }) => action);
  const marker = [
    performance.timeOrigin,
    location.href,
    scrollX,
    scrollY,
    innerWidth,
    innerHeight,
    document.title,
    text,
    semantics,
    page_key[6]
  ];
  const omitted_actions = Math.max(0, actions.length - 250);
  actions.splice(250);
  actions.forEach((a, i) => a.id = 'e' + (i + 1));
  if (scrollY + innerHeight < height - 2) {
    actions.push({ id: 'scroll_down', kind: 'scroll', label: 'Scroll down', delta: 560 });
  }
  if (scrollY > 0) {
    actions.push({ id: 'scroll_up', kind: 'scroll', label: 'Scroll up', delta: -560 });
  }
  actions.push({ id: 'wait', kind: 'wait', label: 'Wait for the page to update' });

  return {
    url: location.href,
    title: document.title,
    w: innerWidth,
    h: innerHeight,
    text,
    scroll: { y: scrollY, height },
    actions,
    marker,
    page_key,
    guards,
    omitted_actions
  };
})()
`;

export function computeJevFingerprint(snapshot: {
  url: string;
  text: string;
  actions: any[];
  scroll: any;
}): string {
  const content = {
    actions: snapshot.actions,
    scroll: snapshot.scroll,
    text: snapshot.text,
    url: snapshot.url,
  };
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

/**
 * JevSnapshotEngine embeds and executes the client-side Jev snapshot script in Playwright.
 */
export class JevSnapshotEngine {
  /**
   * Retrieves the raw client-side evaluation script.
   */
  static getSnapshotScript(): string {
    return JEV_CLIENT_SNAPSHOT_SCRIPT;
  }

  /**
   * Takes a typed semantic DOM snapshot of the specified page.
   */
  static async takeSnapshot(page: Page): Promise<JevPageSnapshot> {
    const raw = (await page.evaluate(JEV_CLIENT_SNAPSHOT_SCRIPT)) as JevPageSnapshot | null;
    if (!raw) {
      return {
        url: page.url(),
        title: '',
        w: 0,
        h: 0,
        text: '',
        scroll: { y: 0, height: 0 },
        actions: [],
        marker: [],
        page_key: [],
        guards: {},
        omitted_actions: 0,
        fingerprint: '',
      };
    }
    raw.fingerprint = computeJevFingerprint(raw);
    return raw;
  }

  /**
   * Instance method wrapper for takeSnapshot.
   */
  async takeSnapshot(page: Page): Promise<JevPageSnapshot> {
    return JevSnapshotEngine.takeSnapshot(page);
  }
}

/**
 * Standalone helper to take a typed Jev semantic snapshot.
 */
export async function takeJevSnapshot(page: Page): Promise<JevPageSnapshot> {
  return JevSnapshotEngine.takeSnapshot(page);
}

import type { Page } from 'playwright';

/**
 * Deterministic Hydration Barrier for SPAs, React, Next.js, and SSR/CSR applications.
 *
 * Avoids unreliable heuristics like `networkidle` (which hangs indefinitely on HMR/WebSockets).
 * Executes a 5-phase deterministic sequence:
 * 1. DOM mount point detection (#root:not(:empty), [data-hydrated="true"], main, #__next:not(:empty)).
 * 2. React Fiber root attachment (__reactFiber or __reactContainer on the root element).
 * 3. Web fonts readiness (document.fonts.ready).
 * 4. DOM quiescence (MutationObserver quiet window of 200ms).
 * 5. Double requestAnimationFrame GPU composite flush.
 */
export async function waitForHydration(page: Page, timeoutMs = 10000): Promise<void> {
  const startTime = Date.now();

  const getRemainingTime = (): number => {
    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) {
      throw new Error(`Hydration barrier timed out after ${timeoutMs}ms`);
    }
    return remaining;
  };

  try {
    // Phase 1: Wait for DOM mount point
    const mountSelector = '#root:not(:empty), [data-hydrated="true"], main, #__next:not(:empty)';
    await page.waitForSelector(mountSelector, {
      timeout: getRemainingTime(),
      state: 'attached',
    });

    // Phase 2: React Fiber root attachment (__reactFiber or __reactContainer on root element)
    await page.waitForFunction(
      () => {
        const mount = document.querySelector('#root, #__next, [data-hydrated="true"], main');
        if (!mount) return false;

        // Explicit hydration marker
        if (mount.getAttribute('data-hydrated') === 'true' || document.querySelector('[data-hydrated="true"]')) {
          return true;
        }

        const checkFiber = (el: Element | null): boolean => {
          if (!el) return false;
          if ('__reactFiber' in el || '__reactContainer' in el || '_reactRootContainer' in el) {
            return true;
          }
          const keys = Object.getOwnPropertyNames(el);
          for (const key of keys) {
            if (key.startsWith('__reactFiber') || key.startsWith('__reactContainer')) {
              return true;
            }
          }
          return false;
        };

        if (checkFiber(mount)) {
          return true;
        }

        if (mount.firstElementChild && checkFiber(mount.firstElementChild)) {
          return true;
        }

        // If mount point is specifically #root or #__next, wait for React fiber attachment
        if (mount.id === 'root' || mount.id === '__next') {
          return false;
        }

        // For non-React specific mount points (e.g., plain <main>), allow progression
        return true;
      },
      undefined,
      { timeout: getRemainingTime() }
    );

    // Phase 3: Web fonts loading (document.fonts.ready)
    const fontTimeout = Math.min(getRemainingTime(), 5000);
    await page.evaluate(async (timeout) => {
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, timeout)),
        ]);
      }
    }, fontTimeout);

    // Phase 4: MutationObserver quiet window (DOM quiescent for 200ms)
    const quietWindowMs = 200;
    const maxQuietWait = Math.min(getRemainingTime(), 5000);
    await page.evaluate(
      ({ quietMs, maxWait }) => {
        return new Promise<void>((resolve) => {
          let timer: any = null;
          let maxTimer: any = null;

          const finish = () => {
            if (timer) clearTimeout(timer);
            if (maxTimer) clearTimeout(maxTimer);
            observer.disconnect();
            resolve();
          };

          const observer = new MutationObserver(() => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(finish, quietMs);
          });

          observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });

          timer = setTimeout(finish, quietMs);
          maxTimer = setTimeout(finish, maxWait);
        });
      },
      { quietMs: quietWindowMs, maxWait: maxQuietWait }
    );

    // Phase 5: Double requestAnimationFrame GPU composite flush
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        } else {
          resolve();
        }
      });
    });
  } catch (err: any) {
    const msg = err?.message?.toLowerCase() || '';
    if (msg.includes('timeout') || msg.includes('timed out') || err?.name === 'TimeoutError') {
      throw new Error(`Hydration barrier timed out after ${timeoutMs}ms: ${err.message}`);
    }
    throw err;
  }
}

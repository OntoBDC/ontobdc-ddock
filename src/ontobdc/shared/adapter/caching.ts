import { notify } from '@/ontobdc/shared/adapter/notice';

/**
 * Sets up the service worker that keeps the files of the application and of the Python runtime (`public/sw.js`),
 * and says when it controls the page, so that what is downloaded after that goes through it. Only in the built
 * application: while it is developed the files change all the time. A browser with no service workers has no
 * cache, and nothing to say about it. When it has them and the worker cannot be set up, the person is told, and
 * the application goes on, downloading the runtime again each time.
 */
export async function setUpCaching(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${__BUILD_ID__}`, { scope: import.meta.env.BASE_URL });
    if (navigator.serviceWorker.controller) return;
    // A worker that is already active and does not control the page (a reload that skips it) will not take it: there is nothing to wait for.
    const installing = registration.installing ?? registration.waiting;
    if (!installing) return;
    await new Promise<void>((resolve, reject) => {
      const settled = (): void => {
        if (installing.state === 'redundant') reject(new Error('the service worker was not installed'));
        else if (installing.state === 'activated') {
          // Activating includes taking the page: a worker that is active and does not control it never will.
          if (navigator.serviceWorker.controller) resolve();
          else reject(new Error('the service worker is active but does not control the page'));
        }
      };
      installing.addEventListener('statechange', settled);
      navigator.serviceWorker.addEventListener('controllerchange', settled);
      settled();
    });
  } catch (error) {
    notify(`The cache of the Python runtime could not be set up: ${error instanceof Error ? error.message : String(error)}. It is downloaded again on each visit.`, 'warning');
  }
}

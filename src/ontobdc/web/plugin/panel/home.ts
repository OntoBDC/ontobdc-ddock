import { showRemoteContainers } from '@/ontobdc/shared/adapter/remote-container-dialog';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { applyTranslations, translate as t, type MessageKey } from '@/ontobdc/shared/plugin/i18n';
import type { Mountable } from '@/ontobdc/shared/adapter/view';

export { makeHome as default };

// These listeners belong to the plugin, not the mounted panel: Dockview disposes
// the panel before publishing its removal, so instance subscriptions are gone.
let waitingForContainerState = false;
let reopenScheduled = false;
let pluginDisposed = false;
const unsubscribeReopening = [
  eventBus.subscribe('presentation.main.panel.closed', ({ payload }) => {
    if (payload?.id !== 'home' || reopenScheduled) return;
    reopenScheduled = true;
    // Wait until Dockview finishes removing the old tab before adding another.
    queueMicrotask(() => {
      reopenScheduled = false;
      if (pluginDisposed) return;
      waitingForContainerState = true;
      eventBus.publish('presentation.container.state.requested', 'home');
    });
  }),
  eventBus.subscribe('presentation.container.state.reported', ({ payload }) => {
    if (!waitingForContainerState || !payload) return;
    waitingForContainerState = false;
    if (payload.container) return;
    eventBus.publish('presentation.main.panel.open.requested', 'home', {
      container: 'surface',
      id: 'home',
      component: 'home',
      title: t('home.tab'),
    });
  }),
];

if (import.meta.hot) import.meta.hot.dispose(() => {
  pluginDisposed = true;
  unsubscribeReopening.forEach((unsubscribe) => unsubscribe());
});

const HOME_START_HTML = `
  <section class="home-start" aria-labelledby="home-start-title">
    <h1 id="home-start-title" data-i18n="home.start"></h1>
    <button type="button" class="home-action" data-action="new">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 27H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h9l7 8v4M15 2v8h8"/>
        <circle cx="22" cy="23" r="8" fill="currentColor" stroke="none"/>
        <path d="M22 18v10m-5-5h10" stroke="var(--background)"/>
      </svg>
      <span data-i18n="home.newWorkspace"></span>
    </button>
    <button type="button" class="home-action" data-action="open">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 25V7a3 3 0 0 1 3-3h5l5 5h8a3 3 0 0 1 3 3v2M3 25l5-11h19a3 3 0 0 1 3 4l-4 8a4 4 0 0 1-3 2H6a3 3 0 0 1-3-3Z"/>
      </svg>
      <span data-i18n="home.openWorkspace"></span>
    </button>
    <div class="home-action-row">
      <button type="button" class="home-action" data-action="connect" disabled>
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 10H9a6 6 0 0 0 0 12h3m8-12h3a6 6 0 0 1 0 12h-3M10 16h12"/>
        </svg>
        <span data-i18n="home.connectTo"></span>
      </button>
      <button type="button" class="home-login" data-action="login" data-i18n="home.login"></button>
    </div>
  </section>
`;

const HOME_CREATE_HTML = `
  <form class="home-create" aria-labelledby="home-create-title">
    <h1 id="home-create-title" data-i18n="home.create.title"></h1>
    <label class="home-create-field">
      <span data-i18n="home.create.name"></span>
      <input name="name" required autocomplete="off" />
    </label>
    <p class="home-create-hint" data-i18n="home.create.hint"></p>
    <p class="home-create-error" role="alert" hidden></p>
    <div class="home-create-actions">
      <button type="submit" class="home-create-submit" data-i18n="home.create.submit"></button>
      <button type="button" class="home-create-cancel" data-i18n="home.create.cancel"></button>
    </div>
  </form>
`;

/** Creating needs the File System Access API; the read-only fallback cannot write. */
const canCreate = (): boolean => 'showDirectoryPicker' in window;

/**
 * Home shows Start until a container is being opened or created. New Container
 * asks for the container's name and then publishes `presentation.container.new.requested`
 * (the folder is picked next); a cancelled picker or a failed creation keeps
 * the form, with the error. While Python creates or inspects the container it
 * shows a loading indicator, and nothing once `presentation.container.local.opened` or
 * `presentation.container.remote.opened` arrives. A failed open brings Start back so the
 * user can try again.
 */
export function makeHome(): Mountable {
  const root = document.createElement('div');
  root.className = 'panel-content home';
  let pythonReady = false;
  /** Whether the person is logged in: connecting to a remote workspace needs it. */
  let loggedIn = false;
  let state: 'start' | 'form' | 'loading' | 'cleared' = 'start';
  /** The name typed in the form, kept while the folder is picked and if creating fails. */
  let containerName = '';
  /** What the loading indicator is waiting for, once Python is ready. */
  let loadingKey: MessageKey = 'home.loading.workspace';

  /** Connect is enabled once the person is logged in; until then the login button sits beside it. */
  const applyLogin = (): void => {
    const connect = root.querySelector<HTMLButtonElement>('.home-action[data-action="connect"]');
    if (connect) connect.disabled = !loggedIn;
    const login = root.querySelector<HTMLButtonElement>('.home-login');
    if (login) login.hidden = loggedIn;
  };

  const renderStart = (error?: string): void => {
    state = 'start';
    root.innerHTML = HOME_START_HTML;
    applyTranslations(root);
    if (error) {
      const message = document.createElement('p');
      message.className = 'home-create-error';
      message.setAttribute('role', 'alert');
      message.textContent = error;
      root.append(message);
    }
    const newButton = root.querySelector<HTMLButtonElement>('.home-action[data-action="new"]');
    if (newButton && !canCreate()) {
      newButton.disabled = true;
      newButton.dataset.i18nTitle = 'home.newWorkspace.unsupported';
      newButton.title = t('home.newWorkspace.unsupported');
    }
    newButton?.addEventListener('click', () => renderForm());
    root.querySelector('.home-action[data-action="connect"]')?.addEventListener('click', () => showRemoteContainers());
    root.querySelector('.home-login')?.addEventListener('click', () => {
      eventBus.publish('presentation.user.login.requested', 'home');
    });
    applyLogin();
    root.querySelector('.home-action[data-action="open"]')?.addEventListener('click', () => {
      eventBus.publish('presentation.container.open.requested', 'home');
    });
  };

  const renderForm = (error: string | null = null): void => {
    state = 'form';
    root.innerHTML = HOME_CREATE_HTML;
    applyTranslations(root);
    const form = root.querySelector<HTMLFormElement>('.home-create');
    const input = root.querySelector<HTMLInputElement>('input[name="name"]');
    const errorLine = root.querySelector<HTMLParagraphElement>('.home-create-error');
    if (!form || !input || !errorLine) return;
    input.value = containerName;
    if (error) {
      errorLine.hidden = false;
      errorLine.textContent = error;
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      containerName = input.value.trim();
      if (!containerName) return;
      // Published inside the submit, so the folder picker keeps the user gesture.
      eventBus.publish('presentation.container.new.requested', 'home', { name: containerName });
    });
    root.querySelector('.home-create-cancel')?.addEventListener('click', () => {
      containerName = '';
      renderStart();
    });
    input.focus();
  };

  const renderLoading = (key: MessageKey): void => {
    state = 'loading';
    loadingKey = key;
    const box = document.createElement('div');
    box.className = 'home-loading';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    const spinner = document.createElement('span');
    spinner.className = 'home-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'home-loading-label';
    label.dataset.i18n = pythonReady ? key : 'home.loading.python';
    box.append(spinner, label);
    root.replaceChildren(box);
    applyTranslations(root);
  };

  const setLoadingLabel = (key: MessageKey): void => {
    const label = root.querySelector<HTMLElement>('.home-loading-label');
    if (!label) return;
    label.dataset.i18n = key;
    label.textContent = t(key);
  };

  const updatePython = (ready: boolean): void => {
    pythonReady = ready;
    if (state === 'loading') setLoadingLabel(ready ? loadingKey : 'home.loading.python');
  };
  const clearContainer = (): void => {
    state = 'cleared';
    containerName = '';
    root.replaceChildren();
  };
  const unsubscribe = [
    eventBus.subscribe('presentation.python.state.reported', ({ payload }) => updatePython(payload?.ready ?? false)),
    eventBus.subscribe('presentation.python.loading', () => updatePython(false)),
    eventBus.subscribe('presentation.python.failed', () => updatePython(false)),
    eventBus.subscribe('presentation.python.disconnected', () => updatePython(false)),
    eventBus.subscribe('presentation.container.state.reported', ({ payload }) => {
      if (payload?.container) clearContainer();
    }),
    eventBus.subscribe('presentation.container.create.started', () => renderLoading('home.loading.create')),
    eventBus.subscribe('presentation.container.create.failed', (event) => {
      const failure = event.payload;
      if (!failure) return;
      renderForm(t('home.create.error', { message: failure.message }));
    }),
    eventBus.subscribe('presentation.container.inspect.started', () => renderLoading('home.loading.workspace')),
    eventBus.subscribe('presentation.python.ready', () => updatePython(true)),
    eventBus.subscribe('presentation.user.login.succeeded', () => {
      loggedIn = true;
      applyLogin();
    }),
    eventBus.subscribe('presentation.container.local.opened', clearContainer),
    eventBus.subscribe('presentation.container.remote.opened', clearContainer),
    eventBus.subscribe('presentation.container.open.failed', ({ payload }) => {
      const reason = payload?.reason;
      const key: MessageKey = reason === 'unsupported' ? 'home.open.unsupported'
        : reason === 'permission-denied' ? 'home.open.permissionDenied'
        : reason === 'crate-not-found' || reason === 'crate-invalid' || reason === 'location-not-found' ? 'home.open.invalidWorkspace'
        : reason === 'inspect-failed' ? 'home.open.inspectFailed' : 'home.open.readError';
      const message = payload?.message ?? t(key);
      renderStart(t('home.open.error', { message }));
    }),
  ];

  renderStart();
  eventBus.publish('presentation.python.state.requested', 'home');
  eventBus.publish('presentation.container.state.requested', 'home');
  return {
    element: root,
    dispose: () => {
      unsubscribe.forEach((unsub) => unsub());
      root.remove();
    },
  };
}

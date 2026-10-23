import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { profileName } from '@/ontobdc/shared/adapter/session';
import { applyTranslations, translate } from '@/ontobdc/shared/plugin/i18n';
import type { Mountable } from '@/ontobdc/shared/adapter/view';

const SKELETON_HTML = `
  <div class="login-skeleton" role="status" aria-busy="true">
    <span class="login-skeleton-line login-skeleton-title"></span>
    <span class="login-skeleton-line"></span>
    <span class="login-skeleton-line"></span>
    <span class="login-skeleton-line login-skeleton-short"></span>
    <span class="login-skeleton-label" data-i18n="login.loading"></span>
  </div>
`;

/** The tab of the login: a skeleton while loading, until the login succeeds. */
export default function makeLogin(): Mountable {
  const element = document.createElement('div');
  element.className = 'panel-content login-panel';
  element.innerHTML = SKELETON_HTML;
  applyTranslations(element);

  // A new attempt starts again from the skeleton.
  const unsubscribeRequested = eventBus.subscribe('presentation.user.login.requested', () => {
    element.innerHTML = SKELETON_HTML;
    applyTranslations(element);
  });

  // The login did not finish: say so, and let the person try again.
  const unsubscribeFailed = eventBus.subscribe('presentation.user.login.failed', ({ payload }) => {
    const message = document.createElement('p');
    message.className = 'login-welcome login-failed';
    message.textContent = payload?.cancelled ? translate('login.cancelled') : translate('login.failed', { message: payload?.message ?? '' });
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'login-retry';
    retry.textContent = translate('login.retry');
    retry.addEventListener('click', () => eventBus.publish('presentation.user.login.requested', 'login'));
    element.replaceChildren(message, retry);
  });

  const unsubscribeLoaded = eventBus.subscribe('presentation.user.login.succeeded', ({ payload }) => {
    const name = profileName(payload?.profile);
    const greeting = document.createElement('h1');
    greeting.className = 'login-greeting';
    greeting.textContent = translate('login.greeting', { name: name ?? translate('login.guest') });
    const welcome = document.createElement('p');
    welcome.className = 'login-welcome';
    welcome.textContent = translate('login.welcome');
    element.replaceChildren(greeting, welcome);
  });

  return {
    element,
    dispose: () => {
      unsubscribeRequested();
      unsubscribeFailed();
      unsubscribeLoaded();
      element.remove();
    },
  };
}

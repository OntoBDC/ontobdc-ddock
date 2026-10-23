import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { onLocaleChange, translate } from '@/ontobdc/shared/plugin/i18n';

const SOURCE = 'terminal-prompt';

/**
 * The small terminal icon at the bottom right of the Updates pane. A click opens a box with a text
 * of two lines that floats right above it, and closes it again; it also closes on a click anywhere
 * else and on Escape. Enter, or the button at the right of the box, runs what was typed: it
 * publishes `presentation.main.command.requested` with the text as the command, empties the box and
 * closes it. Shift+Enter breaks the line, and a box with nothing typed in it runs nothing.
 */
export function createTerminalPrompt(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'prompt';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-button prompt-button';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 10 3 2-3 2"/><path d="M13 15h4"/></svg>';

  const box = document.createElement('div');
  box.className = 'prompt-box';
  box.hidden = true;
  const input = document.createElement('textarea');
  input.className = 'prompt-input';
  input.rows = 2;
  input.spellcheck = false;
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'prompt-send';
  send.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>';
  box.append(input, send);
  wrapper.append(button, box);

  const label = (): void => {
    button.title = translate('prompt.button');
    button.setAttribute('aria-label', button.title);
    input.placeholder = translate('prompt.placeholder');
    input.setAttribute('aria-label', input.placeholder);
    send.title = translate('prompt.send');
    send.setAttribute('aria-label', send.title);
  };

  const close = (): void => {
    box.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const run = (): void => {
    const command = input.value.trim();
    if (!command) return;
    eventBus.publish('presentation.main.command.requested', SOURCE, { requestId: crypto.randomUUID(), command });
    input.value = '';
    close();
    button.focus();
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!box.hidden) return close();
    box.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    input.focus();
  });
  send.addEventListener('click', run);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    run();
  });
  document.addEventListener('click', (event) => { if (!box.hidden && !wrapper.contains(event.target as Node)) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !box.hidden) { close(); button.focus(); } });
  onLocaleChange(label);
  label();
  return wrapper;
}

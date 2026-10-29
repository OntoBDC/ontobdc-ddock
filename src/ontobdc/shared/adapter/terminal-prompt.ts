import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { onLocaleChange, translate, type MessageKey } from '@/ontobdc/shared/plugin/i18n';

const SOURCE = 'terminal-prompt';

/** What tells one button of the footer of the Updates pane from another: its icon, its words, and the command its text becomes. */
export type PromptOptions = {
  icon: string;
  /** The messages of the button, the placeholder of the box and the button that runs. */
  messages: { button: MessageKey; placeholder: MessageKey; send: MessageKey };
  rows: number;
  /** What is done with a text typed and sent. */
  run: (text: string) => void;
};

const TERMINAL: PromptOptions = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 10 3 2-3 2"/><path d="M13 15h4"/></svg>',
  messages: { button: 'prompt.button', placeholder: 'prompt.placeholder', send: 'prompt.send' },
  rows: 2,
  run: (command) => eventBus.publish('presentation.main.command.requested', SOURCE, { requestId: crypto.randomUUID(), command }),
};

/** The small terminal icon at the bottom right of the Updates pane: the text typed in its box is run as a command. */
export const createTerminalPrompt = (): HTMLElement => createPrompt(TERMINAL);

/**
 * A small icon at the bottom of the Updates pane. A click opens a box with a text that floats right above it, and
 * closes it again; it also closes on a click anywhere else and on Escape. Enter, or the button at the right of the box,
 * runs what was typed: it hands the text to what the button does with it (the terminal publishes `presentation.main.command.requested` with it as the command), empties
 * the box and closes it. Shift+Enter breaks the line, and a box with nothing typed in it runs nothing.
 */
export function createPrompt(options: PromptOptions): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'prompt';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-button prompt-button';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = options.icon;

  const box = document.createElement('div');
  box.className = 'prompt-box';
  box.hidden = true;
  const input = document.createElement('textarea');
  input.className = 'prompt-input';
  input.rows = options.rows;
  input.spellcheck = false;
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'prompt-send';
  send.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>';
  box.append(input, send);
  wrapper.append(button, box);

  const label = (): void => {
    button.title = translate(options.messages.button);
    button.setAttribute('aria-label', button.title);
    input.placeholder = translate(options.messages.placeholder);
    input.setAttribute('aria-label', input.placeholder);
    send.title = translate(options.messages.send);
    send.setAttribute('aria-label', send.title);
  };

  const close = (): void => {
    box.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const run = (): void => {
    const text = input.value.trim();
    if (!text) return;
    options.run(text);
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

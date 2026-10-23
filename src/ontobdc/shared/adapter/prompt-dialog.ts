export type PromptDialogOptions = {
  title: string;
  label: string;
  /** What the box starts with. The part before the last dot is selected, so a file keeps its extension unless the person changes it. */
  initial?: string;
  confirmLabel: string;
  cancelLabel: string;
};

/**
 * Asks the person for a short text, in a modal over the page. It answers the text when they confirm it,
 * and null when they cancel, press Escape or close the modal in any other way.
 */
export function promptDialog(options: PromptDialogOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('aria-label', options.title);
    const form = document.createElement('form');
    form.method = 'dialog';
    const title = document.createElement('h2');
    title.textContent = options.title;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'entity-editor';
    input.value = options.initial ?? '';
    input.setAttribute('aria-label', options.label);
    input.placeholder = options.label;
    const actions = document.createElement('div');
    actions.className = 'confirm-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'confirm-dialog-cancel';
    cancel.textContent = options.cancelLabel;
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.className = 'confirm-dialog-confirm';
    confirm.textContent = options.confirmLabel;
    actions.append(cancel, confirm);
    form.append(title, input, actions);
    dialog.append(form);

    let answer: string | null = null;
    form.addEventListener('submit', () => { answer = input.value.trim() || null; });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(answer);
    });
    cancel.addEventListener('click', () => dialog.close());

    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    const dot = input.value.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  });
}

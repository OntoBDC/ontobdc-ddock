import type { Editor, EditorOptions } from '@/ontobdc/shared/adapter/editor/editor';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { documentTitle } from '@/ontobdc/shared/adapter/document-iri';
import { registerListEditor } from '@/ontobdc/shared/adapter/list-editors';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const SOURCE = 'document_editor';

/**
 * Edits a field that takes one document of the container: it shows the name of the file, a button to choose
 * another one, and a × to leave none. Like the list editor of a field of documents it only reports what the
 * person asks: the button publishes `presentation.entity.list.item.add.requested`, the same request the +
 * of a list publishes, and the listeners that show the files answer through the editor, which is registered by
 * owner and field. The value is the IRI of the document, as the data source holds it. Choosing a document, or
 * leaving none, is saved as soon as it is done (`commits`): the editing asks for the save the Save button asks for.
 */
export default function documentEditor({ value, label, owner = '', field = '' }: EditorOptions): Editor {
  let current = value.trim();
  const listeners: Array<() => void> = [];
  const changed = (): void => listeners.forEach((listener) => listener());

  const root = document.createElement('div');
  root.className = 'entity-document-editor';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', label);
  const name = document.createElement('span');
  name.className = 'entity-document-name';
  const choose = document.createElement('button');
  choose.type = 'button';
  choose.className = 'entity-list-add';
  choose.textContent = '…';
  choose.title = translate('entity.document.choose');
  choose.setAttribute('aria-label', choose.title);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'entity-list-remove';
  clear.textContent = '×';
  clear.title = translate('entity.document.clear');
  clear.setAttribute('aria-label', clear.title);
  root.append(name, choose, clear);

  const draw = (): void => {
    name.textContent = current ? documentTitle(current) ?? current : '—';
    name.title = current;
    name.classList.toggle('entity-empty', current === '');
    clear.hidden = current === '';
  };
  const set = (next: string): void => {
    if (next === current) return;
    current = next;
    draw();
    changed();
  };

  choose.addEventListener('click', () => {
    eventBus.publish('presentation.entity.list.item.add.requested', SOURCE, { owner, field, documents: true });
  });
  clear.addEventListener('click', () => set(''));

  draw();
  // It is not where "Relate to…" puts a file: that is the field of a list of documents, so the editor says it holds none.
  registerListEditor(owner, field, {
    element: root,
    documents: false,
    remove: (item) => { if (item === current) set(''); },
    add: (item) => set(item),
  });

  return {
    element: root,
    value: () => current,
    isValid: () => true,
    onChange: (listener) => { listeners.push(listener); },
    commits: true,
  };
}

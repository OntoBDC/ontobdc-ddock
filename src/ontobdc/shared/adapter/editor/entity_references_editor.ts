import type { Editor, EditorOptions } from '@/ontobdc/shared/adapter/editor/editor';
import { fillEntityChoices, NEW_PREFIX, NEW_TYPE_PREFIX } from '@/ontobdc/shared/adapter/editor/entity_choices';
import { entityLabels, registerReferenceEditor, requestNewEntityFor, requestNewEntityForType } from '@/ontobdc/shared/adapter/entity-references';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const SEPARATOR = '|';

/**
 * Edits a field that takes several entities of the container: the ones chosen, each with a × to take it off, and a
 * list to choose another from (by group and type, with the choice of making a new one in a group, which is added
 * when it is saved). The value is their global ids separated by `|`, as the data source holds them.
 */
export default function entityReferencesEditor({ value, label, owner = '', field = '', entityTypes = [], entityTypeLabels = {} }: EditorOptions): Editor {
  const ids: string[] = value.split(SEPARATOR).map((id) => id.trim()).filter(Boolean);
  const names = new Map<string, string>();
  const listeners: Array<() => void> = [];
  const changed = (): void => listeners.forEach((listener) => listener());

  const root = document.createElement('div');
  root.className = 'entity-list-editor';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', label);
  const list = document.createElement('ul');
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  const none = document.createElement('option');
  none.value = '';
  none.textContent = translate('entity.list.add');
  select.append(none);
  fillEntityChoices(select, owner, entityTypes, entityTypeLabels);
  root.append(list, select);

  const known = entityLabels();
  const shown = (id: string): string => names.get(id) ?? known[id]?.en ?? id;
  const draw = (): void => {
    list.replaceChildren(...ids.map((id) => {
      const entry = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = shown(id);
      text.title = id;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'entity-list-remove';
      remove.textContent = '×';
      remove.title = translate('entity.list.remove', { item: shown(id) });
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => {
        ids.splice(ids.indexOf(id), 1);
        draw();
        changed();
      });
      entry.append(text, remove);
      return entry;
    }));
  };
  const add = (id: string, name = ''): void => {
    if (!id || ids.includes(id)) return;
    if (name) names.set(id, name);
    ids.push(id);
    draw();
    changed();
  };

  select.addEventListener('change', () => {
    const chosen = select.value;
    select.value = '';
    if (chosen.startsWith(NEW_TYPE_PREFIX)) requestNewEntityForType(owner, field, chosen.slice(NEW_TYPE_PREFIX.length));
    else if (chosen.startsWith(NEW_PREFIX)) requestNewEntityFor(owner, field, chosen.slice(NEW_PREFIX.length));
    else add(chosen);
  });
  registerReferenceEditor(owner, field, (id, name) => add(id, name));

  draw();
  return {
    element: root,
    value: () => ids.join(SEPARATOR),
    isValid: () => true,
    onChange: (listener) => { listeners.push(listener); },
  };
}

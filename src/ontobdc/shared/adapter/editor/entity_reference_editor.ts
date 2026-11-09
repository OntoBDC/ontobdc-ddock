import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import type { Editor, EditorOptions } from '@/ontobdc/shared/adapter/editor/editor';
import { fillEntityChoices, NEW_PREFIX, NEW_TYPE_PREFIX } from '@/ontobdc/shared/adapter/editor/entity_choices';
import { registerReferenceEditor, requestNewEntityFor, requestNewEntityForType } from '@/ontobdc/shared/adapter/entity-references';

/**
 * Edits a field that takes one entity of the container: a choice of making a new one in a group, and then the list of the
 * entities, by group and, when they have one, by type. Making it asks for the tab of a new entity of that
 * group; the entity that is saved there is chosen here, and the tab of what is edited comes back. The value is
 * the global id of the entity, as the data source holds it.
 */
export default function entityReferenceEditor({ value, label, owner = '', field = '', entityTypes = [], entityTypeLabels = {}, owned = false }: EditorOptions): Editor {
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  const none = document.createElement('option');
  none.value = '';
  select.append(none);

  fillEntityChoices(select, owner, entityTypes, entityTypeLabels, owned);

  // What is chosen but is not among the entities (one that is not listed any more) is kept as it is.
  if (value !== '' && ![...select.options].some((entry) => entry.value === value)) {
    const kept = document.createElement('option');
    kept.value = value;
    kept.textContent = EntityRepository.getInstance().find(value)?.item.name || value;
    select.insertBefore(kept, none.nextSibling);
  }
  select.value = value;

  const listeners: Array<() => void> = [];
  const changed = (): void => listeners.forEach((listener) => listener());
  let chosen = value;
  select.addEventListener('change', () => {
    if (select.value.startsWith(NEW_TYPE_PREFIX)) {
      const type = select.value.slice(NEW_TYPE_PREFIX.length);
      select.value = chosen;
      requestNewEntityForType(owner, field, type);
      return;
    }
    if (select.value.startsWith(NEW_PREFIX)) {
      const group = select.value.slice(NEW_PREFIX.length);
      select.value = chosen;
      requestNewEntityFor(owner, field, group);
      return;
    }
    chosen = select.value;
    changed();
  });

  registerReferenceEditor(owner, field, (id, name) => {
    if (![...select.options].some((entry) => entry.value === id)) {
      const created = document.createElement('option');
      created.value = id;
      created.textContent = name || id;
      select.insertBefore(created, none.nextSibling);
    }
    select.value = id;
    chosen = id;
    changed();
  });

  return {
    element: select,
    value: () => chosen,
    isValid: () => true,
    onChange: (listener) => { listeners.push(listener); },
  };
}

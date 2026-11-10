import { forgetListEditors } from '@/ontobdc/shared/adapter/list-editors';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { editorFor } from '@/ontobdc/shared/adapter/editor_by_datatype';
import type { Editor } from '@/ontobdc/shared/adapter/editor/editor';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { entityTypeLabelsOf, entityTypesOf, forgetReferenceEditors, isEntityReference, isOwned } from '@/ontobdc/shared/adapter/entity-references';
import { nameIn } from '@/ontobdc/shared/adapter/facade-labels';
import type { Mountable } from '@/ontobdc/shared/adapter/view';
import { getLocale, onLocaleChange, translate } from '@/ontobdc/shared/plugin/i18n';

const ID_PREFIX = 'entity-new:';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * A Surface tab to fill in a new entity of a group of the database. Its fields
 * are the ones a person has to give: those the facade of the group's entity
 * declares editable or required and gives no default, in the order
 * the facade gives, each named in the language of the interface and edited with
 * the editor of its datatype (a list to choose from when the facade lists the
 * values). The Dockview panel id is `entity-new:<group>`, where group is the
 * dataset's path in the container. Save is on while something is filled in and
 * everything is valid; it publishes `presentation.entity.create.requested` with
 * the fields that were filled in. It only shows the form and reports: what that
 * event does is up to the listeners.
 */
export default function makeEntityNew({ id }: { id: string }): Mountable {
  const groupId = id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : id;
  const repository = EntityRepository.getInstance();

  const root = document.createElement('div');
  root.className = 'panel-content entity-viewer entity-new';
  root.id = `entity-new-panel:${encodeURIComponent(groupId)}`;
  root.tabIndex = -1;

  const actions = document.createElement('div');
  actions.className = 'entity-actions';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'entity-action save';
  save.dataset.action = 'save';
  save.disabled = true;
  save.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2h8l2 2v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M5 2v4h5V2M5 14v-4h6v4"/></svg>';
  actions.append(save);
  const titleSave = (): void => {
    save.title = translate('entity.action.save');
    save.setAttribute('aria-label', save.title);
  };
  titleSave();

  const required = new Set<string>();
  /** The fields that belong to other types than the one chosen: they are not shown and take no value. */
  const hidden = new Set<string>();
  /** What the person filled in, by field; a field left empty, or one that is not of the type, is not part of it. */
  const filled = (): Record<string, string> => Object.fromEntries(
    [...editors].filter(([name]) => !hidden.has(name)).map(([name, editor]) => [name, editor.value()]).filter(([, value]) => value.trim() !== ''),
  );
  /** Whether the facade gives a field a value of its own. */
  let named = false;
  const refresh = (): void => {
    const values = filled();
    const valid = [...editors].filter(([name]) => !hidden.has(name)).every(([name, editor]) => editor.isValid() || (values[name] === undefined && !required.has(name)));
    const complete = [...required].filter((name) => !hidden.has(name)).every((name) => values[name] !== undefined);
    // Nothing filled in is an entity too when the facade gives a field a value of its own (a 5W2H is called 5W2H): the rest is filled in later.
    save.disabled = (Object.keys(values).length === 0 && !named) || !valid || !complete;
  };
  save.addEventListener('click', () => {
    if (save.disabled) return;
    eventBus.publish('presentation.entity.create.requested', 'entity_new', { group: groupId, values: filled() });
  });

  const labels = new Map<HTMLElement, { labels: Record<string, string>; name: string; required: boolean }>();
  const editors = new Map<string, Editor>();

  const labelText = (name: string, names: Record<string, string>, required: boolean): string =>
    `${nameIn(names, getLocale()) ?? name}${required ? ' *' : ''}`;

  const draw = async (): Promise<void> => {
    const facade = repository.facadeOf(groupId);
    const group = repository.findGroup(groupId);
    if (!facade) return;

    const header = document.createElement('header');
    const title = document.createElement('h1');
    const dataset = document.createElement('p');
    dataset.className = 'entity-dataset';
    header.append(title, dataset);
    labels.set(title, { labels: facade.labels ?? {}, name: facade.name ?? groupId, required: false });
    title.textContent = translate('database.new.title', { name: nameIn(facade.labels, getLocale()) ?? facade.name ?? groupId });
    dataset.textContent = group ? `Dataset: ${group.title}` : '';

    const fields = document.createElement('dl');
    fields.className = 'entity-fields';
    const initial = repository.newValuesOf(groupId);
    named = facade.fields.some((field) => field.default_value !== undefined && field.default_value !== null);
    const editable = [...facade.fields]
      .filter((field) => !field.default && (field.default_value === undefined || field.default_value === null) && (field.editable === true || field.required === true))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const rows = new Map<string, { term: HTMLElement; detail: HTMLElement; types: string[] }>();
    const typeField = facade.fields.find((field) => field.maps_to_resource === RDF_TYPE);
    /** Shows the fields of the type chosen, and hides the ones of other types: a field that names no type is always shown. */
    const applyType = (): void => {
      const chosen = typeField ? (editors.get(typeField.identifier)?.value() ?? initial[typeField.identifier] ?? '').trim() : '';
      for (const [name, { term, detail, types }] of rows) {
        const belongs = types.length === 0 || (chosen !== '' && types.includes(chosen));
        term.hidden = !belongs;
        detail.hidden = !belongs;
        if (belongs) hidden.delete(name); else hidden.add(name);
      }
    };
    for (const field of editable) {
      const term = document.createElement('dt');
      term.dataset.field = field.identifier;
      term.title = field.identifier;
      labels.set(term, { labels: field.labels, name: field.identifier, required: field.required === true });
      term.textContent = labelText(field.identifier, field.labels, field.required === true);
      const detail = document.createElement('dd');
      const documents = field.resource_facade?.fields.some((resource) => resource.identifier === 'title') === true;
      const entities = isEntityReference(field);
      const editor = (await editorFor(field.datatype, field.options, field.multivalued === true, documents, entities))({
        value: initial[field.identifier] ?? '',
        datatype: field.datatype ?? '',
        label: term.textContent,
        entityTypes: entities ? entityTypesOf(field) : undefined,
        entityTypeLabels: entities ? entityTypeLabelsOf(field) : undefined,
        owned: isOwned(field),
        options: field.options,
        multivalued: field.multivalued === true,
        documents,
        owner: `new:${groupId}`,
        panelId: `entity-new:${groupId}`,
        field: field.identifier,
        optionLabels: Object.fromEntries((field.options ?? []).map((option) => [option, nameIn(field.option_labels?.[option], getLocale()) ?? option])),
      });
      editors.set(field.identifier, editor);
      if (field.required === true) required.add(field.identifier);
      if (!Array.isArray(field.applies_to)) throw new Error(`The facade does not say which types the field ${field.identifier} belongs to: brasidatacenter 0.15.0 or later is needed.`);
      rows.set(field.identifier, { term, detail, types: field.applies_to });
      editor.onChange(field.identifier === typeField?.identifier ? () => { applyType(); refresh(); } : refresh);
      detail.append(editor.element);
      fields.append(term, detail);
    }
    root.replaceChildren(actions, header, fields);
    applyType();
    refresh();
  };

  void draw();

  const unsubscribe = onLocaleChange(() => {
    titleSave();
    for (const [term, { labels: names, name, required }] of labels) {
      term.textContent = term.tagName === 'H1'
        ? translate('database.new.title', { name: nameIn(names, getLocale()) ?? name })
        : labelText(name, names, required);
    }
  });

  return {
    element: root,
    dispose: () => {
      unsubscribe();
      forgetListEditors(`new:${groupId}`);
      forgetReferenceEditors(`new:${groupId}`);
      root.remove();
    },
  };
}

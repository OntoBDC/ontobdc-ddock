import { listSkeleton } from '@/ontobdc/shared/adapter/command-pending';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { documentPath } from '@/ontobdc/shared/adapter/document-iri';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { clearPending, markPending } from '@/ontobdc/shared/adapter/facade-labels';
import type { Mountable } from '@/ontobdc/shared/adapter/view';
import type { EntityField } from '@/ontobdc/shared/domain/model/entity';
import type { MessageKey } from '@/ontobdc/shared/plugin/i18n';
import { applyTranslations, getLocale, onLocaleChange, translate } from '@/ontobdc/shared/plugin/i18n';

const SOURCE = 'entity';
const ID_PREFIX = 'entity:';

/**
 * The name of a field in the current language: the one the ontology gives in
 * the locale (`pt-br`), else in its language (`pt`), else English, else the
 * identifier the data source has.
 */
function fieldLabel(field: EntityField, locale: string): string {
  const tag = locale.toLowerCase();
  return field.labels[tag] ?? field.labels[tag.split('-')[0]] ?? field.labels.en ?? field.name;
}

const DATE = /^\d{4}-\d{2}-\d{2}([T\s]|$)/;
const IMAGE = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i;

/**
 * The fields whose value the tab is likely to show differently once the facade is set up, judged by
 * the value: a date is masked, and the files that are images are drawn as a carousel. The facade
 * says it for sure, a little later; this is what the tab knows meanwhile.
 */
function likelyLazy(item: { fields: EntityField[] }): Map<string, 'text' | 'visual'> {
  const lazy = new Map<string, 'text' | 'visual'>();
  for (const field of item.fields) {
    const values = field.values.flatMap((value) => value.split('|')).map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) continue;
    if (values.some((value) => IMAGE.test(documentPath(value) ?? ''))) lazy.set(field.name, 'visual');
    else if (values.every((value) => DATE.test(value))) lazy.set(field.name, 'text');
  }
  return lazy;
}

type Action = 'comment' | 'edit' | 'save' | 'discard' | 'delete' | 'refresh';

const ACTIONS: Array<{ action: Action; icon: string; label: MessageKey }> = [
  { action: 'comment', icon: '<path d="M2.5 3h11v7.5H8L5 13.5v-3H2.5z"/>', label: 'comment.button' },
  { action: 'edit', icon: '<path d="M10.5 2.5l3 3-7.5 7.5H3v-3z"/><path d="M9 4l3 3"/>', label: 'entity.action.edit' },
  { action: 'save', icon: '<path d="M3 2h8l2 2v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M5 2v4h5V2M5 14v-4h6v4"/>', label: 'annotations.menu.save' },
  { action: 'discard', icon: '<path d="M3 6h6a3.5 3.5 0 0 1 0 7H6"/><path d="M5.5 3.5 3 6l2.5 2.5"/>', label: 'annotations.menu.discard' },
  { action: 'delete', icon: '<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/><path d="M6.5 6.5v5M9.5 6.5v5"/>', label: 'annotations.menu.delete' },
  { action: 'refresh', icon: '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5v3h-3"/>', label: 'entity.action.refresh' },
];

/**
 * A Surface tab with one entity of the database: its type, the dataset that
 * keeps it and every field its data source holds, whatever they are. The
 * fields are what `ontobdc container --entity` lists for the entity, so a new
 * kind of entity shows up here with nothing to change. The Dockview panel id is
 * `entity:<global id>`. The Comment, Edit, Save, Discard and Delete buttons are there
 * but disabled; the facade setup enables Comment when the facade says the entity can be commented on; Refresh is enabled, and publishes `presentation.entity.refresh.requested` with the id; the entity facade setup enables Edit when the facade declares an
 * editable field, and Edit then publishes `presentation.entity.edit.requested`
 * with the id; Delete is enabled the same way when the facade says its instances can
 * be deleted, and publishes `presentation.entity.delete.requested`. Nothing else
 * changes an entity yet. Closing the tab
 * publishes `presentation.main.entity.closed` with the id.
 */
export default function makeEntity({ id }: { id: string }): Mountable {
  const globalId = id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : id;

  const root = document.createElement('div');
  root.id = `entity-panel:${encodeURIComponent(globalId)}`;
  root.className = 'panel-content entity-viewer';
  root.tabIndex = -1; // focusable, so a click in the tab activates it

  const actions = document.createElement('div');
  actions.className = 'annotation-actions';
  const buttons = ACTIONS.map(({ action, icon, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `annotation-action ${action}`;
    button.dataset.action = action;
    // Reading the entities again changes nothing in the tab, so it is there from the start.
    button.disabled = action !== 'refresh';
    button.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
    return { button, label };
  });
  actions.append(...buttons.map(({ button }) => button));
  actions.querySelector('button[data-action="refresh"]')?.addEventListener('click', () => {
    eventBus.publish('presentation.entity.refresh.requested', SOURCE, { id: globalId });
  });

  const render = (): void => {
    for (const { button, label } of buttons) {
      button.title = translate(label);
      button.setAttribute('aria-label', translate(label));
    }

    // While the entity is being edited the fields are what the person is typing: drawing them again would lose it.
    if (root.dataset.mode === 'editing') return;

    const repository = EntityRepository.getInstance();
    const found = repository.find(globalId);
    actions.hidden = !found;
    // An entity the lists do not have yet is not missing: they are still being read.
    if (!found && (!repository.isLoaded() || repository.isExpected(globalId)) && !readFailed) {
      root.dataset.state = 'loading';
      root.replaceChildren(actions, listSkeleton(6));
      return;
    }
    root.dataset.state = found ? 'ready' : 'missing';
    if (!found) {
      const missing = document.createElement('p');
      missing.className = 'entity-missing';
      missing.dataset.i18n = 'entity.viewer.missing';
      missing.textContent = translate('entity.viewer.missing');
      root.replaceChildren(actions, missing);
      applyTranslations(root);
      return;
    }

    const { group, item } = found;
    const header = document.createElement('header');
    if (item.type) {
      const type = document.createElement('span');
      type.className = 'entity-type';
      type.textContent = item.type;
      header.append(type);
    }
    const title = document.createElement('h2');
    title.className = 'entity-title';
    title.textContent = item.name || item.id;
    const dataset = document.createElement('p');
    dataset.className = 'entity-dataset';
    dataset.textContent = translate('entity.viewer.dataset', { dataset: group.title });
    header.append(title, dataset);

    const fields = document.createElement('dl');
    fields.className = 'entity-fields';
    for (const field of item.fields) {
      // Stable across locale changes and renders; unique across entity tabs.
      const fieldId = `entity-field:${encodeURIComponent(globalId)}:${encodeURIComponent(field.name)}`;
      const term = document.createElement('dt');
      term.id = `${fieldId}:label`;
      term.textContent = fieldLabel(field, getLocale());
      term.title = field.name;
      term.dataset.field = field.name;
      const detail = document.createElement('dd');
      detail.id = `${fieldId}:value`;
      detail.setAttribute('aria-labelledby', term.id);
      if (field.values.length === 0) {
        detail.className = 'entity-empty';
        detail.textContent = '—';
      } else if (field.values.length === 1) {
        detail.textContent = field.values[0];
      } else {
        const list = document.createElement('ul');
        for (const value of field.values) {
          const entry = document.createElement('li');
          entry.textContent = value;
          list.append(entry);
        }
        detail.append(list);
      }
      fields.append(term, detail);
    }

    root.replaceChildren(actions, header, fields);
    applyTranslations(root);
    // The first time, and when the person asks to read it again, the fields that are likely to change
    // wait behind a skeleton: the facade setup, or the answer, takes them off.
    if (skeleton) {
      skeleton = false;
      markPending(root, likelyLazy(item));
    }
    announce();
  };

  /** The facade setup starts once the tab is mounted and the entity is drawn: it works on the fields it finds. */
  let mountedDone = false;
  let announced = false;
  const announce = (): void => {
    if (announced || !mountedDone || root.dataset.state !== 'ready') return;
    announced = true;
    eventBus.publish('presentation.main.panel.entity.opened', SOURCE, { id: globalId, panelId: root.id });
  };

  let readFailed = false;
  let skeleton = true;
  render();

  const unsubscribers = [
    // The lists were read again: the entity is what the CLI answered last.
    eventBus.subscribe('presentation.container.entities.found', render),
    // One entity was read again, maybe this one.
    eventBus.subscribe('presentation.container.entity.found', render),
    // The lists could not be read: what is not there is missing.
    eventBus.subscribe('presentation.container.entities.failed', () => { readFailed = true; render(); }),
    eventBus.subscribe('presentation.entity.refresh.requested', ({ payload }) => {
      if (payload?.id !== globalId || root.dataset.state !== 'ready') return;
      const found = EntityRepository.getInstance().find(globalId);
      if (found) markPending(root, likelyLazy(found.item));
    }),
    eventBus.subscribe('presentation.entity.refresh.failed', ({ payload }) => {
      if (payload?.id === globalId) clearPending(root);
    }),
    onLocaleChange(render),
  ];

  return {
    element: root,
    mounted: () => {
      mountedDone = true;
      announce();
    },
    dispose: () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      root.remove();
      eventBus.publish('presentation.main.entity.closed', SOURCE, { id: globalId });
    },
  };
}

import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { tagsOf } from '@/ontobdc/shared/adapter/entity-tags';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import imageCarousel from '@/ontobdc/shared/adapter/image-carousel';
import type { Mountable } from '@/ontobdc/shared/adapter/view';
import type { EntityItem } from '@/ontobdc/shared/domain/model/entity';
import { applyTranslations, onLocaleChange, translate } from '@/ontobdc/shared/plugin/i18n';

const SOURCE = 'tag';
const ID_PREFIX = 'tag:';

/** The field that holds the documents an entity refers to, separated by a vertical bar. */
const DOCUMENTS_FIELD = 'related_documents';
const SEPARATOR = '|';

/** The images the carousel shows, as the ImageCarousel visualization of the facades accepts them. */
const IMAGE_PROFILE = {
  mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/heic', 'image/heif'],
  extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'],
};

type Tagged = { group: string; item: EntityItem };

/** The entities that have the tag (in any case), in the order the database lists them. */
function taggedWith(tag: string): Tagged[] {
  const wanted = tag.toLocaleLowerCase();
  const found: Tagged[] = [];
  for (const group of EntityRepository.getInstance().all()) {
    for (const item of group.items) {
      if (tagsOf(item.fields).some((candidate) => candidate.toLocaleLowerCase() === wanted)) found.push({ group: group.id, item });
    }
  }
  return found;
}

/** The documents the entities refer to, once each. */
function documentsOf(items: EntityItem[]): string[] {
  const documents = new Set<string>();
  for (const item of items) {
    for (const value of item.fields.find((field) => field.name === DOCUMENTS_FIELD)?.values ?? []) {
      for (const part of value.split(SEPARATOR)) if (part.trim()) documents.add(part.trim());
    }
  }
  return [...documents];
}

/**
 * A Surface tab with the entities that have a tag, grouped by the kind of entity, in the style of the
 * Related Documents of an entity: each kind is a row, with its instances as a list to open them, and
 * the images of the documents they refer to in a carousel. The Dockview panel id is `tag:<tag>`. It
 * draws again when the entities are read again or the language changes.
 */
export default function makeTag({ id }: { id: string }): Mountable {
  const tag = id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : id;

  const root = document.createElement('div');
  root.id = `tag-panel:${encodeURIComponent(tag)}`;
  root.className = 'panel-content entity-viewer tag-viewer';
  root.tabIndex = -1;

  let disposers: Array<() => void> = [];

  const render = (): void => {
    disposers.forEach((dispose) => dispose());
    disposers = [];

    const header = document.createElement('header');
    const chip = document.createElement('span');
    chip.className = 'entity-type';
    chip.textContent = translate('tag.kind');
    const title = document.createElement('h2');
    title.className = 'entity-title';
    title.textContent = tag;
    header.append(chip, title);

    const tagged = taggedWith(tag);
    if (tagged.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'entity-missing';
      empty.textContent = translate('tag.empty');
      root.replaceChildren(header, empty);
      return;
    }

    const kinds = new Map<string, Tagged[]>();
    for (const entry of tagged) kinds.set(entry.item.type || '—', [...(kinds.get(entry.item.type || '—') ?? []), entry]);

    const fields = document.createElement('dl');
    fields.className = 'entity-fields';
    for (const [kind, entries] of kinds) {
      const term = document.createElement('dt');
      term.textContent = `${kind} (${entries.length})`;
      const detail = document.createElement('dd');

      const list = document.createElement('ul');
      list.className = 'tag-instances';
      for (const { group, item } of entries) {
        const row = document.createElement('li');
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'tag-instance';
        open.textContent = item.name || item.id;
        open.title = item.id;
        open.addEventListener('click', () => eventBus.publish('presentation.database.item.opened', SOURCE, { group, id: item.id }));
        row.append(open);
        list.append(row);
      }
      detail.append(list);

      const documents = documentsOf(entries.map((entry) => entry.item));
      if (documents.length > 0) {
        const carousel = imageCarousel({ values: documents, accepts: IMAGE_PROFILE });
        // What is not an image is left out: the carousel only draws what it can.
        if (carousel.handled.length > 0) {
          carousel.element.classList.add('tag-carousel');
          detail.append(carousel.element);
          disposers.push(carousel.dispose);
        } else {
          carousel.dispose();
        }
      }
      fields.append(term, detail);
    }

    root.replaceChildren(header, fields);
    applyTranslations(root);
  };

  render();

  const unsubscribers = [
    eventBus.subscribe('presentation.container.entities.found', render),
    eventBus.subscribe('presentation.container.entity.found', render),
    onLocaleChange(render),
  ];

  return {
    element: root,
    dispose: () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      disposers.forEach((dispose) => dispose());
      root.remove();
    },
  };
}

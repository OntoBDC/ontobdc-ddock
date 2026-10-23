import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import type { VisualizationContext, VisualizationResult } from '@/ontobdc/shared/domain/model/visualization';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const SOURCE = 'tag-list';
/** The separator of the values of a field in its data source: a tag cannot hold it. */
const SEPARATOR = '|';
const MAX_LENGTH = 40;

/**
 * The visualization of a tag list: the values of the field are texts, and each is a tag, a small
 * label, side by side with the others. The tags are drawn beside the fields, at the right of the tab.
 * A tag is not changed: it is removed, with the × on it, or added, by typing it in the box at the end and
 * pressing Enter. Either way the list of the entity is saved whole, with
 * `presentation.entity.save.requested`; the tags go back to what was saved if saving fails.
 */
export default function tagList(context: VisualizationContext): VisualizationResult {
  const element = document.createElement('div');
  element.className = 'tag-cloud';
  const entityId = context.entityId;

  let committed = [...context.values];
  let shown = [...committed];
  let saving = false;

  const save = (next: string[]): void => {
    if (!entityId || saving) return;
    saving = true;
    shown = next;
    draw();
    eventBus.publish('presentation.entity.save.requested', SOURCE, { id: entityId, changes: { tags: next.join(SEPARATOR) } });
  };

  const chip = (value: string): HTMLElement => {
    const tag = document.createElement('span');
    tag.className = 'tag-chip';
    const text = document.createElement('span');
    text.className = 'tag-text';
    text.textContent = value;
    text.title = value;
    tag.append(text);
    if (entityId) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tag-remove';
      remove.textContent = '×';
      remove.title = translate('tags.remove', { name: value });
      remove.setAttribute('aria-label', remove.title);
      remove.disabled = saving;
      remove.addEventListener('click', () => save(shown.filter((other) => other !== value)));
      tag.append(remove);
    }
    return tag;
  };

  const adder = (): HTMLInputElement => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-add';
    input.maxLength = MAX_LENGTH;
    input.placeholder = translate('tags.add');
    input.setAttribute('aria-label', input.placeholder);
    input.disabled = saving;
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      const tag = input.value.replaceAll(SEPARATOR, ' ').replace(/\s+/g, ' ').trim();
      if (!tag) return;
      // The same tag in another case is the same tag: it is not added twice.
      if (shown.some((other) => other.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
        input.value = '';
        return;
      }
      save([...shown, tag]);
    });
    return input;
  };

  const draw = (): void => {
    element.dataset.saving = String(saving);
    element.replaceChildren(...shown.map(chip), ...(entityId ? [adder()] : []));
  };

  const unsubscribe = entityId
    ? [
      eventBus.subscribe('presentation.entity.saved', ({ payload }) => {
        if (payload?.id !== entityId || !saving) return;
        saving = false;
        committed = [...shown];
        draw();
      }),
      eventBus.subscribe('presentation.entity.save.failed', ({ payload }) => {
        if (payload?.id !== entityId || !saving) return;
        saving = false;
        shown = [...committed];
        draw();
      }),
    ]
    : [];
  draw();

  return {
    element,
    handled: [...context.values],
    aside: true,
    dispose: () => {
      unsubscribe.forEach((off) => off());
      element.remove();
    },
  };
}

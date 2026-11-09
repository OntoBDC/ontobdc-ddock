import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { entityChoiceGroups } from '@/ontobdc/shared/adapter/entity-references';
import { translate } from '@/ontobdc/shared/plugin/i18n';

/** The prefix of the value of an option that asks for a new entity in a group, whose name follows. */
export const NEW_PREFIX = '\u0000new:';
/** The prefix of the value of an option that asks for a new entity of a type the container has no group for, whose IRI follows. */
export const NEW_TYPE_PREFIX = '\u0000new-type:';

/**
 * Puts in the list the choice of making a new entity in a group, and then the entities of the container by group
 * and, when they have one, by type: but the one `owner` is (an entity cannot point to itself). With `types`, only the
 * groups that hold entities of those types. `excludedTypes` are never offered. An `owned` field only makes: it lists
 * the types it takes, to make one of them.
 */
export function fillEntityChoices(
  select: HTMLSelectElement,
  owner: string,
  types: string[] = [],
  typeLabels: Record<string, string> = {},
  owned = false,
  excludedTypes: string[] = [],
): void {
  if (owned) {
    // The entity belongs to the one being edited: it is made for it, so the list has only the types to make, named by their facades.
    const making = document.createElement('optgroup');
    making.label = translate('entity.reference.new');
    for (const type of types.filter((candidate) => !excludedTypes.includes(candidate) && typeLabels[candidate] !== undefined)) {
      const entry = document.createElement('option');
      entry.value = `${NEW_TYPE_PREFIX}${type}`;
      entry.textContent = `+ ${typeLabels[type]}`;
      making.append(entry);
    }
    select.append(making);
    return;
  }
  const groups = entityChoiceGroups(owner, types, excludedTypes);
  const creation = document.createElement('optgroup');
  creation.label = translate('entity.reference.new');
  for (const { group, title } of groups) {
    // The tab of a new entity of the group the field is in is this one: there is nothing to make.
    if (owner === `new:${group}`) continue;
    const entry = document.createElement('option');
    entry.value = `${NEW_PREFIX}${group}`;
    entry.textContent = `+ ${title}`;
    creation.append(entry);
  }
  // A type the field takes and no group of the container holds is offered too, when its facade names it (one without a facade cannot be made): making one makes the group.
  const held = new Set(groups.flatMap(({ group }) => EntityRepository.getInstance().findGroup(group)?.entityTypes ?? []));
  for (const type of types.filter((candidate) => !excludedTypes.includes(candidate) && !held.has(candidate) && typeLabels[candidate] !== undefined)) {
    const entry = document.createElement('option');
    entry.value = `${NEW_TYPE_PREFIX}${type}`;
    entry.textContent = `+ ${typeLabels[type]}`;
    creation.append(entry);
  }
  select.append(creation);
  for (const { title, sections } of groups) {
    for (const { type, items } of sections) {
      const section = document.createElement('optgroup');
      section.label = type ? `${title} · ${type}` : title;
      for (const item of items) {
        const entry = document.createElement('option');
        entry.value = item.id;
        entry.textContent = item.name;
        section.append(entry);
      }
      select.append(section);
    }
  }

}

import type { EntityGroup } from '@/ontobdc/shared/domain/model/entity';

/**
 * The groups with the entities that were read again in place of the ones they had, and nothing else
 * changed: an entity the group did not have is added at its end, and a group that was not there is left
 * out, because one entity read does not say what else a group holds.
 */
export function withEntitiesRead(groups: EntityGroup[], read: EntityGroup[]): EntityGroup[] {
  return groups.map((group) => {
    const items = read.find((candidate) => candidate.id === group.id)?.items;
    if (!items) return group;
    const replaced = group.items.map((item) => items.find((candidate) => candidate.id === item.id) ?? item);
    return { ...group, items: [...replaced, ...items.filter((item) => !group.items.some((candidate) => candidate.id === item.id))] };
  });
}

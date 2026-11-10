import type { EntityGroup } from '@/ontobdc/shared/domain/model/entity';

/** The IRI of the type of the entities a group creates: the only one the group declares. */
export function createdTypeOf(group: EntityGroup): string {
  if (group.entityTypes.length === 0) throw new Error(`The group ${group.title} declares no entity type to create an entity of.`);
  if (group.entityTypes.length > 1) throw new Error(`The group ${group.title} declares several entity types (${group.entityTypes.join(', ')}): the request must say which one to create.`);
  return group.entityTypes[0];
}

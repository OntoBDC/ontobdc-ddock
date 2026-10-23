import type { EntityGroup } from '@/ontobdc/shared/domain/model/entity';
import type { ExplorerNode } from '@/ontobdc/shared/domain/model/explorer-node';

/** The name of the field that holds the tags of an entity, and what separates its values in the data source. */
const TAGS_FIELD = 'tags';
const SEPARATOR = '|';

/** The tags of an entity, as its `tags` field holds them: none when it has no such field or no value. */
export function tagsOf(fields: Array<{ name: string; values: string[] }>): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of fields.find((field) => field.name === TAGS_FIELD)?.values ?? []) {
    for (const part of value.split(SEPARATOR)) {
      const tag = part.trim();
      if (tag && !seen.has(tag.toLocaleLowerCase())) {
        seen.add(tag.toLocaleLowerCase());
        tags.push(tag);
      }
    }
  }
  return tags;
}

/**
 * The tree of the tags of the entities: a directory for each tag, in alphabetical order, and under it
 * the entities that have it, by name. The same tag in another case is the same tag, and shows as
 * it was first written.
 */
export function tagNodesOf(groups: EntityGroup[]): ExplorerNode[] {
  const byTag = new Map<string, { label: string; entities: ExplorerNode[] }>();
  for (const group of groups) {
    for (const item of group.items) {
      for (const tag of tagsOf(item.fields)) {
        const key = tag.toLocaleLowerCase();
        const entry = byTag.get(key) ?? { label: tag, entities: [] };
        entry.entities.push({ name: item.name || item.id, entity: { group: group.id, id: item.id } });
        byTag.set(key, entry);
      }
    }
  }

  return [...byTag.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(({ label, entities }) => ({
      name: label,
      children: entities.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

import { withEntitiesRead } from '@/ontobdc/shared/adapter/entity-groups';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import type { Facade } from '@/ontobdc/shared/adapter/facade-labels';
import type { EntityGroup, EntityItem } from '@/ontobdc/shared/domain/model/entity';

/**
 * Keeps the groups the database last showed, so a tab of one entity can read
 * it by its global id without going through the event bus. The container
 * listeners own the truth and publish it in `presentation.container.entities.found`;
 * this just caches it.
 */
export class EntityRepository {
  private static instance: EntityRepository | null = null;
  private groups: EntityGroup[] = [];
  private loaded = false;
  private readonly expected = new Set<string>();
  private readonly facades = new Map<string, Facade>();
  private readonly facadesByEntityType = new Map<string, Facade>();
  private readonly newValues = new Map<string, Record<string, string>>();
  private readonly unsubscribe: Array<() => void> = [];

  private constructor() {
    this.unsubscribe.push(
      eventBus.subscribe('presentation.container.entities.found', ({ payload }) => {
        this.groups = Array.isArray(payload?.groups) ? payload.groups : [];
        this.loaded = true;
        this.expected.clear();
      }),
      // The lists could not be read: what was expected will not come.
      eventBus.subscribe('presentation.container.entities.failed', () => this.expected.clear()),
      // One entity was read again: it takes the place of the one the group had, and the others stay as they were.
      eventBus.subscribe('presentation.container.entity.found', ({ payload }) => {
        this.groups = withEntitiesRead(this.groups, Array.isArray(payload?.groups) ? payload.groups : []);
      }),
    );
  }

  static getInstance(): EntityRepository {
    EntityRepository.instance ??= new EntityRepository();
    return EntityRepository.instance;
  }

  /** Whether the entities were read at least once: until then an entity that is not found may only not have been read yet. */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** An entity that was just created: it is not missing from the lists, they only have to be read again to show it. */
  expect(id: string): void {
    this.expected.add(id);
  }

  /** Whether the entity was created and the lists were not read again since. */
  isExpected(id: string): boolean {
    return this.expected.has(id);
  }

  /** The groups last shown. */
  all(): EntityGroup[] {
    return this.groups;
  }

  /**
   * Groups that a command read from outside the lists the database shows, kept so the tab of one of
   * their entities can find it: a group the repository has is given the entities it did not have, and
   * one it does not have is added.
   */
  attach(groups: EntityGroup[]): void {
    const known = new Set(this.groups.map((group) => group.id));
    this.groups = [...withEntitiesRead(this.groups, groups), ...groups.filter((group) => !known.has(group.id))];
  }

  /** The entity with this global id, with its group, among the groups last shown. */
  find(id: string): { group: EntityGroup; item: EntityItem } | null {
    for (const group of this.groups) {
      const item = group.items.find((candidate) => candidate.id === id);
      if (item) return { group, item };
    }
    return null;
  }

  /** The group with this id (the dataset's path in the container), as last shown. */
  findGroup(id: string): EntityGroup | null {
    return this.groups.find((group) => group.id === id) ?? null;
  }

  /** The facade a listener found for the entities of the group, to draw the header of its table. */
  setFacade(group: string, facade: Facade): void {
    this.facades.set(group, facade);
  }

  /** The facade already inspected for this entity type, reused by entity and table panels. */
  setFacadeForEntityType(entityType: string, facade: Facade): void {
    this.facadesByEntityType.set(entityType, facade);
  }

  /** The fields the form of a new entity of the group starts with, by name. */
  setNewValues(group: string, values: Record<string, string>): void {
    this.newValues.set(group, values);
  }

  newValuesOf(group: string): Record<string, string> {
    return this.newValues.get(group) ?? {};
  }

  facadeOf(group: string): Facade | null {
    return this.facades.get(group) ?? null;
  }

  facadeOfEntityType(entityType: string): Facade | null {
    return this.facadesByEntityType.get(entityType) ?? null;
  }

  dispose(): void {
    this.unsubscribe.forEach((dispose) => dispose());
    this.groups = [];
    this.loaded = false;
    this.expected.clear();
    this.facades.clear();
    this.facadesByEntityType.clear();
    this.newValues.clear();
    EntityRepository.instance = null;
  }
}

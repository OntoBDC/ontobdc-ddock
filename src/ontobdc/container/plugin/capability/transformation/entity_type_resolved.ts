import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

/** Finds the type of the entity to create: the one the request names, or the one of the group it names. */
export class EntityTypeResolvedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.entity_type_resolved',
    description: 'Resolve the type of the entity to create, from the request or from the group it names.',
  };

  /** Nothing tells beforehand that this state already holds. */
  async isSatisfied(): Promise<boolean> {
    return false;
  }

  async execute(context: CapabilityContext): Promise<void> {
    if (!context.machine) throw new Error('The context of the capability carries no machine.');
    const { entityType, group: groupId } = context.parameters;

    let type = entityType;
    if (!type && groupId) {
      const group = EntityRepository.getInstance().findGroup(groupId);
      if (!group) throw new Error(`The database has no group ${groupId}.`);
      type = group.items[0]?.type || group.entityTypes[0];
      if (!type) throw new Error(`The group ${group.title} has no entity type to create an entity of.`);
    }
    if (!type) throw new Error('The request for a new entity names neither a type nor a group.');

    context.etl.write(context.machine, context.requestId, context.state, {
      phase: 'done',
      entity: { type },
      result: { type },
    });
  }
}

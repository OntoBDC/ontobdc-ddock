import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { entityGroupsOf } from '@/ontobdc/shared/adapter/container-format';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { CONTAINER_ENTITY_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import type { EntityGroup } from '@/ontobdc/shared/domain/model/entity';

const typeOf = (context: CapabilityContext): string => {
  if (!context.machine) throw new Error('The context of the capability carries no machine.');
  const type = (context.etl.read(context.machine, context.requestId, 'entity_type_resolved')?.result as { type?: string } | undefined)?.type;
  if (!type) throw new Error('No state resolved the type of the entity.');
  return type;
};

/** The group of the container that holds entities of the type: the one the request names when it does, else the first that does. */
export function groupHolding(type: string, requested?: string): EntityGroup | undefined {
  const holding = EntityRepository.getInstance().all().filter((group) => group.entityTypes.includes(type));
  return holding.find((group) => group.id === requested) ?? holding[0];
}

/**
 * Makes sure the container has a dataset that holds the entity: when it has none, one is created,
 * empty (`ontobdc container --entity <type> --dataset`), and the entities are read again so the
 * database knows it.
 */
export class EntityDatasetReadyCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.entity_dataset_ready',
    description: 'Create the dataset of the entity in the container, unless it already has one.',
  };

  /** Whether a dataset of the database holds the type. */
  async isSatisfied(context: CapabilityContext): Promise<boolean> {
    return groupHolding(typeOf(context), context.parameters.group) !== undefined;
  }

  async execute(context: CapabilityContext): Promise<void> {
    const type = typeOf(context);
    await requestCommand(`ontobdc container --entity ${quoted(type)} --dataset`, 'entity_dataset_ready');

    const read = await requestCommand(CONTAINER_ENTITY_COMMAND, 'entity_dataset_ready');
    const groups = entityGroupsOf(read.stdout);
    if (!groups) throw new Error('The entity command did not answer with datasets.');
    eventBus.publish('presentation.container.entities.found', 'entity_dataset_ready', { groups });
    if (!groupHolding(type)) throw new Error(`The container still has no dataset that holds ${type}.`);
  }
}

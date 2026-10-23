import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import type { Facade } from '@/ontobdc/shared/adapter/facade-labels';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import { groupHolding } from './entity_dataset_ready';

/** Reads the facade of the entity (`ontobdc context --entity <type> --inspect`) and keeps it with the entities of its group. */
export class EntityNewFacadeFoundCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.entity_new_facade_found',
    description: 'Read the facade of the entity, which must allow creating instances, and keep it for the form.',
  };

  /** Nothing tells beforehand that this state already holds. */
  async isSatisfied(): Promise<boolean> {
    return false;
  }

  async execute(context: CapabilityContext): Promise<void> {
    if (!context.machine) throw new Error('The context of the capability carries no machine.');
    const type = (context.etl.read(context.machine, context.requestId, 'entity_type_resolved')?.result as { type?: string } | undefined)?.type;
    const group = type ? groupHolding(type, context.parameters.group) : undefined;
    if (!type || !group) throw new Error('The database has no group that holds the entity.');

    const result = await requestCommand(`ontobdc context --entity ${quoted(type)} --inspect`, 'entity_new_facade_found');
    const response = result.stdout;
    const content = response && typeof response === 'object' && !Array.isArray(response) ? response.content : null;
    if (!content || typeof content !== 'object' || Array.isArray(content) || !Array.isArray(content.fields)) {
      throw new Error(`The facade inspection returned no facade for ${type}.`);
    }
    const facade = content as unknown as Facade;
    if (facade.creatable !== true) throw new Error(`The entities of ${type} cannot be created: their facade does not allow it.`);

    const repository = EntityRepository.getInstance();
    repository.setFacade(group.id, facade);
    repository.setNewValues(group.id, JSON.parse(context.parameters.values ?? '{}') as Record<string, string>);
    context.etl.write(context.machine, context.requestId, context.state, {
      phase: 'done',
      entity: { type, group: group.id },
      result: { facade, group: group.id },
    });
  }
}

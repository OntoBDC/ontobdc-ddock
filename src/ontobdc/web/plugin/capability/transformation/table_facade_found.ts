import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import type { Facade } from '@/ontobdc/shared/adapter/facade-labels';
import { GROUP_TABLE_MACHINE } from '@/ontobdc/shared/adapter/facade-table';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

export class TableFacadeFoundCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.web.plugin.capability.transformation.target.table_facade_found',
    description: 'Inspect the facade of the entity a group holds, in BrasidataCenter, through the command execution pipeline.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const { id, panelId } = context.parameters;
    if (!id) throw new Error('Group facade lookup requires a group id.');
    const repository = EntityRepository.getInstance();
    const group = repository.findGroup(id);
    const entityType = group?.entityTypes[0] || group?.items[0]?.type;
    if (!entityType) throw new Error(`The group ${id} has no known entity type for facade lookup.`);
    const cachedFacade = repository.facadeOfEntityType(entityType);
    const result = cachedFacade ? null : await requestCommand(`ontobdc context --entity ${quoted(entityType)} --inspect`, 'table_facade_found');
    const response = result?.stdout;
    const facade = cachedFacade ?? (response && typeof response === 'object' && !Array.isArray(response) ? response.content : null);
    if (!facade || typeof facade !== 'object' || Array.isArray(facade) || !Array.isArray(facade.fields)) {
      throw new Error(`The facade inspection returned no facade for group ${id}.`);
    }
    repository.setFacadeForEntityType(entityType, facade as Facade);
    context.etl.write(GROUP_TABLE_MACHINE, context.requestId, context.state, {
      phase: 'done', entity: { id, panelId, entityType }, result: { facade: facade as Facade, command: result },
    });
  }
}

import { CommandFailedError } from '@/ontobdc/shared/domain/exception/command-failed';
import { EntityFacadeUnavailableError } from '@/ontobdc/shared/domain/exception/entity-facade-unavailable';
import { markPending } from '@/ontobdc/shared/adapter/facade-labels';
import type { Facade } from '@/ontobdc/shared/adapter/facade-labels';
import { maskFor } from '@/ontobdc/shared/adapter/mask_by_datatype';
import { VISUALIZATION_BY_IRI } from '@/ontobdc/shared/adapter/visualization_by_iri';
import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

export class EntityFacadeFoundCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.web.plugin.capability.transformation.target.entity_facade_found',
    description: 'Inspect the entity facade in BrasidataCenter through the command execution pipeline.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const { id, panelId } = context.parameters;
    if (!id) throw new Error('Entity facade lookup requires an entity id.');
    const repository = EntityRepository.getInstance();
    const entityType = repository.find(id)?.item.type;
    if (!entityType) throw new Error(`The entity ${id} has no known type for facade lookup.`);
    const cachedFacade = repository.facadeOfEntityType(entityType);
    if (cachedFacade) {
      context.etl.write('set_up_entity_facade', context.requestId, context.state, {
        phase: 'done', entity: { id, panelId, entityType }, result: { facade: cachedFacade, command: null },
      });
      return;
    }
    let result;
    try {
      result = await requestCommand(`ontobdc context --entity ${quoted(entityType)} --inspect`, 'entity_facade_found');
    } catch (error) {
      if (error instanceof CommandFailedError && JSON.stringify(error.result?.stdout ?? null).includes('No URI is registered for the entity name')) {
        throw new EntityFacadeUnavailableError(entityType);
      }
      throw error;
    }
    const response = result.stdout;
    const facade = response && typeof response === 'object' && !Array.isArray(response) ? response.content : null;
    if (!facade || typeof facade !== 'object' || Array.isArray(facade) || !Array.isArray(facade.fields)) {
      throw new Error(`The facade inspection returned no facade for entity ${id}.`);
    }
    repository.setFacadeForEntityType(entityType, facade as Facade);
    // The fields the next states change are drawn as a skeleton until they have.
    const panelElement = panelId ? globalThis.document?.getElementById(panelId) ?? null : null;
    if (panelElement) {
      const lazy = new Map<string, 'text' | 'visual'>();
      for (const field of facade.fields as Array<{ identifier: string; datatype?: string; formats?: Record<string, string>; alternative_visualization?: { iri?: string } }>) {
        const iri = field.alternative_visualization?.iri;
        if (iri !== undefined && Object.hasOwn(VISUALIZATION_BY_IRI, iri)) lazy.set(field.identifier, 'visual');
        else if (maskFor(field.datatype) !== undefined && Object.keys(field.formats ?? {}).length > 0) lazy.set(field.identifier, 'text');
      }
      markPending(panelElement, lazy);
    }

    context.etl.write('set_up_entity_facade', context.requestId, context.state, {
      phase: 'done', entity: { id, panelId, entityType }, result: { facade, command: result },
    });
  }
}

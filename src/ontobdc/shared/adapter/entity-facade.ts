import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import type { Facade } from '@/ontobdc/shared/adapter/facade-labels';

/**
 * The facade of an entity type: the one the repository has, else the one `ontobdc context --entity <type> --inspect`
 * tells, kept for the next time.
 */
export async function entityFacadeOf(entityType: string): Promise<Facade> {
  const repository = EntityRepository.getInstance();
  const known = repository.facadeOfEntityType(entityType);
  if (known) return known;
  const result = await requestCommand(`ontobdc context --entity ${quoted(entityType)} --inspect`, 'entity_facade');
  const response = result.stdout;
  const facade = response && typeof response === 'object' && !Array.isArray(response) ? response.content : null;
  if (!facade || typeof facade !== 'object' || Array.isArray(facade) || !Array.isArray(facade.fields)) {
    throw new Error(`The facade inspection returned no facade for ${entityType}.`);
  }
  repository.setFacadeForEntityType(entityType, facade as Facade);
  return facade as Facade;
}

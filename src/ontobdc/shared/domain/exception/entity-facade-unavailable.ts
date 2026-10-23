/** The ontology has no facade for the type of the entity: it is shown with the fields it has. */
export class EntityFacadeUnavailableError extends Error {
  constructor(readonly entityType: string) {
    super(`The ontology has no URI registered for the entity type ${entityType}.`);
    this.name = 'EntityFacadeUnavailableError';
  }
}

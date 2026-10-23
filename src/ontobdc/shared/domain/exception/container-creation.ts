/** The person closed the folder picker without choosing: nothing failed, nothing was created. */
export class ContainerCreationCancelledError extends Error {
  constructor() {
    super('The creation of the container was cancelled.');
    this.name = 'ContainerCreationCancelledError';
  }
}

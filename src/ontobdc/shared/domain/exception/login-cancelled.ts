/** The person closed the login tab of the server without finishing: nothing failed, nobody is logged in. */
export class LoginCancelledError extends Error {
  constructor() {
    super('The login was cancelled: its tab was closed.');
    this.name = 'LoginCancelledError';
  }
}

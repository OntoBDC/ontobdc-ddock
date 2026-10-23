import type { CapabilityContext } from '@/ontobdc/shared/domain/model/capability';

/** The name the access token is kept under in the ETL: not a state, so no state depends on another. */
const TOKEN_RECORD = 'access_token';

export type LoginTokenData = {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
  scope?: string;
  refreshToken?: string;
  idToken?: string;
};

/** The access token of the person, the way the states of the login see it. */
export class LoginToken {
  constructor(private readonly context: Pick<CapabilityContext, 'etl' | 'requestId' | 'machine'>) {}

  private get machine(): string {
    if (!this.context.machine) throw new Error('The context of the capability carries no machine.');
    return this.context.machine;
  }

  /** Records the access token; it is not written to the URL, to logs or to local storage. */
  define(token: LoginTokenData): void {
    this.context.etl.write(this.machine, this.context.requestId, TOKEN_RECORD, {
      phase: 'done',
      entity: { name: 'access_token' },
      result: token,
    });
  }

  /** The access token, if a state received it. */
  read(): LoginTokenData | undefined {
    return this.context.etl.read(this.machine, this.context.requestId, TOKEN_RECORD)?.result as LoginTokenData | undefined;
  }
}

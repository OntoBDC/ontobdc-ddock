import { ACCESS_TOKEN_MAX_AGE_SECONDS, AccessTokenRepository } from '@/ontobdc/shared/adapter/access-token';
import { Config } from '@/ontobdc/shared/adapter/config';
import { LoginToken } from '@/ontobdc/shared/adapter/login-token';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

/** Remembers the access token of the person, for the server they logged in to. */
export class AccessTokenRememberedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.user.plugin.capability.transformation.target.access_token_remembered',
    description: 'Keep the access token in the AccessTokenRepository, for the server, for as long as it is valid.',
  };

  /** Nothing tells beforehand that this state already holds. */
  async isSatisfied(): Promise<boolean> {
    return false;
  }

  async execute(context: CapabilityContext): Promise<void> {
    const token = new LoginToken(context).read();
    if (!token?.accessToken) throw new Error('There is no access token to remember.');

    const maxAge = token.expiresIn && Number.isFinite(token.expiresIn) && token.expiresIn > 0
      ? Math.floor(token.expiresIn)
      : ACCESS_TOKEN_MAX_AGE_SECONDS;
    new AccessTokenRepository().set(Config.url('server.url'), token.accessToken, maxAge);
  }
}

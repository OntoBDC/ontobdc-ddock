import { AccessTokenRepository } from '@/ontobdc/shared/adapter/access-token';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import { accessTokenOf } from './folder';

/** Remembers, in the cookie, the token the connection worked with. */
export class AccessTokenRememberedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.access_token_remembered',
    description: 'Save the access token that worked in the cookie.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const url = context.parameters.url;
    const apiToken = accessTokenOf(context);
    if (url && apiToken) new AccessTokenRepository().set(url, apiToken);
    context.etl.write('remote_container_connection', context.requestId, context.state, {
      phase: 'done',
      entity: { remembered: Boolean(url && apiToken) },
      result: null,
    });
  }
}

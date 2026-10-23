import { LoginToken } from '@/ontobdc/shared/adapter/login-token';
import { Config } from '@/ontobdc/shared/adapter/config';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

const SOURCE = 'user_profile_received';

/** Reads the profile of the person from the server, and tells the application the login succeeded. */
export class UserProfileReceivedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.user.plugin.capability.transformation.target.user_profile_received',
    description: 'Call /profile with the access token and publish presentation.user.login.succeeded with the session.',
  };

  /** Nothing tells beforehand that this state already holds. */
  async isSatisfied(): Promise<boolean> {
    return false;
  }

  async execute(context: CapabilityContext): Promise<void> {
    const token = new LoginToken(context).read();
    if (!token?.accessToken) throw new Error('There is no access token to read the profile with.');

    const url = new URL(Config.url('server.profile'));
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('Profile URL must use HTTPS.');
    }

    const type = !token.tokenType || token.tokenType.toLowerCase() === 'bearer' ? 'Bearer' : token.tokenType;
    const response = await fetch(url, {
      headers: { Authorization: `${type} ${token.accessToken}`, Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(`Reading the profile failed (HTTP ${response.status}).`);

    const profile: unknown = await response.json();
    if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
      throw new Error('The profile response is not an object.');
    }

    // The access token is not in the event: the debug panel shows the payloads of the events.
    eventBus.publish('presentation.user.login.succeeded', SOURCE, {
      profile: profile as Record<string, unknown>,
      session: { tokenType: token.tokenType, expiresIn: token.expiresIn, scope: token.scope },
    });
  }
}

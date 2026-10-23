import { LoginCancelledError } from '@/ontobdc/shared/domain/exception/login-cancelled';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { LoginToken } from '@/ontobdc/shared/adapter/login-token';
import { Config } from '@/ontobdc/shared/adapter/config';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

const CALLBACK_PATH = '/oauth/callback.html';
const CALLBACK_EVENT = 'ontobdc.oauth.callback';
const SOURCE = 'user_access_token_received';
const LOGIN_TIMEOUT_MS = 300_000;

type OAuthCallback = {
  type: typeof CALLBACK_EVENT;
  state: string;
  code?: string;
  error?: string;
};

type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
};

const base64url = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const randomValue = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)));

const pkceChallenge = async (verifier: string): Promise<string> =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

/** Accept HTTPS endpoints; plain HTTP is limited to local development. */
const endpoint = (raw: string, name: string): URL => {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error(name + ' must use HTTPS.');
  }
  if (url.username || url.password || url.hash) throw new Error(name + ' contains unsupported URL components.');
  return url;
};

/** The callback page hosted by the current application. */
const callbackUrl = (): URL => new URL(CALLBACK_PATH, window.location.origin);

/**
 * The provider redirects the child tab to our small same-origin callback page.
 * That page uses postMessage to report the authorization code to its opener.
 */
function awaitAuthorizationCode(tab: Window, authorizationUrl: string, state: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (code?: string, error?: Error): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timeout);
      window.clearInterval(closedCheck);
      if (error) reject(error);
      else resolve(code!);
    };

    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin || event.source !== tab) return;
      const message: unknown = event.data;
      if (typeof message !== 'object' || message === null || Array.isArray(message)) return;
      const data = message as Partial<OAuthCallback>;
      if (data.type !== CALLBACK_EVENT || data.state !== state) return;
      if (typeof data.error === 'string') {
        finish(undefined, new Error('OAuth authorization failed: ' + data.error));
        return;
      }
      if (typeof data.code !== 'string' || !data.code) {
        finish(undefined, new Error('OAuth callback has no authorization code.'));
        return;
      }
      finish(data.code);
    };

    const timeout = window.setTimeout(() => finish(undefined, new Error('OAuth login timed out.')), LOGIN_TIMEOUT_MS);
    const closedCheck = window.setInterval(() => {
      if (tab.closed) finish(undefined, new LoginCancelledError());
    }, 1000);
    window.addEventListener('message', onMessage);

    try {
      tab.location.replace(authorizationUrl);
    } catch (error) {
      finish(undefined, error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Opens the login of the server in a separate browser tab, receives its authorization
 * code without reloading the application, and exchanges it for the access token. The
 * exchange is bound to the login by PKCE, so the application needs no registered client.
 *
 * The addresses of the login and of the token are the ones of `asset/config.yaml`.
 */
export class AccessTokenReceivedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.user.plugin.capability.transformation.target.access_token_received',
    description: 'Obtain an access token via a new browser tab and the authorization code, bound by PKCE.',
  };

  async isSatisfied(): Promise<boolean> {
    return false;
  }

  async execute(context: CapabilityContext): Promise<void> {
    if (!context.machine) throw new Error('The context of the capability carries no machine.');

    eventBus.publish('presentation.user.token.requested', SOURCE);

    const authorize = endpoint(Config.url('server.login'), 'Login URL');
    const token = endpoint(Config.url('server.token'), 'Token URL');
    const redirect = callbackUrl();
    const verifier = randomValue();
    const state = randomValue();

    // Open before any await to maximize the chance of retaining user activation.
    const tab = window.open('about:blank', '_blank');
    if (!tab) throw new Error('The browser blocked the OAuth login tab.');

    try {
      const challenge = await pkceChallenge(verifier);
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('redirect_uri', redirect.href);
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('code_challenge', challenge);
      authorize.searchParams.set('code_challenge_method', 'S256');

      const code = await awaitAuthorizationCode(tab, authorize.href, state);
      eventBus.publish('presentation.user.state_code.received', SOURCE);
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect.href,
        code_verifier: verifier,
      });
      const response = await fetch(token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        credentials: 'omit',
      });
      if (!response.ok) throw new Error('OAuth token exchange failed (HTTP ' + response.status + ').');

      const data: unknown = await response.json();
      if (typeof data !== 'object' || data === null || !('access_token' in data) ||
          typeof data.access_token !== 'string' || !data.access_token) {
        throw new Error('The OAuth token response has no access_token.');
      }
      const tokens = data as TokenResponse;

      new LoginToken(context).define({
        accessToken: tokens.access_token,
        tokenType: tokens.token_type,
        expiresIn: tokens.expires_in,
        scope: tokens.scope,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
      });
      eventBus.publish('presentation.user.token.received', SOURCE);
    } finally {
      if (!tab.closed) tab.close();
    }
  }
}

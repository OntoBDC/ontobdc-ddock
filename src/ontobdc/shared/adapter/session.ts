import { eventBus } from '@/ontobdc/shared/adapter/event-bus';

/** The name a profile goes by: its name, else its user name, else its e-mail; none when it has none. */
export function profileName(profile: Record<string, unknown> | undefined): string | undefined {
  const name = [profile?.name, profile?.username, profile?.email].find((value) => typeof value === 'string' && value.trim());
  return typeof name === 'string' ? name.trim() : undefined;
}

/** Who is logged in, as the last `presentation.user.login.succeeded` said. */
export class Session {
  private static instance: Session | null = null;
  private name: string | undefined;

  private constructor() {
    eventBus.subscribe('presentation.user.login.succeeded', ({ payload }) => {
      this.name = profileName(payload?.profile);
    });
  }

  static getInstance(): Session {
    Session.instance ??= new Session();
    return Session.instance;
  }

  /** The name of the person logged in; none when nobody is, or the profile has none. */
  userName(): string | undefined {
    return this.name;
  }
}

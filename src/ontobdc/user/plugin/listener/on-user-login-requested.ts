import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { LoginCancelledError } from '@/ontobdc/shared/domain/exception/login-cancelled';
import { UserLoginMachine } from '@/ontobdc/user/plugin/machine/user_login/machine';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const LOGIN_REQUESTED = 'presentation.user.login.requested';
const SOURCE = 'user_on_login_requested';

export class OnUserLoginRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'user',
    description: 'Logs the person in when they ask to, and says when the login did not finish.',
    arguments: [
      {
        listen: [LOGIN_REQUESTED],
        valued: false,
        description: 'The person asked to log in.',
        type: 'str',
      },
    ],
  };

  /** Hands the request to the machine of the login of the person. */
  async run(): Promise<void> {
    try {
      await new UserLoginMachine().execute();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The tab of the login tells the person; only what went wrong is also raised as an exception.
      eventBus.publish('presentation.user.login.failed', SOURCE, { message, cancelled: error instanceof LoginCancelledError });
      if (!(error instanceof LoginCancelledError)) eventBus.publish('presentation.exception.listener.raised', SOURCE, { message });
    }
  }
}

import source from './standard_user_login.yaml?raw';
import { convertStatechart, stateSequence, type StatechartConfig } from '@/ontobdc/shared/adapter/statechart-converter';

/** Provides the statechart definition independently of machine execution. */
export class UserLoginStatechart {
  static config(): StatechartConfig {
    return convertStatechart(source);
  }

  static sequence(): string[] {
    return stateSequence(UserLoginStatechart.config());
  }
}

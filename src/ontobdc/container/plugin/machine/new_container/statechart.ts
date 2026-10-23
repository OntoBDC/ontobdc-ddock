import source from './standard_new_container.yaml?raw';
import { convertStatechart, stateSequence, type StatechartConfig } from '@/ontobdc/shared/adapter/statechart-converter';

/** Provides the statechart definition independently of machine execution. */
export class NewContainerStatechart {
  static config(): StatechartConfig {
    return convertStatechart(source);
  }

  static sequence(): string[] {
    return stateSequence(NewContainerStatechart.config());
  }
}

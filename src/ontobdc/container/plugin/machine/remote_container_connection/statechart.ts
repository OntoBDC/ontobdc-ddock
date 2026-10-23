import source from './standard_remote_container_connection.yaml?raw';
import { convertStatechart, stateSequence, type StatechartConfig } from '@/ontobdc/shared/adapter/statechart-converter';

/** Provides the statechart definition independently of machine execution. */
export class RemoteContainerConnectionStatechart {
  static config(): StatechartConfig {
    return convertStatechart(source);
  }

  static sequence(): string[] {
    return stateSequence(RemoteContainerConnectionStatechart.config());
  }
}

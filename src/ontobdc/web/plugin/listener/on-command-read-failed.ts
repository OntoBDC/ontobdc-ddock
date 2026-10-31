import { notify } from '@/ontobdc/shared/adapter/notice';
import type { AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { translate } from '@/ontobdc/shared/plugin/i18n';

/** What the runtime says when a file it was told is there cannot be read: only `--refresh` reads the files on disk. */
const READ_FAILED = /Errno 5\b|Input\/output error/;

type Payload = { code?: number; stderr?: string };

export class OnCommandReadFailed {
  static readonly METADATA: ListenerMetadata = {
    id: 'web_on_command_read_failed',
    logical_component: 'web',
    description: 'Tells the person, in a notice, that a command failed because it needed the content of a file that has not been read from disk, and that reading the folder again fixes it.',
    arguments: [{
      listen: ['presentation.python.command.completed'],
      valued: false,
      description: 'A command that finished; one that failed on reading a file is the one that is reported.',
      type: 'str',
    }],
  };

  constructor(private readonly event: AppEvent<Payload>) {}

  run(): void {
    const { code, stderr } = this.event.payload ?? {};
    if (!code || !stderr || !READ_FAILED.test(stderr)) return;
    notify(translate('notice.command.read.failed'), 'error');
  }
}

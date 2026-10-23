import type { AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { notify } from '@/ontobdc/shared/adapter/notice';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { translate, type MessageKey } from '@/ontobdc/shared/plugin/i18n';

const FAILURES: Record<string, MessageKey> = {
  'presentation.annotations.item.delete.failed': 'notice.annotations.delete.failed',
  'presentation.annotations.group.export.failed': 'notice.annotations.export.failed',
};

export class OnAnnotationsFailureReported {
  static readonly METADATA: ListenerMetadata = {
    id: 'annotations_on_failure_reported',
    logical_component: 'annotations',
    description: 'Tells the person, in a notice, that deleting or exporting annotations failed.',
    arguments: [{
      listen: Object.keys(FAILURES),
      valued: false,
      description: 'A failure of an action of the person on the annotations.',
      type: 'str',
    }],
  };

  constructor(private readonly event: AppEvent<{ message?: string }>) {}

  /** Shows the reason of the failure the event reports. */
  run(): void {
    const key = FAILURES[this.event.type];
    if (!key) return;
    notify(translate(key, { message: this.event.payload?.message ?? '' }), 'error');
  }
}

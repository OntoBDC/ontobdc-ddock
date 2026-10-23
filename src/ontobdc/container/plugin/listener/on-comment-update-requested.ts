import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { failureMessage, quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { publishThread } from '@/ontobdc/container/plugin/listener/on-comment-list-requested';

const UPDATE_REQUESTED = 'presentation.comment.update.requested';
const SOURCE = 'container_on_comment_update_requested';

type UpdateRequested = AppEventMap[typeof UPDATE_REQUESTED];

export class OnCommentUpdateRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Changes the text or the author of a comment of the thread of an entity, and reads the thread again.',
    arguments: [
      {
        listen: [UPDATE_REQUESTED],
        valued: true,
        parameter: 'id',
        description: 'Global id of the entity whose thread has the comment.',
        type: 'str',
      },
      {
        listen: [UPDATE_REQUESTED],
        valued: true,
        parameter: 'commentId',
        description: 'Global id of the comment to change.',
        type: 'str',
      },
    ],
  };

  private readonly request: UpdateRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as UpdateRequested | undefined;
  }

  /**
   * Runs `ontobdc comment --update <comment> [--text <text>] [--author <name>]`. The command line has no
   * line breaks, so those of the text become spaces.
   */
  async run(): Promise<void> {
    const { id, commentId, author } = this.request ?? {};
    const text = this.request?.text?.replace(/\s*[\r\n]+\s*/g, ' ').trim();
    if (!id || !commentId) throw new Error('The request to change a comment carries no entity id or comment id.');
    if (!text && !author) throw new Error('The request to change a comment carries nothing to change.');

    try {
      await requestCommand(
        `ontobdc comment --update ${quoted(commentId)}`
          + (text ? ` --text ${quoted(text)}` : '')
          + (author ? ` --author ${quoted(author)}` : ''),
        SOURCE,
      );
      await publishThread(id, SOURCE);
    } catch (error) {
      eventBus.publish('presentation.comment.failed', SOURCE, { id, message: failureMessage(error) });
    }
  }
}

import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { publishThread } from '@/ontobdc/container/plugin/listener/on-comment-list-requested';

const DELETE_REQUESTED = 'presentation.comment.delete.requested';
const SOURCE = 'container_on_comment_delete_requested';

type DeleteRequested = AppEventMap[typeof DELETE_REQUESTED];

export class OnCommentDeleteRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Deletes a comment of the thread of an entity, and reads the thread again.',
    arguments: [
      {
        listen: [DELETE_REQUESTED],
        valued: true,
        parameter: 'id',
        description: 'Global id of the entity whose thread has the comment.',
        type: 'str',
      },
      {
        listen: [DELETE_REQUESTED],
        valued: true,
        parameter: 'commentId',
        description: 'Global id of the comment to delete.',
        type: 'str',
      },
    ],
  };

  private readonly request: DeleteRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as DeleteRequested | undefined;
  }

  async run(): Promise<void> {
    const { id, commentId } = this.request ?? {};
    if (!id || !commentId) throw new Error('The request to delete a comment carries no entity id or comment id.');

    try {
      await requestCommand(`ontobdc comment --delete ${quoted(commentId)}`, SOURCE);
      await publishThread(id, SOURCE);
    } catch (error) {
      eventBus.publish('presentation.comment.failed', SOURCE, { id, message: error instanceof Error ? error.message : String(error) });
    }
  }
}

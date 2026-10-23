import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { commentsOf } from '@/ontobdc/shared/adapter/comment-format';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';

const LIST_REQUESTED = 'presentation.comment.list.requested';
const SOURCE = 'container_on_comment_list_requested';

type ListRequested = AppEventMap[typeof LIST_REQUESTED];

/** Reads the thread of an entity and publishes it, or why it could not. Shared by what changes the thread. */
export async function publishThread(id: string, source: string): Promise<void> {
  const result = await requestCommand(`ontobdc comment --guid ${quoted(id)} --list`, source);
  const comments = commentsOf(result.stdout);
  if (!comments) throw new Error('The command did not answer with the comments.');
  eventBus.publish('presentation.comment.listed', source, { id, comments });
}

export class OnCommentListRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Reads the thread of comments of an entity.',
    arguments: [
      {
        listen: [LIST_REQUESTED],
        valued: true,
        parameter: 'id',
        description: 'Global id of the entity whose thread is read.',
        type: 'str',
      },
    ],
  };

  private readonly request: ListRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as ListRequested | undefined;
  }

  async run(): Promise<void> {
    const id = this.request?.id;
    if (!id) throw new Error('The request for a thread carries no entity id.');

    try {
      await publishThread(id, SOURCE);
    } catch (error) {
      eventBus.publish('presentation.comment.failed', SOURCE, { id, message: error instanceof Error ? error.message : String(error) });
    }
  }
}

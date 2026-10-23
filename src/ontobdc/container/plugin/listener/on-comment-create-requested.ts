import { eventBus, type AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import { quoted, requestCommand } from '@/ontobdc/shared/adapter/command-request';
import { Session } from '@/ontobdc/shared/adapter/session';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { publishThread } from '@/ontobdc/container/plugin/listener/on-comment-list-requested';

const CREATE_REQUESTED = 'presentation.comment.create.requested';
const SOURCE = 'container_on_comment_create_requested';

type CreateRequested = AppEventMap[typeof CREATE_REQUESTED];

export class OnCommentCreateRequested {
  static readonly METADATA: ListenerMetadata = {
    id: SOURCE,
    logical_component: 'container',
    description: 'Comments on an entity, and reads its thread again.',
    arguments: [
      {
        listen: [CREATE_REQUESTED],
        valued: true,
        parameter: 'id',
        description: 'Global id of the entity to comment on.',
        type: 'str',
      },
      {
        listen: [CREATE_REQUESTED],
        valued: true,
        parameter: 'text',
        description: 'The text of the comment.',
        type: 'str',
      },
      {
        listen: [CREATE_REQUESTED],
        valued: true,
        parameter: 'replyTo',
        description: 'Global id of the comment this one answers. Optional.',
        type: 'str',
      },
    ],
  };

  private readonly request: CreateRequested | undefined;

  constructor(event: AppEvent) {
    this.request = event.payload as CreateRequested | undefined;
  }

  /**
   * Runs `ontobdc comment --guid <id> --create <text>`, with the author the person wrote, else the name of the person logged in,
   * when there is one. The command line has no line breaks, so those of the text become spaces.
   */
  async run(): Promise<void> {
    const { id, replyTo } = this.request ?? {};
    const text = this.request?.text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
    if (!id || !text) throw new Error('The request to comment carries no entity id or text.');

    try {
      const author = this.request?.author?.replace(/\s+/g, ' ').trim() || Session.getInstance().userName();
      await requestCommand(
        `ontobdc comment --guid ${quoted(id)} --create ${quoted(text)}`
          + (replyTo ? ` --reply-to ${quoted(replyTo)}` : '')
          + (author ? ` --author ${quoted(author)}` : ''),
        SOURCE,
      );
      await publishThread(id, SOURCE);
    } catch (error) {
      eventBus.publish('presentation.comment.failed', SOURCE, { id, message: error instanceof Error ? error.message : String(error) });
    }
  }
}

import { mountCommentThread, type CommentThreadView } from '@/ontobdc/shared/adapter/comment-thread';
import { keepApplied, panelAndFacade } from '@/ontobdc/shared/adapter/facade-labels';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

/** Per entity panel: what stops the thread from being kept, replaced when the tab is set up again. */
const watching = new WeakMap<HTMLElement, () => void>();
/** Per entity panel: what takes the Comment button and the thread back to how the tab drew them. */
const enabled = new WeakMap<HTMLElement, () => void>();

/**
 * An instance of an entity can be commented on when its facade says so (`isCommentable`); a facade
 * that does not say so forbids it. When it can, the tab gets the thread of comments of the entity at
 * its end, and its Comment button is enabled: pressing it opens the box to write a comment. The thread
 * is drawn again when the tab draws its fields again.
 */
export class EntityCommentsResolvedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.web.plugin.capability.transformation.target.entity_comments_resolved',
    description: 'Show the thread of comments in the entity tab and enable the Comment button when the facade says its instances can be commented on.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const { panel, facade } = panelAndFacade(context);
    const id = context.parameters.id as string;
    const button = panel.querySelector<HTMLButtonElement>('button[data-action="comment"]');
    if (!button) throw new Error(`The entity panel of ${id} has no Comment button.`);

    watching.get(panel)?.();
    enabled.get(panel)?.();
    const commentable = facade.commentable === true;
    if (commentable) {
      let view: CommentThreadView | undefined;
      await keepApplied(panel, watching, () => {
        view?.dispose();
        view = mountCommentThread(panel, id);
      });
      const toggle = (): void => view?.toggleComposer();
      button.disabled = false;
      button.addEventListener('click', toggle);
      enabled.set(panel, () => {
        button.removeEventListener('click', toggle);
        button.disabled = true;
        view?.dispose();
      });
    }

    context.etl.write('set_up_entity_facade', context.requestId, context.state, {
      phase: 'done',
      entity: { id, panelId: context.parameters.panelId },
      result: { commentable },
    });
  }
}

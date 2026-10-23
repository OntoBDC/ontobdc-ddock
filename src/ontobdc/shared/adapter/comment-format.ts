import type { EntityComment } from '@/ontobdc/shared/domain/model/comment';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * The comments `ontobdc comment --guid <id> --list` answers, in the order the CLI gives them.
 * Returns null when the response is not that answer; a comment without an id is skipped.
 */
export function commentsOf(response: unknown): EntityComment[] | null {
  const comments = isRecord(response) && isRecord(response.content) ? response.content.comments : undefined;
  if (!Array.isArray(comments)) return null;

  return comments.flatMap((comment): EntityComment[] => {
    if (!isRecord(comment) || !text(comment.global_id)) return [];
    return [{
      id: text(comment.global_id),
      text: text(comment.text),
      author: text(comment.author).trim(),
      createdAt: text(comment.created_at),
      replyOf: text(comment.reply_of),
    }];
  });
}

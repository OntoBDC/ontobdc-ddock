/** One comment of the thread of an entity, as `ontobdc comment --guid <id> --list` tells it. */
export type EntityComment = {
  id: string;
  text: string;
  /** Who said it; empty when the comment has no author. */
  author: string;
  /** When it was said, as a date and time. */
  createdAt: string;
  /** The id of the comment of the thread this one answers; empty for one that opens the discussion. */
  replyOf: string;
};

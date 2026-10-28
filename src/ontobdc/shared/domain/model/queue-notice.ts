/** What an addon's `plugin/queue` module exports to have the person told when a command of it waits in the queue. */
export type QueueNotice = {
  /** The commands, as one line of text, that take long enough to be told about: the others are quick and need no notice. */
  noticed: RegExp[];
};

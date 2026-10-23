import { confirmDialog } from '@/ontobdc/shared/adapter/confirm-dialog';
import { listSkeleton, watchCommand } from '@/ontobdc/shared/adapter/command-pending';
import { quoted } from '@/ontobdc/shared/adapter/command-request';
import { Session } from '@/ontobdc/shared/adapter/session';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import type { EntityComment } from '@/ontobdc/shared/domain/model/comment';
import { getLocale, onLocaleChange, translate } from '@/ontobdc/shared/plugin/i18n';

const PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/></svg>';
const REPLY = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5 2.5 7l4 3.5"/><path d="M2.5 7h6a5 5 0 0 1 5 5v.5"/></svg>';
const TRASH = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/><path d="M6.5 6.5v5M9.5 6.5v5"/></svg>';
const PENCIL = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3-7.5 7.5H3v-3z"/><path d="M9 4l3 3"/></svg>';
const SEND = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>';

/** The threads read so far, by entity id: what a tab draws again from, when it only redraws. */
const threads = new Map<string, EntityComment[]>();
let listening = false;

/** Listens, once, to the threads read and to the tabs that close, so a closed tab's thread is read again when it opens. */
function listen(): void {
  if (listening) return;
  listening = true;
  eventBus.subscribe('presentation.comment.listed', ({ payload }) => {
    if (payload) threads.set(payload.id, payload.comments);
  });
  eventBus.subscribe('presentation.main.entity.closed', ({ payload }) => {
    if (payload) threads.delete(payload.id);
  });
}

export type CommentThreadView = {
  /** Opens the box to write a comment on the entity, or closes it. */
  toggleComposer(): void;
  /** Takes the thread off the tab. */
  dispose(): void;
};

const repliesTo = (comments: EntityComment[], parent: string): EntityComment[] =>
  comments.filter((comment) => comment.replyOf === parent);

const when = (createdAt: string): string => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? createdAt : date.toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' });
};

const AUTHOR_KEY = 'comment.author';

/** The author the person wrote last in this browser, else who is logged in; empty when neither. */
function rememberedAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) || Session.getInstance().userName() || '';
  } catch {
    return Session.getInstance().userName() ?? '';
  }
}

const rememberAuthor = (author: string): void => {
  try {
    localStorage.setItem(AUTHOR_KEY, author);
  } catch { /* the author is just not remembered */ }
};

const iconButton = (className: string, icon: string, label: string, text?: string): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon;
  if (text) button.append(Object.assign(document.createElement('span'), { textContent: text }));
  return button;
};

/**
 * The thread of comments of an entity, at the end of its tab: who said each comment (a photo, which
 * is a placeholder for everybody for now, and the name under it), what, and when, with the replies
 * under the comment they answer. Under each comment, after a rule, are Reply and Delete. Anyone
 * can delete any comment: nothing tells who is who. The box to write a comment is opened by the
 * button of the tab (`toggleComposer`). Nothing is changed here: writing, replying and deleting
 * publish `presentation.comment.create.requested` and `presentation.comment.delete.requested`, and the
 * thread is drawn again from `presentation.comment.listed`.
 */
export function mountCommentThread(panel: HTMLElement, entityId: string): CommentThreadView {
  listen();

  const section = document.createElement('section');
  section.className = 'entity-comments';
  panel.append(section);

  let composing = false;
  /** The thread could not be read: what is not known is shown as empty. */
  let failed = false;
  /** A comment is being written or deleted (`saving`), or the thread is being read again (`reading`): the tab says so meanwhile. */
  let saving = false;
  let reading = false;
  let deleting = false;
  /** The comment being edited, and what was typed in it and not sent, by `author` and `text`. */
  let editing: string | null = null;
  const edits = new Map<string, { author: string; text: string }>();
  let replying: string | null = null;
  /** What was typed and not sent, by where it is being typed (`''` for the box of the entity). */
  const drafts = new Map<string, string>();
  /** The author being typed and not sent, by where it is being typed. */
  const authors = new Map<string, string>();

  const composer = (replyTo: string | null): HTMLFormElement => {
    const key = replyTo ?? '';
    const form = document.createElement('form');
    form.className = 'comment-composer';
    const input = document.createElement('textarea');
    input.rows = 3;
    input.value = drafts.get(key) ?? '';
    input.placeholder = translate(replyTo ? 'comment.replyPlaceholder' : 'comment.placeholder');
    input.setAttribute('aria-label', input.placeholder);
    const author = document.createElement('input');
    author.type = 'text';
    author.className = 'comment-author';
    author.value = authors.get(key) ?? rememberedAuthor();
    author.placeholder = translate('comment.authorPlaceholder');
    author.setAttribute('aria-label', translate('comment.author'));
    author.addEventListener('input', () => authors.set(key, author.value));
    const actions = document.createElement('div');
    actions.className = 'comment-composer-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'comment-cancel';
    cancel.textContent = translate('comment.cancel');
    const send = iconButton('comment-send', SEND, translate('comment.send'), translate('comment.send'));
    send.type = 'submit';
    actions.append(cancel, send);
    form.append(author, input, actions);

    input.addEventListener('input', () => drafts.set(key, input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    cancel.addEventListener('click', () => {
      drafts.delete(key);
      authors.delete(key);
      if (replyTo) replying = null; else composing = false;
      draw();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      drafts.delete(key);
      authors.delete(key);
      if (replyTo) replying = null; else composing = false;
      const who = author.value.trim();
      if (who) rememberAuthor(who);
      eventBus.publish('presentation.comment.create.requested', 'comment-thread', {
        id: entityId, text, ...(replyTo ? { replyTo } : {}), ...(who ? { author: who } : {}),
      });
      draw();
    });
    return form;
  };

  /** The form that changes a comment: who says it and what it says, as they are until the person changes them. */
  const editor = (comment: EntityComment): HTMLFormElement => {
    const form = document.createElement('form');
    form.className = 'comment-composer comment-edit-box';
    const draft = edits.get(comment.id) ?? { author: comment.author, text: comment.text };
    const author = document.createElement('input');
    author.type = 'text';
    author.className = 'comment-author';
    author.value = draft.author;
    author.placeholder = translate('comment.authorPlaceholder');
    author.setAttribute('aria-label', translate('comment.author'));
    const input = document.createElement('textarea');
    input.rows = 3;
    input.value = draft.text;
    input.setAttribute('aria-label', translate('comment.edit'));
    const remember = (): void => { edits.set(comment.id, { author: author.value, text: input.value }); };
    author.addEventListener('input', remember);
    input.addEventListener('input', remember);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    const actions = document.createElement('div');
    actions.className = 'comment-composer-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'comment-cancel';
    cancel.textContent = translate('comment.cancel');
    cancel.addEventListener('click', () => {
      edits.delete(comment.id);
      editing = null;
      draw();
    });
    const save = iconButton('comment-send', SEND, translate('comment.save'), translate('comment.save'));
    save.type = 'submit';
    actions.append(cancel, save);
    form.append(author, input, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      const who = author.value.trim();
      if (!text) return;
      edits.delete(comment.id);
      editing = null;
      // Only what changed is asked for: a comment's author cannot be cleared, so an empty one changes nothing.
      const changes = {
        ...(text !== comment.text ? { text } : {}),
        ...(who && who !== comment.author ? { author: who } : {}),
      };
      if (Object.keys(changes).length > 0) {
        if (who) rememberAuthor(who);
        eventBus.publish('presentation.comment.update.requested', 'comment-thread', { id: entityId, commentId: comment.id, ...changes });
      }
      draw();
    });
    return form;
  };

  const article = (comment: EntityComment, all: EntityComment[], depth: number): HTMLElement => {
    const root = document.createElement('article');
    root.className = 'comment-item';
    root.dataset.id = comment.id;

    const who = document.createElement('div');
    who.className = 'comment-who';
    const avatar = document.createElement('span');
    avatar.className = 'comment-avatar';
    avatar.innerHTML = PERSON;
    const name = document.createElement('span');
    name.className = 'comment-name';
    name.textContent = comment.author || translate('comment.unknownUser');
    name.title = name.textContent;
    who.append(avatar, name);

    const body = document.createElement('div');
    body.className = 'comment-body';
    const text = document.createElement('p');
    text.className = 'comment-text';
    text.textContent = comment.text;
    const time = document.createElement('time');
    time.className = 'comment-time';
    time.dateTime = comment.createdAt;
    time.textContent = when(comment.createdAt);
    body.append(text, time);

    const replies = repliesTo(all, comment.id);
    const reply = iconButton('comment-action reply', REPLY, translate('comment.reply'), translate('comment.reply'));
    reply.addEventListener('click', () => {
      replying = replying === comment.id ? null : comment.id;
      draw();
    });
    const edit = iconButton('comment-action edit', PENCIL, translate('comment.edit'), translate('comment.edit'));
    edit.addEventListener('click', () => {
      editing = editing === comment.id ? null : comment.id;
      draw();
    });
    const remove = iconButton('comment-action delete', TRASH, translate('comment.delete'));
    remove.addEventListener('click', () => {
      void (async () => {
        // Its replies go with it: say so before.
        const replied = all.filter((candidate) => candidate.id !== comment.id && isBelow(all, candidate, comment.id)).length;
        if (replied > 0 && !(await confirmDialog({
          title: translate('comment.delete.title'),
          message: translate('comment.delete.message', { count: replied }),
          confirmLabel: translate('comment.delete.confirm'),
          cancelLabel: translate('confirm.cancel'),
        }))) return;
        eventBus.publish('presentation.comment.delete.requested', 'comment-thread', { id: entityId, commentId: comment.id });
      })();
    });
    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    actions.append(reply, edit, remove);

    root.append(who, editing === comment.id ? editor(comment) : body, actions);
    if (replying === comment.id) {
      const box = composer(comment.id);
      box.classList.add('comment-reply-box');
      root.append(box);
    }
    if (replies.length > 0) {
      const nested = document.createElement('div');
      nested.className = 'comment-replies';
      nested.dataset.depth = String(Math.min(depth + 1, 4));
      nested.append(...replies.map((child) => article(child, all, depth + 1)));
      root.append(nested);
    }
    return root;
  };

  const draw = (): void => {
    const comments = threads.get(entityId) ?? [];
    // Until the thread is read, nothing is known: no count and no "no comments", only a skeleton.
    const loading = !threads.has(entityId) && !failed;
    const title = document.createElement('h3');
    title.className = 'entity-comments-title';
    title.textContent = loading ? translate('comment.title') : `${translate('comment.title')} (${comments.length})`;
    if (loading) {
      section.replaceChildren(title, ...(composing ? [composer(null)] : []), listSkeleton(2));
      return;
    }
    const list = document.createElement('div');
    list.className = 'comment-list';
    const known = new Set(comments.map((comment) => comment.id));
    // A comment whose parent is not in the thread (it was deleted from elsewhere) is shown as an opening one.
    const roots = comments.filter((comment) => !comment.replyOf || !known.has(comment.replyOf));
    if (roots.length === 0) {
      const none = document.createElement('p');
      none.className = 'comment-empty';
      none.textContent = translate('comment.empty');
      list.append(none);
    } else {
      list.append(...roots.map((comment) => article(comment, comments, 0)));
    }
    if (saving || deleting) {
      const status = document.createElement('p');
      status.className = 'comment-saving';
      status.setAttribute('role', 'status');
      status.textContent = translate(deleting ? 'comment.deleting' : 'comment.saving');
      list.append(status);
    }
    section.dataset.loading = String(reading && !saving && !deleting);
    section.replaceChildren(title, ...(composing ? [composer(null)] : []), list);
    if (composing && !section.querySelector('textarea:focus')) section.querySelector('textarea')?.focus();
  };

  const ofThread = (command: string): boolean => command.startsWith(`ontobdc comment --guid ${quoted(entityId)} `);
  const unsubscribe = [
    watchCommand(
      (command) => (ofThread(command) && command.includes(' --create '))
        // What changes a comment names the comment, not the entity: it is of this thread when the comment is.
        || (threads.get(entityId) ?? []).some((comment) => command.startsWith(`ontobdc comment --update ${quoted(comment.id)} `)),
      (value) => { saving = value; draw(); },
    ),
    // The command that deletes names the comment, not the entity: it is of this thread when the comment is.
    watchCommand((command) => (threads.get(entityId) ?? []).some((comment) => command === `ontobdc comment --delete ${quoted(comment.id)}`), (value) => { deleting = value; draw(); }),
    watchCommand((command) => ofThread(command) && command.includes(' --list'), (value) => { reading = value; draw(); }),
    eventBus.subscribe('presentation.comment.listed', ({ payload }) => {
      if (payload?.id === entityId) draw();
    }),
    eventBus.subscribe('presentation.comment.failed', ({ payload }) => {
      if (payload?.id !== entityId) return;
      failed = true;
      draw();
    }),
    onLocaleChange(draw),
  ];
  if (!threads.has(entityId)) eventBus.publish('presentation.comment.list.requested', 'comment-thread', { id: entityId });
  draw();

  return {
    toggleComposer: () => {
      composing = !composing;
      draw();
    },
    dispose: () => {
      unsubscribe.forEach((off) => off());
      section.remove();
    },
  };
}

/** Whether `comment` is a reply, however deep, to the comment `ancestor`. */
function isBelow(all: EntityComment[], comment: EntityComment, ancestor: string): boolean {
  const seen = new Set<string>();
  let parent = comment.replyOf;
  while (parent && !seen.has(parent)) {
    if (parent === ancestor) return true;
    seen.add(parent);
    parent = all.find((candidate) => candidate.id === parent)?.replyOf ?? '';
  }
  return false;
}

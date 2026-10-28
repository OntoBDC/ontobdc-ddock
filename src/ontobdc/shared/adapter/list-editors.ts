/** What a list editor lets the listeners do to the items it shows. */
export type ListEditorHandle = {
  element: HTMLElement;
  remove(item: string): void;
  add(item: string): void;
  /** The items are documents of the container. */
  documents?: boolean;
  /** The items it holds now, as the person has them: what is not saved yet included. */
  items?(): string[];
};

const editors = new Map<string, ListEditorHandle>();
const keyOf = (owner: string, field: string): string => `${owner}\u0000${field}`;

/** Registers the list editor of a field of what is being edited; a field has one editor at a time. */
export function registerListEditor(owner: string, field: string, handle: ListEditorHandle): void {
  editors.set(keyOf(owner, field), handle);
}

/** The fields of documents that are being edited in what `owner` is. */
export function documentFieldsOf(owner: string): string[] {
  const prefix = `${owner}\u0000`;
  return [...editors.keys()]
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .filter((field) => findListEditor(owner, field)?.documents === true);
}

/** The list editor of the field, for as long as it is registered: a tab that is not the active one is out of the page, and its editors are still there. */
export function findListEditor(owner: string, field: string): ListEditorHandle | null {
  return editors.get(keyOf(owner, field)) ?? null;
}

/** Forgets the list editors of what was edited, once its editing is over. */
export function forgetListEditors(owner: string): void {
  const prefix = `${owner}\u0000`;
  for (const key of [...editors.keys()]) if (key.startsWith(prefix)) editors.delete(key);
}

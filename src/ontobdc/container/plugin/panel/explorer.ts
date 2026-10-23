import { createActionMenu, runAction, type ActionMenuTable } from '@/ontobdc/shared/adapter/action-menu';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { tagNodesOf } from '@/ontobdc/shared/adapter/entity-tags';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { DELETE_ICON, NEW_ICON, OPEN_ICON, REFRESH_ICON, RELATE_ICON, RENAME_ICON, UPLOAD_ICON } from '@/ontobdc/shared/adapter/menu-icons';
import { createThumbnails, extensionLabel, isImageFile } from '@/ontobdc/shared/adapter/file-thumbnails';
import { createHistoryView } from '@/ontobdc/shared/adapter/history-view';
import type { Mountable } from '@/ontobdc/shared/adapter/view';
import type { ExplorerGroupId } from '@/ontobdc/shared/domain/model/event';
import { DAY_ENTITY_TYPE, todayAsDate } from '@/ontobdc/shared/domain/model/history';
import type { ExplorerNode } from '@/ontobdc/shared/domain/model/explorer-node';
import { applyTranslations, getLocale, onLocaleChange, translate, type MessageKey } from '@/ontobdc/shared/plugin/i18n';

const SOURCE = 'explorer';

/** Four tiles: the files as thumbnails. */
const GRID_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>';

const EXPLORER_GROUPS: Array<{ id: ExplorerGroupId; label: MessageKey }> = [
  { id: 'files', label: 'explorer.group.files' },
  { id: 'tags', label: 'explorer.group.tags' },
  { id: 'history', label: 'explorer.group.history' },
];

/**
 * The actions of an item, in the order its ⋯ menu shows them: one table per
 * group, because a file and an entity do not share the same event.
 */
const ITEM_MENU: Record<ExplorerGroupId, ActionMenuTable> = {
  files: [
    { id: 'open', label: 'explorer.menu.open', icon: OPEN_ICON, event: 'presentation.explorer.file.activated' },
    { id: 'relate', label: 'explorer.menu.relate', icon: RELATE_ICON, event: 'presentation.explorer.file.relate.requested' },
    { id: 'rename', label: 'explorer.menu.rename', icon: RENAME_ICON, shortcut: 'explorer.menu.shortcut.rename', event: 'presentation.explorer.file.rename.requested' },
    { id: 'delete', label: 'explorer.menu.delete', icon: DELETE_ICON, shortcut: 'explorer.menu.shortcut.delete', event: 'presentation.explorer.file.delete.requested' },
  ],
  // An entity under a tag opens as it does in the database: in a tab of its own.
  tags: [
    { id: 'open', label: 'explorer.menu.open', icon: OPEN_ICON, event: 'presentation.database.item.opened' },
  ],
  history: [],
};

/** The actions of a group, in the order its ⋯ menu shows them; a group with none shows no ⋯. */
const GROUP_MENU: Record<ExplorerGroupId, ActionMenuTable> = {
  files: [
    { id: 'upload', label: 'explorer.menu.upload', icon: UPLOAD_ICON, event: 'presentation.explorer.file.upload.requested' },
    { id: 'refresh', label: 'explorer.menu.refresh', icon: REFRESH_ICON, event: 'presentation.container.refresh.requested' },
  ],
  tags: [],
  // The only thing the history makes is a day.
  history: [
    { id: 'new', label: 'database.menu.new', icon: NEW_ICON, event: 'presentation.entity.new.requested' },
  ],
};

/** The actions of a directory, in the order its ⋯ menu shows them: it takes uploads, and can be renamed and deleted. */
const DIRECTORY_MENU: ActionMenuTable = [
  { id: 'upload', label: 'explorer.menu.upload', icon: UPLOAD_ICON, event: 'presentation.explorer.file.upload.requested' },
  { id: 'rename', label: 'explorer.menu.rename', icon: RENAME_ICON, shortcut: 'explorer.menu.shortcut.rename', event: 'presentation.explorer.file.rename.requested' },
  { id: 'delete', label: 'explorer.menu.delete', icon: DELETE_ICON, shortcut: 'explorer.menu.shortcut.delete', event: 'presentation.explorer.file.delete.requested' },
];

/** The actions of a tag, which is a directory of the TAGS group: it opens the tab with the entities that have it. */
const TAG_MENU: ActionMenuTable = [
  { id: 'open', label: 'explorer.menu.open', icon: OPEN_ICON, event: 'presentation.explorer.tag.open.requested' },
];

/** The header of every group opens it and publishes its activation. */
const GROUP_HEADER: ActionMenuTable = [
  { id: 'open', label: 'explorer.menu.open', event: 'presentation.explorer.group.activated' },
];

/**
 * Container explorer. Each group owns an independent tree that starts empty and
 * is (re)populated by its own event carrying `{ nodes }`: FILES by
 * `presentation.container.files.found`, TAGS by the entities of the container (the tags they have, and under each tag the entities that have it), and HISTORY by monthly calendars (the current month, two before and two after, and every month with a day saved in `presentation.container.days.found`), where only the saved days can be clicked.
 * The explorer only displays and reports what the user does: a double click or
 * a menu entry publishes `presentation.explorer.file.activated` for a file, and `presentation.database.item.opened` for an entity,
 * and opening a group publishes `presentation.explorer.group.activated`.
 * What those mean is up to the listeners.
 */
export default function makeExplorer(): Mountable {
  const root = document.createElement('div');
  root.className = 'panel-content tree-panel';

  const heading = document.createElement('div');
  heading.className = 'section-title explorer-title';
  const headingLabel = document.createElement('span');
  headingLabel.dataset.i18n = 'explorer.title';
  heading.appendChild(headingLabel);
  root.appendChild(heading);

  const moreMenu = createActionMenu(SOURCE);
  // F2 renames and Delete deletes what is selected among the files, as the menu says.
  root.tabIndex = -1;
  root.addEventListener('keydown', (event) => {
    const path = selectedRow?.dataset.path;
    if (!path || !selectedRow?.closest('.tree-group-body') || groupBodies.get('files')?.contains(selectedRow) !== true) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'F2') eventBus.publish('presentation.explorer.file.rename.requested', SOURCE, { item: path });
    else if (event.key === 'Delete') eventBus.publish('presentation.explorer.file.delete.requested', SOURCE, { item: path });
    else return;
    event.preventDefault();
  });
  let selectedRow: HTMLLIElement | null = null;

  let activated = false;
  const setInactive = (inactive: boolean): void => {
    root.classList.toggle('inactive', inactive);
    root.setAttribute('aria-disabled', inactive ? 'true' : 'false');
    root.inert = inactive;
  };
  const activate = (): void => {
    if (activated) return;
    activated = true;
    setInactive(false);
  };
  setInactive(true);

  /** Whether the files are shown as thumbnails instead of a list. */
  let thumbs = false;
  /** The files as the last `files.found` gave them, to draw them again when the view changes. */
  let filesNodes: ExplorerNode[] = [];
  const thumbnails = createThumbnails();

  const openActionsMenu = (anchor: HTMLButtonElement, group: ExplorerGroupId, node: ExplorerNode, item: string, isDirectory: boolean): void => {
    if (isDirectory && group === 'tags') moreMenu.show(anchor, TAG_MENU, { tag: node.name });
    else if (isDirectory) moreMenu.show(anchor, DIRECTORY_MENU, { path: item, item });
    else moreMenu.show(anchor, ITEM_MENU[group], node.entity ?? { item });
  };

  const select = (row: HTMLLIElement): void => {
    if (selectedRow && selectedRow !== row) selectedRow.classList.remove('selected');
    row.classList.add('selected');
    selectedRow = row;
  };

  const renderNodes = (
    nodes: ExplorerNode[],
    group: ExplorerGroupId,
    parentPath: string,
    depth: number,
  ): HTMLUListElement => {
    const list = document.createElement('ul');
    list.className = depth === 0 ? 'tree' : 'tree tree-children';
    list.setAttribute('role', depth === 0 ? 'tree' : 'group');
    const asThumbs = group === 'files' && thumbs;
    if (asThumbs) list.classList.add('thumbs');

    for (const node of nodes) {
      const path = parentPath ? `${parentPath}/${node.name}` : node.name;
      const isDirectory = node.children !== undefined;

      const item = document.createElement('li');
      item.className = isDirectory ? 'tree-node dir' : 'tree-node file';
      item.dataset.path = path;
      item.setAttribute('role', 'treeitem');
      if (isDirectory) item.setAttribute('aria-expanded', 'false');

      const row = document.createElement('div');
      row.className = 'tree-row';
      row.style.setProperty('--depth', String(depth));

      const button = document.createElement('button');
      button.type = 'button';
      button.className = isDirectory ? 'tree-item dir' : 'tree-item';
      if (asThumbs && !isDirectory) {
        // A tile: the image when the file is one, else its extension, and the name under it.
        button.classList.add('thumb');
        const picture = document.createElement('span');
        picture.className = 'thumb-image';
        const name = document.createElement('span');
        name.className = 'thumb-name';
        name.textContent = node.name;
        if (isImageFile(path)) thumbnails.show(path, picture);
        else picture.textContent = extensionLabel(path);
        button.append(picture, name);
        button.title = node.name;
      } else {
        button.textContent = node.name;
      }

      const more = document.createElement('button');
      more.className = 'tree-more';
      more.type = 'button';
      more.dataset.item = path;
      more.setAttribute('aria-label', translate('explorer.moreActions', { item: path }));
      more.textContent = '⋯';

      const children = isDirectory ? renderNodes(node.children ?? [], group, path, depth + 1) : null;
      if (children) children.hidden = true;

      button.addEventListener('click', () => {
        if (children) {
          children.hidden = !children.hidden;
          item.setAttribute('aria-expanded', String(!children.hidden));
        }
        select(item);
        moreMenu.close();
      });

      // A tag opens with a double click, as an entity does.
      if (isDirectory && group === 'tags') {
        button.addEventListener('dblclick', () => {
          select(item);
          runAction(SOURCE, TAG_MENU, 'open', { tag: node.name });
        });
      }

      if (!isDirectory && ITEM_MENU[group].length > 0) {
        button.addEventListener('dblclick', () => {
          select(item);
          runAction(SOURCE, ITEM_MENU[group], 'open', node.entity ?? { item: path });
        });
      }

      more.addEventListener('click', (event) => {
        event.stopPropagation();
        if (moreMenu.isOpen()) { moreMenu.close(); return; }
        openActionsMenu(more, group, node, path, isDirectory);
      });

      // Only a directory of the files takes uploads, and only an item with actions has a menu.
      const hasMenu = isDirectory ? group === 'files' || group === 'tags' : ITEM_MENU[group].length > 0;
      row.append(...(hasMenu ? [button, more] : [button]));
      item.appendChild(row);
      if (children) item.appendChild(children);
      list.appendChild(item);
    }
    return list;
  };

  const groupBodies = new Map<ExplorerGroupId, HTMLDivElement>();

  const renderGroup = (group: ExplorerGroupId, nodes: ExplorerNode[]): void => {
    const body = groupBodies.get(group);
    if (!body) return;
    if (selectedRow && body.contains(selectedRow)) selectedRow = null;
    moreMenu.close();
    if (group === 'files') filesNodes = nodes;
    if (nodes.length === 0) {
      const key: MessageKey = group === 'tags' ? 'explorer.tags.empty' : 'explorer.empty';
      const empty = document.createElement('p');
      empty.className = 'tree-empty';
      empty.dataset.i18n = key;
      empty.textContent = translate(key);
      body.replaceChildren(empty);
    } else {
      body.replaceChildren(renderNodes(nodes, group, '', 0));
    }
  };

  const historyView = createHistoryView(SOURCE);

  // One group open at a time.
  const sections = new Map<ExplorerGroupId, HTMLDetailsElement>();
  EXPLORER_GROUPS.forEach((group, index) => {
    const section = document.createElement('details');
    section.open = index === 0;
    const summary = document.createElement('summary');
    const label = document.createElement('span');
    label.className = 'tree-group-label';
    label.dataset.i18n = group.label;
    summary.appendChild(label);

    // The files can be shown as a list or as thumbnails: the button is green while they are thumbnails.
    if (group.id === 'files') {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'tree-group-view';
      view.innerHTML = GRID_ICON;
      const refreshView = (): void => {
        view.dataset.active = String(thumbs);
        view.setAttribute('aria-pressed', String(thumbs));
        view.title = translate(thumbs ? 'explorer.files.asList' : 'explorer.files.asThumbs');
        view.setAttribute('aria-label', view.title);
      };
      refreshView();
      view.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        thumbs = !thumbs;
        refreshView();
        renderGroup('files', filesNodes);
      });
      summary.appendChild(view);
    }

    const menu = GROUP_MENU[group.id];
    if (menu.length > 0) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'tree-group-more';
      more.dataset.group = group.id;
      more.setAttribute('aria-label', translate('explorer.files.actions'));
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        if (moreMenu.isOpen()) { moreMenu.close(); return; }
        moreMenu.show(more, menu, group.id === 'history' ? { entityType: DAY_ENTITY_TYPE, values: { date: todayAsDate() } } : { path: '' });
      });
      summary.appendChild(more);
    }
    section.appendChild(summary);

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      if (section.open) return;
      for (const other of sections.values()) other.open = false;
      section.open = true;
      runAction(SOURCE, GROUP_HEADER, 'open', { group: group.id });
    });

    const body = document.createElement('div');
    body.className = 'tree-group-body';
    section.appendChild(body);
    root.appendChild(section);
    groupBodies.set(group.id, body);
    sections.set(group.id, section);
    if (group.id === 'history') body.appendChild(historyView.element);
    else renderGroup(group.id, []);
  });

  applyTranslations(root);

  const nodesOf = (payload: { nodes?: ExplorerNode[] } | undefined): ExplorerNode[] =>
    Array.isArray(payload?.nodes) ? payload.nodes : [];

  const repository = EntityRepository.getInstance();
  const renderTags = (): void => renderGroup('tags', tagNodesOf(repository.all()));
  renderTags();

  const unsubscribers = [
    eventBus.subscribe('presentation.container.local.opened', activate),
    eventBus.subscribe('presentation.container.remote.opened', activate),
    eventBus.subscribe('presentation.container.state.reported', ({ payload }) => {
      if (payload?.container) activate();
    }),
    eventBus.subscribe('presentation.container.files.found', (event) => renderGroup('files', nodesOf(event.payload))),
    // The tags come from the entities the container holds: they are drawn again whenever those are read.
    eventBus.subscribe('presentation.container.entities.found', renderTags),
    eventBus.subscribe('presentation.container.entity.found', renderTags),
    // Translate in place so populated trees and the selection survive a locale switch.
    onLocaleChange(() => {
      applyTranslations(root);
      root.querySelectorAll<HTMLButtonElement>('.tree-more').forEach((button) => {
        button.setAttribute('aria-label', translate('explorer.moreActions', { item: button.dataset.item ?? '' }));
      });
    }),
  ];

  // A container may already be open by the time the panel mounts; ask for the
  // current state so the panel does not stay locked forever.
  eventBus.publish('presentation.container.state.requested', SOURCE);

  return {
    element: root,
    dispose: () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      thumbnails.dispose();
      historyView.dispose();
      moreMenu.close();
      root.remove();
    },
  };
}

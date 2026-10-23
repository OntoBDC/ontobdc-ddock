import type {
  PythonCommandRequest,
  PythonCommandResult,
  PythonFeatureMessageRequest,
  PythonPackageVersionsRequest,
  PythonPackageVersionsResult,
  PythonFeatureMessageResult,
} from '@/ontobdc/shared/domain/model/python-command';
import type { CommandExecutionResult } from '@/ontobdc/shared/domain/model/command-execution';
import type { CommandQueueSnapshot } from '@/ontobdc/shared/domain/model/command-queue';
import type { EntityComment } from '@/ontobdc/shared/domain/model/comment';
import type { EntityGroup } from '@/ontobdc/shared/domain/model/entity';
import type { DayEntry } from '@/ontobdc/shared/domain/model/history';
import type { RemoteContainerEntry } from '@/ontobdc/shared/domain/model/remote-container';
import type { ContainerOpened } from '@/ontobdc/shared/domain/model/container';

/**
 * 
 */
import type { ExplorerNode } from '@/ontobdc/shared/domain/model/explorer-node';
import type { PanelClosedPayload, PanelResizePayload } from '@/ontobdc/shared/domain/model/panel-event';

/**
 * Event names and the data each event carries.
 * These declarations only help TypeScript check the code. They do not store,
 * publish, or subscribe to events, and they do not validate data at runtime.
 */

/** The groups of the explorer. */
export type ExplorerGroupId = 'files' | 'tags' | 'history';

/**
 * An entry of the menu of an item was chosen.
 */
export type ExplorerMenuAction = { group: ExplorerGroupId; action: string; item: string };

/** The events of the explorer. */
type ExplorerEvents = {
  /** A file was double-clicked, or opened from its menu; item contains its path in the container. */
  'presentation.explorer.file.activated': { item: string };
  /** An entry of the menu of an item of any group was chosen. */
  'presentation.explorer.activated': ExplorerMenuAction;
  /** The days saved in the container were (re)found; the HISTORY calendars highlight them. */
  'presentation.container.days.found': { days: DayEntry[] };
  /** The user opened a group (FILES, TAGS or HISTORY) of the explorer. */
  'presentation.explorer.group.activated': { group: ExplorerGroupId };
  /** The person asked to open a tag of the explorer: the tab with the entities that have it, grouped by kind. */
  'presentation.explorer.tag.open.requested': { tag: string };
  /** The person asked to rename a file of the container; item is its path in the container. */
  'presentation.explorer.file.rename.requested': { item: string };
  /** The person asked to delete a file of the container; item is its path in the container. Nothing is deleted before they confirm. */
  'presentation.explorer.file.delete.requested': { item: string };
  /** A file could not be renamed or deleted; it stays as it was. */
  /** The person asked to relate a file to the entity of the active tab; item is the path of the file. */
  'presentation.explorer.file.relate.requested': { item: string };
  'presentation.explorer.file.relate.failed': { item: string; message: string };
  'presentation.explorer.file.rename.failed': { item: string; message: string };
  'presentation.explorer.file.delete.failed': { item: string; message: string };
  /** The user chose to upload files; path is where they go, in the container: a directory, or "" for the root of the container. */
  'presentation.explorer.file.upload.requested': { path: string };
  /** The user picked files on their computer to upload to path (as in the request); nothing was sent yet. */
  'presentation.explorer.file.upload.selected': { path: string; files: File[] };
  /** The picked files were written into path of the container; skipped are the names that already existed there and were left as they were. */
  'presentation.explorer.file.uploaded': { path: string; files: string[]; skipped: string[] };
  /** The picked files could not be written into path of the container. */
  'presentation.explorer.file.upload.failed': { path: string; message: string };
  /** The FILES group's tree was (re)found; replaces its nodes. */
  'presentation.container.files.found': { nodes: ExplorerNode[] };
};

/**
 * Combines explorer events with panel resize and theme change events.
 * Each property is an allowed event name; its value is the required data type.
 * For example, AppEventMap['presentation.container.files.found'] is { nodes: ExplorerNode[] }.
 * Despite its name, this is a type declaration, not a Map object or repository.
 */
export interface AppEventMap extends ExplorerEvents, CoreEvents {}

type CoreEvents = {
  /** The shell HTML and header controls are mounted; Dockview panels may not be ready yet. */
  'presentation.main.layout.loaded': undefined;

  /** The active translation locale changed. */
  'presentation.main.locale.changed': { locale: string };

  /** Home requests a container operation; container adapters handle the request. */
  'presentation.container.open.requested': undefined;
  'presentation.container.new.requested': { name: string };
  /** The person asks for the containers of the server. */
  'presentation.container.remote.list.requested': undefined;
  /** The server listed its containers. */
  'presentation.container.remote.list.succeeded': { containers: RemoteContainerEntry[] };
  /** The containers of the server could not be listed. */
  'presentation.container.remote.list.failed': { message: string };
  /** The thread of an entity is asked for; the id is the entity's. */
  'presentation.comment.list.requested': { id: string };
  /** The thread of an entity, as it is now. */
  'presentation.comment.listed': { id: string; comments: EntityComment[] };
  /** The person comments on an entity, maybe in reply to a comment of its thread. */
  'presentation.comment.create.requested': { id: string; text: string; replyTo?: string; author?: string };
  /** The person deletes a comment of the thread of an entity, and the replies to it. */
  /** The person changed a comment of the thread of an entity: its text, its author, or both; what is not given stays. */
  'presentation.comment.update.requested': { id: string; commentId: string; text?: string; author?: string };
  'presentation.comment.delete.requested': { id: string; commentId: string };
  /** The thread of an entity could not be read or changed; the tab keeps what it showed. */
  'presentation.comment.failed': { id: string; message: string };
  /** The person asks to log in. */
  'presentation.user.login.requested': undefined;
  /** The login page sent the application the state and the authorization code; neither goes in the payload. */
  'presentation.user.state_code.received': undefined;
  /** The application starts to get the access token. */
  'presentation.user.token.requested': undefined;
  /** The application holds the access token; it is not in the payload. */
  'presentation.user.token.received': undefined;
  /** The person is logged in: their profile and the data of the session. The access token is not in it. */
  'presentation.user.login.succeeded': {
    profile: Record<string, unknown>;
    session: { tokenType?: string; expiresIn?: number; scope?: string };
  };
  /** The login did not finish: the person closed its tab (`cancelled`), or something failed, and `message` says what. Nobody is logged in. */
  'presentation.user.login.failed': { message: string; cancelled: boolean };
  /** The person chose a container the server lists, by its URI. */
  'presentation.container.connect.requested': { container: string };
  /** The server answered the inspection of the container the person chose. */
  'presentation.container.remote.inspect.succeeded': { container: string; answer: unknown };
  /** The inspection of the container the person chose could not be done. */
  'presentation.container.remote.inspect.failed': { container: string; message: string };
  /** Container adapters report operation progress and results to panels. */
  'presentation.container.create.started': { name: string };
  'presentation.container.create.failed': { message: string };
  'presentation.container.inspect.started': { name: string };
  /** A container on local disk was opened or created. */
  'presentation.container.local.opened': ContainerOpened;
  /** A container hosted at a remote URL was opened. */
  'presentation.container.remote.opened': ContainerOpened;
  'presentation.container.create.cancelled': undefined;
  'presentation.container.open.cancelled': undefined;
  /** Request and report the last successfully opened container without a getter. */
  'presentation.container.state.requested': undefined;
  'presentation.container.state.reported': { container: ContainerOpened | null };
  'presentation.container.open.failed': {
    reason: 'unsupported' | 'permission-denied' | 'crate-not-found' | 'crate-invalid'
      | 'location-not-found' | 'inspect-failed' | 'read-error';
    name: string | null;
    message?: string;
  };

  /** Something failed but the application keeps running; the message says what. */
  'presentation.exception.listener.raised': { message: string };

  /** The Python worker is loading the runtime and its local packages. */
  'presentation.python.loading': undefined;
  /** Runtime and packages are ready; includes the installed OntoBDC version. */
  'presentation.python.ready': { ontobdcVersion: string };
  /** Python initialization failed; ready remains false. */
  'presentation.python.failed': { message: string };
  /** The runtime worker has been terminated. */
  'presentation.python.disconnected': undefined;
  /** Query readiness through the bus, including after a panel is remounted. */
  'presentation.python.state.requested': undefined;
  'presentation.python.state.reported': { ready: boolean };
  /** Correlated CLI requests and replies; callers never import the runtime adapter. */
  'presentation.python.command.requested': PythonCommandRequest;
  'presentation.python.command.completed': PythonCommandResult;
  'presentation.python.command.failed': { requestId: string; message: string };
  /** Correlated feature-message lookups; no container mount involved. */
  'presentation.brasidatacenter.message.requested': PythonFeatureMessageRequest;
  'presentation.brasidatacenter.message.completed': PythonFeatureMessageResult;
  'presentation.brasidatacenter.message.failed': { requestId: string; message: string };
  /** Ask the runtime which versions of these packages are installed in it. */
  'presentation.python.packages.requested': PythonPackageVersionsRequest;
  'presentation.python.packages.completed': PythonPackageVersionsResult;
  'presentation.python.packages.failed': { requestId: string; message: string };
  /** The folder of the container may have changed on disk by other means than a command: at `paths` (relative to the folder), or anywhere when there are none. The runtime reads what differs before its next command. */
  'presentation.python.mount.invalidated': { paths?: string[] };
  /** Ask for the queue of the runtime as it is now, including after a panel is remounted; the answer is queue.changed. */
  'presentation.python.queue.requested': undefined;
  /** The queue of commands that share the runtime changed: what runs, what waits, what is over. */
  'presentation.python.queue.changed': CommandQueueSnapshot;

  /** A panel resize interaction began, carrying the panel resize data. */
  'presentation.main.panel.resize.started': PanelResizePayload;
  /** A panel resize interaction progressed, carrying the updated resize data. */
  'presentation.main.panel.resize.changed': PanelResizePayload;
  /** A panel resize interaction finished, carrying the final resize data. */
  'presentation.main.panel.resize.ended': PanelResizePayload;

  /** A tab was removed by Dockview, through the UI or its panel removal API. */
  'presentation.main.panel.closed': PanelClosedPayload;
  /** The active tab of a container changed; `id` is null when no tab is left, `kind` says what the tab shows and `entityId` is the global id of the entity of an entity tab. */
  'presentation.main.panel.activated': { container: string; id: string | null; kind: 'entity' | 'entity-new' | 'table' | 'tag' | 'other'; entityId?: string };
  /** Ask a container to mount a registered panel; existing ids are reused. */
  'presentation.main.panel.open.requested': {
    container: string;
    id: string;
    component: string;
    title?: string;
  };

  /** The table of a group was mounted in its tab; group is the dataset's path in the container and panelId the DOM id of the panel. */
  'presentation.main.panel.table.opened': { group: string; panelId: string };
  /** The person opened the about menu and wants the versions of the packages installed in the runtime of the application. */
  'presentation.main.about.requested': undefined;
  /** The installed versions: one entry per package, `version` null when the package is not installed. */
  'presentation.main.about.found': { packages: Array<{ name: string; label: string; version: string | null }> };

  /** Ask a container to close the tab with this id; an id that is not open is ignored. */
  'presentation.main.panel.close.requested': { container: string; id: string };

  /** The tab of an image was closed; item is the path of the image in the container. */
  'presentation.main.image.closed': { item: string };
  /** The tab of a PDF was closed; item is the path of the file in the container. */
  'presentation.main.pdf.closed': { item: string };
  /** The tab of a text file was closed; item is the path of the file in the container. */
  'presentation.main.txt.closed': { item: string };
  /** The tab of a CSV file was closed; item is the path of the file in the container. */
  'presentation.main.csv.closed': { item: string };
  /** The tab of a Markdown file was closed; item is the path of the file in the container. */
  'presentation.main.md.closed': { item: string };
  /** The tab of an Excel file was closed; item is the path of the file in the container. */
  'presentation.main.xlsx.closed': { item: string };
  /** The tab of a Word file was closed; item is the path of the file in the container. */
  'presentation.main.docx.closed': { item: string };
  /** The tab of an HTML file was closed; item is the path of the file in the container. */
  'presentation.main.html.closed': { item: string };
  /** The tab of a DXF drawing was closed; item is the path of the file in the container. */
  'presentation.main.dxf.closed': { item: string };
  /** The tab of a DWG drawing was closed; item is the path of the file in the container. */
  'presentation.main.dwg.closed': { item: string };
  /** The tab of an entity of the database was closed; id is the global id of the entity. */
  'presentation.main.entity.closed': { id: string };
  /** The entity tab's initial visual is rendered and attached to the document. */
  'presentation.main.panel.entity.opened': { id: string; panelId: string };
  /** The tab of a HEIC photo was closed; item is the path of the file in the container. */
  'presentation.main.heic.closed': { item: string };


  /** `ontobdc container --entity` answered: the groups of the database, one per dataset; replaces every group. */
  'presentation.container.entities.found': { groups: EntityGroup[] };
  /** `ontobdc container --entity` could not be read; the database keeps what it showed. */
  'presentation.container.entities.failed': { message: string };
  /** A group (a dataset) of the database became the active one; group is its path in the container. Only the active group shows its ⋯ menu. */
  'presentation.database.group.activated': { group: string };
  /** The user asked to open a group (a dataset) of the database; group is its path in the container. */
  'presentation.database.group.open.requested': { group: string };
  /** The person asked for a new entity: of the type `entityType`, or of the type the group (a dataset's path in the container) holds. `values` has the fields the form starts with, by name. */
  'presentation.entity.new.requested': { entityType?: string; group?: string; values?: Record<string, string> };
  /** The user opened an item of the database; id is the global id of the entity. */
  'presentation.database.item.opened': { group: string; id: string };
  /** The person asked to create an entity in group (a dataset's path in the container); `values` has the fields they filled in, by name, with their values. */
  'presentation.entity.create.requested': { group: string; values: Record<string, string> };
  /** The person asked to remove an item from a list field. owner is the entity being edited (its global id) or `new:<group>` for the tab of a new entity; field is the identifier of the field; item the value to remove. */
  'presentation.entity.list.item.remove.requested': { owner: string; field: string; item: string };
  /** The person asked to add an item to a list field. documents says its values are documents of the container, chosen from its files. */
  'presentation.entity.list.item.add.requested': { owner: string; field: string; documents: boolean };
  /** The person chose the item to add to a list field. */
  'presentation.entity.list.item.chosen': { owner: string; field: string; item: string };
  /** A new entity could not be started in group (a dataset's path in the container). */
  'presentation.entity.new.failed': { message: string };
  /** The entity was created in group; id is its global id. */
  'presentation.entity.created': { group: string; id: string };
  /** The entity could not be created in group. */
  'presentation.entity.create.failed': { group: string; message: string };
  'presentation.entity.edit.requested': { id: string };
  'presentation.entity.edit.cancelled': { id: string };
  /** The person asked to save: `changes` has the fields they changed, by name, with their new values. */
  'presentation.entity.save.requested': { id: string; changes: Record<string, string> };
  /** The changes were saved; the edit is over. */
  'presentation.entity.saved': { id: string };
  'presentation.entity.save.failed': { id: string; message: string };
  'presentation.entity.delete.requested': { id: string };
  /** The person asks to read one entity again, from its tab; the id is the entity of the tab. */
  'presentation.entity.refresh.requested': { id: string };
  /** The entity was read again: the dataset that keeps it, with that entity only; it replaces the one the repository has. */
  'presentation.container.entity.found': { groups: EntityGroup[] };
  /** The entity could not be read again; the tab keeps what it showed. */
  'presentation.entity.refresh.failed': { id: string; message: string };
  'presentation.entity.delete.confirmed': { id: string };
  'presentation.entity.delete.cancelled': { id: string };
  'presentation.entity.deleted': { id: string };
  'presentation.entity.delete.failed': { id: string; message: string };

  /** The person asked to refresh the container: read its files again and bring the manifest up to date. */
  'presentation.container.refresh.requested': undefined;
  /** `ontobdc container --refresh` ran and worked; requestId is the one of that command. */
  'presentation.container.refresh.completed': { requestId: string };

  /** A command was requested; the terminal shows it and the run listener executes it. */
  'presentation.main.command.requested': { requestId: string; command: string };
  /** The command ran and worked; carries the result, matched by requestId. */
  'presentation.main.code.success': { requestId: string; result: CommandExecutionResult };
  /** The command could not run or did not work; result is null when nothing ran. */
  'presentation.main.code.failure': { requestId: string; result: CommandExecutionResult | null; message: string };
  /** The command was rejected before running, with the reason. */
  'presentation.main.command.invalid': { requestId: string; reason: string };

  /** The assistant has a new message to show, such as the first-load welcome text. */
  'presentation.assistant.message.sent': { text: string };

  /** Requests the light or dark color theme; does not mean it has been applied. */
  'presentation.main.theme.change.requested': { theme: 'light' | 'dark' };
  /** The color theme was applied, carrying the active and previous themes. */
  'presentation.main.theme.changed': {
    theme: 'light' | 'dark';
    previousTheme: 'light' | 'dark';
  };
};

/**
 * Extracts the allowed event names from AppEventMap, without their data types.
 * This lets the event bus reject unknown event names during TypeScript checking.
 */
export type AppEventType = keyof AppEventMap;

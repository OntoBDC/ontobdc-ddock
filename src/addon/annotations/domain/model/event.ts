import type { AnnotationGroup } from '@/addon/annotations/domain/model/annotation';

/**
 * The events of the Annotations addon and the data each one carries. The addon
 * adds them to the event map of the application (`AppEventMap`) from here, so the
 * core does not know the addon: it only needs this file to be part of the build.
 */
export type AnnotationsEvents = {
  /** `ontobdc annotate --list` answered: the annotation types of the ontology, each with its annotations; replaces every group. */
  'presentation.container.annotations.found': { groups: AnnotationGroup[] };
  /** `ontobdc annotate --list` could not be read; the Annotations panel keeps what it showed. */
  'presentation.container.annotations.failed': { message: string };
  /** The person opened an annotation of the Annotations panel; id is its global id, group its annotation type. */
  'presentation.annotations.item.opened': { group: string; id: string; title: string };
  /** The person asked to delete an annotation; nothing is deleted before they confirm. */
  'presentation.annotations.item.delete.requested': { id: string; title: string };
  'presentation.annotations.item.delete.confirmed': { id: string; title: string };
  'presentation.annotations.item.delete.cancelled': { id: string; title: string };
  /** The annotation was removed from the container. */
  'presentation.annotations.item.deleted': { id: string };
  'presentation.annotations.item.delete.failed': { id: string; message: string };
  /** The person asked to export the annotations of a group (an annotation type) in a format. */
  'presentation.annotations.group.export.requested': { group: string; format: 'excel'; ids?: string[] };
  'presentation.annotations.group.export.started': { group: string };
  /** The export was handed to the browser as a download. */
  'presentation.annotations.group.export.finished': { group: string; filename: string; bytes: number };
  'presentation.annotations.group.export.failed': { group: string; message: string };
};

declare module '@/ontobdc/shared/domain/model/event' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AppEventMap extends AnnotationsEvents {}
}

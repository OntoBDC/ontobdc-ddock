import { unwrapCliText } from '@/ontobdc/shared/adapter/container-format';
import type { AnnotationGroup, AnnotationItem } from '@/addon/annotations/domain/model/annotation';

/** The ontobdc command the annotation listeners chain: a result is recognized by the command it answers. */
export const ANNOTATION_LIST_COMMAND = 'ontobdc annotate --list';

/** The entity type of an annotation, as the datasets of the container declare it: the dataset that holds the annotations is the one that declares it. */
export const ANNOTATION_ENTITY_TYPE = 'http://datacenter.app.br/ontology/domain/annotation/taxonomy/type.ttl#Annotation';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A text field of the listing; the CLI wraps long strings, so the breaks it adds are removed. */
const textOf = (value: unknown): string => (typeof value === 'string' ? unwrapCliText(value) : '');

/** The `content` of a CLI answer that was already parsed, or null when it is not one. */
export function contentOf(response: unknown): Record<string, unknown> | null {
  return isRecord(response) && isRecord(response.content) ? response.content : null;
}

/**
 * The groups `ontobdc annotate --list` answers: one per annotation type the
 * Brasidatacenter ontology declares, in the order the CLI gives them, each with
 * its labels by language and its annotations. Returns null when the response is
 * not that answer.
 */
export function annotationGroupsOf(response: unknown): AnnotationGroup[] | null {
  const groups = contentOf(response)?.groups;
  if (!Array.isArray(groups)) return null;

  const parsed: AnnotationGroup[] = [];
  for (const group of groups) {
    if (!isRecord(group) || typeof group.id !== 'string' || !group.id) return null;
    parsed.push({ id: group.id, labels: labelsOf(group.labels, group.id), items: itemsOf(group.annotations) });
  }
  return parsed;
}

function labelsOf(labels: unknown, fallback: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (isRecord(labels)) {
    for (const [language, label] of Object.entries(labels)) {
      if (typeof label === 'string' && label) parsed[language.toLowerCase()] = unwrapCliText(label);
    }
  }
  if (!parsed.en) parsed.en = fallback;
  return parsed;
}

function itemsOf(annotations: unknown): AnnotationItem[] {
  if (!Array.isArray(annotations)) return [];
  const items: AnnotationItem[] = [];
  for (const annotation of annotations) {
    if (!isRecord(annotation) || typeof annotation.global_id !== 'string' || typeof annotation.title !== 'string') continue;
    items.push({
      id: annotation.global_id,
      title: unwrapCliText(annotation.title),
      text: textOf(annotation.text),
      author: textOf(annotation.author),
      createdAt: textOf(annotation.created_at),
      completedAt: textOf(annotation.completed_at),
      geometry: textOf(annotation.geometry),
      sourceDocument: textOf(annotation.source_document),
      related: Array.isArray(annotation.related_documents)
        ? annotation.related_documents.filter((path): path is string => typeof path === 'string' && path !== '').map(unwrapCliText)
        : [],
    });
  }
  return items;
}

/** The name of a group in the current language: the label the ontology gives in the locale (`pt-br`), else in its language (`pt`), else English. */
export function groupLabel(group: AnnotationGroup, locale: string): string {
  const tag = locale.toLowerCase();
  const label = group.labels[tag] ?? group.labels[tag.split('-')[0]] ?? group.labels.en ?? group.id;
  return label.toLocaleUpperCase(locale);
}

/** Whether the annotation was closed: it has a `completed_at`. */
export const isClosed = (annotation: AnnotationItem): boolean => annotation.completedAt.trim() !== '';

import type { DocumentSpace } from '@/ontobdc/shared/domain/model/document-space';

/** The spaces of the addons. */
const modules = import.meta.glob<{ space: DocumentSpace }>('@/addon/*/plugin/space/*.ts', { eager: true });

/** The way an addon shows this document in space, by its path in the container; none when no addon does. */
export function documentSpace(path: string): DocumentSpace | undefined {
  return Object.values(modules).map((module) => module.space).find((space) => space.accepts(path));
}

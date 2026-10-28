import type { DocumentImageRenderer } from '@/ontobdc/shared/domain/model/document-image';

/** The renderers of the addons. */
const modules = import.meta.glob<{ renderer: DocumentImageRenderer }>('@/addon/*/plugin/image/*.ts', { eager: true });

/** The renderer an addon offers for this document, by its path in the container; none when no addon draws it. */
export function documentImageRenderer(path: string): DocumentImageRenderer | undefined {
  return Object.values(modules).map((module) => module.renderer).find((renderer) => renderer.accepts(path));
}

import type { Visualization } from '@/ontobdc/shared/domain/model/visualization';

const FACADE = 'http://datacenter.app.br/ontology/tool/ontobdc/facade/ns.ttl#';

export type { VisualizationContext, VisualizationResult, Visualization } from '@/ontobdc/shared/domain/model/visualization';

/**
 * The file that draws each visualization the ontology can ask for. A file is
 * loaded when it is first needed, so a visualization nobody asks for costs
 * nothing. A visualization with no entry cannot be drawn, and the field is shown
 * as text.
 */
export const VISUALIZATION_BY_IRI: Readonly<Record<string, () => Promise<{ default: Visualization }>>> = {
  [`${FACADE}ImageCarousel`]: () => import('@/ontobdc/shared/adapter/image-carousel'),
  [`${FACADE}TagList`]: () => import('@/ontobdc/shared/adapter/tag-list'),
};

/** The visualization of an IRI, loaded; none if the table has no entry. */
export async function visualizationFor(iri: string | undefined): Promise<Visualization | undefined> {
  if (iri === undefined || !Object.hasOwn(VISUALIZATION_BY_IRI, iri)) return undefined;
  return (await VISUALIZATION_BY_IRI[iri]()).default;
}

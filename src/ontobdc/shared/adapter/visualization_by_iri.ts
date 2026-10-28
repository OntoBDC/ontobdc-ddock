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

/**
 * The visualizations the addons draw: the file `plugin/visualization/<Name>.ts` of an addon draws the visualization of
 * the IRI `<Name>` of the facade ontology, so none is loaded before it is asked for.
 */
const ADDON_VISUALIZATIONS = import.meta.glob<{ default: Visualization }>('@/addon/*/plugin/visualization/*.ts');

/** The visualization of an IRI, loaded; none if neither the table nor an addon has one. */
export async function visualizationFor(iri: string | undefined): Promise<Visualization | undefined> {
  if (iri === undefined) return undefined;
  if (Object.hasOwn(VISUALIZATION_BY_IRI, iri)) return (await VISUALIZATION_BY_IRI[iri]()).default;
  if (!iri.startsWith(FACADE)) return undefined;
  const load = Object.entries(ADDON_VISUALIZATIONS).find(([file]) => file.endsWith(`/${iri.slice(FACADE.length)}.ts`))?.[1];
  return load ? (await load()).default : undefined;
}

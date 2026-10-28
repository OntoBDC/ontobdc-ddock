import type { EditorFactory } from '@/ontobdc/shared/adapter/editor/editor';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const GEO_WKT = 'http://www.opengis.net/ont/geosparql#wktLiteral';

const numeric = [
  'integer', 'int', 'long', 'short', 'byte',
  'nonNegativeInteger', 'positiveInteger', 'nonPositiveInteger', 'negativeInteger',
  'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte',
  'decimal', 'double', 'float',
];

type Loader = () => Promise<{ default: EditorFactory }>;

/**
 * The file that edits the values of each datatype, loaded when it is first needed.
 * Several datatypes share a file when one editor serves them all. A datatype with
 * no entry is edited as text.
 */
export const EDITOR_BY_DATATYPE: Readonly<Record<string, Loader>> = {
  [`${XSD}string`]: () => import('@/ontobdc/shared/adapter/editor/text_editor'),
  [`${XSD}anyURI`]: () => import('@/ontobdc/shared/adapter/editor/text_editor'),
  [`${XSD}dateTime`]: () => import('@/ontobdc/shared/adapter/editor/datetime_editor'),
  [`${XSD}date`]: () => import('@/ontobdc/shared/adapter/editor/datetime_editor'),
  [`${XSD}time`]: () => import('@/ontobdc/shared/adapter/editor/datetime_editor'),
  [`${XSD}boolean`]: () => import('@/ontobdc/shared/adapter/editor/boolean_editor'),
  ...Object.fromEntries(numeric.map((name) => [`${XSD}${name}`, () => import('@/ontobdc/shared/adapter/editor/number_editor')])),
};

/**
 * The editor of a field: a list of values to add to and remove from when the
 * field holds several (and the facade lists none to choose from), a list to choose
 * from when the facade lists the values the field takes, a choice of one file when the field takes one document of the
 * container, a button that draws it when the field is a geometry, else the editor of its datatype (an IRI), else the text editor.
 */
export async function editorFor(datatype: string | undefined, options?: string[], multivalued = false, documents = false): Promise<EditorFactory> {
  if (datatype === GEO_WKT) return (await import('@/ontobdc/shared/adapter/editor/geometry_editor')).default;
  if (documents && !multivalued && !(options && options.length > 0)) return (await import('@/ontobdc/shared/adapter/editor/document_editor')).default;
  if (multivalued && !(options && options.length > 0)) return (await import('@/ontobdc/shared/adapter/editor/list_editor')).default;
  if (options && options.length > 0) return (await import('@/ontobdc/shared/adapter/editor/choice_editor')).default;
  const load = datatype !== undefined && Object.hasOwn(EDITOR_BY_DATATYPE, datatype)
    ? EDITOR_BY_DATATYPE[datatype]
    : EDITOR_BY_DATATYPE[`${XSD}string`];
  return (await load()).default;
}

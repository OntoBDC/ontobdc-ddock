/** A geometry of an entity: its identifier, which stays while the others come and go, its well-known text, the shape it was made as, and how it is drawn. */
export type EntityGeometry = { id: string; wkt: string; shape: string | null; stroke: string | null; stroke_width: number | null; fill: string | null };

/** `geometries` is, for a field of geometries, what each of its values is besides the text: one for each value, in the same order. */
export type EntityField = { name: string; labels: Record<string, string>; editable: boolean; values: string[]; geometries?: EntityGeometry[] };

/** One entity of a dataset, as `ontobdc container --entity` tells it: its fields are whatever its data source holds. */
export type EntityItem = { id: string; name: string; type: string; fields: EntityField[] };

/**
 * One group of the database panel: a dataset of the container's container, with
 * the entities its data sources hold. `id` is the dataset's path in the
 * container, `title` its name, `entityTypes` the entity types it declares.
 */
export type EntityGroup = { id: string; title: string; entityTypes: string[]; items: EntityItem[] };

/**
 * One entity of a tree, with the entities below it, as `ontobdc container --entity <type> --tree`
 * tells it: `iri` is the resource it is in the graph (null when its data source gives it none),
 * `id` its global id, and `dataset` the path of the dataset that keeps it, which is not always the
 * dataset of its parent.
 */
export type EntityTreeNode = {
  iri: string | null;
  id: string;
  name: string;
  type: string;
  dataset: string;
  children: EntityTreeNode[];
};

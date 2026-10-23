/** What a visualization is given to draw the values of a field. */
export type VisualizationContext = {
  /** The values of the field, each one a document IRI. */
  values: string[];
  /** The files the visualization shows, as its file profile accepts them. */
  accepts: { mime_types: string[]; extensions: string[] };
  /** The global id of the entity the field is of, for a visualization that changes it. */
  entityId?: string;
};

export type VisualizationResult = {
  element: HTMLElement;
  /** The values it shows; the others are left for the caller to show. */
  handled: string[];
  /** Drawn beside the fields, at the right of the tab, and not in the row of its field. */
  aside?: boolean;
  /** Frees what the visualization holds. */
  dispose(): void;
};

export type Visualization = (context: VisualizationContext) => VisualizationResult;

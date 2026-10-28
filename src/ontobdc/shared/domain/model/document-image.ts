/** A document drawn as one image, in the pixels it was drawn at. */
export type DocumentImage = { blob: Blob; width: number; height: number };

/**
 * What an addon's `plugin/image` module exports as `renderer` to have a kind of document drawn as an image: the
 * documents it accepts are told by their path in the container.
 */
export type DocumentImageRenderer = {
  accepts(path: string): boolean;
  render(file: File): Promise<DocumentImage>;
};

import type { DocumentImage } from '@/ontobdc/shared/domain/model/document-image';
import type { EntityGeometry } from '@/ontobdc/shared/domain/model/entity';

/** A point of a model in space, in the coordinates of the model: x and y on the ground, z going up. */
export type SpacePoint = [number, number, number];

/** The shapes that can be put in space, with what is needed to show one before it is made: where it is, and its size. */
export type SpacePreview = { shape: 'box' | 'cylinder' | 'sphere' | 'lollipop'; center: SpacePoint; size: number; color: string };

/**
 * A model in space, shown for the geometries of an annotation to be put in it and chosen, moved and taken off. It
 * draws and answers where things are; what is done with them is not its business.
 */
export type SpaceView = {
  /** What receives the pointer: the person turns the model with it, unless the orbit is off. */
  canvas: HTMLElement;
  /** The point of the model (or of a geometry) under a position of the screen, in client pixels; none when it is over nothing. */
  pointAt(clientX: number, clientY: number): SpacePoint | null;
  /** How long, in the coordinates of the model, a number of pixels of the screen is at that point. */
  lengthAt(point: SpacePoint, pixels: number): number;
  /** The length of the diagonal of the model. */
  extent(): number;
  /** Draws these geometries (those of three dimensions) in place of the ones drawn, and the one chosen marked. */
  setGeometries(geometries: EntityGeometry[], selected: string | null): void;
  /** Shows the shape that is being made, or none. */
  setPreview(preview: SpacePreview | null): void;
  /** The identifier of the geometry under a position of the screen; none when it is over none. */
  geometryAt(clientX: number, clientY: number): string | null;
  /** Moves a geometry on the screen by this much, until the geometries are drawn again. */
  nudge(id: string, delta: SpacePoint): void;
  /** How far, in the coordinates of the model, dragging by these pixels moves a point of the model, on the plane facing the screen. */
  dragDelta(point: SpacePoint, dxPixels: number, dyPixels: number): SpacePoint;
  /** The view as it is now, as the address of a picture of it. */
  capture(): string;
  /** Whether the pointer turns the model. */
  setOrbit(enabled: boolean): void;
  dispose(): void;
};

/**
 * What an addon's `plugin/space` module exports as `space` to have a kind of document shown in space: the documents it
 * accepts are told by their path in the container.
 */
export type DocumentSpace = {
  accepts(path: string): boolean;
  /** Shows the document in `host`, ready for the person to put geometries in. */
  open(file: File, host: HTMLElement): Promise<SpaceView>;
  /** The document with the geometries in it, seen from where a person would see it, as an image. */
  snapshot(file: File, geometries: EntityGeometry[], size: { width: number; height: number }): Promise<DocumentImage>;
};

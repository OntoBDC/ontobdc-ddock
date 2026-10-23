import { createCarousel, type CarouselItem } from '@/ontobdc/shared/adapter/carousel';
import { documentPath } from '@/ontobdc/shared/adapter/document-iri';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { convertHeicToPng } from '@/ontobdc/shared/adapter/heic-convert';
import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import type { VisualizationContext, VisualizationResult } from '@/ontobdc/shared/domain/model/visualization';

const SOURCE = 'image_carousel';
const HEIC = /\.(heic|heif)$/i;

const extensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
};

/**
 * The visualization of an image carousel: the values of the field are document
 * IRIs, and the carousel shows the ones whose file the profile of the
 * visualization accepts, by extension. A HEIC photo is converted to a PNG to be
 * drawn, as the HEIC tab does; the file in the container is not changed.
 * Double-clicking an image opens it as the explorer would.
 */
export default function imageCarousel(context: VisualizationContext): VisualizationResult {
  const accepted = new Set(context.accepts.extensions.map((extension) => extension.toLowerCase()));
  const shown = context.values.flatMap((value) => {
    const path = documentPath(value);
    return path !== undefined && accepted.has(extensionOf(path)) ? [{ value, path }] : [];
  });
  const paths = shown.map(({ path }) => path);
  const folder = ContainerRepository.getInstance().get()?.folder;

  const carousel = createCarousel({
    onOpen: (path) => eventBus.publish('presentation.explorer.file.activated', SOURCE, { item: path }),
  });
  const items: CarouselItem[] = paths.map((path) => ({
    id: path,
    caption: path.slice(path.lastIndexOf('/') + 1),
    async load() {
      if (!folder) throw new Error('No container is open.');
      const file = await ContainerFileRepository.of(folder).file(path);
      const image: Blob = HEIC.test(path) ? await convertHeicToPng(file) : file;
      const url = URL.createObjectURL(image);
      return { url, release: () => URL.revokeObjectURL(url) };
    },
  }));
  carousel.setItems(items);

  return { element: carousel.element, handled: shown.map(({ value }) => value), dispose: carousel.dispose };
}

import { ContainerFileRepository } from '@/ontobdc/shared/adapter/container-file-repository';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import { convertHeicToPng } from '@/ontobdc/shared/adapter/heic-convert';

const IMAGE = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i;
const HEIC = /\.(heic|heif)$/i;

/** How many images are read from the container at the same time. */
const CONCURRENCY = 3;

/** Whether the file is an image the thumbnails can draw. */
export const isImageFile = (path: string): boolean => IMAGE.test(path);

/** The short word that stands for a file that is not an image: its extension, in capitals. */
export function extensionLabel(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1, dot + 5).toUpperCase() : '';
}

/**
 * Draws the images of the files of the container as thumbnails, each read when it comes to be seen
 * and a few at a time, and kept until the set is disposed. A file that cannot be read or drawn
 * keeps what the tile shows without it.
 */
export function createThumbnails(): { show: (path: string, target: HTMLElement) => void; dispose: () => void } {
  const urls = new Map<string, string>();
  const waiting: Array<() => Promise<void>> = [];
  let running = 0;
  let observer: IntersectionObserver | null = null;
  const targets = new WeakMap<Element, { path: string; target: HTMLElement }>();

  const pump = (): void => {
    while (running < CONCURRENCY && waiting.length > 0) {
      const next = waiting.shift();
      if (!next) break;
      running += 1;
      void next().finally(() => { running -= 1; pump(); });
    }
  };

  const paint = (target: HTMLElement, url: string): void => {
    target.style.backgroundImage = `url("${url}")`;
    target.dataset.loaded = 'true';
  };

  const load = (path: string, target: HTMLElement): void => {
    const known = urls.get(path);
    if (known) { paint(target, known); return; }
    waiting.push(async () => {
      try {
        const folder = ContainerRepository.getInstance().get()?.folder;
        if (!folder) return;
        const file = await ContainerFileRepository.of(folder).file(path);
        const image: Blob = HEIC.test(path) ? await convertHeicToPng(file) : file;
        const url = urls.get(path) ?? URL.createObjectURL(image);
        urls.set(path, url);
        if (target.isConnected) paint(target, url);
      } catch {
        // The tile keeps its icon.
      }
    });
    pump();
  };

  return {
    show: (path, target) => {
      if (typeof IntersectionObserver === 'undefined') { load(path, target); return; }
      observer ??= new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const found = targets.get(entry.target);
          if (!found) continue;
          observer?.unobserve(entry.target);
          load(found.path, found.target);
        }
      });
      targets.set(target, { path, target });
      observer.observe(target);
    },
    dispose: () => {
      observer?.disconnect();
      waiting.length = 0;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    },
  };
}

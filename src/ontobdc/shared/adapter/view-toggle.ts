import { translate } from '@/ontobdc/shared/plugin/i18n';

/** Four tiles: the files as thumbnails. */
export const GRID_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>';

export type ViewToggle = {
  element: HTMLButtonElement;
  /** Whether the files are shown as thumbnails now, rather than as a list. */
  thumbs(): boolean;
};

/**
 * The button that switches a set of files between a list and thumbnails, the one of the explorer: green while they are
 * thumbnails. `onChange` is told the new view after each click, and what it draws is up to the caller.
 */
export function createViewToggle(options: { className: string; thumbs: boolean; onChange(thumbs: boolean): void }): ViewToggle {
  let thumbs = options.thumbs;
  const element = document.createElement('button');
  element.type = 'button';
  element.className = options.className;
  element.innerHTML = GRID_ICON;
  const refresh = (): void => {
    element.dataset.active = String(thumbs);
    element.setAttribute('aria-pressed', String(thumbs));
    element.title = translate(thumbs ? 'explorer.files.asList' : 'explorer.files.asThumbs');
    element.setAttribute('aria-label', element.title);
  };
  refresh();
  element.addEventListener('click', (event) => {
    // Where it sits inside something a click opens or closes, that does not happen.
    event.preventDefault();
    event.stopPropagation();
    thumbs = !thumbs;
    refresh();
    options.onChange(thumbs);
  });
  return { element, thumbs: () => thumbs };
}

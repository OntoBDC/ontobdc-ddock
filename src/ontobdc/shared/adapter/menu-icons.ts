/** Small outline icons for the entries of the ⋯ menus: one stroke, in the color of the text. */
const outline = (paths: string): string =>
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Two arrows going round: read again. */
export const REFRESH_ICON = outline('<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5v3h-3"/>');

/** An arrow going up out of a tray: send. */
export const UPLOAD_ICON = outline('<path d="M8 10.5V2.5M5 5.5l3-3 3 3"/><path d="M2.5 10v3h11v-3"/>');

/** A pen: rename. */
export const RENAME_ICON = outline('<path d="M10.5 2.5l3 3-7.5 7.5H3v-3z"/><path d="M9 4l3 3"/>');

/** A bin: delete. */
export const DELETE_ICON = outline('<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/><path d="M6.5 6.5v5M9.5 6.5v5"/>');

/** A window with an arrow leaving it: open. */
export const OPEN_ICON = outline('<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5"/><path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>');

/** A plus: new. */
export const NEW_ICON = outline('<path d="M8 3v10M3 8h10"/>');

/** Two links of a chain: relate. */
export const RELATE_ICON = outline('<path d="M6.5 9.5l3-3"/><path d="M7 4.5l.8-.8a2.5 2.5 0 0 1 3.5 3.5l-.8.8"/><path d="M9 11.5l-.8.8a2.5 2.5 0 0 1-3.5-3.5l.8-.8"/>');

/** An arrow leaving a sheet: export. */
export const EXPORT_ICON = outline('<path d="M9 2.5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h5"/><path d="M7 8h7M11.5 5.5 14 8l-2.5 2.5"/>');

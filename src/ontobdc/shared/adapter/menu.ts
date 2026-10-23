import type { PanelFactory } from '@/ontobdc/shared/adapter/view';
import type { MessageKey } from '@/ontobdc/shared/plugin/i18n';

/**
 * A tab of the left menu. A file in a module's plugin/menu folder exports one as
 * its default; the web listener of the loaded layout adds the button and mounts
 * the panel it points to.
 */
export type MenuEntry = {
  /** Unique among the tabs; the button and the panel are tied by it. */
  id: string;
  /** The button's SVG, as markup. */
  icon: string;
  /** Tooltip and accessible name of the button. */
  label: MessageKey;
  /** What the pane header shows while the tab is open. */
  header: MessageKey;
  /** Builds the panel the tab shows. */
  panel: PanelFactory;
};

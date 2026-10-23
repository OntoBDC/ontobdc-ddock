import { toMountable, type Mountable } from '@/ontobdc/shared/adapter/view';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import type { MenuEntry } from '@/ontobdc/shared/adapter/menu';
import { applyTranslations } from '@/ontobdc/shared/plugin/i18n';

type MenuModule = { default?: MenuEntry };

/** Discover every <module>/plugin/menu file without executing it yet. */
const menuImports = import.meta.glob<MenuModule>([
  '@/addon/*/plugin/menu/*.ts',
  '!@/addon/*/plugin/menu/*.d.ts',
]);

/** The panels mounted by the previous layout; the shell is rebuilt, so they are disposed first. */
let mounted: Mountable[] = [];

export class OnLayoutLoadedMenu {
  static readonly METADATA: ListenerMetadata = {
    id: 'web_on_layout_loaded_menu',
    logical_component: 'web',
    description: 'Scans the plugin/menu folders and adds each entry found as a tab of the left menu.',
    arguments: [
      {
        listen: ['presentation.main.layout.loaded'],
        valued: false,
        description: 'The shell is mounted, so the left menu can take its tabs.',
        type: 'str',
      },
    ],
  };

  /** Adds, in ascending file-path order, a button to the activity bar and its panel to the left pane. */
  async run(): Promise<void> {
    mounted.forEach((view) => view.dispose?.());
    mounted = [];
    const bar = document.querySelector<HTMLElement>('.activitybar');
    const host = document.querySelector<HTMLElement>('#explorer-host');
    if (!bar || !host) throw new Error('Left menu not found');

    for (const filePath of Object.keys(menuImports).sort()) {
      const entry = (await menuImports[filePath]()).default;
      if (!entry) throw new Error(`Menu file ${filePath} must export a menu entry as default.`);
      if (document.querySelector(`.activity[data-view="${CSS.escape(entry.id)}"]`)) {
        throw new Error(`Menu entry ${entry.id} in ${filePath} is already in the left menu.`);
      }

      const button = document.createElement('button');
      button.className = 'activity';
      button.dataset.view = entry.id;
      button.dataset.header = entry.header;
      button.dataset.i18nTitle = entry.label;
      button.dataset.i18nAriaLabel = entry.label;
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = entry.icon;
      bar.append(button);

      const view = toMountable(entry.panel({ id: entry.id }));
      view.element.dataset.sidebarView = entry.id;
      view.element.hidden = true;
      host.append(view.element);
      mounted.push(view);
      applyTranslations(button);
    }
  }
}

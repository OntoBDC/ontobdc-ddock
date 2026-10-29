/** The tools the addons put at the foot of the Updates pane: each module of `plugin/footer` makes one. */
const modules = import.meta.glob<{ default: () => HTMLElement }>('@/addon/*/plugin/footer/*.ts', { eager: true });

/** The tools of the addons, one for each, in the order of their modules. */
export function createFooterTools(): HTMLElement[] {
  return Object.values(modules).map((module) => module.default());
}
